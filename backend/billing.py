"""Non-custodial EVM wallet subscription boundary.

The service creates payment intents and verifies transaction receipts, but never
handles seed phrases or private keys. Browser mining is intentionally not used.
"""
from __future__ import annotations
import json, os, secrets, urllib.request

PLANS = {
    "starter": {"name": "Starter", "price_env": "CRYPTO_PRICE_STARTER_WEI", "features": ["profile", "basic_intake", "manual_notes"]},
    "professional": {"name": "Professional", "price_env": "CRYPTO_PRICE_PROFESSIONAL_WEI", "features": ["emergency_routing", "source_packets", "documents", "reminders"]},
    "agency": {"name": "Agency", "price_env": "CRYPTO_PRICE_AGENCY_WEI", "features": ["staff_accounts", "county_routing", "analytics", "exports"]},
}

def plan_catalog():
    return [{"id": key, "name": value["name"], "features": value["features"], "configured": bool(os.environ.get(value["price_env"])), "asset": os.environ.get("CRYPTO_ASSET", "native")} for key, value in PLANS.items()]

def create_checkout(plan_id, wallet_address, success_url="", cancel_url=""):
    plan = PLANS.get(plan_id); price = os.environ.get(plan["price_env"], "") if plan else ""
    if not plan: raise ValueError("unknown plan")
    if not price: return {"status": "not_configured", "plan": plan_id}
    return {"status": "payment_required", "intent_id": "pi_" + secrets.token_urlsafe(16), "plan": plan_id,
            "recipient": os.environ.get("CRYPTO_PAYMENT_ADDRESS", ""), "amount_wei": price,
            "chain_id": os.environ.get("CRYPTO_CHAIN_ID", "0x1"), "asset": os.environ.get("CRYPTO_ASSET", "native"),
            "wallet_address": wallet_address, "success_url": success_url, "cancel_url": cancel_url}

def verify_transaction(tx_hash, expected_recipient, expected_amount_wei):
    """Verify a native-token receipt through a configured JSON-RPC endpoint."""
    rpc = os.environ.get("CRYPTO_RPC_URL", "")
    if not rpc: return {"status": "not_configured", "tx_hash": tx_hash}
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_getTransactionReceipt", "params": [tx_hash]}).encode()
    req = urllib.request.Request(rpc, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as response: receipt = json.loads(response.read().decode()).get("result")
    if not receipt: return {"status": "pending", "tx_hash": tx_hash}
    tx_payload = json.dumps({"jsonrpc": "2.0", "id": 2, "method": "eth_getTransactionByHash", "params": [tx_hash]}).encode()
    tx_req = urllib.request.Request(rpc, data=tx_payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(tx_req, timeout=20) as response: tx = json.loads(response.read().decode()).get("result") or {}
    confirmed = (receipt.get("status") == "0x1" and tx.get("to", "").lower() == expected_recipient.lower()
                 and int(tx.get("value", "0x0"), 16) == int(expected_amount_wei or "0"))
    return {"status": "confirmed" if confirmed else "rejected", "tx_hash": tx_hash, "receipt": receipt}
