# VaultLink

VaultLink is a local/LAN secure file-sharing web app for a digital security project. It demonstrates authentication, encrypted file storage, secure random share tokens, password-protected expiring links, one-time downloads, SHA-256 integrity fingerprints, audit logging, and threat modeling.

## Project Layout

- `backend` - Flask API, sessions, encrypted local file storage.
- `frontend` - React + Tailwind CSS UI.
- `db` - PostgreSQL schema and seed/init SQL.

## Quick Start

### 1. Database

Create a PostgreSQL database named `vaultlink`. If `psql` is on PATH, run:

```bash
psql -d vaultlink -f db/schema.sql
```

On Windows, if `psql` is not on PATH, install the backend dependencies first and run the Python initializer. It creates the `vaultlink` database when it is missing, then applies `db/schema.sql`:

```bash
cd backend
python init_db.py
```

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python generate_fernet_key.py
```

Paste the generated key into `VAULTLINK_FERNET_KEY` in `.env`, then run:

```bash
flask --app app run --host 0.0.0.0 --port 5000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Demo Flow

1. Register or log in.
2. Upload a file with a password, 10-minute expiration, and one-time download enabled.
3. Copy the generated share link.
4. Open it in another browser/incognito window.
5. Try a wrong password and confirm the failed attempt appears in the audit log.
6. Enter the correct password and download the file.
7. Refresh the share link and confirm the one-time link is blocked.
8. Review the admin dashboard and threat model page.
