from __future__ import annotations

import hashlib
import io
import json
import os
import secrets
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg
from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_file, session
from flask_cors import CORS
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from werkzeug.datastructures import FileStorage
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

load_dotenv()

EXPIRATION_OPTIONS = {
    "10m": timedelta(minutes=10),
    "1h": timedelta(hours=1),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
}

ALLOWED_EXTENSIONS = {
    ".txt",
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".zip",
    ".csv",
    ".json",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
}

RATE_LIMIT_ATTEMPTS = 5


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY=os.getenv("SECRET_KEY", secrets.token_hex(32)),
        DATABASE_URL=os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/vaultlink"),
        FRONTEND_ORIGIN=os.getenv("FRONTEND_ORIGIN", "http://localhost:5173"),
        UPLOAD_FOLDER=os.getenv("UPLOAD_FOLDER", "storage"),
        MAX_UPLOAD_BYTES=int(os.getenv("MAX_UPLOAD_BYTES", "10485760")),
        FERNET_KEY=os.getenv("VAULTLINK_FERNET_KEY", ""),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=False,
    )
    if test_config:
        app.config.update(test_config)

    configured_origins = [
        origin.strip()
        for origin in app.config["FRONTEND_ORIGIN"].split(",")
        if origin.strip()
    ]
    CORS(
        app,
        supports_credentials=True,
        origins=[
            *configured_origins,
            r"http://localhost:\d+",
            r"http://127\.0\.0\.1:\d+",
            r"http://192\.168\.\d+\.\d+:\d+",
            r"http://10\.\d+\.\d+\.\d+:\d+",
            r"http://172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+:\d+",
        ],
    )

    storage_dir = Path(app.config["UPLOAD_FOLDER"]).resolve()
    storage_dir.mkdir(parents=True, exist_ok=True)
    app.config["STORAGE_DIR"] = storage_dir

    if not app.config["FERNET_KEY"]:
        raise RuntimeError(
            "VAULTLINK_FERNET_KEY is missing. Generate one with "
            "`python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"` "
            "and add it to backend/.env before uploading files."
        )
    app.config["FERNET"] = Fernet(app.config["FERNET_KEY"].encode())

    app.config.setdefault("DB_POOL", None)

    @app.teardown_appcontext
    def close_pool(_: BaseException | None = None) -> None:
        pool = app.config.get("DB_POOL")
        if pool and getattr(pool, "closed", False):
            return

    @contextmanager
    def db():
        pool = app.config.get("DB_POOL")
        if pool is None:
            pool = ConnectionPool(
                conninfo=app.config["DATABASE_URL"],
                kwargs={"row_factory": dict_row, "autocommit": False},
                open=True,
            )
            app.config["DB_POOL"] = pool
        with pool.connection() as conn:
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise

    def audit(
        event_type: str,
        user_id: int | None = None,
        share_id: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        ip_address = request.headers.get("X-Forwarded-For", request.remote_addr or "127.0.0.1").split(",")[0].strip()
        with db() as conn:
            conn.execute(
                """
                INSERT INTO audit_logs (user_id, share_id, event_type, ip_address, details)
                VALUES (%s, %s, %s, %s, %s::jsonb)
                """,
                (user_id, share_id, event_type, ip_address, json.dumps(details or {})),
            )

    def current_user() -> dict[str, Any] | None:
        user_id = session.get("user_id")
        if not user_id:
            return None
        with db() as conn:
            return conn.execute(
                "SELECT id, username, role, created_at FROM users WHERE id = %s",
                (user_id,),
            ).fetchone()

    def require_user() -> dict[str, Any] | Response:
        user = current_user()
        if not user:
            return error("Authentication required", 401)
        return user

    def error(message: str, status: int = 400, code: str | None = None) -> Response:
        return jsonify({"error": {"message": message, "code": code or message.upper().replace(" ", "_")}}), status

    def serialize_user(user: dict[str, Any]) -> dict[str, Any]:
        return {"id": user["id"], "username": user["username"], "role": user["role"]}

    def serialize_file_share(row: dict[str, Any]) -> dict[str, Any]:
        expires_at = row["expires_at"]
        expired = expires_at <= utcnow()
        return {
            "id": row["file_id"],
            "originalFilename": row["original_filename"],
            "size": row["size"],
            "sha256Hash": row["sha256_hash"],
            "note": row.get("note"),
            "createdAt": row["file_created_at"].isoformat(),
            "share": {
                "id": row["share_id"],
                "token": row["token"],
                "expiresAt": expires_at.isoformat(),
                "expired": expired,
                "passwordRequired": bool(row["password_hash"]),
                "oneTime": row["one_time"],
                "used": row["used"],
                "usedAt": row["used_at"].isoformat() if row["used_at"] else None,
                "createdAt": row["share_created_at"].isoformat(),
            },
        }

    def share_url(token: str) -> str:
        origin = request.headers.get("Origin") or app.config["FRONTEND_ORIGIN"].split(",")[0]
        return f"{origin.rstrip('/')}/share/{token}"

    def is_allowed_file(file: FileStorage) -> bool:
        name = file.filename or ""
        ext = Path(name).suffix.lower()
        return ext in ALLOWED_EXTENSIONS

    def load_share(token: str) -> dict[str, Any] | None:
        with db() as conn:
            return conn.execute(
                """
                SELECT
                    s.id AS share_id, s.token, s.password_hash, s.expires_at, s.one_time, s.used, s.used_at,
                    f.id AS file_id, f.owner_id, f.original_filename, f.stored_filename, f.size, f.sha256_hash, f.note
                FROM shares s
                JOIN files f ON f.id = s.file_id
                WHERE s.token = %s
                """,
                (token,),
            ).fetchone()

    def share_is_password_verified(token: str) -> bool:
        verified = session.get("verified_shares", [])
        return token in verified

    def mark_share_verified(token: str) -> None:
        verified = set(session.get("verified_shares", []))
        verified.add(token)
        session["verified_shares"] = sorted(verified)

    def rate_limit_key(token: str) -> str:
        ip = request.headers.get("X-Forwarded-For", request.remote_addr or "127.0.0.1").split(",")[0].strip()
        return f"{ip}:{token}"

    @app.post("/api/register")
    def register():
        payload = request.get_json(silent=True) or {}
        username = (payload.get("username") or "").strip()
        password = payload.get("password") or ""
        if len(username) < 3:
            return error("Username must be at least 3 characters")
        if len(password) < 8:
            return error("Password must be at least 8 characters")
        try:
            with db() as conn:
                existing_count = conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
                role = "admin" if existing_count == 0 else "user"
                user = conn.execute(
                    """
                    INSERT INTO users (username, password_hash, role)
                    VALUES (%s, %s, %s)
                    RETURNING id, username, role, created_at
                    """,
                    (username, generate_password_hash(password), role),
                ).fetchone()
        except psycopg.errors.UniqueViolation:
            return error("Username is already registered", 409, "USERNAME_TAKEN")
        session["user_id"] = user["id"]
        audit("user_registered", user_id=user["id"], details={"username": username, "role": user["role"]})
        return jsonify({"user": serialize_user(user)})

    @app.post("/api/login")
    def login():
        payload = request.get_json(silent=True) or {}
        username = (payload.get("username") or "").strip()
        password = payload.get("password") or ""
        with db() as conn:
            user = conn.execute("SELECT * FROM users WHERE username = %s", (username,)).fetchone()
        if not user or not check_password_hash(user["password_hash"], password):
            audit("failed_login", details={"username": username})
            return error("Invalid username or password", 401, "INVALID_CREDENTIALS")
        session["user_id"] = user["id"]
        audit("user_logged_in", user_id=user["id"], details={"username": user["username"]})
        return jsonify({"user": serialize_user(user)})

    @app.post("/api/logout")
    def logout():
        user_id = session.get("user_id")
        session.clear()
        if user_id:
            audit("user_logged_out", user_id=user_id)
        return jsonify({"ok": True})

    @app.get("/api/me")
    def me():
        user = current_user()
        return jsonify({"user": serialize_user(user) if user else None})

    @app.post("/api/files/upload")
    def upload_file():
        user = require_user()
        if isinstance(user, tuple):
            return user
        uploaded = request.files.get("file")
        if not uploaded or not uploaded.filename:
            return error("A file is required")
        if not is_allowed_file(uploaded):
            return error("File type is not allowed", 415, "UNSUPPORTED_FILE_TYPE")
        expires_in = request.form.get("expiresIn", "1h")
        if expires_in not in EXPIRATION_OPTIONS:
            return error("Unsupported expiration option")
        raw = uploaded.read()
        if not raw:
            return error("File cannot be empty")
        if len(raw) > app.config["MAX_UPLOAD_BYTES"]:
            return error("File exceeds the maximum allowed size", 413, "FILE_TOO_LARGE")

        original_filename = secure_filename(uploaded.filename) or "vaultlink-upload"
        ext = Path(original_filename).suffix.lower()
        stored_filename = f"{secrets.token_hex(24)}{ext}.vault"
        encrypted = app.config["FERNET"].encrypt(raw)
        storage_path = app.config["STORAGE_DIR"] / stored_filename
        storage_path.write_bytes(encrypted)

        sha256_hash = hashlib.sha256(raw).hexdigest()
        token = secrets.token_urlsafe(32)
        password = request.form.get("password") or ""
        password_hash = generate_password_hash(password) if password else None
        one_time = (request.form.get("oneTime") or "false").lower() in {"1", "true", "yes", "on"}
        note = (request.form.get("note") or "").strip() or None
        expires_at = utcnow() + EXPIRATION_OPTIONS[expires_in]

        with db() as conn:
            file_row = conn.execute(
                """
                INSERT INTO files (owner_id, original_filename, stored_filename, size, sha256_hash, note)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, owner_id, original_filename, size, sha256_hash, note, created_at
                """,
                (user["id"], original_filename, stored_filename, len(raw), sha256_hash, note),
            ).fetchone()
            share = conn.execute(
                """
                INSERT INTO shares (file_id, token, password_hash, expires_at, one_time)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, token, expires_at, one_time, used, used_at, created_at
                """,
                (file_row["id"], token, password_hash, expires_at, one_time),
            ).fetchone()

        audit("file_uploaded", user_id=user["id"], share_id=share["id"], details={"fileId": file_row["id"], "filename": original_filename})
        audit("share_link_created", user_id=user["id"], share_id=share["id"], details={"expiresIn": expires_in, "oneTime": one_time, "passwordProtected": bool(password_hash)})
        return jsonify(
            {
                "file": {
                    "id": file_row["id"],
                    "originalFilename": file_row["original_filename"],
                    "size": file_row["size"],
                    "sha256Hash": file_row["sha256_hash"],
                    "note": file_row["note"],
                    "createdAt": file_row["created_at"].isoformat(),
                },
                "share": {
                    "id": share["id"],
                    "token": share["token"],
                    "expiresAt": share["expires_at"].isoformat(),
                    "oneTime": share["one_time"],
                    "used": share["used"],
                    "usedAt": share["used_at"],
                    "createdAt": share["created_at"].isoformat(),
                },
                "shareUrl": share_url(token),
            }
        ), 201

    @app.get("/api/files")
    def list_files():
        user = require_user()
        if isinstance(user, tuple):
            return user
        with db() as conn:
            rows = conn.execute(
                """
                SELECT
                    f.id AS file_id, f.original_filename, f.size, f.sha256_hash, f.note, f.created_at AS file_created_at,
                    s.id AS share_id, s.token, s.password_hash, s.expires_at, s.one_time, s.used, s.used_at, s.created_at AS share_created_at
                FROM files f
                JOIN shares s ON s.file_id = f.id
                WHERE f.owner_id = %s
                ORDER BY f.created_at DESC
                """,
                (user["id"],),
            ).fetchall()
        return jsonify({"files": [serialize_file_share(row) for row in rows]})

    @app.delete("/api/files/<int:file_id>")
    def delete_file(file_id: int):
        user = require_user()
        if isinstance(user, tuple):
            return user
        with db() as conn:
            file_row = conn.execute(
                "SELECT id, stored_filename, original_filename FROM files WHERE id = %s AND owner_id = %s",
                (file_id, user["id"]),
            ).fetchone()
            if not file_row:
                return error("File not found", 404, "FILE_NOT_FOUND")
            conn.execute("DELETE FROM files WHERE id = %s", (file_id,))
        storage_path = app.config["STORAGE_DIR"] / file_row["stored_filename"]
        if storage_path.exists():
            storage_path.unlink()
        audit("file_deleted", user_id=user["id"], details={"fileId": file_id, "filename": file_row["original_filename"]})
        return jsonify({"ok": True})

    @app.get("/api/share/<token>")
    def share_metadata(token: str):
        share = load_share(token)
        if not share:
            return error("Secure link not found", 404, "SHARE_NOT_FOUND")
        expired = share["expires_at"] <= utcnow()
        if expired:
            audit("expired_link_access", share_id=share["share_id"], details={"token": token})
        if share["one_time"] and share["used"]:
            audit("reused_one_time_attempt", share_id=share["share_id"], details={"token": token})
        return jsonify(
            {
                "fileName": share["original_filename"],
                "size": share["size"],
                "sha256Hash": share["sha256_hash"],
                "note": share["note"],
                "expiresAt": share["expires_at"].isoformat(),
                "expired": expired,
                "passwordRequired": bool(share["password_hash"]),
                "passwordVerified": share_is_password_verified(token) or not share["password_hash"],
                "oneTime": share["one_time"],
                "used": share["used"],
            }
        )

    @app.post("/api/share/<token>/verify-password")
    def verify_share_password(token: str):
        share = load_share(token)
        if not share:
            return error("Secure link not found", 404, "SHARE_NOT_FOUND")
        if share["expires_at"] <= utcnow():
            audit("expired_link_access", share_id=share["share_id"], details={"token": token})
            return error("This secure link has expired", 410, "SHARE_EXPIRED")
        if share["one_time"] and share["used"]:
            audit("reused_one_time_attempt", share_id=share["share_id"], details={"token": token})
            return error("This secure link has already been used", 410, "SHARE_USED")
        if not share["password_hash"]:
            mark_share_verified(token)
            return jsonify({"ok": True})

        attempts = session.get("password_attempts", {})
        key = rate_limit_key(token)
        if attempts.get(key, 0) >= RATE_LIMIT_ATTEMPTS:
            audit("share_password_rate_limited", share_id=share["share_id"], details={"token": token})
            return error("Too many failed password attempts", 429, "RATE_LIMITED")

        payload = request.get_json(silent=True) or {}
        password = payload.get("password") or ""
        if not check_password_hash(share["password_hash"], password):
            attempts[key] = attempts.get(key, 0) + 1
            session["password_attempts"] = attempts
            audit("failed_password_attempt", share_id=share["share_id"], details={"token": token, "attempts": attempts[key]})
            return error("Incorrect download password", 401, "INVALID_SHARE_PASSWORD")
        attempts.pop(key, None)
        session["password_attempts"] = attempts
        mark_share_verified(token)
        return jsonify({"ok": True})

    @app.post("/api/share/<token>/download")
    def download_share(token: str):
        share = load_share(token)
        if not share:
            return error("Secure link not found", 404, "SHARE_NOT_FOUND")
        if share["expires_at"] <= utcnow():
            audit("expired_link_access", share_id=share["share_id"], details={"token": token})
            return error("This secure link has expired", 410, "SHARE_EXPIRED")
        if share["one_time"] and share["used"]:
            audit("reused_one_time_attempt", share_id=share["share_id"], details={"token": token})
            return error("This secure link has already been used", 410, "SHARE_USED")
        if share["password_hash"] and not share_is_password_verified(token):
            return error("Password verification is required", 403, "PASSWORD_REQUIRED")

        storage_path = app.config["STORAGE_DIR"] / share["stored_filename"]
        if not storage_path.exists():
            return error("Encrypted file is missing from storage", 404, "STORED_FILE_MISSING")
        try:
            decrypted = app.config["FERNET"].decrypt(storage_path.read_bytes())
        except InvalidToken:
            return error("Encrypted file cannot be decrypted", 500, "DECRYPTION_FAILED")

        if share["one_time"]:
            with db() as conn:
                conn.execute("UPDATE shares SET used = TRUE, used_at = NOW() WHERE id = %s", (share["share_id"],))
        audit("successful_download", share_id=share["share_id"], details={"token": token, "filename": share["original_filename"]})
        return send_file(io.BytesIO(decrypted), as_attachment=True, download_name=share["original_filename"])

    @app.get("/api/audit")
    def audit_log():
        user = require_user()
        if isinstance(user, tuple):
            return user
        with db() as conn:
            rows = conn.execute(
                """
                SELECT a.id, a.event_type, a.ip_address::text AS ip_address, a.details, a.created_at,
                       u.username, a.user_id, a.share_id
                FROM audit_logs a
                LEFT JOIN users u ON u.id = a.user_id
                WHERE %s = 'admin' OR a.user_id = %s OR a.share_id IN (
                    SELECT s.id FROM shares s JOIN files f ON f.id = s.file_id WHERE f.owner_id = %s
                )
                ORDER BY a.created_at DESC
                LIMIT 200
                """,
                (user["role"], user["id"], user["id"]),
            ).fetchall()
        return jsonify(
            {
                "events": [
                    {
                        "id": row["id"],
                        "eventType": row["event_type"],
                        "username": row["username"] or "anonymous",
                        "userId": row["user_id"],
                        "shareId": row["share_id"],
                        "ipAddress": row["ip_address"],
                        "details": row["details"],
                        "createdAt": row["created_at"].isoformat(),
                    }
                    for row in rows
                ]
            }
        )

    @app.get("/api/admin/security-summary")
    def admin_summary():
        user = require_user()
        if isinstance(user, tuple):
            return user
        if user["role"] != "admin":
            return error("Admin access required", 403, "ADMIN_REQUIRED")
        with db() as conn:
            summary = conn.execute(
                """
                SELECT
                    (SELECT COUNT(*) FROM files) AS total_files,
                    (SELECT COUNT(*) FROM shares WHERE expires_at > NOW() AND used = FALSE) AS active_shares,
                    (SELECT COUNT(*) FROM shares WHERE expires_at <= NOW()) AS expired_shares,
                    (SELECT COUNT(*) FROM audit_logs WHERE event_type IN ('failed_password_attempt', 'failed_login')) AS failed_access_attempts,
                    (SELECT COALESCE(SUM(size), 0) FROM files) AS storage_used
                """
            ).fetchone()
            events = conn.execute(
                """
                SELECT a.id, a.event_type, a.ip_address::text AS ip_address, a.details, a.created_at,
                       COALESCE(u.username, 'anonymous') AS username
                FROM audit_logs a
                LEFT JOIN users u ON u.id = a.user_id
                ORDER BY a.created_at DESC
                LIMIT 10
                """
            ).fetchall()
        return jsonify(
            {
                "totalFiles": summary["total_files"],
                "activeShares": summary["active_shares"],
                "expiredShares": summary["expired_shares"],
                "failedAccessAttempts": summary["failed_access_attempts"],
                "storageUsed": summary["storage_used"],
                "recentEvents": [
                    {
                        "id": row["id"],
                        "eventType": row["event_type"],
                        "username": row["username"],
                        "ipAddress": row["ip_address"],
                        "details": row["details"],
                        "createdAt": row["created_at"].isoformat(),
                    }
                    for row in events
                ],
            }
        )

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True, "time": utcnow().isoformat()})

    return app


app = create_app()
