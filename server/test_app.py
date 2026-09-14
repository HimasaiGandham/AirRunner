"""API tests. MongoDB is swapped for in-memory mongomock, so no database server is needed."""

import os
from datetime import datetime, timedelta, timezone

TEST_SECRET = "test-secret-that-is-at-least-32-bytes-long"
os.environ["JWT_SECRET"] = TEST_SECRET

import jwt  # noqa: E402
import mongomock  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app as backend  # noqa: E402

PASSWORD = "followthewhiterabbit"


@pytest.fixture
def client(monkeypatch):
    database = mongomock.MongoClient().airrunner
    backend.ensure_indexes(database)
    monkeypatch.setattr(backend, "db", database)
    return TestClient(backend.app)


def signup(client, gamer_id="neo", email="neo@example.com", **overrides):
    body = {"pilotName": "Neo Anderson", "gamerId": gamer_id, "email": email, "password": PASSWORD, **overrides}
    return client.post("/api/auth/signup", json=body)


def login(client, email="neo@example.com", password=PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def post_score(client, token, score=100, **fields):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    body = {"score": score, "distance": 42, "coinsCollected": 3, **fields}
    return client.post("/api/scores", json=body, headers=headers)


def test_signup_then_login_with_differently_cased_email(client):
    res = signup(client, email="Neo@Example.com")
    assert res.status_code == 201
    assert res.json()["gamerId"] == "neo"

    res = login(client, email="NEO@example.com")
    assert res.status_code == 200
    assert res.json()["pilotName"] == "Neo Anderson"


def test_duplicate_email_or_gamer_id_is_rejected(client):
    assert signup(client).status_code == 201
    assert signup(client, gamer_id="someone").status_code == 409
    assert signup(client, email="someone@example.com").status_code == 409
    assert signup(client, gamer_id="NEO", email="someone@example.com").status_code == 409


@pytest.mark.parametrize("email, password", [("neo@example.com", "wrong-password"), ("ghost@example.com", PASSWORD)])
def test_bad_credentials_are_rejected(client, email, password):
    signup(client)
    assert login(client, email, password).status_code == 401


@pytest.mark.parametrize(
    "overrides",
    [
        {"password": "short"},
        {"password": "é" * 37},  # 74 bytes, past bcrypt's limit
        {"pilotName": "  ab  "},
        {"gamerId": ""},
        {"email": "not-an-email"},
    ],
)
def test_signup_validates_input(client, overrides):
    assert signup(client, **overrides).status_code == 422


def test_overlong_login_password_is_a_validation_error_not_a_crash(client):
    assert login(client, password="é" * 37).status_code == 422


def test_scores_require_a_valid_unexpired_token(client):
    token = signup(client).json()["token"]
    user_id = jwt.decode(token, options={"verify_signature": False})["sub"]
    now = datetime.now(timezone.utc)
    expired = jwt.encode({"sub": user_id, "exp": now - timedelta(minutes=1)}, TEST_SECRET, algorithm="HS256")
    forged = jwt.encode({"sub": user_id, "exp": now + timedelta(hours=1)}, "x" * 48, algorithm="HS256")

    for bad_token in (None, "garbage", expired, forged):
        assert post_score(client, bad_token).status_code == 401
    assert post_score(client, token).status_code == 201


@pytest.mark.parametrize("field", ["score", "distance", "coinsCollected"])
def test_negative_run_values_are_rejected(client, field):
    token = signup(client).json()["token"]
    assert post_score(client, token, **{field: -1}).status_code == 422


@pytest.mark.parametrize("limit", [0, 51])
def test_leaderboard_limit_is_bounded(client, limit):
    assert client.get(f"/api/leaderboard?limit={limit}").status_code == 422


def test_leaderboard_shows_each_players_best_run_highest_first(client):
    neo = signup(client).json()["token"]
    trinity = signup(client, gamer_id="trinity", email="trinity@example.com").json()["token"]
    for token, score in [(neo, 500), (trinity, 700), (neo, 900)]:
        assert post_score(client, token, score).status_code == 201

    board = client.get("/api/leaderboard").json()
    assert [(row["gamerId"], row["score"]) for row in board] == [("neo", 900), ("trinity", 700)]
    assert len(client.get("/api/leaderboard?limit=1").json()) == 1
