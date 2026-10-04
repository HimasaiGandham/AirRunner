"""
Air Runner — gamers database.

Creates and seeds the SQLite file `Air Runner.db` (in the repo root) from the
live game state: the accounts in the Mongo `users` collection and the runs in
the `scores` collection. The schema mirrors server/app.py exactly:

  gamers  <- users collection   (gamerId is the unique, case-insensitive handle)
  runs    <- scores collection  (one row per submitted run)

`python server/airrunner_db.py` rebuilds the file from the running server's
MongoDB (falling back to mongomock when Mongo is unreachable), or prints the
current contents when called with `--show`.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

DB_FILENAME = "Air Runner.db"
REPO_ROOT = Path(__file__).resolve().parent.parent

SCHEMA = """
CREATE TABLE IF NOT EXISTS gamers (
    gamer_id         TEXT PRIMARY KEY,
    gamer_id_lower   TEXT NOT NULL UNIQUE,   -- "Neo" and "neo" are the same Gamer ID
    pilot_name       TEXT NOT NULL,
    email            TEXT NOT NULL UNIQUE,
    created_at       TEXT NOT NULL             -- ISO-8601 UTC
);

CREATE TABLE IF NOT EXISTS runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    gamer_id    TEXT NOT NULL REFERENCES gamers(gamer_id),
    score       INTEGER NOT NULL,
    distance    REAL    NOT NULL,
    achieved_at TEXT NOT NULL                 -- ISO-8601 UTC
);

CREATE INDEX IF NOT EXISTS idx_gamers_lower ON gamers(gamer_id_lower);
CREATE INDEX IF NOT EXISTS idx_runs_ranking ON runs(score DESC, achieved_at ASC);
CREATE INDEX IF NOT EXISTS idx_runs_gamer   ON runs(gamer_id);
"""


def _iso(value: object) -> str:
    """Mongo datetimes are tz-aware; store them as explicit UTC ISO-8601."""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    return str(value)


def _mongo_db():
    """The live database the API writes to, or a mongomock stand-in."""
    uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    name = os.getenv("MONGO_DB", "airrunner")
    try:
        from pymongo import MongoClient

        client = MongoClient(uri, serverSelectionTimeoutMS=1000)
        client.admin.command("ping")
        return client[name], False
    except Exception as err:  # noqa: BLE001 - any failure means "no real Mongo"
        print(f"MongoDB unavailable ({err}); building from an empty database.", file=sys.stderr)
        import mongomock

        return mongomock.MongoClient()[name], True


def connect(path: Path | None = None) -> sqlite3.Connection:
    target = path or (REPO_ROOT / DB_FILENAME)
    conn = sqlite3.connect(target)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


def rebuild(path: Path | None = None, db=None) -> Path:
    """Rebuild Air Runner.db from scratch out of the server's Mongo data.

    Pass `db` to reuse an already-open database — required when Mongo is
    unreachable and the mongomock stand-in is in play, since a fresh mongomock
    client starts empty and would not see anything seeded in this process.
    """
    target = path or (REPO_ROOT / DB_FILENAME)
    if target.exists():
        target.unlink()

    if db is None:
        db, _empty = _mongo_db()
    conn = connect(target)

    users = list(db.users.find()) if "users" in db.list_collection_names() else []
    for user in users:
        conn.execute(
            "INSERT INTO gamers (gamer_id, gamer_id_lower, pilot_name, email, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (
                user["gamerId"],
                user["gamerId"].lower(),
                user["pilotName"],
                user["email"],
                _iso(user.get("createdAt")),
            ),
        )

    scores = list(db.scores.find()) if "scores" in db.list_collection_names() else []
    for run in scores:
        conn.execute(
            "INSERT INTO runs (gamer_id, score, distance, achieved_at) VALUES (?, ?, ?, ?)",
            (run["gamerId"], run["score"], run["distance"], _iso(run.get("achievedAt"))),
        )

    conn.commit()
    print(f"Wrote {target} — {len(users)} gamer(s), {len(scores)} run(s).")
    return target


def show(path: Path | None = None) -> None:
    conn = connect(path)
    print("\nGamers")
    print("------")
    for row in conn.execute("SELECT * FROM gamers ORDER BY gamer_id_lower"):
        print(f"  {row['gamer_id']:<20} {row['pilot_name']:<20} {row['email']}")

    print("\nLeaderboard (best run per gamer)")
    print("-----------------------------------")
    for row in conn.execute(
        "SELECT r.gamer_id, MAX(r.score) AS best, COUNT(*) AS runs"
        " FROM runs r GROUP BY r.gamer_id ORDER BY best DESC"
    ):
        print(f"  {row['gamer_id']:<20} best {row['best']:>8}  ({row['runs']} run(s))")
    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build/show the Air Runner gamers database.")
    parser.add_argument("--show", action="store_true", help="print the database instead of rebuilding it")
    args = parser.parse_args()

    if args.show:
        show()
    else:
        rebuild()
        show()