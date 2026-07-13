"""Human-in-the-loop agent boundary for Tulsa case packets.

The agent extracts and cites supplied facts. It must never return an automated
eligibility, flight-risk, or fee decision.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class AgentPacket:
    decision: str
    facts: tuple[str, ...]
    missing: tuple[str, ...]
    flags: tuple[str, ...]
    human_action_required: str = "licensed_bondsman_review"


def build_packet(intake: dict, inmate_evidence: dict, oscn_evidence: dict | None = None) -> AgentPacket:
    missing = tuple(k for k in ("full_name", "date_of_birth", "phone", "consent") if not intake.get(k))
    facts = [f"intake.full_name={intake.get('full_name', '')}"]
    if intake.get("county"):
        facts.append(f"intake.county={intake['county']}")
    if inmate_evidence.get("matches"):
        facts.append(f"inmate_source.matches={len(inmate_evidence['matches'])}")
    if oscn_evidence:
        facts.append("oscn.source=received")
    flags = ["human_review_required"]
    if not inmate_evidence.get("matches"):
        flags.append("no_inmate_match_confirmed")
    if oscn_evidence is None:
        flags.append("oscn_data_not_available")
    return AgentPacket("human_review_required", tuple(facts), missing, tuple(flags))
