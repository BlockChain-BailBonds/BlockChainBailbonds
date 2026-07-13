"""Stripe subscription boundary. No card data is handled by this service."""
from __future__ import annotations
import hashlib, hmac, json, os, time, urllib.parse, urllib.request

PLANS = {
    "starter": {"name": "Starter", "price_env": "STRIPE_PRICE_STARTER", "features": ["profile", "basic_intake", "manual_notes"]},
    "professional": {"name": "Professional", "price_env": "STRIPE_PRICE_PROFESSIONAL", "features": ["emergency_routing", "source_packets", "documents", "reminders"]},
    "agency": {"name": "Agency", "price_env": "STRIPE_PRICE_AGENCY", "features": ["staff_accounts", "county_routing", "analytics", "exports"]},
}

def plan_catalog():
    return [{"id": key, "name": value["name"], "features": value["features"], "configured": bool(os.environ.get(value["price_env"]))} for key, value in PLANS.items()]

def create_checkout(plan_id, email, success_url, cancel_url):
    plan = PLANS.get(plan_id); secret = os.environ.get("STRIPE_SECRET_KEY", ""); price = os.environ.get(plan["price_env"], "") if plan else ""
    if not plan: raise ValueError("unknown plan")
    if not secret or not price: return {"status": "not_configured", "plan": plan_id}
    params = urllib.parse.urlencode({"mode": "subscription", "line_items[0][price]": price, "line_items[0][quantity]": "1", "success_url": success_url, "cancel_url": cancel_url, "customer_email": email})
    req = urllib.request.Request("https://api.stripe.com/v1/checkout/sessions", data=params.encode(), headers={"Authorization": "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as response: return json.loads(response.read().decode())

def verify_webhook(payload, signature, secret, tolerance=300):
    fields = dict(item.split("=", 1) for item in signature.split(",") if "=" in item); timestamp = int(fields.get("t", "0"))
    if abs(time.time() - timestamp) > tolerance: raise ValueError("stale webhook")
    expected = hmac.new(secret.encode(), f"{timestamp}.".encode() + payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, fields.get("v1", "")): raise ValueError("invalid webhook signature")
    return json.loads(payload.decode())
