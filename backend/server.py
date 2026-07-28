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
from datetime import datetime, timezone
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
except ImportError:
    from billing import create_checkout, plan_catalog, verify_transaction
    from auth import admin_configured, new_session, verify_password
    from prepay import bbt_for_usd_cents, load_json, verify_revenue_signature
    from token_policy import resolve_token_tier
    from public_booking import public_booking_records
    from agreement import agreement_manifest, agreement_digest
    from assessment import assess_review_readiness

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("BAILBONDS_DB", ROOT / "data.sqlite3"))
ADMIN_TOKEN = os.environ.get("BAILBONDS_ADMIN_TOKEN", "")
INMATE_API = os.environ.get("TULSA_INMATE_API_URL", "")
OSCN_SERVICE = os.environ.get("OSCN_SERVICE_URL", "")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript("""
    PRAGMA journal_mode=WAL;
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
        return json.loads(response.read().decode("utf-8"))


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


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        return

    def send_json(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", os.environ.get("BAILBONDS_ALLOWED_ORIGIN", "http://127.0.0.1:8787"))
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", os.environ.get("BAILBONDS_ALLOWED_ORIGIN", "http://127.0.0.1:8787"))
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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
                if not require_staff(conn, self.headers): return self.send_json(401, {"error": "bondsman authentication required"})
                data = self.body(); tx_hash = data.get("tx_hash", "")
                if not tx_hash: return self.send_json(400, {"error": "tx_hash is required"})
                result = verify_transaction(tx_hash, os.environ.get("CRYPTO_PAYMENT_ADDRESS", ""), data.get("amount_wei", ""))
                return self.send_json(200, result)
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
                payload = source_get(INMATE_API, {"name": intake.get("full_name", "")})
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
                from datetime import timedelta
                expires = datetime.now(timezone.utc) + timedelta(hours=24)
                conn.execute("INSERT INTO public_shares VALUES(?,?,?,?,0)", (token, request_id, now(), expires.isoformat()))
                conn.commit()
                base = os.environ.get("PUBLIC_APP_URL", "")
                return self.send_json(201, {"share_token": token, "share_url": base + "?share=" + token if base else "?share=" + token, "expires_at": expires.isoformat()})
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
        parts = [p for p in self.path.split("/") if p]
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
