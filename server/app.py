"""AirRunner API: pilot accounts, run scores and the leaderboard, stored in MongoDB."""

import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import AfterValidator, BaseModel, BeforeValidator, EmailStr, Field
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import DuplicateKeyError

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is not set. Copy server/.env.example to server/.env and fill it in.")

TOKEN_TTL = timedelta(hours=1)
LEADERBOARD_MAX = 50

client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"), serverSelectionTimeoutMS=5000)
db = client[os.getenv("MONGO_DB", "airrunner")]


def ensure_indexes(database):
    database.users.create_index("email", unique=True)
    database.users.create_index("gamerIdLower", unique=True)  # "Neo" and "neo" are the same Gamer ID
    database.scores.create_index([("score", DESCENDING), ("achievedAt", ASCENDING)])


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


class SignupRequest(BaseModel):
    pilotName: Annotated[Name, Field(min_length=3, max_length=40)]
    gamerId: Annotated[Name, Field(min_length=3, max_length=30)]
    email: Email
    password: Annotated[Password, Field(min_length=8)]


class LoginRequest(BaseModel):
    email: Email
    password: Password


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


@app.post("/api/auth/signup", status_code=status.HTTP_201_CREATED)
def signup(req: SignupRequest):
    user = {
        "pilotName": req.pilotName,
        "gamerId": req.gamerId,
        "gamerIdLower": req.gamerId.lower(),
        "email": req.email,
        "passwordHash": bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8"),
        "createdAt": datetime.now(timezone.utc),
    }
    try:
        db.users.insert_one(user)  # sets user["_id"]
    except DuplicateKeyError:
        raise HTTPException(status.HTTP_409_CONFLICT, "That email or Gamer ID is already registered.") from None
    return _session_for(user)


@app.post("/api/auth/login")
def login(req: LoginRequest):
    user = db.users.find_one({"email": req.email})
    stored_hash = user["passwordHash"].encode("utf-8") if user else _DUMMY_HASH
    password_ok = bcrypt.checkpw(req.password.encode("utf-8"), stored_hash)
    if not (user and password_ok):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")
    return _session_for(user)


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
