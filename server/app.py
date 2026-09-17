"""AirRunner API: pilot accounts with email verification, run scores and the leaderboard, stored in MongoDB."""

import os
import secrets
import smtplib
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Annotated

import bcrypt
import jwt
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import AfterValidator, BaseModel, BeforeValidator, EmailStr, Field
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import DuplicateKeyError

# .env may sit next to this file or at the repository root
SERVER_DIR = Path(__file__).resolve().parent
ROOT_DIR = SERVER_DIR.parent
load_dotenv(SERVER_DIR / ".env")
load_dotenv(ROOT_DIR / ".env")
load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is not set. Copy server/.env.example to server/.env and fill it in.")

TOKEN_TTL = timedelta(hours=1)
LEADERBOARD_MAX = 50

# One-time codes: short-lived, few guesses, and a cooldown between emails, so a 6-digit
# code can't be brute forced and the endpoint can't be used to spam an inbox
OTP_TTL = timedelta(minutes=10)
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_COOLDOWN = timedelta(seconds=60)
OTP_MAX_SENDS_PER_HOUR = 5

# SMTP delivery for verification codes; without it, codes are printed to the server console for local development
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", "").strip() or SMTP_USER or "AirRunner <no-reply@airrunner.net>"


def send_email_otp(to_email: str, otp_code: str, pilot_name: str = "Pilot", purpose: str = "signup") -> tuple[bool, str]:
    """Emails a 6-digit code, or prints it to the console when SMTP isn't configured. Returns (sent, message)."""
    is_signup = purpose == "signup"
    subject = f"AirRunner Account Verification OTP: {otp_code}" if is_signup else f"AirRunner Password Reset OTP: {otp_code}"
    title = "Verify Your AirRunner Account" if is_signup else "AirRunner Password Reset"
    action_msg = (
        "Welcome to AirRunner! Use the 6-digit OTP code below to verify your email address and activate your pilot account:"
        if is_signup
        else "We received a request to reset your AirRunner account password. Enter the 6-digit OTP code below to verify your identity:"
    )

    if SMTP_HOST and SMTP_USER and SMTP_PASSWORD:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to_email

        text_content = (
            f"Hello {pilot_name},\n\n"
            f"{action_msg}\n\n"
            f"OTP Code: {otp_code}\n\n"
            "This code will expire in 10 minutes.\n"
            "If you did not request this, please ignore this email.\n\n"
            "- The AirRunner Flight Control Team"
        )
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
            <h2 style="color: #2b6cb0; margin-top: 0; font-size: 22px;">{title}</h2>
            <p style="color: #4a5568; font-size: 14px;">Hello <strong>{pilot_name}</strong>,</p>
            <p style="color: #4a5568; font-size: 14px;">{action_msg}</p>
            <div style="text-align: center; margin: 24px 0;">
                <span style="display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2b6cb0; background: #ebf8ff; padding: 12px 24px; border-radius: 6px; border: 1px dashed #3182ce;">{otp_code}</span>
            </div>
            <p style="color: #718096; font-size: 13px;">This verification code is valid for <strong>10 minutes</strong>. If you did not request this, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="color: #a0aec0; font-size: 11px; text-align: center; margin: 0;">AirRunner High-Speed Web Gaming</p>
        </div>
        """
        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        try:
            if SMTP_PORT == 465:
                with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                    server.login(SMTP_USER, SMTP_PASSWORD)
                    server.sendmail(SMTP_FROM, [to_email], msg.as_string())
            else:
                with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                    server.starttls()
                    server.login(SMTP_USER, SMTP_PASSWORD)
                    server.sendmail(SMTP_FROM, [to_email], msg.as_string())
            print(f"[EMAIL] Sent {purpose} code to {to_email}")
            return True, f"Verification code sent to {to_email}."
        except Exception as exc:
            print(f"[EMAIL ERROR] Could not send to {to_email}: {exc}")
            return False, "Could not send the email."

    # Local development fallback: no SMTP configured, so the code goes to the server console
    tag = "SIGNUP EMAIL OTP" if is_signup else "PASSWORD RESET OTP"
    print("\n" + "=" * 60)
    print(f"[{tag}] Target Email: {to_email}")
    print(f"[{tag}] Pilot Name:   {pilot_name}")
    print(f"[{tag}] 6-Digit Code: {otp_code}")
    print("[TIP] Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD in server/.env to deliver codes by email")
    print("=" * 60 + "\n")
    return True, "Verification code printed to the server console (SMTP is not configured)."


client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"), serverSelectionTimeoutMS=5000)
db = client[os.getenv("MONGO_DB", "airrunner")]


def ensure_indexes(database):
    database.users.create_index("email", unique=True)
    database.users.create_index("gamerIdLower", unique=True)  # "Neo" and "neo" are the same Gamer ID
    database.scores.create_index([("score", DESCENDING), ("achievedAt", ASCENDING)])
    # MongoDB removes verification codes once they expire
    database.otp_verifications.create_index("expiresAt", expireAfterSeconds=0)


@asynccontextmanager
async def lifespan(_app):
    # Doubles as a startup check: fails within 5s with a clear error if MongoDB isn't reachable
    ensure_indexes(db)
    yield


app = FastAPI(title="AirRunner API", lifespan=lifespan)

# Tokens travel in the Authorization header, not cookies, so any origin may call the API
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _strip(value):
    return value.strip() if isinstance(value, str) else value


def _fits_bcrypt(password: str) -> str:
    # bcrypt only reads 72 bytes, and bcrypt>=5 raises on anything longer
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes")
    return password


Name = Annotated[str, BeforeValidator(_strip)]
Email = Annotated[EmailStr, AfterValidator(lambda email: email.lower())]
Password = Annotated[str, AfterValidator(_fits_bcrypt)]
Otp = Annotated[str, BeforeValidator(_strip), Field(min_length=6, max_length=6)]


class SignupOtpRequest(BaseModel):
    pilotName: Annotated[Name, Field(min_length=3, max_length=40)]
    gamerId: Annotated[Name, Field(min_length=3, max_length=30)]
    email: Email


class VerifyOtpRequest(BaseModel):
    email: Email
    otp: Otp


class CompleteSignupRequest(BaseModel):
    email: Email
    otp: Otp
    password: Annotated[Password, Field(min_length=8)]
    confirmPassword: str


class LoginRequest(BaseModel):
    gamerId: Name  # a Gamer ID or the registered email
    password: Password


class ForgotPasswordOtpRequest(BaseModel):
    identifier: Name


class ResetPasswordRequest(BaseModel):
    identifier: Name
    otp: Otp
    password: Annotated[Password, Field(min_length=8)]
    confirmPassword: str


class ScoreRequest(BaseModel):
    score: int = Field(ge=0)
    distance: int = Field(ge=0)
    coinsCollected: int = Field(ge=0)


# Checked when the account is unknown, so response time doesn't reveal which accounts exist
_DUMMY_HASH = bcrypt.hashpw(b"airrunner-unknown-user", bcrypt.gensalt())

# Password reset answers the same way whether or not the account exists
GENERIC_RESET_REPLY = {"message": "If that Gamer ID or email is registered, a reset code is on its way."}


def _hash(value: str) -> str:
    return bcrypt.hashpw(value.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _matches(value: str, hashed: str) -> bool:
    return bcrypt.checkpw(value.encode("utf-8"), hashed.encode("utf-8"))


def _as_utc(when: datetime) -> datetime:
    return when if when.tzinfo else when.replace(tzinfo=timezone.utc)


def _find_user(identifier: str):
    key = identifier.strip().lower()
    return db.users.find_one({"$or": [{"gamerIdLower": key}, {"email": key}]})


def _check_send_limits(record, now):
    """One code a minute and a few an hour per address, so nobody's inbox can be flooded."""
    if not record:
        return
    last_sent = record.get("lastSentAt")
    if last_sent and now - _as_utc(last_sent) < OTP_RESEND_COOLDOWN:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Please wait a minute before requesting another code.")
    window_start = record.get("sendWindowStart")
    within_window = window_start and now - _as_utc(window_start) < timedelta(hours=1)
    if within_window and record.get("sendCount", 0) >= OTP_MAX_SENDS_PER_HOUR:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many codes requested. Please try again later.")


