"""Auditable ADTV-funded BBT prepaid credits.

BBT units are accounting credits until an independently configured token
settlement layer is added. Revenue events are accepted only with an HMAC
signature from the ADTV service.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time


def verify_revenue_signature(payload: bytes, signature: str, secret: str, tolerance: int = 300) -> bool:
    fields = dict(item.split("=", 1) for item in signature.split(",") if "=" in item)
    timestamp = int(fields.get("t", "0"))
    if not timestamp or abs(time.time() - timestamp) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{timestamp}.".encode() + payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, fields.get("v1", ""))


def bbt_for_usd_cents(usd_cents: int) -> int:
    rate = int(os.environ.get("BBT_UNITS_PER_USD_CENT", "1"))
    if usd_cents < 0 or rate <= 0:
        raise ValueError("invalid BBT conversion configuration")
    return usd_cents * rate


def load_json(value: str | None) -> dict:
    return json.loads(value) if value else {}
