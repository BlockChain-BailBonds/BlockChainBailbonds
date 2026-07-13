import os, unittest
from backend.billing import create_checkout, plan_catalog

class BillingTests(unittest.TestCase):
    def test_catalog_is_safe_without_keys(self):
        self.assertEqual(len(plan_catalog()), 3)
        self.assertFalse(any(item["configured"] for item in plan_catalog()))
    def test_wallet_checkout_intent(self):
        os.environ["CRYPTO_PRICE_STARTER_WEI"] = "1000"
        os.environ["CRYPTO_PAYMENT_ADDRESS"] = "0x0000000000000000000000000000000000000001"
        intent = create_checkout("starter", "0x0000000000000000000000000000000000000002")
        self.assertEqual(intent["status"], "payment_required")
        self.assertEqual(intent["amount_wei"], "1000")
        os.environ.pop("CRYPTO_PRICE_STARTER_WEI")
        os.environ.pop("CRYPTO_PAYMENT_ADDRESS")

if __name__ == "__main__": unittest.main()
