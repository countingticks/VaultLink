# VaultLink - Answers for Exercises / Evaluation Points 1-5

This document answers the project requirements from `Proiect_Securitate_Digitala_unlocked.pdf` for the VaultLink project. The selected project idea is:

**Project idea 3: File encryption and decryption**

VaultLink is a local/LAN secure file-sharing web application. A user uploads a file, the backend encrypts it, stores only the encrypted version, creates a secure sharing link, and lets the recipient download the file only if the link is still valid and the security conditions are satisfied.

The application is split according to the required project structure:

- `backend`: Flask API, authentication, encryption, download rules, audit logging.
- `frontend`: React interface, upload flow, share page, dashboard, audit page, threat model page.
- `db`: PostgreSQL schema for users, files, shares, and audit logs.

## 1. Clarity and Relevance of the Chosen Theme

The chosen theme is secure file sharing with encryption. This is relevant to digital security because sending files is one of the most common actions in real life: students send documents, companies send contracts, medical offices send reports, and teams exchange private archives. If files are sent without protection, several problems can happen:

- Someone who gets the link can open the file.
- Old links may remain active for too long.
- A file can be changed during transfer and the receiver may not notice.
- Passwords can be stored badly and leaked.
- There may be no record of who tried to access the file.

VaultLink solves these problems by adding security controls around the file:

- The uploaded file is encrypted before it is saved.
- The share link uses a long random token.
- The link can expire after a selected time.
- The link can be one-time only.
- The link can require a download password.
- The password is hashed, not stored as plain text.
- The original file has a SHA-256 fingerprint for integrity checking.
- Important actions are written to an audit log.

In simple words, VaultLink is like putting a file inside a locked box, giving someone a temporary key, and writing down every important action involving that box.

## 2. Technical Implementation and Security Solution

VaultLink implements a secure file-sharing workflow using a React frontend, a Flask backend, and a PostgreSQL database.

The main flow is:

1. A user registers or logs in.
2. The user uploads a file.
3. The backend checks that the file is valid.
4. The backend encrypts the file.
5. The encrypted file is saved in local storage.
6. Metadata is saved in PostgreSQL.
7. A secure share token is generated.
8. The recipient opens the share link.
9. If needed, the recipient enters the download password.
10. The backend checks expiration, one-time status, and password verification.
11. The backend decrypts the file only at download time.
12. The download is logged.

### Authentication

Authentication means proving who the user is. In VaultLink, users log in with a username and password.

Passwords are not stored directly in the database. Instead, the backend uses Werkzeug password hashing:

- On register, the password is converted into a password hash.
- On login, the entered password is compared with the stored hash.
- The original password cannot be read from the database.

Example:

If the user password is:

```text
mySecretPassword123
```

the database does not store that text. It stores a long hash value. If an attacker reads the database, they do not immediately know the real password.

This is important because databases can leak. A well-designed system assumes that leaks are possible and reduces the damage.

### Sessions

After login, VaultLink stores the user identity in a session cookie. The backend configures the cookie as HTTP-only.

HTTP-only means JavaScript in the browser cannot read the cookie. This helps protect the session from some cross-site scripting attacks.

Simple example:

- Without HTTP-only: malicious JavaScript could try to read the cookie.
- With HTTP-only: the browser sends the cookie to the server, but frontend JavaScript cannot directly access it.

### File Type Validation

VaultLink allows only specific file extensions, such as:

- `.txt`
- `.pdf`
- `.png`
- `.jpg`
- `.zip`
- `.csv`
- `.json`
- `.docx`
- `.xlsx`

This reduces risk because dangerous or unexpected files, such as `.exe`, are rejected.

This does not make file upload perfectly safe by itself, but it is a useful first layer. Security usually works in layers, not with one single magic solution.

### Upload Size Limit

The backend limits file size using `MAX_UPLOAD_BYTES`. By default, the project uses 10 MB.

This protects the server from simple abuse. For example, without a size limit, someone could upload a huge file and fill the disk or memory.

### Secure File Names