def _store_otp(email: str, purpose: str, extra: dict, now: datetime) -> str:
    """Replaces any previous code for this address and purpose, and returns the plain code to email."""
    record = db.otp_verifications.find_one({"email": email, "type": purpose})
    _check_send_limits(record, now)

    window_start, send_count = now, 1
    previous_window = record.get("sendWindowStart") if record else None
    if previous_window and now - _as_utc(previous_window) < timedelta(hours=1):
        window_start = _as_utc(previous_window)
        send_count = record.get("sendCount", 0) + 1

    code = f"{secrets.randbelow(1_000_000):06d}"  # secrets, not random: reset codes must be unguessable
    db.otp_verifications.update_one(
        {"email": email, "type": purpose},
        {
            "$set": {
                "email": email,
                "type": purpose,
                # Hashed, so a leaked database can't be used to take over accounts
                "otpHash": _hash(code),
                "attempts": 0,
                "verified": False,
                "expiresAt": now + OTP_TTL,
                "createdAt": now,
                "lastSentAt": now,
                "sendWindowStart": window_start,
                "sendCount": send_count,
                **extra,
            }
        },
        upsert=True,
    )
    return code


def _consume_otp(email: str, purpose: str, code: str, now: datetime):
    """Checks a submitted code and counts failures, so the code can't be found by trying every combination."""
    record = db.otp_verifications.find_one({"email": email, "type": purpose})
    if not record:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active code for this request. Please request a new one.")

    if now > _as_utc(record["expiresAt"]):
        db.otp_verifications.delete_one({"_id": record["_id"]})
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That code has expired. Please request a new one.")

    if not _matches(code.strip(), record["otpHash"]):
        attempts = record.get("attempts", 0) + 1
        if attempts >= OTP_MAX_ATTEMPTS:
            db.otp_verifications.delete_one({"_id": record["_id"]})
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many incorrect codes. Please request a new one.")
        db.otp_verifications.update_one({"_id": record["_id"]}, {"$set": {"attempts": attempts}})
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect code. Please check your inbox and try again.")

    return record


