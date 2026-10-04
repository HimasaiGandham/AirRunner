"""
Seed `Air Runner.db` with real gamer accounts and runs.

Accounts and scores are created by calling the actual FastAPI endpoints in
server/app.py (signup -> login -> submit score), so the rows in the SQLite file
are exactly what the game would have stored — no hand-written fixtures.

    python server/seed_gamers.py            # seed, then rebuild Air Runner.db
    python server/seed_gamers.py --force    # re-run even if rows already exist
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "server"))

import airrunner_db  # noqa: E402

# Gamer ID, pilot name, email, password, then (score, distance, coins) runs.
PILOTS = [
    ("Neo", "Neeta Rao", "neo@airrunner.dev", "airrunner-dev-1", [(1420, 3140, 37), (980, 2210, 24)]),
    ("Vex", "Vikram Shah", "vex@airrunner.dev", "airrunner-dev-2", [(2210, 4870, 58)]),
    ("Juno", "Anita Desai", "juno@airrunner.dev", "airrunner-dev-3", [(760, 1620, 19), (1130, 2605, 31), (1355, 3055, 44)]),
    ("Rift", "Rohit Menon", "rift@airrunner.dev", "airrunner-dev-4", [(1890, 4105, 49)]),
]


def seed(force: bool = False) -> int:
    from fastapi.testclient import TestClient

    import app as server  # the mongomock fallback keeps this offline-safe

    client = TestClient(server.app)

    created = 0
    for gamer_id, pilot, email, password, runs in PILOTS:
        response = client.post(
            "/api/auth/signup",
            json={
                "pilotName": pilot,
                "gamerId": gamer_id,
                "email": email,
                "password": password,
            },
        )
        if response.status_code == 409 and not force:
            continue  # already seeded
        if response.status_code not in (200, 201):
            print(f"  ! signup failed for {gamer_id}: {response.status_code} {response.text}")
            continue
        created += 1

        # Exercise the real login path too, so auth is proven end to end.
        token = client.post(
            "/api/auth/login",
            json={"email": email, "password": password},
        ).json()["token"]

        for score, distance, coins in runs:
            posted = client.post(
                "/api/scores",
                json={"score": score, "distance": int(distance), "coinsCollected": coins},
                headers={"Authorization": f"Bearer {token}"},
            )
            if posted.status_code != 201:
                print(f"  ! score rejected for {gamer_id}: {posted.status_code} {posted.text}")

    print(f"Seeded {created} new gamer(s) through the API.")
    return created


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed the Air Runner gamers database via the real API.")
    parser.add_argument("--force", action="store_true", help="re-create accounts that already exist")
    args = parser.parse_args()

    seed(force=args.force)
    # Rebuild from the SAME database the seed just wrote to, so the offline
    # mongomock path still produces a populated file.
    import app as server

    airrunner_db.rebuild(db=server.db)
    airrunner_db.show()