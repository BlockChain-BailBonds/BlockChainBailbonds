#!/usr/bin/env python3
"""Small-dependency Tulsa bail workflow API with mandatory human review."""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
try:
    from .billing import create_checkout, plan_catalog, verify_transaction
    from .auth import admin_configured, new_session, verify_password
    from .prepay import bbt_for_usd_cents, load_json, verify_revenue_signature
    from .token_policy import resolve_token_tier
    from .public_booking import public_booking_records
    from .agreement import agreement_manifest, agreement_digest
    from .assessment import assess_review_readiness
    from .booking_alerts import booking_key, booking_fingerprint, changed_bookings
    from .attention import block_receipt, choose_question, make_slots, participant_hash, verified_signature
except ImportError:
    from billing import create_checkout, plan_catalog, verify_transaction
    from auth import admin_configured, new_session, verify_password
    from prepay import bbt_for_usd_cents, load_json, verify_revenue_signature
    from token_policy import resolve_token_tier
    from public_booking import public_booking_records
    from agreement import agreement_manifest, agreement_digest
    from assessment import assess_review_readiness

    from booking_alerts import booking_key, booking_fingerprint, changed_bookings
    from attention import block_receipt, choose_question, make_slots, participant_hash, verified_signature
ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("BAILBONDS_DB", ROOT / "data.sqlite3"))
ADMIN_TOKEN = os.environ.get("BAILBONDS_ADMIN_TOKEN", "")
INMATE_API = os.environ.get("TULSA_INMATE_API_URL", "")
OSCN_SERVICE = os.environ.get("OSCN_SERVICE_URL", "")
TULSA_BOOKING_PORTAL_URL = os.environ.get("TULSA_BOOKING_PORTAL_URL", "https://community.365labs.com/f160b8ff-b432-4575-ad6d-6fddac1b1aaa/inmatelist")


class BookingSourceMigrated(RuntimeError):
    """The retired PDF export now redirects to a human-verified county portal."""


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript("""
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, status TEXT NOT NULL,
      urgency TEXT NOT NULL, intake_json TEXT NOT NULL, source_json TEXT,
      packet_json TEXT, review_json TEXT, fee_json TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL,
      actor TEXT NOT NULL, action TEXT NOT NULL, detail_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL,
      channel TEXT NOT NULL, recipient TEXT NOT NULL, message TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public_shares (
      token TEXT PRIMARY KEY, request_id TEXT NOT NULL, created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY, bondsman_id TEXT NOT NULL, plan_id TEXT NOT NULL,
      status TEXT NOT NULL, provider_customer_id TEXT, provider_subscription_id TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alert_preferences (
      bondsman_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1,
      counties_json TEXT NOT NULL DEFAULT '[]', channels_json TEXT NOT NULL DEFAULT '["portal"]',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS booking_snapshots (
      booking_key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, record_json TEXT NOT NULL,
      first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS confirmed_bookings (
      booking_number TEXT PRIMARY KEY, full_name TEXT NOT NULL,
      bond_amount_cents INTEGER NOT NULL, booked_at TEXT, charges TEXT,
      source_url TEXT NOT NULL, staff_user_id TEXT NOT NULL,
      staff_email TEXT NOT NULL, notes TEXT, confirmed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS payment_events (
      tx_hash TEXT PRIMARY KEY, wallet_address TEXT, plan_id TEXT, amount_wei TEXT,
      status TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bbt_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL,
      entry_type TEXT NOT NULL, amount_bbt INTEGER NOT NULL,
      source_ref TEXT NOT NULL, detail_json TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(entry_type, source_ref)
    );
    CREATE TABLE IF NOT EXISTS adtv_revenue_events (
      event_id TEXT PRIMARY KEY, request_id TEXT NOT NULL, usd_cents INTEGER NOT NULL,
      bbt_amount INTEGER NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_toggles (
      key TEXT PRIMARY KEY, enabled INTEGER NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attention_campaigns (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sponsor_name TEXT NOT NULL,
      pledge_usd_cents INTEGER NOT NULL, provider_name TEXT NOT NULL,
      question_bank_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attention_blocks (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, participant_hash TEXT NOT NULL,
      status TEXT NOT NULL, slots_json TEXT NOT NULL, verified_slots_json TEXT NOT NULL,
      question_json TEXT, answer_attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS solidarity_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT, block_id TEXT NOT NULL UNIQUE,
      campaign_id TEXT NOT NULL, sponsor_name TEXT NOT NULL, usd_cents INTEGER NOT NULL,
      status TEXT NOT NULL, provider_event_ids_json TEXT NOT NULL, created_at TEXT NOT NULL,
      released_at TEXT, released_by TEXT
    );
    CREATE TABLE IF NOT EXISTS emergency_profiles (
      id TEXT PRIMARY KEY, access_hash TEXT NOT NULL, profile_json TEXT NOT NULL,
      assigned_bondsman_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS emergency_mandates (
      id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, request_id TEXT NOT NULL,
      assigned_bondsman_id TEXT NOT NULL, status TEXT NOT NULL,
      expires_at TEXT NOT NULL, activated_at TEXT NOT NULL, next_poll_at TEXT,
      poll_attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, last_polled_at TEXT,
      canceled_at TEXT
    );
    """)
    return conn


def audit(conn, request_id: str, actor: str, action: str, detail=None):
    conn.execute(
        "INSERT INTO audit_events(request_id,actor,action,detail_json,created_at) VALUES(?,?,?,?,?)",
        (request_id, actor, action, json.dumps(detail or {}), now()),
    )
    conn.commit()


def source_get(url: str, params: dict) -> dict:
    if not url:
        return {"status": "not_configured", "records": []}
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url.rstrip("/") + "/inmateBooking?" + query,
        headers={"User-Agent": os.environ.get("BAILBONDS_USER_AGENT", "918-BailBonds/0.1")},
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        raw = response.read().decode("utf-8", errors="replace")
    if "Tulsa County IIC has been replaced" in raw or "community.365labs.com" in raw:
        raise BookingSourceMigrated("Tulsa County retired the PDF export; licensed staff must use the current county portal.")
    return json.loads(raw)