def _session_for(user):
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(user["_id"]),
        "gamerId": user["gamerId"],
        # Bumped by a password reset, which signs out tokens issued earlier
        "ver": user.get("tokenVersion", 0),
        "iat": now,
        "exp": now + TOKEN_TTL,
    }
    return {
        "token": jwt.encode(claims, JWT_SECRET, algorithm="HS256"),
        "pilotName": user["pilotName"],
        "gamerId": user["gamerId"],
    }


def current_user(authorization: Annotated[str | None, Header()] = None):
    scheme, _, token = (authorization or "").partition(" ")
    user = None
    if scheme.lower() == "bearer" and token:
        try:
            claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], options={"require": ["exp", "sub"]})
            candidate = db.users.find_one({"_id": ObjectId(claims["sub"])})
            if candidate and claims.get("ver", 0) == candidate.get("tokenVersion", 0):
                user = candidate
        except (jwt.InvalidTokenError, InvalidId):
            pass
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired or invalid. Please sign in again.")
    return user


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/signup/request-otp")
def signup_request_otp(req: SignupOtpRequest):
    """Step 1 of signup: claim a Gamer ID and email, and send a verification code to that address."""
    now = datetime.now(timezone.utc)
    if db.users.find_one({"gamerIdLower": req.gamerId.lower()}):
        raise HTTPException(status.HTTP_409_CONFLICT, "That Gamer ID is already taken. Please choose another.")
    if db.users.find_one({"email": req.email}):
        raise HTTPException(status.HTTP_409_CONFLICT, "That email address is already registered. Please sign in instead.")

    code = _store_otp(req.email, "signup", {"pilotName": req.pilotName, "gamerId": req.gamerId}, now)
    sent, message = send_email_otp(req.email, code, req.pilotName, purpose="signup")
    if not sent:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not send the verification email. Please try again.")
    return {"message": message}


@app.post("/api/auth/signup/verify-otp")
def signup_verify_otp(req: VerifyOtpRequest):
    """Step 2 of signup: check the emailed code before asking for a password."""
    record = _consume_otp(req.email, "signup", req.otp, datetime.now(timezone.utc))
    db.otp_verifications.update_one({"_id": record["_id"]}, {"$set": {"verified": True}})
    return {"message": "Email verified successfully.", "verified": True}


@app.post("/api/auth/signup/complete", status_code=status.HTTP_201_CREATED)
def signup_complete(req: CompleteSignupRequest):
    """Step 3 of signup: set a password and create the account."""
    if req.password != req.confirmPassword:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Passwords do not match.")

    now = datetime.now(timezone.utc)
    record = _consume_otp(req.email, "signup", req.otp, now)

    # Name and Gamer ID come from the verified request, not from this call
    user = {
        "pilotName": record["pilotName"],
        "gamerId": record["gamerId"],
        "gamerIdLower": record["gamerId"].lower(),
        "email": req.email,
        "passwordHash": _hash(req.password),
        "tokenVersion": 0,
        "createdAt": now,
    }
    try:
        db.users.insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(status.HTTP_409_CONFLICT, "That Gamer ID or email was just registered. Please sign in.") from None

    db.otp_verifications.delete_one({"_id": record["_id"]})
    return _session_for(user)


@app.post("/api/auth/login")
def login(req: LoginRequest):
    user = _find_user(req.gamerId)
    stored_hash = user["passwordHash"].encode("utf-8") if user else _DUMMY_HASH
    password_ok = bcrypt.checkpw(req.password.encode("utf-8"), stored_hash)
    if not (user and password_ok):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Gamer ID or password.")
    return _session_for(user)


