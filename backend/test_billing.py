import hashlib, hmac, json, time, unittest
from backend.billing import plan_catalog, verify_webhook

class BillingTests(unittest.TestCase):
    def test_catalog_is_safe_without_keys(self):
        self.assertEqual(len(plan_catalog()), 3)
        self.assertFalse(any(item["configured"] for item in plan_catalog()))
    def test_webhook_signature(self):
        payload = json.dumps({"type": "customer.subscription.created"}).encode(); secret = "whsec_test"; ts = int(time.time())
        sig = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
        self.assertEqual(verify_webhook(payload, f"t={ts},v1={sig}", secret)["type"], "customer.subscription.created")

if __name__ == "__main__": unittest.main()
