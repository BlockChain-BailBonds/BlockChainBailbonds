#!/usr/bin/env python3
"""Run one safe server-side emergency-poll and notification-delivery cycle."""
from __future__ import annotations

from .notifications import deliver_notification
from .server import db, now, poll_emergency_mandate


def run_once() -> dict:
    conn = db()
    try:
        mandates = conn.execute("SELECT id FROM emergency_mandates WHERE status='active' AND next_poll_at<=? ORDER BY next_poll_at LIMIT 100", (now(),)).fetchall()
        poll_results = [poll_emergency_mandate(conn, row["id"]) for row in mandates]
        queued = conn.execute("SELECT id,request_id,channel,recipient,message,created_at FROM notifications WHERE status='queued' AND channel='webhook' ORDER BY id LIMIT 100").fetchall()
        delivered = []
        for row in queued:
            notification = dict(row); status, detail = deliver_notification(notification)
            if status == "delivered": conn.execute("UPDATE notifications SET status=? WHERE id=?", (status, row["id"]))
            elif status == "provider_not_configured": conn.execute("UPDATE notifications SET status=? WHERE id=?", (status, row["id"]))
            else: conn.execute("UPDATE notifications SET status=? WHERE id=?", ("retry_required", row["id"]))
            delivered.append({"id": row["id"], "status": status, "detail": detail})
        conn.commit()
        return {"mandates_polled": len(poll_results), "notification_results": delivered}
    finally:
        conn.close()


if __name__ == "__main__":
    print(run_once())
