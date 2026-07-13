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
        size = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(size) or b"{}")

    def do_POST(self):
        parts = [p for p in self.path.split("/") if p]
        conn = db()
        try:
            if parts == ["api", "intake"]:
                data = self.body()
                if not data.get("consent"):
                    return self.send_json(400, {"error": "explicit consent is required"})
                request_id = "req_" + secrets.token_urlsafe(12)
                urgency = "emergency" if data.get("emergency") else "normal"
                conn.execute("INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?)",
                    (request_id, now(), "new", urgency, json.dumps(data), None, None, None, None))
                audit(conn, request_id, "client", "intake_submitted", {"urgency": urgency})
                return self.send_json(201, {"request_id": request_id, "status": "new"})
            if len(parts) == 4 and parts[:2] == ["api", "requests"] and parts[3] == "poll":
                if not token_ok(self.headers): return self.send_json(401, {"error": "bondsman authentication required"})
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
                if not token_ok(self.headers): return self.send_json(401, {"error": "bondsman authentication required"})
                data = self.body(); request_id = parts[2]
                if data.get("decision") not in {"approve", "approve_with_conditions", "request_information", "decline"}:
                    return self.send_json(400, {"error": "invalid human decision"})
                conn.execute("UPDATE requests SET status=?,review_json=? WHERE id=?", ("reviewed", json.dumps(data), request_id))
                audit(conn, request_id, "bondsman", "human_review_recorded", data)
                return self.send_json(200, {"request_id": request_id, "status": "reviewed"})
            if len(parts) == 4 and parts[:2] == ["api", "requests"] and parts[3] == "fee-offer":
                if not token_ok(self.headers): return self.send_json(401, {"error": "bondsman authentication required"})
                data = self.body(); request_id = parts[2]
                required = {"bond_amount", "premium_amount", "currency", "schedule_name"}
                if not required <= data.keys() or data.get("currency") != "USD":
                    return self.send_json(400, {"error": "bondsman must provide a USD fee offer"})
                conn.execute("UPDATE requests SET fee_json=? WHERE id=?", (json.dumps(data), request_id))
                audit(conn, request_id, "bondsman", "fee_offer_recorded", {"schedule_name": data["schedule_name"]})
                return self.send_json(200, {"request_id": request_id, "fee_offer": data})
            if len(parts) == 4 and parts[:2] == ["api", "requests"] and parts[3] == "share":
                if not token_ok(self.headers): return self.send_json(401, {"error": "bondsman authentication required"})
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
        if self.path == "/health": return self.send_json(200, {"ok": True, "service": "tulsa-bail-workflow"})
        public_parts = [p for p in self.path.split("/") if p]
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
        if not token_ok(self.headers): return self.send_json(401, {"error": "bondsman authentication required"})
        parts = [p for p in self.path.split("/") if p]
        conn = db()
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
        return self.send_json(404, {"error": "route not found"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8788"))
    print(f"Tulsa workflow API listening on http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
