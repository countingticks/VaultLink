from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import psycopg
from psycopg import sql
from dotenv import load_dotenv


def maintenance_url(database_url: str) -> tuple[str, str]:
    parsed = urlparse(database_url)
    db_name = parsed.path.lstrip("/") or "vaultlink"
    maintenance = parsed._replace(path="/postgres")
    return urlunparse(maintenance), db_name


def ensure_database(database_url: str) -> None:
    admin_url, db_name = maintenance_url(database_url)
    try:
        with psycopg.connect(admin_url, autocommit=True) as conn:
            exists = conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,)).fetchone()
            if not exists:
                conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db_name)))
                print(f"Created database {db_name}")
    except psycopg.OperationalError as exc:
        parsed = urlparse(database_url)
        user = parsed.username or "postgres"
        host = parsed.hostname or "localhost"
        port = parsed.port or 5432
        raise SystemExit(
            "\nCould not connect to PostgreSQL.\n"
            f"Tried user '{user}' on {host}:{port}.\n\n"
            "Open backend\\.env and set DATABASE_URL to your real PostgreSQL credentials, for example:\n"
            "DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/vaultlink\n\n"
            "If you do not remember the PostgreSQL password, reset it in pgAdmin or reinstall PostgreSQL with a known password.\n"
            f"\nOriginal error: {exc}\n"
        ) from exc


def main() -> None:
    load_dotenv()
    database_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/vaultlink")
    schema_path = Path(__file__).resolve().parents[1] / "db" / "schema.sql"
    schema_sql = schema_path.read_text(encoding="utf-8")

    ensure_database(database_url)
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute(schema_sql)

    print(f"Applied schema from {schema_path}")


if __name__ == "__main__":
    main()
