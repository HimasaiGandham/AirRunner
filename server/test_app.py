"""API tests. MongoDB is swapped for in-memory mongomock and emails are captured, so nothing external is needed."""

import os
from datetime import datetime, timedelta, timezone

TEST_SECRET = "test-secret-that-is-at-least-32-bytes-long"
os.environ["JWT_SECRET"] = TEST_SECRET

import jwt  # noqa: E402
import mongomock  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app as backend  # noqa: E402

PILOT = {"pilotName": "Neo Anderson", "gamerId": "neo", "email": "neo@example.com"}
PASSWORD = "followthewhiterabbit"


class Mailbox:
    """Stands in for SMTP and remembers the codes that would have been emailed."""

    def __init__(self):
        self.sent = []

    def send(self, to_email, otp_code, pilot_name="Pilot", purpose="signup"):
        self.sent.append({"email": to_email, "code": otp_code, "purpose": purpose})
        return True, "sent"

    def code_for(self, email, purpose):
        return next(m["code"] for m in reversed(self.sent) if m["email"] == email and m["purpose"] == purpose)


@pytest.fixture
def mailbox(monkeypatch):
    box = Mailbox()
    monkeypatch.setattr(backend, "send_email_otp", box.send)
    return box


@pytest.fixture
def client(monkeypatch):
    database = mongomock.MongoClient().airrunner
    backend.ensure_indexes(database)
    monkeypatch.setattr(backend, "db", database)
    return TestClient(backend.app)


def request_signup_otp(client, **overrides):
    return client.post("/api/auth/signup/request-otp", json={**PILOT, **overrides})


def register(client, mailbox, password=PASSWORD, **overrides):
    """Runs the whole signup flow and returns the completed response."""
    pilot = {**PILOT, **overrides}
    assert request_signup_otp(client, **overrides).status_code == 200
    code = mailbox.code_for(pilot["email"], "signup")
    assert client.post("/api/auth/signup/verify-otp", json={"email": pilot["email"], "otp": code}).status_code == 200
    return client.post(
        "/api/auth/signup/complete",
        json={"email": pilot["email"], "otp": code, "password": password, "confirmPassword": password},
    )


def login(client, gamer_id="neo", password=PASSWORD):
    return client.post("/api/auth/login", json={"gamerId": gamer_id, "password": password})


def post_score(client, token, score=100, **fields):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    body = {"score": score, "distance": 42, "coinsCollected": 3, **fields}
    return client.post("/api/scores", json=body, headers=headers)


def expire_code(email, purpose):
    backend.db.otp_verifications.update_one(
        {"email": email, "type": purpose},
        {"$set": {"expiresAt": datetime.now(timezone.utc) - timedelta(minutes=1)}},
    )


# ---- Signup with email verification ----

def test_signup_flow_creates_an_account_that_can_sign_in(client, mailbox):
    res = register(client, mailbox)
    assert res.status_code == 201
    assert res.json()["gamerId"] == "neo"

    # Either the Gamer ID or the email works, in any casing
    assert login(client, "NEO").status_code == 200
    assert login(client, "Neo@Example.com").status_code == 200


def test_account_is_not_created_without_the_emailed_code(client, mailbox):
    request_signup_otp(client)
    body = {"email": PILOT["email"], "otp": "000000", "password": PASSWORD, "confirmPassword": PASSWORD}
    assert client.post("/api/auth/signup/complete", json=body).status_code == 400
    assert backend.db.users.count_documents({}) == 0


def test_there_is_no_way_to_register_without_verifying_the_email(client):
    # The old unverified endpoint is gone
    assert client.post("/api/auth/signup", json={**PILOT, "password": PASSWORD}).status_code == 404


def test_signup_rejects_a_taken_gamer_id_or_email(client, mailbox):
    register(client, mailbox)
    assert request_signup_otp(client, email="someone@example.com").status_code == 409
    assert request_signup_otp(client, gamerId="NEO", email="other@example.com").status_code == 409


def test_the_name_and_gamer_id_come_from_the_verified_request(client, mailbox):
    request_signup_otp(client)
    code = mailbox.code_for(PILOT["email"], "signup")
    res = client.post(
        "/api/auth/signup/complete",
        json={
            "email": PILOT["email"],
            "otp": code,
            "password": PASSWORD,
            "confirmPassword": PASSWORD,
            "gamerId": "somebody_else",  # ignored
            "pilotName": "Somebody Else",
        },
    )
    assert res.status_code == 201
    assert res.json()["gamerId"] == "neo"


def test_an_expired_code_is_refused(client, mailbox):
    request_signup_otp(client)
    code = mailbox.code_for(PILOT["email"], "signup")
    expire_code(PILOT["email"], "signup")
    assert client.post("/api/auth/signup/verify-otp", json={"email": PILOT["email"], "otp": code}).status_code == 400


@pytest.mark.parametrize(
    "overrides",
    [{"pilotName": "  ab  "}, {"gamerId": "no"}, {"email": "not-an-email"}],
)
def test_signup_validates_input(client, overrides):
    assert request_signup_otp(client, **overrides).status_code == 422


@pytest.mark.parametrize("password", ["short", "é" * 37])  # too short, and past bcrypt's 72-byte limit
def test_passwords_are_validated(client, mailbox, password):
    request_signup_otp(client)
    code = mailbox.code_for(PILOT["email"], "signup")
    body = {"email": PILOT["email"], "otp": code, "password": password, "confirmPassword": password}
    assert client.post("/api/auth/signup/complete", json=body).status_code == 422