The original file name is cleaned using `secure_filename`. The stored file name is not the same as the uploaded file name. Instead, VaultLink generates a random storage name:

```text
random_hex_value.pdf.vault
```

This matters because user-controlled file names can be dangerous. For example, a malicious user might try a name like:

```text
../../important-system-file
```

Cleaning the file name and generating a separate random storage name helps prevent path traversal and accidental overwriting.

### Encryption at Rest

Encryption at rest means the file is protected while it is stored on disk.

VaultLink uses Fernet encryption from the Python `cryptography` library. Fernet provides authenticated symmetric encryption. In simple words:

- Symmetric encryption means the same secret key encrypts and decrypts the data.
- Authenticated encryption means the system can detect if encrypted data was changed.

The file is encrypted before it is written to disk:

```text
original file bytes -> encryption key -> encrypted .vault file
```

Only the encrypted version is stored.

Example:

Suppose the user uploads a text file containing:

```text
Exam answers: private
```

The stored file will not show that text. It will look like unreadable encrypted data. If someone opens the `.vault` file directly, they cannot understand the content without the encryption key.

### Why the Encryption Key Matters

The encryption key is stored in the backend environment variable:

```text
VAULTLINK_FERNET_KEY
```

This is good because the key is not hardcoded into the source code. However, it also means the server must protect the `.env` file and environment variables.

Important limitation:

If an attacker compromises the server and steals both the encrypted files and the encryption key, they may be able to decrypt the files. Encryption protects stored files, but it does not magically protect against a fully compromised server.

That is why VaultLink also includes access control, tokens, password checks, expiration, one-time links, and logs.

### Secure Random Share Tokens

When a file is uploaded, VaultLink creates a share token using a secure random generator:

```text
secrets.token_urlsafe(32)
```

The token becomes part of the share link:

```text
http://localhost:5173/share/<random-token>
```

This token works like a secret key for the link. It must be long and unpredictable.

Bad example:

```text
/share/123
```

This is bad because an attacker could guess `124`, `125`, and so on.

Good example:

```text
/share/Vq9k...long_random_value...
```

This is good because guessing it is practically impossible.

### Expiring Links

VaultLink lets the uploader choose when the link expires:

- 10 minutes
- 1 hour
- 24 hours
- 7 days

Expiration is important because access should not last forever.

Simple example:

A teacher sends a private file to a student. The student only needs it today. If the link stays active for one year, it becomes a long-term risk. If it expires after 24 hours, the risk is smaller.

When someone opens or downloads using an expired link, VaultLink blocks the action and records the event.

### One-Time Downloads

VaultLink supports "burn after first successful download." This means a link can be used only once.

Simple example:

The uploader creates a one-time link. The recipient downloads the file. After that, if someone else gets the same link, VaultLink refuses the download.

This protects against link forwarding and accidental reuse.

Important detail:

The link is marked as used only after a successful download. That way, a failed password attempt does not consume the link.

### Download Passwords

A share link can also require a password. This is separate from the user's account password.

The download password is useful because the link alone is not enough. The recipient needs both:

```text
the secret link + the download password
```

This is stronger than a link alone.

Example:

- The link is sent by email.
- The password is sent by phone or another channel.

If someone compromises only the email, they still do not have the password.

### Password Hashing for Share Passwords

VaultLink does not store the download password in plain text. It stores a hash.

This is the same idea as account passwords:

```text
download password -> hash -> database
```

When the recipient enters the password, VaultLink checks the entered password against the hash.

This protects the password if the database is exposed.

### Rate Limiting Failed Password Attempts

VaultLink limits failed password attempts for share links. The project uses:

```text
RATE_LIMIT_ATTEMPTS = 5
```

This helps stop brute-force attacks.

Brute force means trying many passwords until one works.

Simple example:

If there were no limit, an attacker could try:

```text
password1
password2
password3
...
```

With rate limiting, after too many wrong attempts, VaultLink blocks more attempts for that session/key and logs the event.

### SHA-256 Integrity Fingerprint

