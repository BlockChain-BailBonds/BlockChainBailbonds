"""Booking-monitor alert helpers.

These functions deliberately compare public-source records only. A new record
is a lead to review, never an identity, eligibility, or release decision.
"""
from __future__ import annotations

import hashlib
import json


def booking_key(record: dict) -> str:
    """Stable, non-secret key for a public booking record."""
    source_id = str(record.get("booking_id") or "").strip()
    if source_id:
        return "booking:" + source_id
    canonical = json.dumps(record, sort_keys=True, separators=(",", ":"))
    return "fingerprint:" + hashlib.sha256(canonical.encode()).hexdigest()


def booking_fingerprint(record: dict) -> str:
    canonical = json.dumps(record, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def changed_bookings(records: list[dict], known: dict[str, str]) -> list[dict]:
    """Return records not previously seen, or whose public source data changed."""
    return [record for record in records if known.get(booking_key(record)) != booking_fingerprint(record)]
