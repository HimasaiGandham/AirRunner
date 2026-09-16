"""AirRunner API: pilot accounts, run scores and the leaderboard, stored in MongoDB."""

import os
import random
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

# Load .env from server directory, root directory, or environment
SERVER_DIR = Path(__file__).resolve().parent
ROOT_DIR = SERVER_DIR.parent
load_dotenv(SERVER_DIR / ".env")
load_dotenv(ROOT_DIR / ".env")
load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    print("[WARNING] JWT_SECRET not found in .env. Using fallback development secret.")
    JWT_SECRET = "airrunner-local-development-secret-key-32chars-minimum-safe"

TOKEN_TTL = timedelta(hours=1)
LEADERBOARD_MAX = 50

# SMTP Configuration for sending OTP emails to mail inbox
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", "").strip() or SMTP_USER or "AirRunner <no-reply@airrunner.net>"


def send_email_otp(to_email: str, otp_code: str, pilot_name: str = "Pilot", purpose: str = "signup") -> tuple[bool, str]:
    """Sends a 6-digit OTP to the user's email inbox using SMTP, or logs to console if SMTP is not configured."""
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
            print(f"[EMAIL] Successfully sent {purpose} OTP email to {to_email}")
            return True, f"OTP sent to {to_email}."
        except Exception as exc:
            print(f"[EMAIL ERROR] Failed to send email to {to_email}: {exc}")
            return False, f"Could not send email via SMTP: {exc}"

    # Development fallback if SMTP is not yet configured in server/.env
    tag = "SIGNUP EMAIL OTP" if is_signup else "PASSWORD RESET OTP"
    print("\n" + "=" * 60)
    print(f"[{tag}] Target Email: {to_email}")
    print(f"[{tag}] Pilot Name:   {pilot_name}")
    print(f"[{tag}] 6-Digit Code:  {otp_code}")
    print("[TIP] To send real emails to your mail inbox, set SMTP_HOST, SMTP_USER, SMTP_PASSWORD in server/.env")
    print("=" * 60 + "\n")
    return True, f"OTP generated (Printed to server console; add SMTP credentials to server/.env to deliver to inbox)."



mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
mongo_db_name = os.getenv("MONGO_DB", "airrunner")

try:
    import mongomock
except ImportError:
    mongomock = None

try:
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=2000)
    client.admin.command("ping")
    db = client[mongo_db_name]
    print(f"Successfully connected to MongoDB at {mongo_uri}")
except Exception as err:
    if mongomock:
        print(f"Local MongoDB not detected ({err}). Using mongomock in-memory database for testing.")
        client = mongomock.MongoClient()
        db = client[mongo_db_name]
    else:
        raise


def ensure_indexes(database):
    database.users.create_index("email", unique=True)
    database.users.create_index("gamerIdLower", unique=True)  # "Neo" and "neo" are the same Gamer ID
    database.scores.create_index([("score", DESCENDING), ("achievedAt", ASCENDING)])
    database.otp_verifications.create_index("expiresAt", expireAfterSeconds=0)


@asynccontextmanager
async def lifespan(_app):
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


class SignupRequest(BaseModel):
    pilotName: Annotated[Name, Field(min_length=2, max_length=40)]
    gamerId: Annotated[Name, Field(min_length=3, max_length=30)]
    email: Email
    password: Annotated[Password, Field(min_length=8)]


class SignupOtpRequest(BaseModel):
    pilotName: Annotated[Name, Field(min_length=2, max_length=40)]
    gamerId: Annotated[Name, Field(min_length=3, max_length=30)]
    email: Email


class VerifyOtpRequest(BaseModel):
    email: Email
    otp: Annotated[str, Field(min_length=6, max_length=6)]


class CompleteSignupRequest(BaseModel):
    pilotName: Annotated[Name, Field(min_length=2, max_length=40)]
    gamerId: Annotated[Name, Field(min_length=3, max_length=30)]
    email: Email
    otp: Annotated[str, Field(min_length=6, max_length=6)]
    password: Annotated[Password, Field(min_length=8)]
    confirmPassword: Annotated[str, Field(min_length=8)]


class LoginRequest(BaseModel):
    gamerId: Annotated[str, BeforeValidator(_strip)]  # Accepts gamerId or email
    password: Password


class ForgotPasswordOtpRequest(BaseModel):
    identifier: Annotated[str, BeforeValidator(_strip)]


class ResetPasswordRequest(BaseModel):
    email: Email
    otp: Annotated[str, Field(min_length=6, max_length=6)]
    password: Annotated[Password, Field(min_length=8)]
    confirmPassword: Annotated[str, Field(min_length=8)]


class ScoreRequest(BaseModel):
    score: int = Field(ge=0)
    distance: int = Field(ge=0)
    coinsCollected: int = Field(ge=0)


# Checked when the email is unknown, so response time doesn't reveal which emails are registered
_DUMMY_HASH = bcrypt.hashpw(b"airrunner-unknown-user", bcrypt.gensalt())


def _session_for(user):
    claims = {"sub": str(user["_id"]), "gamerId": user["gamerId"], "exp": datetime.now(timezone.utc) + TOKEN_TTL}
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
            user = db.users.find_one({"_id": ObjectId(claims["sub"])})
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
    # Check if gamerId or email is already registered
    existing_user = db.users.find_one({
        "$or": [{"gamerIdLower": req.gamerId.lower()}, {"email": req.email}]
    })
    if existing_user:
        if existing_user.get("gamerIdLower") == req.gamerId.lower():
            raise HTTPException(status.HTTP_409_CONFLICT, "This Gamer ID is already taken. Please choose another.")
        raise HTTPException(status.HTTP_409_CONFLICT, "This email address is already registered. Please sign in instead.")

    # Generate 6-digit OTP
    otp_code = f"{random.randint(100000, 999999):06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    # Store or update OTP record
    db.otp_verifications.update_one(
        {"email": req.email, "type": "signup"},
        {
            "$set": {
                "email": req.email,
                "gamerId": req.gamerId,
                "pilotName": req.pilotName,
                "otp": otp_code,
                "type": "signup",
                "verified": False,
                "expiresAt": expires_at,
                "createdAt": datetime.now(timezone.utc)
            }
        },
        upsert=True
    )

    # Send OTP email
    sent, msg = send_email_otp(req.email, otp_code, req.pilotName, purpose="signup")
    return {"message": f"Verification code sent to {req.email}", "email": req.email}