VaultLink calculates a SHA-256 hash of the original file.

SHA-256 is not encryption. It does not hide the file. Instead, it creates a fingerprint.

Simple example:

If the original file has fingerprint:

```text
abc123...
```

and the downloaded file has the same fingerprint, the recipient knows the file probably did not change.

If one byte changes, the SHA-256 hash becomes completely different.

This helps with integrity. Integrity means "the data stayed correct and was not modified."

Encryption and hashing are different:

- Encryption hides content.
- Hashing checks whether content changed.

VaultLink uses both because they solve different problems.

### Audit Logging

VaultLink records security events in the `audit_logs` table.

Examples of logged events:

- user registered
- user logged in
- failed login
- file uploaded
- share link created
- failed share password attempt
- rate-limited password attempt
- expired link access
- reused one-time link attempt
- successful download
- file deleted

Each log can include:

- user ID
- share ID
- event type
- IP address
- structured details
- timestamp

Audit logs are important because prevention is not enough. A secure system also needs visibility.

Simple example:

If a recipient says, "I could not access the file," the owner or admin can check whether:

- the link expired,
- the password was wrong,
- the one-time link was already used,
- there were suspicious failed attempts.

### Role-Based Access

The first registered user becomes an admin. Other users become normal users.

Normal users can see their own files and relevant audit events. Admin users can see a security summary across the system.

This is role-based access control. It means users do not all have the same permissions.

Simple example:

- A normal user should manage only their own files.
- An admin can inspect global security activity.

### PostgreSQL Data Model

The database has four main tables:

- `users`: accounts and password hashes.
- `files`: file metadata, owner, original name, stored encrypted name, size, SHA-256 hash.
- `shares`: secure token, password hash, expiration, one-time status, used status.
- `audit_logs`: security history.

This separation is clean because file metadata, sharing rules, and logs are different concepts.

### Threat Model

A threat model explains what the project protects against and what it does not protect against.

VaultLink protects against:

- Casual unauthorized access to shared files.
- Guessable links, because tokens are random and long.
- Old links, because links expire.
- Link reuse, because one-time downloads can be enabled.
- Direct inspection of stored files, because files are encrypted.
- Silent tampering, because SHA-256 fingerprints can be compared.
- Repeated password guessing, because failed attempts are limited and logged.
- Lack of visibility, because audit logs record important actions.

VaultLink does not fully protect against:

- A stolen server encryption key.
- Malware on the uploader's or recipient's computer.
- A malicious admin.
- Network attackers if HTTPS is not enabled.
- Weak download passwords chosen by users.

This honest explanation matters. A real security project should not claim perfect security. It should explain the limits clearly.

### Example Attack and Defense

Attack example:

An attacker finds an old file link in a chat message.

VaultLink defenses:

1. If the link expired, download is blocked.
2. If the link was one-time and already used, download is blocked.
3. If a password is required, the attacker must know the password.
4. If the attacker guesses wrong too many times, attempts are rate-limited.
5. The failed attempts are written to the audit log.

This shows defense in depth. Defense in depth means using multiple layers of protection. If one layer fails, another layer can still help.

## 3. Project Documentation: Steps, Problems, and Solutions

The project was implemented in three main parts: database, backend, and frontend.

### Step 1: Database

The PostgreSQL schema was created in `db/schema.sql`.

The database stores:

- users,
- uploaded file metadata,
- share link settings,
- audit log events.

Indexes were added for common searches, such as looking up shares by token and sorting audit logs by creation date.

### Step 2: Backend

The backend was implemented with Flask.

Important backend responsibilities:

- register and login users,
- create sessions,
- validate uploaded files,
- encrypt uploaded files,
- store encrypted files,
- create random share links,
- verify share passwords,
- block expired or reused links,
- decrypt files only when download is allowed,
- write audit logs.

### Step 3: Frontend

The frontend was implemented with React and Tailwind CSS.

The UI follows the provided `DESIGN.md` direction: warm cream surfaces, strong dark text, orange accent actions, code-style panels, and a developer-security visual style.

