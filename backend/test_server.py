import json
import os
import tempfile
import unittest
from pathlib import Path
from backend.auth import hash_password, verify_password

os.environ["BAILBONDS_ADMIN_TOKEN"] = "test-admin-token"
with tempfile.TemporaryDirectory() as temp:
    os.environ["BAILBONDS_DB"] = str(Path(temp) / "test.sqlite3")
    from backend.server import db, normalize_match, review_packet


class WorkflowTests(unittest.TestCase):
    def test_password_hash_round_trip(self):
        encoded = hash_password("a-strong-test-password")
        self.assertTrue(verify_password("a-strong-test-password", encoded))
        self.assertFalse(verify_password("wrong-password", encoded))

    def test_consent_and_review_guards(self):
        intake = {"full_name": "Jane Doe", "date_of_birth": "1990-01-01", "phone": "9185550100", "consent": True}
        source = normalize_match({"records": [{"name": "Jane Doe", "booking": "123"}]}, intake)
        packet = review_packet(intake, source)
        self.assertEqual(packet["decision"], "human_review_required")
        self.assertTrue(packet["evidence"]["source_match_count"] == 1)
        self.assertIn("source_match_requires_bondsman_confirmation", packet["flags"])


if __name__ == "__main__":
    unittest.main()