@app.post("/api/auth/signup/verify-otp")
def signup_verify_otp(req: VerifyOtpRequest):
    record = db.otp_verifications.find_one({"email": req.email, "type": "signup"})
    if not record:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No verification request found for this email. Please request a new code.")
    
    expires_at = record.get("expiresAt")
    if expires_at:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verification code has expired. Please request a new one.")

    if record.get("otp") != req.otp.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect verification code. Please check your inbox and try again.")

    db.otp_verifications.update_one(
        {"_id": record["_id"]},
        {"$set": {"verified": True}}
    )
    return {"message": "Email verified successfully.", "verified": True}


@app.post("/api/auth/signup/complete", status_code=status.HTTP_201_CREATED)
def signup_complete(req: CompleteSignupRequest):
    if req.password != req.confirmPassword:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Passwords do not match.")

    # Check OTP verification
    record = db.otp_verifications.find_one({"email": req.email, "type": "signup"})
    if not record:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please verify your email address first.")

    expires_at = record.get("expiresAt")
    if expires_at:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verification session expired. Please request a new code.")

    if record.get("otp") != req.otp.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid verification code.")

    user = {
        "pilotName": req.pilotName,
        "gamerId": req.gamerId,
        "gamerIdLower": req.gamerId.lower(),
        "email": req.email,
        "passwordHash": bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8"),
        "createdAt": datetime.now(timezone.utc),
    }
    try:
        db.users.insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(status.HTTP_409_CONFLICT, "That Gamer ID or email is already registered.") from None

    # Clean up OTP record
    db.otp_verifications.delete_one({"_id": record["_id"]})
    return _session_for(user)


@app.post("/api/auth/signup", status_code=status.HTTP_201_CREATED)
def signup_direct(req: SignupRequest):
    """Direct signup endpoint retained for backwards compatibility."""
    user = {
        "pilotName": req.pilotName,
        "gamerId": req.gamerId,
        "gamerIdLower": req.gamerId.lower(),
        "email": req.email,
        "passwordHash": bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8"),
        "createdAt": datetime.now(timezone.utc),
    }
    try:
        db.users.insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(status.HTTP_409_CONFLICT, "That email or Gamer ID is already registered.") from None
    return _session_for(user)


@app.post("/api/auth/login")
def login(req: LoginRequest):
    identifier = req.gamerId.strip().lower()
    # Search by unique gamerId or registered email
    user = db.users.find_one({"$or": [{"gamerIdLower": identifier}, {"email": identifier}]})
    stored_hash = user["passwordHash"].encode("utf-8") if user else _DUMMY_HASH
    password_ok = bcrypt.checkpw(req.password.encode("utf-8"), stored_hash)
    if not (user and password_ok):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Gamer ID or password.")
    return _session_for(user)


@app.post("/api/auth/forgot-password/request-otp")
def forgot_password_request_otp(req: ForgotPasswordOtpRequest):
    identifier = req.identifier.strip().lower()
    user = db.users.find_one({"$or": [{"gamerIdLower": identifier}, {"email": identifier}]})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No account found with that Gamer ID or Email.")

    user_email = user["email"]
    pilot_name = user.get("pilotName", "Pilot")
    otp_code = f"{random.randint(100000, 999999):06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    db.otp_verifications.update_one(
        {"email": user_email, "type": "forgot_password"},
        {
            "$set": {
                "email": user_email,
                "userId": user["_id"],
                "otp": otp_code,
                "type": "forgot_password",
                "verified": False,
                "expiresAt": expires_at,
                "createdAt": datetime.now(timezone.utc)
            }
        },
        upsert=True
    )

    send_email_otp(user_email, otp_code, pilot_name, purpose="reset")

    # Return masked email for privacy UI feedback (e.g. jo***@gmail.com)
    parts = user_email.split("@")
    masked = parts[0][:2] + "***@" + parts[1] if len(parts) == 2 and len(parts[0]) > 2 else user_email
    return {"message": f"Reset code sent to {masked}", "email": user_email, "maskedEmail": masked}


@app.post("/api/auth/forgot-password/reset")
def forgot_password_reset(req: ResetPasswordRequest):
    if req.password != req.confirmPassword:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Passwords do not match.")

    record = db.otp_verifications.find_one({"email": req.email, "type": "forgot_password"})
    if not record:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No password reset request found for this email.")

    expires_at = record.get("expiresAt")
    if expires_at:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reset code has expired. Please request a new one.")

    if record.get("otp") != req.otp.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect verification code.")

    new_hash = bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    result = db.users.update_one({"email": req.email}, {"$set": {"passwordHash": new_hash}})
    if result.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User account not found.")

    db.otp_verifications.delete_one({"_id": record["_id"]})
    return {"message": "Password reset successfully! You can now sign in with your new password."}



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
# Static Frontend Serving for unified local host access
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
    print("AirRunner Local Host Server Running!")
    print(f"-> Open in browser: http://localhost:{port}/login.html")
    print(f"-> API Documentation: http://localhost:{port}/docs")
    print("=" * 60 + "\n")
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)