@app.post("/api/auth/forgot-password/request-otp")
def forgot_password_request_otp(req: ForgotPasswordOtpRequest):
    """Emails a reset code. The reply never says whether the account exists, nor what its email address is."""
    user = _find_user(req.identifier)
    if not user:
        return GENERIC_RESET_REPLY

    try:
        code = _store_otp(user["email"], "reset", {"userId": user["_id"]}, datetime.now(timezone.utc))
    except HTTPException:
        return GENERIC_RESET_REPLY  # rate limited, but still don't reveal that the account exists

    send_email_otp(user["email"], code, user.get("pilotName", "Pilot"), purpose="reset")
    return GENERIC_RESET_REPLY


@app.post("/api/auth/forgot-password/reset")
def forgot_password_reset(req: ResetPasswordRequest):
    """Sets a new password for whoever holds the emailed code, and signs out sessions issued before the reset."""
    if req.password != req.confirmPassword:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Passwords do not match.")

    now = datetime.now(timezone.utc)
    user = _find_user(req.identifier)
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That code is not valid. Please request a new one.")

    record = _consume_otp(user["email"], "reset", req.otp, now)
    db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"passwordHash": _hash(req.password), "passwordChangedAt": now}, "$inc": {"tokenVersion": 1}},
    )
    db.otp_verifications.delete_one({"_id": record["_id"]})
    return {"message": "Password reset. You can now sign in with your new password."}


# ponytail: scores are reported by the browser and can be faked; add server-side run verification if cheating matters
@app.post("/api/scores", status_code=status.HTTP_201_CREATED)
def submit_score(req: ScoreRequest, user: Annotated[dict, Depends(current_user)]):
    db.scores.insert_one(
        {"userId": user["_id"], "gamerId": user["gamerId"], **req.model_dump(), "achievedAt": datetime.now(timezone.utc)}
    )
    return {"message": "Score saved"}


@app.get("/api/leaderboard")
def leaderboard(limit: Annotated[int, Query(ge=1, le=LEADERBOARD_MAX)] = 10):
    # Each player's best run, highest first; the earlier run wins a tie
    rows = db.scores.aggregate(
        [
            {"$sort": {"score": -1, "achievedAt": 1}},
            {
                "$group": {
                    "_id": "$userId",
                    "gamerId": {"$first": "$gamerId"},
                    "score": {"$first": "$score"},
                    "distance": {"$first": "$distance"},
                    "achievedAt": {"$first": "$achievedAt"},
                }
            },
            {"$sort": {"score": -1, "achievedAt": 1}},
            {"$limit": limit},
        ]
    )
    return [{"gamerId": row["gamerId"], "score": row["score"], "distance": row["distance"]} for row in rows]


# ---------------------------------------------------------
# Serving the game from the API, so everything runs on one local address
# ---------------------------------------------------------
if (ROOT_DIR / "login.html").exists():
    if (ROOT_DIR / "js").is_dir():
        app.mount("/js", StaticFiles(directory=str(ROOT_DIR / "js")), name="js")
    if (ROOT_DIR / "css").is_dir():
        app.mount("/css", StaticFiles(directory=str(ROOT_DIR / "css")), name="css")

    @app.get("/")
    def root_redirect():
        return RedirectResponse(url="/login.html")

    @app.get("/login.html")
    def serve_login():
        return FileResponse(str(ROOT_DIR / "login.html"))

    @app.get("/portal.html")
    def serve_portal():
        return FileResponse(str(ROOT_DIR / "portal.html"))

    @app.get("/index.html")
    def serve_game():
        return FileResponse(str(ROOT_DIR / "index.html"))

    @app.get("/frontbasic.html")
    def serve_frontbasic():
        return FileResponse(str(ROOT_DIR / "frontbasic.html"))

    @app.get("/style.css")
    def serve_style():
        return FileResponse(str(ROOT_DIR / "style.css"))

    @app.get("/hand_landmarker.task")
    def serve_model():
        model_path = ROOT_DIR / "hand_landmarker.task"
        if model_path.exists():
            return FileResponse(str(model_path))
        raise HTTPException(status_code=404, detail="Model file not found")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    print("\n" + "=" * 60)
    print("AirRunner server running")
    print(f"-> Game:          http://localhost:{port}/login.html")
    print(f"-> API reference: http://localhost:{port}/docs")
    print("=" * 60 + "\n")
    # Bound to localhost: the dev server is not hardened for the open network
    uvicorn.run("app:app", host="127.0.0.1", port=port, reload=True)
