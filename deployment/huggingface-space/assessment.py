def assess_review_readiness(intake, source=None, review=None, fee=None):
    source = source or {}
    review = review or {}
    fee = fee or {}
    required = ("full_name", "date_of_birth", "phone", "consent")
    missing = [field for field in required if not intake.get(field)]
    matches = source.get("matches") or []
    actions = []
    if missing:
        actions.append("collect_missing_consented_intake_fields")
    actions.append("licensed_bondsman_confirm_source_match" if matches else "licensed_bondsman_review_source_status")
    if not review.get("decision"):
        actions.append("licensed_bondsman_record_human_decision")
    if not fee:
        actions.append("licensed_bondsman_prepare_fee_offer_if_appropriate")
    if missing:
        suggestion = "request_missing_information_before_bondsman_review"
    elif matches:
        suggestion = "confirm_public_source_evidence_with_licensed_bondsman"
    else:
        suggestion = "escalate_to_licensed_bondsman_for_source_and_case_review"
    return {
        "assessment_type": "non_binding_case_readiness",
        "decision": "human_review_required",
        "risk_assessment_suggestion": {"suggested_next_step": suggestion, "reason": "Workflow suggestion only; no automated bail-risk or detention determination is made.", "approval_authority": "licensed_bondsman_and_applicable_court_process"},
        "workflow_priority": "urgent" if intake.get("emergency") else "standard",
        "missing_information": missing,
        "evidence_summary": {"source_match_count": len(matches), "source_status": source.get("status", "not_checked"), "human_source_confirmation_required": True},
        "required_human_actions": actions,
        "explanation": "Workflow evidence only; not a risk, eligibility, detention, pricing, or legal decision.",
    }