Important frontend pages:

- Login/Register screen.
- Dashboard with uploaded files.
- Upload page with expiration, password, one-time option, and note.
- Share page for recipients.
- Audit log page.
- Admin security summary.
- Threat model page.

### Problems and Solutions

Problem: Uploaded files should not be readable directly from disk.

Solution: Encrypt the bytes before writing them to storage. Store only `.vault` encrypted files.

Problem: Share links should not be easy to guess.

Solution: Generate long secure random tokens with Python's `secrets` module.

Problem: Links should not stay valid forever.

Solution: Store `expires_at` in the database and check it before password verification and download.

Problem: A recipient might share the link with someone else.

Solution: Add optional one-time downloads.

Problem: A link alone may be leaked.

Solution: Add optional download passwords and store them as hashes.

Problem: Someone may try many passwords.

Solution: Add a failed-attempt limit and log suspicious events.

Problem: The owner needs proof that a file did not change.

Solution: Show the SHA-256 fingerprint.

Problem: Security events need to be reviewed later.

Solution: Store audit logs with event type, timestamp, IP address, and details.

## 4. Originality and Critical Approach

VaultLink is more than a basic "encrypt and download" demo. It combines several real security ideas into one small application:

- encryption at rest,
- authenticated user sessions,
- password-protected share links,
- expiring links,
- one-time downloads,
- integrity fingerprints,
- audit logs,
- admin security summary,
- threat model explanation.

The critical part is that the project does not pretend that encryption alone solves everything.

For example, encryption protects stored files, but if the server key is stolen, the attacker may still decrypt them. That is why the project also uses access rules, password hashing, token secrecy, expiration, and logging.

The project also separates confidentiality, integrity, and accountability:

- Confidentiality: encryption and password-protected links keep data private.
- Integrity: SHA-256 fingerprints help detect changes.
- Accountability: audit logs show what happened and when.

This is a stronger approach than focusing on only one security feature.

## 5. Final Presentation Summary

VaultLink is a secure file-sharing platform for a local or LAN environment. It allows users to upload files, encrypts them before storage, and creates controlled share links.

The main security features are:

- User authentication with hashed passwords.
- Encrypted file storage using Fernet.
- Secure random share tokens.
- Optional password-protected downloads.
- Expiring share links.
- Optional one-time downloads.
- SHA-256 file fingerprints.
- Audit logging for important security events.
- Admin dashboard for security overview.
- Threat model page explaining protections and limits.

The project demonstrates important digital security concepts in a practical way. It shows that real security is not one feature. Real security is a set of layers that work together:

```text
authentication
+ encryption
+ secure tokens
+ expiration
+ one-time access
+ password hashing
+ integrity checks
+ audit logs
= stronger file sharing security
```

In simple words, VaultLink protects files by locking them, controlling who can open them, limiting how long access lasts, checking whether the file changed, and recording important actions.

## Short Presentation Script

Hello, my project is called VaultLink. It is a secure file-sharing web application.

The problem is that normal file links can be risky. A link can be forwarded, guessed if it is simple, used after a long time, or opened by someone who should not have access.

VaultLink solves this with several security layers. First, users must log in, and their passwords are stored as hashes, not plain text. When a file is uploaded, the backend encrypts it before saving it. This means the stored file is unreadable without the server encryption key.

After upload, VaultLink creates a long random share token. The user can also choose an expiration time, a download password, and a one-time download option. Before downloading, the backend checks all these rules. If the link expired, was already used, or the password is wrong, the download is blocked.

The system also calculates a SHA-256 fingerprint for the file. This helps the recipient check integrity, meaning the file was not changed. Finally, VaultLink records important events in an audit log, such as failed passwords, expired link access, successful downloads, and file uploads.

The most important lesson from this project is that security works best in layers. Encryption is important, but it is not enough by itself. VaultLink combines encryption, access control, secure tokens, expiration, one-time links, hashing, integrity checks, and logs to create a stronger solution.
