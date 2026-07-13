import unittest
from agent import deployment_plan, evaluate


class ComplianceTests(unittest.TestCase):
    def test_missing_evidence_blocks(self):
        plan = deployment_plan({})
        self.assertEqual(plan["status"], "blocked")
        self.assertFalse(plan["minting_enabled"])

    def test_complete_evidence_still_requires_two_signers(self):
        evidence = {key: "verified-reference" for key in (
            "licensed_operator", "reserve_custodian", "redemption_policy",
            "aml_kyc_program", "sanctions_screening", "privacy_review",
            "smart_contract_audit", "multisig_signers", "incident_response")}
        self.assertEqual(deployment_plan(evidence, ["alice"])["status"], "awaiting_human_signoff")
        self.assertEqual(deployment_plan(evidence, ["alice", "bob"])["status"], "awaiting_multisig")
        self.assertFalse(deployment_plan(evidence, ["alice", "bob"])["minting_enabled"])


if __name__ == "__main__":
    unittest.main()
