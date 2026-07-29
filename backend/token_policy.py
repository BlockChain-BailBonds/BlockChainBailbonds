"""Server-side token policy for emergency automation limits."""
from __future__ import annotations
import os


def _int_env(name: str, default: int) -> int:
    try:
        return max(0, int(os.environ.get(name, str(default))))
    except ValueError:
        return default


def resolve_token_tier(balance_918: int, balance_bbt: int, verified: bool = False) -> dict:
    """Resolve utility value in integer cents; unverified balances are preview-only."""
    try:
        balance_918 = max(0, int(balance_918))
        balance_bbt = max(0, int(balance_bbt))
    except (TypeError, ValueError):
        balance_918 = balance_bbt = 0

    peg_918_cents = _int_env("TOKEN_918_USD_CENTS", 100000)
    peg_bbt_cents = _int_env("TOKEN_BBT_USD_CENTS", 10)
    value_918_cents = balance_918 * peg_918_cents
    value_bbt_cents = balance_bbt * peg_bbt_cents
    total_value_cents = value_918_cents + value_bbt_cents
    thresholds = {
        "prepared": _int_env("TOKEN_TIER_PREPARED_MIN_USD_CENTS", 10),
        "standard": _int_env("TOKEN_TIER_STANDARD_MIN_USD_CENTS", 10000),
        "priority": _int_env("TOKEN_TIER_PRIORITY_MIN_USD_CENTS", 100000),
    }
    if total_value_cents >= thresholds["priority"]:
        tier = "priority"
    elif total_value_cents >= thresholds["standard"]:
        tier = "standard"
    elif total_value_cents >= thresholds["prepared"]:
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
        "peg_918_usd": peg_918_cents / 100,
        "peg_bbt_usd": peg_bbt_cents / 100,
        "value_918_usd": value_918_cents / 100,
        "value_bbt_usd": value_bbt_cents / 100,
        "total_utility_value_usd": total_value_cents / 100,
        "verified": bool(verified),
        "preview_only": not bool(verified),
        "max_preapproved_usd": max_usd if verified else 0,
        "payment_authorized": False,
        "requires_bondsman_approval": True,
        "requires_user_mandate": True,
        "note": "Pegged utility value is application accounting only; it never approves bail or legal terms.",
    }


def bounded_payment_limit(token_policy: dict, user_limit_usd: int, bondsman_limit_usd: int) -> int:
    """Calculate a fail-closed ceiling after all independent approvals exist."""
    try:
        values = [
            max(0, int(user_limit_usd)),
            max(0, int(bondsman_limit_usd)),
            max(0, int(token_policy.get("max_preapproved_usd", 0))),
        ]
    except (TypeError, ValueError):
        return 0
    return min(values)