def oscn_lookup(intake: dict) -> dict:
    if not OSCN_SERVICE:
        return {"status": "not_configured", "records": []}
    payload = json.dumps({"county": intake.get("county", "Tulsa"), "full_name": intake.get("full_name", ""), "date_of_birth": intake.get("date_of_birth", "")}).encode()
    req = urllib.request.Request(OSCN_SERVICE.rstrip("/") + "/search", data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as response:
        data = json.loads(response.read().decode("utf-8"))
    return {"status": data.get("status", "ok"), "records": data.get("records", data.get("cases", [])), "checked_at": now()}


def normalize_match(payload: dict, intake: dict) -> dict:
    """Return evidence for human confirmation; never claim identity automatically."""
    records = payload.get("records", payload.get("data", []))
    if isinstance(records, dict):
        records = [records]
    wanted = " ".join(intake.get("full_name", "").lower().split())
    matches = []
    for record in records[:100]:
        text = json.dumps(record, sort_keys=True).lower()
        name_match = bool(wanted and wanted in text)
        booking = str(intake.get("booking_number", "")).strip()
        booking_match = bool(booking and booking in text)
        if name_match or booking_match:
            matches.append({
                "record": record,
                "name_match": name_match,
                "booking_match": booking_match,
                "human_confirmation_required": True,
            })
    mugshot_urls = [m.get("record", {}).get("mugshot_url") for m in matches if m.get("record", {}).get("mugshot_url")]
    return {"source_status": payload.get("status", "ok"), "matches": matches,
            "checked_at": now(), "mugshot": "available_for_human_confirmation" if mugshot_urls else "not_provided_by_source",
            "mugshot_url": mugshot_urls[0] if mugshot_urls else None}


def review_packet(intake: dict, source: dict) -> dict:
    missing = [k for k in ("full_name", "date_of_birth", "phone", "consent") if not intake.get(k)]
    flags = []
    if not source.get("matches"):
        flags.append("no_source_match_confirmed")
    if source.get("matches"):
        flags.append("source_match_requires_bondsman_confirmation")
    return {
        "decision": "human_review_required",
        "missing_information": missing,
        "flags": flags,
        "evidence": {"source_match_count": len(source.get("matches", [])),
                     "mugshot_status": source.get("mugshot")},
        "explanation": "This packet summarizes supplied information and source evidence. It is not a risk or eligibility decision.",
        "generated_at": now(),
    }


def queue_notification(conn, request_id: str, recipient: str, message: str, channel: str = "webhook") -> None:
    conn.execute("INSERT INTO notifications(request_id,channel,recipient,message,status,created_at) VALUES(?,?,?,?,?,?)", (request_id, channel, recipient, message, "queued", now()))


def readiness_profile(data: dict) -> dict:
    required = ("full_name", "date_of_birth", "phone", "county")
    if any(not str(data.get(key, "")).strip() for key in required):
        raise ValueError("full_name, date_of_birth, phone, and county are required")
    consents = data.get("consents") or {}
    required_consents = {"public_booking_lookup", "share_with_assigned_bondsman", "emergency_activation"}
    if not isinstance(consents, dict) or not all(consents.get(key) is True for key in required_consents):
        raise ValueError("explicit public booking, bondsman sharing, and emergency activation consents are required")
    contacts = data.get("emergency_contacts", [])
    if not isinstance(contacts, list) or len(contacts) > 5:
        raise ValueError("emergency_contacts must contain at most five contacts")
    return {"full_name": str(data["full_name"]).strip(), "date_of_birth": str(data["date_of_birth"]).strip(),
            "phone": str(data["phone"]).strip(), "county": str(data["county"]).strip(),
            "booking_number": str(data.get("booking_number", "")).strip(), "emergency_contacts": contacts,
            "consents": consents, "created_at": now()}


def mandate_poll_interval(attempts: int) -> timedelta:
    return timedelta(minutes=min(30, 5 * max(1, attempts)))


def poll_emergency_mandate(conn, mandate_id: str) -> dict:
    mandate = conn.execute("SELECT * FROM emergency_mandates WHERE id=?", (mandate_id,)).fetchone()
    if not mandate or mandate["status"] != "active": return {"status": "not_active"}
    if mandate["expires_at"] <= now():
        conn.execute("UPDATE emergency_mandates SET status=?,next_poll_at=NULL WHERE id=?", ("expired", mandate_id)); conn.commit()
        return {"status": "expired"}
    profile = conn.execute("SELECT profile_json FROM emergency_profiles WHERE id=? AND active=1", (mandate["profile_id"],)).fetchone()
    if not profile:
        conn.execute("UPDATE emergency_mandates SET status=?,next_poll_at=NULL,last_error=? WHERE id=?", ("canceled", "profile_inactive", mandate_id)); conn.commit()
        return {"status": "canceled"}
    intake = json.loads(profile["profile_json"])
    attempts = mandate["poll_attempts"] + 1
    try:
        payload = source_get(INMATE_API, {"name": intake["full_name"], "booking_number": intake.get("booking_number", "")})
        source = normalize_match(payload, intake); source["oscn"] = oscn_lookup(intake)
        packet = review_packet(intake, source)
        next_poll = (datetime.now(timezone.utc) + mandate_poll_interval(attempts)).isoformat()
        conn.execute("UPDATE requests SET status=?,source_json=?,packet_json=? WHERE id=?", ("source_found" if source["matches"] else "awaiting_match", json.dumps(source), json.dumps(packet), mandate["request_id"]))
        conn.execute("UPDATE emergency_mandates SET poll_attempts=?,last_polled_at=?,next_poll_at=?,last_error=NULL WHERE id=?", (attempts, now(), next_poll, mandate_id))
        if source["matches"]:
            queue_notification(conn, mandate["request_id"], mandate["assigned_bondsman_id"], "Emergency mandate: possible public booking located; licensed human confirmation required.")
            conn.execute("UPDATE emergency_mandates SET status=?,next_poll_at=NULL WHERE id=?", ("possible_match", mandate_id))
        audit(conn, mandate["request_id"], "system", "emergency_mandate_polled", {"matches": len(source["matches"]), "attempt": attempts})
        conn.commit()
        return {"status": "possible_match" if source["matches"] else "searching", "matches": len(source["matches"])}
    except BookingSourceMigrated:
        queue_notification(conn, mandate["request_id"], mandate["assigned_bondsman_id"], "Emergency mandate needs a licensed staff portal lookup; the automated Tulsa export has migrated.")
        conn.execute("UPDATE emergency_mandates SET status=?,next_poll_at=NULL,last_error=? WHERE id=?", ("portal_confirmation_required", "source_migrated", mandate_id)); conn.commit()
        return {"status": "portal_confirmation_required", "portal_url": TULSA_BOOKING_PORTAL_URL}
    except Exception as error:
        next_poll = (datetime.now(timezone.utc) + mandate_poll_interval(attempts)).isoformat()
        conn.execute("UPDATE emergency_mandates SET poll_attempts=?,last_polled_at=?,next_poll_at=?,last_error=? WHERE id=?", (attempts, now(), next_poll, type(error).__name__, mandate_id)); conn.commit()
        return {"status": "source_unavailable", "error": type(error).__name__}


def token_ok(headers) -> bool:
    if not ADMIN_TOKEN:
        return False
    supplied = headers.get("Authorization", "")
    return secrets.compare_digest(supplied, "Bearer " + ADMIN_TOKEN)


def bearer(headers) -> str:
    value = headers.get("Authorization", "")
    return value[7:].strip() if value.startswith("Bearer ") else ""


def session_user(conn, headers):
    token = bearer(headers)
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = conn.execute("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked=0 AND s.expires_at>? AND u.active=1", (token_hash, now())).fetchone()
    return dict(row) if row else None


def staff_user(conn, headers):
    if token_ok(headers):
        return {"id": "legacy-admin", "email": "legacy-admin", "role": "admin"}
    return session_user(conn, headers)


def require_staff(conn, headers):
    user = staff_user(conn, headers)
    return user


def admin_user(conn, headers):
    user = staff_user(conn, headers)
    return user if user and (user["role"] == "admin" or user["id"] == "legacy-admin") else None


ATTENTION_TOGGLES = {
    "attention_contributions": "Master switch for all public attention blocks.",
    "attention_provider_callbacks": "Accept signed provider completion callbacks.",
    "attention_fund_release": "Allow an admin to mark cleared sponsor pledges released to the fund.",
}


def toggle_enabled(conn, key: str) -> bool:
    row = conn.execute("SELECT enabled FROM admin_toggles WHERE key=?", (key,)).fetchone()
    return bool(row and row["enabled"])


def attention_ready(conn) -> bool:
    return toggle_enabled(conn, "attention_contributions") and toggle_enabled(conn, "attention_provider_callbacks")


def subscription_for(conn, bondsman_id: str) -> dict:
    row = conn.execute("SELECT plan_id,status,updated_at FROM subscriptions WHERE bondsman_id=? ORDER BY updated_at DESC LIMIT 1", (bondsman_id,)).fetchone()
    return dict(row) if row else {"plan_id": None, "status": "inactive", "updated_at": None}


def alert_access(conn, user: dict) -> bool:
    """Only paid professional/agency plans can operate the booking monitor."""
    subscription = subscription_for(conn, user["id"])
    return subscription["status"] == "active" and subscription["plan_id"] in {"professional", "agency"}


def sync_booking_alerts(conn, bondsman_id: str) -> dict:
    if not INMATE_API:
        return {"status": "not_configured", "records": [], "alerts_created": 0}
    payload = source_get(INMATE_API, {})
    records = public_booking_records(payload)
    known = {row["booking_key"]: row["fingerprint"] for row in conn.execute("SELECT booking_key,fingerprint FROM booking_snapshots")}
    changed = changed_bookings(records, known)
    checked_at = now()
    for record in records:
        key, fingerprint = booking_key(record), booking_fingerprint(record)
        conn.execute("INSERT INTO booking_snapshots VALUES(?,?,?,?,?) ON CONFLICT(booking_key) DO UPDATE SET fingerprint=excluded.fingerprint,record_json=excluded.record_json,last_seen_at=excluded.last_seen_at", (key, fingerprint, json.dumps(record), checked_at, checked_at))
    prefs = conn.execute("SELECT enabled,counties_json,channels_json FROM alert_preferences WHERE bondsman_id=?", (bondsman_id,)).fetchone()
    enabled = bool(prefs and prefs["enabled"])
    counties = set(json.loads(prefs["counties_json"])) if prefs else set()
    channels = json.loads(prefs["channels_json"]) if prefs else ["portal"]
    allowed = {str(c).lower() for c in counties}
    deliverable = [r for r in changed if not allowed or str(r.get("county", "")).lower() in allowed]
    if enabled:
        for record in deliverable:
            for channel in channels:
                conn.execute("INSERT INTO notifications(request_id,channel,recipient,message,status,created_at) VALUES(?,?,?,?,?,?)", (booking_key(record), channel, bondsman_id, "New or updated public booking record requires licensed bondsman review.", "queued", checked_at))
    conn.commit()
    return {"status": "ok", "records_checked": len(records), "alerts_created": len(deliverable) * len(channels) if enabled else 0, "changed_records": deliverable, "fetched_at": checked_at}

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        return

    def security_headers(self):
        """Headers appropriate for sensitive, no-cache workflow responses."""
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Cache-Control", "no-store, max-age=0")
        if os.environ.get("BAILBONDS_ENABLE_HSTS") == "1":
            self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

    def send_json(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", os.environ.get("BAILBONDS_ALLOWED_ORIGIN", "http://127.0.0.1:8787"))
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Vary", "Origin")
        self.security_headers()
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", os.environ.get("BAILBONDS_ALLOWED_ORIGIN", "http://127.0.0.1:8787"))
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Vary", "Origin")
        self.security_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def body(self):
        return json.loads(self.body_raw() or b"{}")

    def body_raw(self):
        size = int(self.headers.get("Content-Length", "0"))
        if size > 2_000_000:
            raise ValueError("request body too large")
        return self.rfile.read(size)

    def do_POST(self):
        parts = [p for p in self.path.split("/") if p]
        conn = db()
        try:
            if parts == ["api", "auth", "login"]:
                data = self.body()
                email = str(data.get("email", "")).strip().lower()
                password = str(data.get("password", ""))
                row = conn.execute("SELECT * FROM users WHERE email=? AND active=1", (email,)).fetchone()
                if not row and admin_configured() and email == os.environ.get("BAILBONDS_ADMIN_EMAIL", "").lower():
                    user_id = "usr_admin"
                    conn.execute("INSERT OR IGNORE INTO users VALUES(?,?,?,?,1,?)", (user_id, email, os.environ["BAILBONDS_ADMIN_PASSWORD_HASH"], "admin", now()))
                    conn.commit()
                    row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
                if not row or not verify_password(password, row["password_hash"]):
                    return self.send_json(401, {"error": "invalid credentials"})
                token, expires = new_session()
                conn.execute("INSERT INTO sessions VALUES(?,?,?,?,0)", (hashlib.sha256(token.encode()).hexdigest(), row["id"], expires, now()))
                conn.commit()
                return self.send_json(200, {"token": token, "expires_at": expires, "user": {"id": row["id"], "email": row["email"], "role": row["role"]}})
            if parts == ["api", "auth", "logout"]:
                token = bearer(self.headers)
                if token:
                    conn.execute("UPDATE sessions SET revoked=1 WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),)); conn.commit()
                return self.send_json(204, {})
            if parts == ["api", "emergency", "profiles"]:
                data = self.body()
                try: profile = readiness_profile(data)
                except ValueError as error: return self.send_json(400, {"error": str(error)})
                assigned = str(data.get("assigned_bondsman_id", "")).strip()
                user = conn.execute("SELECT id FROM users WHERE id=? AND active=1", (assigned,)).fetchone()
                if assigned != "legacy-admin" and not user: return self.send_json(400, {"error": "assigned_bondsman_id must be an active, configured licensed staff account"})
                profile_id, access_token = "profile_" + secrets.token_urlsafe(12), secrets.token_urlsafe(32)
                conn.execute("INSERT INTO emergency_profiles VALUES(?,?,?,?,?,?,?)", (profile_id, hashlib.sha256(access_token.encode()).hexdigest(), json.dumps(profile), assigned, 1, now(), now()))
                conn.commit()
                return self.send_json(201, {"profile_id": profile_id, "activation_token": access_token, "status": "ready", "notice": "Store this activation token securely. It can activate or cancel the emergency mandate."})
            if len(parts) == 5 and parts[:3] == ["api", "emergency", "profiles"] and parts[4] == "activate":
                profile_id = parts[3]; data = self.body(); token = str(data.get("activation_token", ""))
                profile_row = conn.execute("SELECT * FROM emergency_profiles WHERE id=? AND active=1", (profile_id,)).fetchone()
                if not profile_row or not secrets.compare_digest(profile_row["access_hash"], hashlib.sha256(token.encode()).hexdigest()): return self.send_json(401, {"error": "valid activation token required"})
                hours = data.get("mandate_hours", 24)
                try: hours = int(hours)
                except (TypeError, ValueError): hours = 0
                if not 1 <= hours <= 72: return self.send_json(400, {"error": "mandate_hours must be between 1 and 72"})
                mandate_id, request_id = "mandate_" + secrets.token_urlsafe(12), "req_" + secrets.token_urlsafe(12)
                intake = json.loads(profile_row["profile_json"]); intake["emergency"] = True; intake["emergency_mandate_id"] = mandate_id
                expires = datetime.now(timezone.utc) + timedelta(hours=hours)
                conn.execute("INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?)", (request_id, now(), "emergency_activated", "emergency", json.dumps(intake), None, None, None, None))
                conn.execute("INSERT INTO emergency_mandates VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (mandate_id, profile_id, request_id, profile_row["assigned_bondsman_id"], "active", expires.isoformat(), now(), now(), 0, None, None, None))
                queue_notification(conn, request_id, profile_row["assigned_bondsman_id"], "Emergency mandate activated. Server-side booking lookup has started.")
                audit(conn, request_id, "client", "emergency_mandate_activated", {"profile_id": profile_id, "expires_at": expires.isoformat()})
                conn.commit()
                return self.send_json(201, {"mandate_id": mandate_id, "request_id": request_id, "status": "active", "expires_at": expires.isoformat()})
            if len(parts) == 5 and parts[:3] == ["api", "emergency", "mandates"] and parts[4] == "cancel":
                mandate_id = parts[3]; data = self.body(); token = str(data.get("activation_token", ""))
                row = conn.execute("SELECT m.*,p.access_hash FROM emergency_mandates m JOIN emergency_profiles p ON p.id=m.profile_id WHERE m.id=?", (mandate_id,)).fetchone()
                if not row or not secrets.compare_digest(row["access_hash"], hashlib.sha256(token.encode()).hexdigest()): return self.send_json(401, {"error": "valid activation token required"})
                conn.execute("UPDATE emergency_mandates SET status=?,canceled_at=?,next_poll_at=NULL WHERE id=?", ("canceled", now(), mandate_id)); conn.commit()
                return self.send_json(200, {"mandate_id": mandate_id, "status": "canceled"})
            if parts == ["api", "intake"]:
                data = self.body()
                required = ("full_name", "date_of_birth", "phone")
                if not data.get("consent") or any(not str(data.get(key, "")).strip() for key in required):
                    return self.send_json(400, {"error": "full_name, date_of_birth, phone, and explicit consent are required"})
                if any(len(str(data.get(key, ""))) > 200 for key in required):
                    return self.send_json(400, {"error": "intake field is too long"})
                request_id = "req_" + secrets.token_urlsafe(12)
                urgency = "emergency" if data.get("emergency") else "normal"
                token_policy = resolve_token_tier(
                    data.get("token_918_balance", 0),
                    data.get("bbt_balance", 0),
                    verified=bool(data.get("token_balances_verified", False)),
                )
                conn.execute("INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?)",
                    (request_id, now(), "new", urgency, json.dumps(data), None, None, None, None))
                audit(conn, request_id, "client", "intake_submitted", {
                    "urgency": urgency,
                    "consent_recorded_at": now(),
                    "token_tier": token_policy["tier"],
                    "token_balances_verified": token_policy["verified"],
                })
                return self.send_json(201, {"request_id": request_id, "status": "new", "automation": token_policy, "assessment": assess_review_readiness(data)})
            if parts == ["api", "billing", "checkout"]:
                if not require_staff(conn, self.headers): return self.send_json(401, {"error": "bondsman authentication required"})
                data = self.body()
                try: result = create_checkout(data.get("plan_id", ""), data.get("wallet_address", ""), data.get("success_url", ""), data.get("cancel_url", ""))
                except ValueError as error: return self.send_json(400, {"error": str(error)})
                return self.send_json(200, result)
            if parts == ["api", "billing", "crypto", "verify"]:
                user = require_staff(conn, self.headers)
                if not user: return self.send_json(401, {"error": "bondsman authentication required"})
                data = self.body(); tx_hash = data.get("tx_hash", "")
                if not tx_hash: return self.send_json(400, {"error": "tx_hash is required"})
                result = verify_transaction(tx_hash, os.environ.get("CRYPTO_PAYMENT_ADDRESS", ""), data.get("amount_wei", ""))
                plan_id = str(data.get("plan_id", ""))
                if result.get("status") == "confirmed" and plan_id in {"starter", "professional", "agency"}:
                    subscription_id = "sub_" + secrets.token_urlsafe(12)
                    conn.execute("INSERT INTO subscriptions VALUES(?,?,?,?,?,?,?,?)", (subscription_id, user["id"], plan_id, "active", data.get("wallet_address"), tx_hash, now(), now()))
                    conn.commit()
                    result["subscription"] = subscription_for(conn, user["id"])
                return self.send_json(200, result)
            if parts == ["api", "operator", "alerts", "preferences"]:
                user = require_staff(conn, self.headers)
                if not user: return self.send_json(401, {"error": "bondsman authentication required"})
                if not alert_access(conn, user): return self.send_json(402, {"error": "an active Professional or Agency subscription is required"})
                data = self.body(); counties = data.get("counties", []); channels = data.get("channels", ["portal"])
                if not isinstance(counties, list) or not isinstance(channels, list) or any(c not in {"portal", "webhook"} for c in channels): return self.send_json(400, {"error": "counties and supported channels are required"})
                conn.execute("INSERT INTO alert_preferences VALUES(?,?,?,?,?) ON CONFLICT(bondsman_id) DO UPDATE SET enabled=excluded.enabled,counties_json=excluded.counties_json,channels_json=excluded.channels_json,updated_at=excluded.updated_at", (user["id"], int(bool(data.get("enabled", True))), json.dumps(counties), json.dumps(channels), now()))
                conn.commit(); return self.send_json(200, {"status": "saved", "enabled": bool(data.get("enabled", True)), "counties": counties, "channels": channels})
            if parts == ["api", "operator", "bookings", "sync"]:
                user = require_staff(conn, self.headers)
                if not user: return self.send_json(401, {"error": "bondsman authentication required"})
                if not alert_access(conn, user): return self.send_json(402, {"error": "an active Professional or Agency subscription is required"})
                try: return self.send_json(200, sync_booking_alerts(conn, user["id"]))
                except Exception as error: return self.send_json(502, {"error": "booking source unavailable", "detail": type(error).__name__})
            if parts == ["api", "operator", "bookings", "manual"]:
                user = require_staff(conn, self.headers)
                if not user: return self.send_json(401, {"error": "licensed staff authentication required"})
                data = self.body()
                booking_number = str(data.get("booking_number", "")).strip()
                full_name = str(data.get("full_name", "")).strip()
                try: bond_amount_cents = int(round(float(data.get("bond_amount", 0)) * 100))
                except (TypeError, ValueError): bond_amount_cents = 0
                if not booking_number or not full_name or bond_amount_cents <= 0 or not data.get("staff_confirmed"):
                    return self.send_json(400, {"error": "booking_number, full_name, positive bond_amount, and staff_confirmed are required"})
                if len(booking_number) > 100 or len(full_name) > 200 or len(str(data.get("charges", ""))) > 2000:
                    return self.send_json(400, {"error": "booking fields are too long"})
                source_url = str(data.get("source_url") or TULSA_BOOKING_PORTAL_URL)
                conn.execute("INSERT INTO confirmed_bookings VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(booking_number) DO UPDATE SET full_name=excluded.full_name,bond_amount_cents=excluded.bond_amount_cents,booked_at=excluded.booked_at,charges=excluded.charges,source_url=excluded.source_url,staff_user_id=excluded.staff_user_id,staff_email=excluded.staff_email,notes=excluded.notes,confirmed_at=excluded.confirmed_at", (booking_number, full_name, bond_amount_cents, str(data.get("booked_at", "")), str(data.get("charges", "")), source_url, user["id"], user["email"], str(data.get("notes", "")), now()))
                audit(conn, "booking:" + booking_number, user["email"], "portal_booking_confirmed", {"bond_amount_cents": bond_amount_cents, "source_url": source_url})
                conn.execute("INSERT INTO notifications(request_id,channel,recipient,message,status,created_at) VALUES(?,?,?,?,?,?)", ("booking:" + booking_number, "portal", user["id"], "Staff-confirmed Tulsa booking imported; human bondsman review required.", "queued", now()))
                conn.commit()
                return self.send_json(201, {"booking_number": booking_number, "status": "staff_confirmed", "bond_amount_cents": bond_amount_cents, "review_required": True})
            if parts == ["api", "adtv", "revenue"]:
                secret = os.environ.get("ADTV_REVENUE_WEBHOOK_SECRET", "")
                raw = self.body_raw()
                if not secret or not verify_revenue_signature(raw, self.headers.get("ADTV-Signature", ""), secret):
                    return self.send_json(401, {"error": "invalid ADTV revenue signature"})
                try: data = json.loads(raw.decode())
                except (UnicodeDecodeError, json.JSONDecodeError): return self.send_json(400, {"error": "invalid JSON payload"})
                event_id = str(data.get("event_id", "")).strip(); request_id = str(data.get("request_id", "")).strip()
                try: usd_cents = int(data.get("usd_cents", 0)); bbt_amount = bbt_for_usd_cents(usd_cents)
                except (TypeError, ValueError): usd_cents = 0; bbt_amount = 0
                if not event_id or not request_id or usd_cents <= 0:
                    return self.send_json(400, {"error": "event_id, request_id, and positive usd_cents are required"})
                request = conn.execute("SELECT id FROM requests WHERE id=?", (request_id,)).fetchone()
                if not request: return self.send_json(404, {"error": "request not found"})
                try:
                    conn.execute("BEGIN IMMEDIATE")
                    conn.execute("INSERT INTO adtv_revenue_events VALUES(?,?,?,?,?,?,?)", (event_id, request_id, usd_cents, bbt_amount, "credited", raw.decode(), now()))
                    conn.execute("INSERT INTO bbt_ledger(request_id,entry_type,amount_bbt,source_ref,detail_json,created_at) VALUES(?,?,?,?,?,?)", (request_id, "adtv_revenue_credit", bbt_amount, event_id, raw.decode(), now()))
                    conn.commit()
                except sqlite3.IntegrityError:
                    conn.rollback()
                    existing = conn.execute("SELECT event_id,request_id,bbt_amount,status FROM adtv_revenue_events WHERE event_id=?", (event_id,)).fetchone()
                    return self.send_json(200, {"status": "already_credited", **dict(existing)})
                return self.send_json(201, {"status": "credited", "event_id": event_id, "request_id": request_id, "bbt_amount": bbt_amount})
            if len(parts) == 5 and parts[:3] == ["api", "public", "shares"] and parts[4] == "prepay":
                share_token = parts[3]
                share = conn.execute("SELECT request_id,expires_at,revoked FROM public_shares WHERE token=?", (share_token,)).fetchone()
                if not share or share["revoked"] or share["expires_at"] < now(): return self.send_json(404, {"error": "share link expired or revoked"})
                request_id = share["request_id"]
                row = conn.execute("SELECT status,review_json,fee_json FROM requests WHERE id=?", (request_id,)).fetchone()
                review = load_json(row["review_json"] if row else None); fee = load_json(row["fee_json"] if row else None)
                if not row or review.get("decision") not in {"approve", "approve_with_conditions"} or not fee:
                    return self.send_json(409, {"error": "approved fee offer required before prepayment"})
                data = self.body(); fee_type = str(data.get("fee_type", "")).strip()
                try: amount_bbt = int(data.get("amount_bbt", 0))
                except (TypeError, ValueError): amount_bbt = 0
                if not fee_type or amount_bbt <= 0: return self.send_json(400, {"error": "fee_type and positive amount_bbt are required"})
                balance = conn.execute("SELECT COALESCE(SUM(amount_bbt),0) AS balance FROM bbt_ledger WHERE request_id=?", (request_id,)).fetchone()["balance"]
                if amount_bbt > balance: return self.send_json(409, {"error": "insufficient BBT balance", "balance_bbt": balance})
                source_ref = "prepay_" + secrets.token_urlsafe(18)
                detail = {"fee_type": fee_type, "share_token_hash": hashlib.sha256(share_token.encode()).hexdigest()}
                conn.execute("INSERT INTO bbt_ledger(request_id,entry_type,amount_bbt,source_ref,detail_json,created_at) VALUES(?,?,?,?,?,?)", (request_id, "client_fee_prepayment", -amount_bbt, source_ref, json.dumps(detail), now()))
                conn.commit()
                return self.send_json(201, {"status": "prepaid", "request_id": request_id, "fee_type": fee_type, "amount_bbt": amount_bbt, "balance_bbt": balance - amount_bbt})
            if len(parts) == 4 and parts[:2] == ["api", "requests"] and parts[3] == "poll":
                if not require_staff(conn, self.headers): return self.send_json(401, {"error": "bondsman authentication required"})
                request_id = parts[2]
                row = conn.execute("SELECT * FROM requests WHERE id=?", (request_id,)).fetchone()
                if not row: return self.send_json(404, {"error": "request not found"})
                intake = json.loads(row["intake_json"])
                try:
                    payload = source_get(INMATE_API, {"name": intake.get("full_name", "")})
                except BookingSourceMigrated:
                    audit(conn, request_id, "system", "booking_source_migrated", {"portal_url": TULSA_BOOKING_PORTAL_URL})
                    return self.send_json(503, {"error": "Tulsa booking export migrated to a human-verified portal", "portal_url": TULSA_BOOKING_PORTAL_URL, "next_action": "A licensed staff member must complete the county portal verification and confirm the record."})
                source = normalize_match(payload, intake)
                source["oscn"] = oscn_lookup(intake)
                packet = review_packet(intake, source)
                conn.execute("UPDATE requests SET status=?,source_json=?,packet_json=? WHERE id=?",
                    ("source_found" if source["matches"] else "awaiting_match", json.dumps(source), json.dumps(packet), request_id))
                audit(conn, request_id, "system", "source_polled", {"matches": len(source["matches"])})
                if source["matches"]:
                    conn.execute("INSERT INTO notifications(request_id,channel,recipient,message,status,created_at) VALUES(?,?,?,?,?,?)",
                        (request_id, "portal", "assigned_bondsman", "Possible Tulsa booking found; human confirmation required.", "queued", now()))
                    conn.commit()
                return self.send_json(200, {"request_id": request_id, "source": source, "packet": packet})
            if len(parts) == 4 and parts[:2] == ["api", "requests"] and parts[3] == "review":
                user = require_staff(conn, self.headers)
                if not user: return self.send_json(401, {"error": "bondsman authentication required"})
                data = self.body(); request_id = parts[2]
                if data.get("decision") not in {"approve", "approve_with_conditions", "request_information", "decline"}:
                    return self.send_json(400, {"error": "invalid human decision"})
                row = conn.execute("SELECT status FROM requests WHERE id=?", (request_id,)).fetchone()
                if not row: return self.send_json(404, {"error": "request not found"})
                if row["status"] not in {"new", "awaiting_match", "source_found"}:
                    return self.send_json(409, {"error": "request is not awaiting review"})
                conn.execute("UPDATE requests SET status=?,review_json=? WHERE id=?", ("reviewed", json.dumps(data), request_id))
                audit(conn, request_id, user["email"], "human_review_recorded", data)
                return self.send_json(200, {"request_id": request_id, "status": "reviewed"})
            if len(parts) == 4 and parts[:2] == ["api", "requests"] and parts[3] == "fee-offer":
                user = require_staff(conn, self.headers)
                if not user: return self.send_json(401, {"error": "bondsman authentication required"})
                data = self.body(); request_id = parts[2]
                required = {"bond_amount", "premium_amount", "currency", "schedule_name"}
                try:
                    bond_amount = float(data.get("bond_amount", 0)); premium_amount = float(data.get("premium_amount", 0))
                except (TypeError, ValueError):
                    bond_amount = -1; premium_amount = -1
                if not required <= data.keys() or data.get("currency") != "USD" or bond_amount <= 0 or premium_amount < 0:
                    return self.send_json(400, {"error": "bondsman must provide a USD fee offer"})
                conn.execute("UPDATE requests SET fee_json=? WHERE id=?", (json.dumps(data), request_id))
                audit(conn, request_id, user["email"], "fee_offer_recorded", {"schedule_name": data["schedule_name"]})
                return self.send_json(200, {"request_id": request_id, "fee_offer": data})
            if len(parts) == 4 and parts[:2] == ["api", "requests"] and parts[3] == "share":
                if not require_staff(conn, self.headers): return self.send_json(401, {"error": "bondsman authentication required"})
                request_id = parts[2]
                row = conn.execute("SELECT review_json,source_json FROM requests WHERE id=?", (request_id,)).fetchone()
                if not row: return self.send_json(404, {"error": "request not found"})
                review = json.loads(row["review_json"] or "{}")
                if review.get("decision") not in {"approve", "approve_with_conditions"}:
                    return self.send_json(409, {"error": "booking must be human-confirmed before sharing"})
                token = secrets.token_urlsafe(24)
                expires = datetime.now(timezone.utc) + timedelta(hours=24)
                conn.execute("INSERT INTO public_shares VALUES(?,?,?,?,0)", (token, request_id, now(), expires.isoformat()))
                conn.commit()
                base = os.environ.get("PUBLIC_APP_URL", "")
                return self.send_json(201, {"share_token": token, "share_url": base + "?share=" + token if base else "?share=" + token, "expires_at": expires.isoformat()})
            if parts == ["api", "admin", "toggles"]:
                user = admin_user(conn, self.headers)
                if not user: return self.send_json(403, {"error": "administrator authentication required"})
                data = self.body(); key = str(data.get("key", "")); enabled = data.get("enabled")
                if key not in ATTENTION_TOGGLES or not isinstance(enabled, bool):
                    return self.send_json(400, {"error": "supported toggle key and boolean enabled are required", "supported": ATTENTION_TOGGLES})
                conn.execute("INSERT INTO admin_toggles VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at", (key, int(enabled), user["email"], now()))
                conn.commit()
                return self.send_json(200, {"key": key, "enabled": enabled, "updated_by": user["email"]})
            if parts == ["api", "admin", "attention", "campaigns"]:
                user = admin_user(conn, self.headers)
                if not user: return self.send_json(403, {"error": "administrator authentication required"})
                data = self.body(); question_bank = data.get("question_bank", [])
                try: choose_question(question_bank); pledge = int(data.get("pledge_usd_cents", 0))
                except (ValueError, TypeError): return self.send_json(400, {"error": "a valid question_bank and positive pledge_usd_cents are required"})
                if pledge <= 0 or not str(data.get("name", "")).strip() or not str(data.get("sponsor_name", "")).strip() or not str(data.get("provider_name", "")).strip():
                    return self.send_json(400, {"error": "name, sponsor_name, provider_name, and positive pledge_usd_cents are required"})
                campaign_id = "camp_" + secrets.token_urlsafe(12)
                conn.execute("INSERT INTO attention_campaigns VALUES(?,?,?,?,?,?,?,?,?)", (campaign_id, data["name"].strip(), data["sponsor_name"].strip(), pledge, data["provider_name"].strip(), json.dumps(question_bank), int(bool(data.get("active", False))), now(), now()))
                conn.commit()
                return self.send_json(201, {"campaign_id": campaign_id, "active": bool(data.get("active", False))})
            if parts == ["api", "attention", "blocks"]:
                if not attention_ready(conn): return self.send_json(503, {"error": "attention contributions are not accepting participants"})
                data = self.body(); campaign_id = str(data.get("campaign_id", "")); participant = str(data.get("participant_nonce", ""))
                campaign = conn.execute("SELECT * FROM attention_campaigns WHERE id=? AND active=1", (campaign_id,)).fetchone()
                if not campaign or len(participant) < 16: return self.send_json(400, {"error": "active campaign_id and a participant nonce are required"})
                block_id = "attn_" + secrets.token_urlsafe(16); slots = make_slots()
                conn.execute("INSERT INTO attention_blocks VALUES(?,?,?,?,?,?,?,?,?)", (block_id, campaign_id, participant_hash(participant), "awaiting_provider", json.dumps(slots), "[]", None, 0, now(), None))
                conn.commit()
                return self.send_json(201, block_receipt(block_id, campaign_id, "awaiting_provider", slots))
            if parts == ["api", "attention", "provider", "verified"]:
                if not toggle_enabled(conn, "attention_provider_callbacks"): return self.send_json(503, {"error": "provider callbacks are disabled"})
                secret = os.environ.get("ATTENTION_PROVIDER_WEBHOOK_SECRET", ""); raw = self.body_raw()
                if not verified_signature(raw, self.headers.get("Attention-Signature", ""), secret): return self.send_json(401, {"error": "invalid provider signature"})
                data = json.loads(raw.decode()); block_id = str(data.get("block_id", "")); slot_id = str(data.get("slot_id", "")); event_id = str(data.get("event_id", ""))
                block = conn.execute("SELECT * FROM attention_blocks WHERE id=?", (block_id,)).fetchone()
                if not block or not event_id or slot_id not in json.loads(block["slots_json"]): return self.send_json(400, {"error": "unknown block, slot, or provider event"})
                verified = json.loads(block["verified_slots_json"])
                if event_id not in [item["event_id"] for item in verified]: verified.append({"slot_id": slot_id, "event_id": event_id})
                status = "ready_for_question" if len({item["slot_id"] for item in verified}) == 5 else "awaiting_provider"
                question = choose_question(json.loads(conn.execute("SELECT question_bank_json FROM attention_campaigns WHERE id=?", (block["campaign_id"],)).fetchone()["question_bank_json"])) if status == "ready_for_question" and not block["question_json"] else json.loads(block["question_json"]) if block["question_json"] else None
                conn.execute("UPDATE attention_blocks SET status=?,verified_slots_json=?,question_json=? WHERE id=?", (status, json.dumps(verified), json.dumps(question) if question else None, block_id)); conn.commit()
                return self.send_json(200, block_receipt(block_id, block["campaign_id"], status, json.loads(block["slots_json"]), question if status == "ready_for_question" else None))
            if parts == ["api", "attention", "blocks", "answer"]:
                data = self.body(); block_id = str(data.get("block_id", "")); answer = data.get("answer_index")
                block = conn.execute("SELECT b.*,c.sponsor_name,c.pledge_usd_cents FROM attention_blocks b JOIN attention_campaigns c ON c.id=b.campaign_id WHERE b.id=?", (block_id,)).fetchone()
                if not block or block["status"] != "ready_for_question" or not isinstance(answer, int): return self.send_json(409, {"error": "a ready attention block and answer_index are required"})
                question = json.loads(block["question_json"]); correct = secrets.compare_digest(str(answer), str(question["answer_index"]))
                if not correct:
                    conn.execute("UPDATE attention_blocks SET status=?,answer_attempts=answer_attempts+1 WHERE id=?", ("attention_not_verified", block_id)); conn.commit()
                    return self.send_json(200, {"block_id": block_id, "status": "attention_not_verified", "funding_notice": "No sponsor pledge was recorded."})
                conn.execute("UPDATE attention_blocks SET status=?,completed_at=? WHERE id=?", ("pledged", now(), block_id))
                conn.execute("INSERT INTO solidarity_ledger(block_id,campaign_id,sponsor_name,usd_cents,status,provider_event_ids_json,created_at) VALUES(?,?,?,?,?,?,?)", (block_id, block["campaign_id"], block["sponsor_name"], block["pledge_usd_cents"], "pledged", block["verified_slots_json"], now()))
                conn.commit()
                return self.send_json(200, {"block_id": block_id, "status": "pledged", "funding_notice": "A sponsor pledge was recorded for the independent solidarity fund; no participant reward was created."})
            if len(parts) == 5 and parts[:3] == ["api", "admin", "attention"] and parts[3] == "ledger" and parts[4] == "release":
                user = admin_user(conn, self.headers)
                if not user: return self.send_json(403, {"error": "administrator authentication required"})
                if not toggle_enabled(conn, "attention_fund_release"): return self.send_json(503, {"error": "fund release is disabled"})
                data = self.body(); block_id = str(data.get("block_id", ""))
                row = conn.execute("SELECT * FROM solidarity_ledger WHERE block_id=?", (block_id,)).fetchone()
                if not row or row["status"] != "pledged": return self.send_json(409, {"error": "a pledged ledger entry is required"})
                conn.execute("UPDATE solidarity_ledger SET status=?,released_at=?,released_by=? WHERE block_id=?", ("released", now(), user["email"], block_id)); conn.commit()
                return self.send_json(200, {"block_id": block_id, "status": "released", "usd_cents": row["usd_cents"]})
            return self.send_json(404, {"error": "route not found"})
        finally:
            conn.close()

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if path in {"/", "/index.html"}:
            page = ROOT.parent / "index.html"
            if page.exists():
                raw = page.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.security_headers()
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
                return
        if path in {"/health", "/api/health"}:
            return self.send_json(200, {"ok": True, "service": "tulsa-bail-workflow", "time": now()})
        if path == "/api/public/bookings":
            if not INMATE_API:
                return self.send_json(200, {"status": "not_configured", "records": [], "fetched_at": now(), "source_cache_hours": 1})
            try:
                payload = source_get(INMATE_API, {})
                records = public_booking_records(payload)
                return self.send_json(200, {"status": "ok", "records": records, "count": len(records), "fetched_at": now(), "source_cache_hours": 1})
            except BookingSourceMigrated:
                return self.send_json(503, {"status": "source_migrated", "records": [], "count": None, "fetched_at": now(), "portal_url": TULSA_BOOKING_PORTAL_URL, "message": "Tulsa County retired the automated PDF export. Use the official portal for human-verified lookup."})
            except Exception as error:
                return self.send_json(200, {"status": "source_unavailable", "records": [], "fetched_at": now(), "error": type(error).__name__})
        if path == "/api/token-policy":
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            policy = resolve_token_tier(
                query.get("balance_918", ["0"])[0],
                query.get("balance_bbt", ["0"])[0],
                verified=False,
            )
            return self.send_json(200, policy)
        if path == "/api/realtime":
            adtv_url = os.environ.get("ADTV_BASE_URL", "https://adtv.onrender.com").rstrip("/") + "/api/health"
            adtv = {"status": "unreachable"}
            try:
                with urllib.request.urlopen(adtv_url, timeout=5) as response:
                    adtv = {"status": "ok", "http_status": response.status, "body": json.loads(response.read().decode())}
            except Exception as error:
                adtv = {"status": "unreachable", "error": type(error).__name__}
            conn = db()
            request_count = conn.execute("SELECT COUNT(*) AS count FROM requests").fetchone()["count"]
            conn.close()
            return self.send_json(200, {"service": "tulsa-bail-workflow", "time": now(), "request_count": request_count, "adtv": adtv})
        if self.path == "/api/billing/plans": return self.send_json(200, {"plans": plan_catalog()})
        if path == "/api/attention/status":
            conn = db()
            accepting = attention_ready(conn)
            totals = conn.execute("SELECT COALESCE(SUM(usd_cents),0) AS pledged_cents,COALESCE(SUM(CASE WHEN status='released' THEN usd_cents ELSE 0 END),0) AS released_cents FROM solidarity_ledger").fetchone()
            campaign_count = conn.execute("SELECT COUNT(*) AS count FROM attention_campaigns WHERE active=1").fetchone()["count"]
            conn.close()
            return self.send_json(200, {"accepting_participants": accepting, "active_campaigns": campaign_count, "pledged_usd_cents": totals["pledged_cents"], "released_usd_cents": totals["released_cents"], "notice": "No participant receives cash, tokens, bail credit, priority, or an eligibility decision."})
        public_parts = [p for p in self.path.split("/") if p]
        if len(public_parts) == 5 and public_parts[:3] == ["api", "public", "shares"] and public_parts[4] == "prepay":
            conn = db()
            share = conn.execute("SELECT request_id,expires_at,revoked FROM public_shares WHERE token=?", (public_parts[3],)).fetchone()
            if not share or share["revoked"] or share["expires_at"] < now(): return self.send_json(404, {"error": "share link expired or revoked"})
            row = conn.execute("SELECT status,review_json,fee_json FROM requests WHERE id=?", (share["request_id"],)).fetchone()
            balance = conn.execute("SELECT COALESCE(SUM(amount_bbt),0) AS balance FROM bbt_ledger WHERE request_id=?", (share["request_id"],)).fetchone()["balance"]
            return self.send_json(200, {"request_id": share["request_id"], "status": row["status"] if row else "unknown", "balance_bbt": balance, "fee_offer": load_json(row["fee_json"] if row else None), "review": load_json(row["review_json"] if row else None)})
        if len(public_parts) == 4 and public_parts[:3] == ["api", "public", "shares"]:
            conn = db()
            row = conn.execute("SELECT r.*,s.expires_at,s.revoked FROM requests r JOIN public_shares s ON s.request_id=r.id WHERE s.token=?", (public_parts[3],)).fetchone()
            if not row or row["revoked"] or row["expires_at"] < now(): return self.send_json(404, {"error": "share link expired or revoked"})
            intake = json.loads(row["intake_json"]); source = json.loads(row["source_json"] or "{}")
            safe = {"request_id": row["id"], "status": row["status"], "urgency": row["urgency"], "expires_at": row["expires_at"],
                    "client_name": intake.get("full_name"), "county": intake.get("county"), "booking_report": source.get("matches", []),
                    "oscn_report": source.get("oscn", {}), "mugshot_url": source.get("mugshot_url"), "source_checked_at": source.get("checked_at")}
            return self.send_json(200, safe)
        if len(public_parts) == 4 and public_parts[:3] == ["api", "public", "requests"]:
            conn = db()
            row = conn.execute("SELECT id,status,urgency,created_at FROM requests WHERE id=?", (public_parts[3],)).fetchone()
            if not row: return self.send_json(404, {"error": "request not found"})
            return self.send_json(200, dict(row))
        parts = public_parts
        conn = db()
        if parts == ["api", "auth", "me"]:
            user = require_staff(conn, self.headers)
            conn.close()
            if not user: return self.send_json(401, {"error": "not authenticated"})
            return self.send_json(200, {"user": {"id": user["id"], "email": user["email"], "role": user["role"]}})
        if not require_staff(conn, self.headers):
            conn.close()
            return self.send_json(401, {"error": "bondsman authentication required"})
        parts = [p for p in urllib.parse.urlsplit(self.path).path.split("/") if p]
        user = require_staff(conn, self.headers)
        if parts == ["api", "admin", "attention", "status"]:
            if not admin_user(conn, self.headers): return self.send_json(403, {"error": "administrator authentication required"})
            toggles = {key: toggle_enabled(conn, key) for key in ATTENTION_TOGGLES}
            rows = conn.execute("SELECT id,name,sponsor_name,pledge_usd_cents,provider_name,active,created_at FROM attention_campaigns ORDER BY created_at DESC").fetchall()
            ledger = conn.execute("SELECT block_id,campaign_id,sponsor_name,usd_cents,status,created_at,released_at FROM solidarity_ledger ORDER BY id DESC LIMIT 100").fetchall()
            return self.send_json(200, {"toggles": toggles, "campaigns": [dict(row) for row in rows], "ledger": [dict(row) for row in ledger]})
        if parts == ["api", "operator", "subscription"]:
            return self.send_json(200, {"subscription": subscription_for(conn, user["id"]), "monitor_enabled": alert_access(conn, user)})
        if parts == ["api", "operator", "alerts"]:
            rows = conn.execute("SELECT id,request_id,channel,message,status,created_at FROM notifications WHERE recipient=? ORDER BY id DESC LIMIT 100", (user["id"],)).fetchall()
            return self.send_json(200, {"alerts": [dict(row) for row in rows]})
        if parts == ["api", "operator", "bookings", "confirmed"]:
            rows = conn.execute("SELECT booking_number,full_name,bond_amount_cents,booked_at,charges,source_url,staff_email,confirmed_at FROM confirmed_bookings ORDER BY confirmed_at DESC LIMIT 500").fetchall()
            return self.send_json(200, {"records": [dict(row) for row in rows], "source": "licensed_staff_portal_confirmation"})
        if parts == ["api", "operator", "bookings", "confirmed-summary"]:
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            try: max_cents = int(round(float(query.get("max_bond_amount", ["10000"])[0]) * 100))
            except (TypeError, ValueError): return self.send_json(400, {"error": "max_bond_amount must be numeric"})
            row = conn.execute("SELECT COUNT(*) AS count,COALESCE(SUM(bond_amount_cents),0) AS total_cents FROM confirmed_bookings WHERE bond_amount_cents<=?", (max_cents,)).fetchone()
            return self.send_json(200, {"count": row["count"], "total_bond_amount_cents": row["total_cents"], "max_bond_amount_cents": max_cents, "source": "licensed_staff_portal_confirmation", "notice": "This is a staff-confirmed subset, not a complete live jail population."})
        if parts == ["api", "operator", "bookings"]:
            rows = conn.execute("SELECT booking_key,record_json,first_seen_at,last_seen_at FROM booking_snapshots ORDER BY last_seen_at DESC LIMIT 500").fetchall()
            return self.send_json(200, {"records": [{**dict(row), "record": json.loads(row["record_json"])} for row in rows]})
        if parts == ["api", "requests"]:
            rows = conn.execute("SELECT id,created_at,status,urgency FROM requests ORDER BY created_at DESC").fetchall()
            return self.send_json(200, {"requests": [dict(r) for r in rows]})
        if len(parts) == 3 and parts[:2] == ["api", "requests"]:
            row = conn.execute("SELECT * FROM requests WHERE id=?", (parts[2],)).fetchone()
            if not row: return self.send_json(404, {"error": "request not found"})
            result = dict(row); result["intake"] = json.loads(result.pop("intake_json"))
            for key in ("source_json", "packet_json", "review_json", "fee_json"):
                value = result.pop(key); result[key[:-5] if key.endswith("_json") else key] = json.loads(value) if value else None
            return self.send_json(200, result)
        if len(parts) == 4 and parts[:2] == ["api", "requests"] and parts[3] == "agreement-manifest":
            row = conn.execute("SELECT id,intake_json,review_json,fee_json FROM requests WHERE id=?", (parts[2],)).fetchone()
            if not row:
                conn.close()
                return self.send_json(404, {"error": "request not found"})
            manifest = agreement_manifest(row["id"], json.loads(row["intake_json"]), load_json(row["review_json"]), load_json(row["fee_json"]))
            conn.close()
            return self.send_json(200, {"manifest": manifest, "sha256": agreement_digest(manifest), "anchorable": bool(manifest["review_decision"] in {"approve", "approve_with_conditions"} and manifest["bond_amount"] is not None)})
        if len(parts) == 4 and parts[:2] == ["api", "requests"] and parts[3] == "assessment":
            row = conn.execute("SELECT id,intake_json,source_json,review_json,fee_json FROM requests WHERE id=?", (parts[2],)).fetchone()
            if not row:
                conn.close()
                return self.send_json(404, {"error": "request not found"})
            assessment = assess_review_readiness(json.loads(row["intake_json"]), load_json(row["source_json"]), load_json(row["review_json"]), load_json(row["fee_json"]))
            conn.close()
            return self.send_json(200, {"request_id": row["id"], "assessment": assessment})
        return self.send_json(404, {"error": "route not found"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8788"))
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"Tulsa workflow API listening on http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
