"""Server-side token policy for emergency automation limits.

Token balances may unlock workflow capacity, but never decide legal eligibility
or replace bondsman approval. Balances are trusted only when supplied by a
verified wallet/indexer integration.
"""
from __future__ import annotations
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class TokenTier:
    id: str
    label: str
    automation_level: str
    max_preapproved_usd: int


def _int_env(name: str, default: int) -> int:
    try:
        return max(0, int(os.environ.get(name, str(default))))
    except ValueError:
        return default


def resolve_token_tier(balance_918: int, balance_bbt: int, verified: bool = False) -> dict:
    """Return a bounded automation tier; unverified balances are preview-only."""
    try:
        balance_918 = max(0, int(balance_918))
        balance_bbt = max(0, int(balance_bbt))
    except (TypeError, ValueError):
        balance_918 = balance_bbt = 0
    signal = max(balance_918, balance_bbt)
    thresholds = {
        "prepared": _int_env("TOKEN_TIER_PREPARED_MIN", 1),
        "standard": _int_env("TOKEN_TIER_STANDARD_MIN", 100),
        "priority": _int_env("TOKEN_TIER_PRIORITY_MIN", 1000),
    }
    if signal >= thresholds["priority"]:
        tier = "priority"
    elif signal >= thresholds["standard"]:
        tier = "standard"
    elif signal >= thresholds["prepared"]:
        tier = "prepared"
    else:
        tier = "unfunded"
    levels = {
        "unfunded": ("Capture and notify", 0),
        "prepared": ("Prepare packet and documents", 0),
        "standard": ("Run approved digital workflow", _int_env("TOKEN_STANDARD_MAX_PREAPPROVED_USD", 0)),
        "priority": ("Run approved workflow with priority tier", _int_env("TOKEN_PRIORITY_MAX_PREAPPROVED_USD", 0)),
    }
    label, max_usd = levels[tier]
    return {
        "tier": tier,
        "label": label,
        "automation_level": label,
        "balance_918": balance_918,
        "balance_bbt": balance_bbt,
        "verified": bool(verified),
        "preview_only": not bool(verified),
        "max_preapproved_usd": max_usd if verified else 0,
        "payment_authorized": False,
        "requires_bondsman_approval": True,
        "requires_user_mandate": True,
        "note": "Token tier changes workflow capacity only; it never approves bail or legal terms.",
    }


def bounded_payment_limit(token_policy: dict, user_limit_usd: int, bondsman_limit_usd: int) -> int:
    """Calculate a fail-closed ceiling after all independent approvals exist."""
    try:
        values = [max(0, int(user_limit_usd)), max(0, int(bondsman_limit_usd)), max(0, int(token_policy.get("max_preapproved_usd", 0)))]
    except (TypeError, ValueError):
        return 0
    return min(values)
