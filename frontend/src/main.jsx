import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Check,
  ChevronDown,
  Clipboard,
  Download,
  FileKey2,
  KeyRound,
  Lock,
  LogOut,
  Menu,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { ButtonColorful } from "./components/ui/button-colorful";
import { FlipButton } from "./components/ui/flip-button";
import { ScrambleText } from "./components/ui/scramble-text";
import "./styles.css";

const Dither = lazy(() => import("./components/Dither"));

const API_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:5000`;

const EXPIRATION_OPTIONS = [
  { value: "10m", label: "10 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
];

function DitherBackdrop({ variant = "page" }) {
  const props = variant === "hero"
    ? { waveSpeed: 0.03, waveFrequency: 2.5, waveAmplitude: 0.3, colorNum: 6, pixelSize: 3, mouseRadius: 0.14 }
    : { waveSpeed: 0.03, waveFrequency: 2.5, waveAmplitude: 0.24, colorNum: 6, pixelSize: 3, mouseRadius: 0.14 };

  return (
    <div className={`dither-backdrop dither-backdrop-${variant}`} aria-hidden="true">
      <Suspense fallback={null}>
        <Dither
          {...props}
          waveColor={[1, 1, 1]}
          enableMouseInteraction
        />
      </Suspense>
    </div>
  );
}

async function copyText(text) {
  try {
    if (!navigator.clipboard || !window.isSecureContext) {
      throw new Error("Clipboard API unavailable");
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!copied) {
      window.prompt("Copy this secure link", text);
    }
    return copied;
  }
}

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: options.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...options,
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const payload = contentType.includes("application/json") ? await response.json() : null;
    throw new Error(payload?.error?.message || `Request failed with ${response.status}`);
  }
  return contentType.includes("application/json") ? response.json() : response;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function truncateFilename(name, maxLength = 32) {
  if (!name || name.length <= maxLength) return name;
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex > 0) {
    const ext = name.slice(dotIndex);
    const baseName = name.slice(0, dotIndex);
    const availableLength = maxLength - ext.length - 3; // 3 for "..."
    if (availableLength > 4) {
      return `${baseName.slice(0, availableLength)}...${ext}`;
    }
  }
  return `${name.slice(0, maxLength - 3)}...`;
}

function StatusPill({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-card text-ink border-hairline",
    success: "bg-success text-white border-success",
    danger: "bg-dark text-white border-dark",
    warning: "bg-bone text-ink border-hairline",
  };
  return <span className={`pill ${tones[tone]}`}>{children}</span>;
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const authTitle = mode === "login" ? "Login" : "Register";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = await api(`/api/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onAuth(payload.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-surface min-h-screen bg-canvas text-ink">
      <DitherBackdrop />
      <section className="hero-band">
        <div className="hero-grid" aria-hidden="true" />
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-16 lg:px-8">
          <div className="hero-copy max-w-4xl">
            <p className="font-mono text-sm">local secure file sharing</p>
            <h1 className="mt-4 font-display text-5xl font-black leading-none tracking-tight md:text-7xl">
              VaultLink
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/85">
              Encrypted local storage, expiring access links, one-time downloads, SHA-256 fingerprints, and an audit trail built for security.
            </p>
          </div>
        </div>
      </section>
      <section className="relative z-[1] mx-auto grid max-w-7xl gap-8 px-6 py-12 lg:grid-cols-[1fr_420px] lg:px-8">
        <CodeWell title="threat-model.txt">
          <pre>{`protects:
  - accidental over-sharing
  - stale links
  - tampered files via SHA-256 checks
  - unauthorized password attempts via audit logs

does_not_protect:
  - compromised server keys
  - malware on a client machine
  - transport exposure without HTTPS on hostile networks`}</pre>
        </CodeWell>
        <form className="panel auth-card" onSubmit={submit}>
          <div className="flex items-center gap-3">
            <div className="icon-bubble"><Lock size={18} /></div>
            <div>
              <div className="auth-title-frame">
                <ScrambleText as="h2" className="auth-title-text text-2xl font-semibold" value={authTitle} />
              </div>
              <p className="text-sm text-charcoal">First registered user becomes admin.</p>
            </div>
          </div>
          <label className="field-label">Username</label>
          <input className="text-input" value={username} onChange={(event) => setUsername(event.target.value)} required />
          <label className="field-label">Password</label>
          <input className="text-input" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
          {error && <p className="error-text">{error}</p>}
          <ButtonColorful
            type="submit"
            className="auth-submit"
            disabled={loading}
            label={loading ? "Working..." : mode === "login" ? "Login" : "Create account"}
          />
          <FlipButton
            className="auth-flip"
            flipped={mode !== "login"}
            text1="Need an account?"
            text2="Already registered?"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          />
        </form>
      </section>
    </main>
  );
}

