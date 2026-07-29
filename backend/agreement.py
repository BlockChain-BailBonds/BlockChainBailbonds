"""Deterministic, privacy-preserving agreement manifests for optional anchoring."""
from __future__ import annotations
import hashlib
import json

def agreement_manifest(request_id: str, intake: dict, review: dict | None, fee: dict | None) -> dict:
    review = review or {}
    fee = fee or {}
    return {
        "schema": "918-bail-agreement/v1",
        "request_id": request_id,
        "jurisdiction": intake.get("county") or "unknown",
        "currency": fee.get("currency", "USD"),
        "bond_amount": fee.get("bond_amount"),
        "premium_amount": fee.get("premium_amount"),
        "schedule_name": fee.get("schedule_name"),
        "review_decision": review.get("decision"),
        "human_review_required": True,
        "funds_custody": "off_chain_only",
    }

def agreement_digest(manifest: dict) -> str:
    encoded = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    return "0x" + hashlib.sha256(encoded).hexdigest()
