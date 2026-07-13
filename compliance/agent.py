"""Evidence-driven compliance gate for the 918 deployment console.

This module automates checks and evidence collection. It never claims that a
lawyer, regulator, auditor, custodian, or licensed bondsman has approved a
deployment.
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone


REQUIRED = (
    "licensed_operator",
    "reserve_custodian",
    "redemption_policy",
    "aml_kyc_program",
    "sanctions_screening",
    "privacy_review",
    "smart_contract_audit",
    "multisig_signers",
    "incident_response",
)


@dataclass
class Check:
    key: str
    passed: bool
    evidence: str = ""
    human_signoff_required: bool = True


@dataclass
class ComplianceReport:
    checks: list[Check] = field(default_factory=list)
    generated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @property
    def ready_for_human_signoff(self) -> bool:
        return bool(self.checks) and all(c.passed for c in self.checks)

    @property
    def deployment_blocked(self) -> bool:
        return not self.ready_for_human_signoff


def evaluate(evidence: dict) -> ComplianceReport:
    checks = []
    for key in REQUIRED:
        value = evidence.get(key)
        checks.append(Check(key, bool(value), str(value or "missing")))
    return ComplianceReport(checks)


def deployment_plan(evidence: dict, human_signoffs: list[str] | None = None) -> dict:
    report = evaluate(evidence)
    signoffs = human_signoffs or []
    if report.deployment_blocked:
        status = "blocked"
    elif len(signoffs) < 2:
        status = "awaiting_human_signoff"
    else:
        status = "awaiting_multisig"
    return {
        "status": status,
        "minting_enabled": False,
        "bail_and_collateral_custody": False,
        "required_signers": 2,
        "received_signers": len(signoffs),
        "checks": [c.__dict__ for c in report.checks],
        "generated_at": report.generated_at,
        "agent_note": "Automated evidence checks are not legal or regulatory approval.",
    }