function CodeWell({ as: Component = "div", children, className = "", title }) {
  return (
    <Component className={`security-well ${className}`}>
      <div className="code-window-bar">
        <div className="mac-window-controls" aria-hidden="true">
          <span className="mac-control mac-control-close" />
          <span className="mac-control mac-control-minimize" />
          <span className="mac-control mac-control-zoom" />
        </div>
        <p className="code-tab">{title}</p>
      </div>
      {children}
    </Component>
  );
}

function Shell({ user, onLogout, children, route, setRoute }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = [
    ["dashboard", "Dashboard"],
    ["upload", "Upload"],
    ["audit", "Audit"],
    ["threat", "Threat model"],
  ];
  if (user.role === "admin") nav.splice(3, 0, ["admin", "Admin"]);
  return (
    <div className="app-surface min-h-screen bg-canvas text-ink">
      <DitherBackdrop />
      <header className="app-header sticky top-0 z-20 border-b border-hairline backdrop-blur">
        <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button className="mobile-menu-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu"><Menu size={20} /></button>
            <button className="font-display text-2xl font-black" onClick={() => { setRoute("dashboard"); setMobileOpen(false); }}>VaultLink</button>
          </div>
          <nav className="hidden items-center gap-2 md:flex">
            {nav.map(([key, label]) => (
              <button key={key} className={`nav-pill ${route === key ? "bg-card" : ""}`} onClick={() => setRoute(key)}>{label}</button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <StatusPill tone={user.role === "admin" ? "success" : "neutral"}>{user.username}</StatusPill>
            <button className="icon-button" title="Logout" onClick={onLogout}><LogOut size={18} /></button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="mobile-nav md:hidden">
            {nav.map(([key, label]) => (
              <button key={key} className={`nav-pill ${route === key ? "bg-card" : ""}`} onClick={() => { setRoute(key); setMobileOpen(false); }}>{label}</button>
            ))}
          </nav>
        )}
      </header>
      <main className="relative z-[1] mx-auto max-w-7xl px-6 py-10 lg:px-8">{children}</main>
    </div>
  );
}

function Dashboard({ files, refresh, setRoute }) {
  const active = files.filter((file) => !file.share.expired && !file.share.used).length;
  const expired = files.filter((file) => file.share.expired).length;
  const used = files.filter((file) => file.share.used).length;

  async function removeFile(fileId) {
    await api(`/api/files/${fileId}`, { method: "DELETE" });
    refresh();
  }

  return (
    <section className="space-y-8">
      <div className="section-heading">
        <div>
          <p className="eyebrow">secure exchange console</p>
          <h1>Dashboard</h1>
        </div>
        <button className="primary-button w-auto" onClick={() => setRoute("upload")}><Upload size={18} /> Upload file</button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Active shares" value={active} />
        <Metric label="Expired shares" value={expired} />
        <Metric label="One-time used" value={used} />
      </div>
      <div className="table-panel">
        <div className="table-header">
          <span>File</span><span>Status</span><span>SHA-256</span><span>Actions</span>
        </div>
        {files.length === 0 ? (
          <div className="empty-state">No encrypted uploads yet.</div>
        ) : files.map((file) => {
          const url = `${window.location.origin}/share/${file.share.token}`;
          return (
            <div className="table-row" key={file.id}>
              <div>
                <p className="font-semibold filename-truncate" title={file.originalFilename}>{truncateFilename(file.originalFilename)}</p>
                <p className="text-sm text-charcoal">{formatBytes(file.size)} · expires {formatDate(file.share.expiresAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill tone={file.share.expired ? "danger" : "success"}>{file.share.expired ? "expired" : "active"}</StatusPill>
                {file.share.oneTime && <StatusPill tone={file.share.used ? "warning" : "neutral"}>{file.share.used ? "used" : "one-time"}</StatusPill>}
              </div>
              <code className="hash">{file.sha256Hash}</code>
              <div className="flex gap-2">
                <button className="icon-button" title="Copy share link" onClick={() => copyText(url)}><Clipboard size={18} /></button>
                <button className="icon-button" title="Delete file" onClick={() => removeFile(file.id)}><Trash2 size={18} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="panel">
      <p className="text-sm text-charcoal">{label}</p>
      <p className="font-display text-5xl font-black leading-none">{value}</p>
    </div>
  );
}

function ExpirationSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const selectedOption = EXPIRATION_OPTIONS.find((option) => option.value === value) || EXPIRATION_OPTIONS[0];

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutside(event) {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function chooseOption(option) {
    onChange(option.value);
    setOpen(false);
  }

  return (
    <div className="select-field" ref={wrapperRef}>
      <button
        type="button"
        className="text-input select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedOption.label}</span>
        <ChevronDown className="select-chevron" size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="select-menu" role="listbox" aria-label="Expiration">
          {EXPIRATION_OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <button
                type="button"
                key={option.value}
                className={`select-option ${selected ? "select-option-active" : ""}`}
                role="option"
                aria-selected={selected}
                onClick={() => chooseOption(option)}
              >
                <span>{option.label}</span>
                {selected && <Check size={16} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UploadPage({ refresh, setRoute }) {
  const [file, setFile] = useState(null);
  const [expiresIn, setExpiresIn] = useState("10m");
  const [password, setPassword] = useState("");
  const [oneTime, setOneTime] = useState(true);
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    const data = new FormData();
    data.append("file", file);
    data.append("expiresIn", expiresIn);
    data.append("password", password);
    data.append("oneTime", String(oneTime));
    data.append("note", note);
    try {
      const payload = await api("/api/files/upload", { method: "POST", body: data });
      setReceipt(payload);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <form className="panel space-y-5" onSubmit={submit}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">encrypted storage</p>
            <h1>Upload file</h1>
          </div>
        </div>
        <label className="upload-drop">
          <FileKey2 size={32} />
          <span className="filename-truncate" title={file ? file.name : undefined}>{file ? truncateFilename(file.name, 40) : "Choose a file"}</span>
          <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} required />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label><span className="field-label">Expiration</span><ExpirationSelect value={expiresIn} onChange={setExpiresIn} /></label>
          <label><span className="field-label">Download password</span><input className="text-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Optional" /></label>
        </div>
        <label><span className="field-label">Note</span><textarea className="text-area" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional context for the recipient" /></label>
        <label className="toggle-row"><input type="checkbox" checked={oneTime} onChange={(event) => setOneTime(event.target.checked)} /> Burn after first successful download</label>
        {error && <p className="error-text">{error}</p>}
        <button className="primary-button" disabled={!file}><ShieldCheck size={18} /> Create secure link</button>
      </form>
      <CodeWell as="aside" title="upload-receipt.json">
        <pre>{receipt ? JSON.stringify({ shareUrl: receipt.shareUrl, sha256: receipt.file.sha256Hash, expiresAt: receipt.share.expiresAt }, null, 2) : "Upload a file to generate a receipt."}</pre>
        {receipt && <button className="dark-button mt-4" onClick={async () => { await copyText(receipt.shareUrl); setRoute("dashboard"); }}><Clipboard size={18} /> Copy and return</button>}
      </CodeWell>
    </section>
  );
}

function AuditPage() {
  const [events, setEvents] = useState([]);
  useEffect(() => { api("/api/audit").then((data) => setEvents(data.events)).catch(() => setEvents([])); }, []);
  return (
    <section className="space-y-8">
      <div className="section-heading"><div><p className="eyebrow">forensic trail</p><h1>Audit log</h1></div></div>
      <CodeWell className="audit-log-well" title="audit-events.log">
        <div className="audit-log-list code-scroll">
          {events.length === 0 ? (
            <p className="audit-empty">No audit events recorded yet.</p>
          ) : events.map((event) => (
          <div className="audit-row" key={event.id}>
            <StatusPill>{event.eventType}</StatusPill>
            <div><p className="font-semibold">{event.username}</p><p className="text-sm text-charcoal">{event.ipAddress} · {formatDate(event.createdAt)}</p></div>
            <code className="hash">{JSON.stringify(event.details)}</code>
          </div>
          ))}
        </div>
      </CodeWell>
    </section>
  );
}

function AdminPage() {
  const [summary, setSummary] = useState(null);
  useEffect(() => { api("/api/admin/security-summary").then(setSummary).catch(() => setSummary(null)); }, []);
  if (!summary) return <div className="panel">Admin summary unavailable.</div>;
  return (
    <section className="space-y-8">
      <div className="section-heading"><div><p className="eyebrow">security overview</p><h1>Admin dashboard</h1></div></div>
      <div className="grid gap-4 md:grid-cols-5">
        <Metric label="Files" value={summary.totalFiles} />
        <Metric label="Active" value={summary.activeShares} />
        <Metric label="Expired" value={summary.expiredShares} />
        <Metric label="Failed" value={summary.failedAccessAttempts} />
        <Metric label="Stored" value={formatBytes(summary.storageUsed)} />
      </div>
      <CodeWell title="recent-events.json"><pre className="code-scroll">{JSON.stringify(summary.recentEvents, null, 2)}</pre></CodeWell>
    </section>
  );
}

function ThreatModel() {
  return (
    <section className="space-y-8">
      <div className="section-heading"><div><p className="eyebrow">security explanation</p><h1>Threat model</h1></div></div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[
          ["What VaultLink protects", "Expired links reduce stale access. One-time downloads limit link reuse. Password-protected shares block casual unauthorized access. Encrypted storage protects files at rest if raw storage is inspected."],
          ["What it does not protect", "It does not protect against a compromised server, leaked encryption key, malware on the recipient machine, or hostile network traffic unless HTTPS is enabled."],
          ["Why hashing matters", "User and share passwords are stored as password hashes, never plaintext. SHA-256 fingerprints let recipients compare file integrity before and after transfer."],
          ["Why audit logs matter", "Every meaningful security event is recorded with timestamp, IP address, actor, share ID, and structured details for later review."],
        ].map(([title, body]) => (
          <article className="panel" key={title}><h2 className="text-2xl font-semibold">{title}</h2><p className="mt-3 leading-7 text-body">{body}</p></article>
        ))}
      </div>
      <CodeWell title="design-choices.yml"><pre>{`passwords: werkzeug salted hashes
tokens: secrets.token_urlsafe(32)
storage: Fernet/AES-style encryption
integrity: SHA-256 of original bytes
sessions: HTTP-only Flask cookie
cors: local frontend origin only`}</pre></CodeWell>
    </section>
  );
}

function SharePage() {
  const token = window.location.pathname.split("/share/")[1];
  const [meta, setMeta] = useState(null);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try { setMeta(await api(`/api/share/${token}`)); } catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, [token]);

  async function verify(event) {
    event.preventDefault();
    setError("");
    try {
      await api(`/api/share/${token}/verify-password`, { method: "POST", body: JSON.stringify({ password }) });
      setMessage("Password accepted.");
      load();
    } catch (err) { setError(err.message); }
  }

  async function download() {
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/share/${token}/download`, { method: "POST", credentials: "include" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error?.message || "Download failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = meta.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      await load();
    } catch (err) { setError(err.message); }
  }

  return (
    <main className="app-surface min-h-screen bg-canvas px-6 py-12 text-ink">
      <DitherBackdrop />
      <section className="relative z-[1] mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_360px]">
        <div className="panel">
          <p className="eyebrow">secure share</p>
          <h1 className="mt-2 font-display text-5xl font-black leading-none share-filename" title={meta?.fileName}>{meta ? truncateFilename(meta.fileName, 28) : "VaultLink share"}</h1>
          {meta && (
            <div className="mt-6 space-y-4">
              <p className="text-charcoal">{formatBytes(meta.size)} · expires {formatDate(meta.expiresAt)}</p>
              <div className="flex flex-wrap gap-2">
                <StatusPill tone={meta.expired || meta.used ? "danger" : "success"}>{meta.expired ? "expired" : meta.used ? "already used" : "available"}</StatusPill>
                {meta.passwordRequired && <StatusPill>password required</StatusPill>}
                {meta.oneTime && <StatusPill>one-time</StatusPill>}
              </div>
              <code className="hash block">{meta.sha256Hash}</code>
              {meta.note && <p className="rounded-[10px] bg-bone p-4 text-body">{meta.note}</p>}
            </div>
          )}
          {meta?.passwordRequired && !meta.passwordVerified && !meta.expired && !meta.used && (
            <form className="mt-6 flex gap-3" onSubmit={verify}>
              <input className="text-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Download password" />
              <button className="dark-button w-auto"><KeyRound size={18} /> Verify</button>
            </form>
          )}
          {meta?.passwordVerified && !meta.expired && !meta.used && (
            <button className="primary-button mt-6 w-auto" onClick={download}><Download size={18} /> Download</button>
          )}
          {message && <p className="mt-4 text-sm text-success">{message}</p>}
          {error && <p className="mt-4 error-text">{error}</p>}
        </div>
        <CodeWell title="fingerprint.txt">
          <pre>{meta ? `sha256 ${meta.sha256Hash}` : "Loading secure metadata..."}</pre>
        </CodeWell>
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [route, setRoute] = useState("dashboard");
  const [files, setFiles] = useState([]);
  const isShareRoute = window.location.pathname.startsWith("/share/");

  async function refreshFiles() {
    if (!user) return;
    const payload = await api("/api/files");
    setFiles(payload.files);
  }

  useEffect(() => {
    if (!isShareRoute) api("/api/me").then((data) => setUser(data.user)).catch(() => setUser(null));
  }, [isShareRoute]);

  useEffect(() => { refreshFiles().catch(() => setFiles([])); }, [user]);

  async function logout() {
    await api("/api/logout", { method: "POST" });
    setUser(null);
  }

  if (isShareRoute) return <SharePage />;
  if (!user) return <AuthScreen onAuth={setUser} />;

  const content = {
    dashboard: <Dashboard files={files} refresh={refreshFiles} setRoute={setRoute} />,
    upload: <UploadPage refresh={refreshFiles} setRoute={setRoute} />,
    audit: <AuditPage />,
    admin: <AdminPage />,
    threat: <ThreatModel />,
  }[route] || <Dashboard files={files} refresh={refreshFiles} setRoute={setRoute} />;

  return <Shell user={user} onLogout={logout} route={route} setRoute={setRoute}>{content}</Shell>;
}

createRoot(document.getElementById("root")).render(<App />);
