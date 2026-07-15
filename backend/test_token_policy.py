import unittest
from backend.token_policy import bounded_payment_limit, resolve_token_tier


class TokenPolicyTests(unittest.TestCase):
    def test_unverified_balance_is_preview_only_and_cannot_authorize_payment(self):
        policy = resolve_token_tier(1000, 0, verified=False)
        self.assertEqual(policy["tier"], "priority")
        self.assertTrue(policy["preview_only"])
        self.assertEqual(policy["max_preapproved_usd"], 0)
        self.assertFalse(policy["payment_authorized"])

    def test_zero_balance_only_captures_and_notifies(self):
        policy = resolve_token_tier(0, 0, verified=True)
        self.assertEqual(policy["tier"], "unfunded")
        self.assertEqual(policy["automation_level"], "Capture and notify")

    def test_payment_limit_fails_closed_to_smallest_ceiling(self):
        policy = {"max_preapproved_usd": 500}
        self.assertEqual(bounded_payment_limit(policy, 1000, 300), 300)
        self.assertEqual(bounded_payment_limit(policy, 1000, 3000), 500)


if __name__ == "__main__":
    unittest.main()