def test_mismatched_passwords_are_refused(client, mailbox):
    request_signup_otp(client)
    code = mailbox.code_for(PILOT["email"], "signup")
    body = {"email": PILOT["email"], "otp": code, "password": PASSWORD, "confirmPassword": PASSWORD + "-typo"}
    assert client.post("/api/auth/signup/complete", json=body).status_code == 400


# ---- Codes cannot be guessed or used to flood an inbox ----

def test_a_code_is_invalidated_after_five_wrong_guesses(client, mailbox):
    request_signup_otp(client)
    real_code = mailbox.code_for(PILOT["email"], "signup")

    statuses = [
        client.post("/api/auth/signup/verify-otp", json={"email": PILOT["email"], "otp": f"00000{i}"}).status_code
        for i in range(5)
    ]
    assert statuses == [400, 400, 400, 400, 429]

    # Even the real code no longer works: a new one has to be requested
    assert client.post("/api/auth/signup/verify-otp", json={"email": PILOT["email"], "otp": real_code}).status_code == 400


def test_codes_cannot_be_requested_again_immediately(client, mailbox):
    assert request_signup_otp(client).status_code == 200
    assert request_signup_otp(client).status_code == 429
    assert len(mailbox.sent) == 1


# ---- Password reset ----

def test_password_reset_replaces_the_password(client, mailbox):
    register(client, mailbox)
    assert client.post("/api/auth/forgot-password/request-otp", json={"identifier": "neo"}).status_code == 200
    code = mailbox.code_for(PILOT["email"], "reset")

    new_password = "the-spoon-does-not-exist"
    res = client.post(
        "/api/auth/forgot-password/reset",
        json={"identifier": "neo", "otp": code, "password": new_password, "confirmPassword": new_password},
    )
    assert res.status_code == 200
    assert login(client, "neo", PASSWORD).status_code == 401
    assert login(client, "neo", new_password).status_code == 200


def test_password_reset_signs_out_existing_sessions(client, mailbox):
    token = register(client, mailbox).json()["token"]
    assert post_score(client, token).status_code == 201

    client.post("/api/auth/forgot-password/request-otp", json={"identifier": "neo"})
    code = mailbox.code_for(PILOT["email"], "reset")
    new_password = "the-spoon-does-not-exist"
    client.post(
        "/api/auth/forgot-password/reset",
        json={"identifier": "neo", "otp": code, "password": new_password, "confirmPassword": new_password},
    )

    assert post_score(client, token).status_code == 401


def test_reset_requests_never_reveal_whether_an_account_exists(client, mailbox):
    register(client, mailbox)
    known = client.post("/api/auth/forgot-password/request-otp", json={"identifier": "neo"})
    unknown = client.post("/api/auth/forgot-password/request-otp", json={"identifier": "ghost"})

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    # ...and no reply ever carries the account's email address
    assert PILOT["email"] not in known.text


def test_a_reset_code_cannot_be_brute_forced(client, mailbox):
    register(client, mailbox)
    client.post("/api/auth/forgot-password/request-otp", json={"identifier": "neo"})
    real_code = mailbox.code_for(PILOT["email"], "reset")
    attacker = {"identifier": "neo", "password": "attacker-password", "confirmPassword": "attacker-password"}

    statuses = [
        client.post("/api/auth/forgot-password/reset", json={**attacker, "otp": f"00000{i}"}).status_code
        for i in range(5)
    ]
    assert statuses == [400, 400, 400, 400, 429]
    assert client.post("/api/auth/forgot-password/reset", json={**attacker, "otp": real_code}).status_code == 400
    assert login(client, "neo", PASSWORD).status_code == 200  # the real password still works


# ---- Sign in ----

@pytest.mark.parametrize("gamer_id, password", [("neo", "wrong-password"), ("ghost", PASSWORD)])
def test_bad_credentials_are_rejected(client, mailbox, gamer_id, password):
    register(client, mailbox)
    assert login(client, gamer_id, password).status_code == 401


def test_overlong_login_password_is_a_validation_error_not_a_crash(client):
    assert login(client, "neo", "é" * 37).status_code == 422


# ---- Scores and leaderboard ----

def test_scores_require_a_valid_unexpired_token(client, mailbox):
    token = register(client, mailbox).json()["token"]
    claims = jwt.decode(token, options={"verify_signature": False})
    now = datetime.now(timezone.utc)
    expired = jwt.encode({**claims, "exp": now - timedelta(minutes=1)}, TEST_SECRET, algorithm="HS256")
    forged = jwt.encode({**claims, "exp": now + timedelta(hours=1)}, "x" * 48, algorithm="HS256")

    for bad_token in (None, "garbage", expired, forged):
        assert post_score(client, bad_token).status_code == 401
    assert post_score(client, token).status_code == 201


@pytest.mark.parametrize("field", ["score", "distance", "coinsCollected"])
def test_negative_run_values_are_rejected(client, mailbox, field):
    token = register(client, mailbox).json()["token"]
    assert post_score(client, token, **{field: -1}).status_code == 422


def test_leaderboard_shows_each_players_best_run_highest_first(client, mailbox):
    neo = register(client, mailbox).json()["token"]
    trinity = register(client, mailbox, gamerId="trinity", email="trinity@example.com").json()["token"]
    for token, score in [(neo, 500), (trinity, 700), (neo, 900)]:
        assert post_score(client, token, score).status_code == 201

    board = client.get("/api/leaderboard").json()
    assert [(row["gamerId"], row["score"]) for row in board] == [("neo", 900), ("trinity", 700)]
    assert len(client.get("/api/leaderboard?limit=1").json()) == 1


@pytest.mark.parametrize("limit", [0, 51])
def test_leaderboard_limit_is_bounded(client, limit):
    assert client.get(f"/api/leaderboard?limit={limit}").status_code == 422
