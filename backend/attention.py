"""Provider-neutral attention-contribution rules.

This module intentionally records sponsor pledges to a separate solidarity-fund
ledger. It never grants a participant cash, tokens, bail priority, or a client
case credit.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets


def participant_hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def verified_signature(raw: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return bool(secret and signature and hmac.compare_digest(expected, signature))


def make_slots() -> list[str]:
    """Five opaque client slots; a provider maps each to its own rewarded unit."""
    return ["slot_" + secrets.token_urlsafe(8) for _ in range(5)]


def choose_question(question_bank: list[dict]) -> dict:
    if not isinstance(question_bank, list) or not question_bank:
        raise ValueError("campaign needs a question bank")
    item = dict(secrets.choice(question_bank))
    answer = item.pop("answer_index", None)
    if not isinstance(answer, int) or not isinstance(item.get("options"), list) or not (0 <= answer < len(item["options"])):
        raise ValueError("invalid campaign question")
    item["answer_index"] = answer
    return item


def public_question(question: dict) -> dict:
    return {"prompt": question["prompt"], "options": question["options"]}


def block_receipt(block_id: str, campaign_id: str, status: str, slots: list[str], question: dict | None = None) -> dict:
    result = {"block_id": block_id, "campaign_id": campaign_id, "status": status, "slots": slots,
              "funding_notice": "No participant reward, token, bail credit, or priority is created."}
    if question:
        result["question"] = public_question(question)
    return result
