import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
import random
import bcrypt
import jwt
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "supersecretjwtkey_replace_in_prod")
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

# In-Memory Database (List of dictionaries)
users_db = []

# Pydantic Models for Request Bodies
class SignupRequest(BaseModel):
    pilotName: str
    gamerId: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str

# Helper Functions (OTP removed)


# Routes
@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "AirRunner FastAPI backend is running"}

@app.post("/api/auth/signup")
def signup(req: SignupRequest):
    # Check if user exists
    for u in users_db:
        if u["email"] == req.email or u["gamerId"] == req.gamerId:
            raise HTTPException(status_code=400, detail="User with this email or Gamer ID already exists.")

    # Hash password
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(req.password.encode('utf-8'), salt).decode('utf-8')

    new_user = {
        "id": str(int(datetime.utcnow().timestamp() * 1000)),
        "pilotName": req.pilotName,
        "gamerId": req.gamerId,
        "email": req.email,
        "passwordHash": hashed_password,
        "isVerified": True  # OTP bypassed
    }

    users_db.append(new_user)

    token_payload = {
        "id": new_user["id"],
        "gamerId": new_user["gamerId"],
        "exp": datetime.utcnow() + timedelta(hours=1)
    }
    token = jwt.encode(token_payload, JWT_SECRET, algorithm="HS256")

    return {
        "message": "Signup successful",
        "token": token,
        "pilotName": new_user["pilotName"],
        "gamerId": new_user["gamerId"]
    }

@app.post("/api/auth/login")
def login(req: LoginRequest):
    user = next((u for u in users_db if u["email"] == req.email), None)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid credentials.")

    # Verify password
    if not bcrypt.checkpw(req.password.encode('utf-8'), user["passwordHash"].encode('utf-8')):
        raise HTTPException(status_code=400, detail="Invalid credentials.")

    token_payload = {
        "id": user["id"],
        "gamerId": user["gamerId"],
        "exp": datetime.utcnow() + timedelta(hours=1)
    }
    token = jwt.encode(token_payload, JWT_SECRET, algorithm="HS256")

    return {
        "message": "Login successful",
        "token": token,
        "pilotName": user.get("pilotName", ""),
        "gamerId": user.get("gamerId", "")
    }

@app.post("/api/auth/verify-otp")
def verify_otp(req: VerifyOTPRequest):
    user = next((u for u in users_db if u["email"] == req.email), None)
    if not user:
        raise HTTPException(status_code=400, detail="User not found.")

    if user["otp"] != req.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    if user["otpExpiresAt"] < datetime.utcnow():
        raise HTTPException(status_code=400, detail="OTP has expired.")

    # OTP Valid
    user["isVerified"] = True
    user["otp"] = None
    user["otpExpiresAt"] = None

    token_payload = {
        "id": user["id"],
        "gamerId": user["gamerId"],
        "exp": datetime.utcnow() + timedelta(hours=1)
    }
    token = jwt.encode(token_payload, JWT_SECRET, algorithm="HS256")

    return {
        "message": "Verification successful",
        "token": token,
        "pilotName": user["pilotName"],
        "gamerId": user["gamerId"]
    }
