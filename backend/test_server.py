import json
import os
import tempfile
import unittest
from pathlib import Path

os.environ["BAILBONDS_ADMIN_TOKEN"] = "test-admin-token"
with tempfile.TemporaryDirectory() as temp:
    os.environ["BAILBONDS_DB"] = str(Path(temp) / "test.sqlite3")
    from server import db, normalize_match, review_packet


class WorkflowTests(unittest.TestCase):
    def test_consent_and_review_guards(self):
        intake = {"full_name": "Jane Doe", "date_of_birth": "1990-01-01", "phone": "9185550100", "consent": True}
        source = normalize_match({"records": [{"name": "Jane Doe", "booking": "123"}]}, intake)
        packet = review_packet(intake, source)
        self.assertEqual(packet["decision"], "human_review_required")
        self.assertTrue(packet["evidence"]["source_match_count"] == 1)
        self.assertIn("source_match_requires_bondsman_confirmation", packet["flags"])


if __name__ == "__main__":
    unittest.main()
