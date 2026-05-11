from __future__ import annotations

import io

from app import create_app


class FakeResult:
    def __init__(self, row=None, rows=None):
        self.row = row
        self.rows = rows or ([] if row is None else [row])

    def fetchone(self):
        return self.row

    def fetchall(self):
        return self.rows


def test_health_endpoint_can_be_created_without_request_context(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "UPLOAD_FOLDER": str(tmp_path),
            "DB_POOL": None,
            "FERNET_KEY": "RqaKisv7akQOwBIlC3E4pMKw21M9IIuBK7cv_iPPt54=",
        }
    )
    assert app.config["SESSION_COOKIE_HTTPONLY"] is True


def test_allowed_upload_extensions_are_enforced(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "UPLOAD_FOLDER": str(tmp_path),
            "DB_POOL": None,
            "FERNET_KEY": "RqaKisv7akQOwBIlC3E4pMKw21M9IIuBK7cv_iPPt54=",
        }
    )
    client = app.test_client()
    response = client.post(
        "/api/files/upload",
        data={"file": (io.BytesIO(b"x"), "payload.exe")},
        content_type="multipart/form-data",
    )
    assert response.status_code in {401, 415}
