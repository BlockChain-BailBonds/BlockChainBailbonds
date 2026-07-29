"""Signed outbound delivery for queued emergency notifications.

The application owns the queue and audit state; a configured adapter owns SMS,
email, or pager delivery. This prevents pretending portal notifications are
external messages when no provider is configured.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import urllib.request


def webhook_signature(raw: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()


def deliver_notification(notification: dict) -> tuple[str, str | None]:
    url = os.environ.get("BAILBONDS_NOTIFICATION_WEBHOOK_URL", "")
    secret = os.environ.get("BAILBONDS_NOTIFICATION_WEBHOOK_SECRET", "")
    if not url or not secret:
        return "provider_not_configured", None
    raw = json.dumps({"event": "bailbonds.notification", "notification": notification}, separators=(",", ":")).encode()
    request = urllib.request.Request(url, data=raw, headers={"Content-Type": "application/json", "BailBonds-Signature": webhook_signature(raw, secret)}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            if 200 <= response.status < 300:
                return "delivered", None
            return "failed", "http_" + str(response.status)
    except Exception as error:
        return "failed", type(error).__name__
