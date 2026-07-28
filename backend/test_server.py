import json
import os
import tempfile
import unittest
from pathlib import Path
from backend.auth import hash_password, verify_password
from backend.prepay import bbt_for_usd_cents, verify_revenue_signature
from backend.agreement import agreement_manifest, agreement_digest
from backend.assessment import assess_review_readiness
import hashlib, hmac, time

os.environ["BAILBONDS_ADMIN_TOKEN"] = "test-admin-token"
with tempfile.TemporaryDirectory() as temp:
    os.environ["BAILBONDS_DB"] = str(Path(temp) / "test.sqlite3")
    from backend.server import db, normalize_match, review_packet


class WorkflowTests(unittest.TestCase):
    def test_password_hash_round_trip(self):
        encoded = hash_password("a-strong-test-password")
        self.assertTrue(verify_password("a-strong-test-password", encoded))
        self.assertFalse(verify_password("wrong-password", encoded))

    def test_adtv_revenue_signature_and_conversion(self):
        payload = b'{"event_id":"evt_1","request_id":"req_1","usd_cents":250}'
        ts = int(time.time()); secret = "adtv-test-secret"
        sig = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
        self.assertTrue(verify_revenue_signature(payload, f"t={ts},v1={sig}", secret))
        self.assertEqual(bbt_for_usd_cents(250), 250)

    def test_consent_and_review_guards(self):
        intake = {"full_name": "Jane Doe", "date_of_birth": "1990-01-01", "phone": "9185550100", "consent": True}
        source = normalize_match({"records": [{"name": "Jane Doe", "booking": "123"}]}, intake)
        packet = review_packet(intake, source)
        self.assertEqual(packet["decision"], "human_review_required")
        self.assertTrue(packet["evidence"]["source_match_count"] == 1)
        self.assertIn("source_match_requires_bondsman_confirmation", packet["flags"])

    def test_agreement_manifest_is_deterministic_and_public_safe(self):
        manifest = agreement_manifest("req_1", {"county": "Tulsa", "full_name": "Private Person"}, {"decision": "approve"}, {"currency": "USD", "bond_amount": 5000, "premium_amount": 500, "schedule_name": "standard"})
        self.assertNotIn("Private Person", json.dumps(manifest))
        self.assertEqual(agreement_digest(manifest), agreement_digest(dict(manifest)))
        self.assertEqual(manifest["funds_custody"], "off_chain_only")

    def test_assessment_is_advisory_and_never_a_risk_decision(self):
        result = assess_review_readiness({"full_name": "Jane Doe", "date_of_birth": "1990-01-01", "phone": "9185550100", "consent": True, "emergency": True}, {"matches": [{"id": "public-1"}]})
        self.assertEqual(result["decision"], "human_review_required")
        self.assertEqual(result["workflow_priority"], "urgent")
        self.assertNotIn("risk_score", result)
        self.assertTrue(result["evidence_summary"]["human_source_confirmation_required"])
        self.assertEqual(result["risk_assessment_suggestion"]["suggested_next_step"], "confirm_public_source_evidence_with_licensed_bondsman")


if __name__ == "__main__":
    unittest.main()
