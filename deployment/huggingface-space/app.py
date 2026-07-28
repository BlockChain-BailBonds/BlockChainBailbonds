import gradio as gr

from assessment import assess_review_readiness


def run_assessment(full_name, date_of_birth, phone, county, consent, emergency, source_match_count):
    intake = {
        "full_name": full_name,
        "date_of_birth": date_of_birth,
        "phone": phone,
        "county": county,
        "consent": consent,
        "emergency": emergency,
    }
    source = {"matches": [{} for _ in range(max(0, int(source_match_count or 0)))], "status": "demo_input"}
    return assess_review_readiness(intake, source)


with gr.Blocks(title="918 Bail Bonds Advisory Review") as demo:
    gr.Markdown("""# 918 Bail Bonds — Advisory Review\n\nThis demo organizes consented workflow evidence for a licensed bondsman. It does **not** calculate criminal risk, recommend detention, determine eligibility, set premiums, or replace a court or licensed professional. Do not enter real personal information in this public demo.""")
    with gr.Row():
        full_name = gr.Textbox(label="Demo client name")
        date_of_birth = gr.Textbox(label="Demo date of birth")
        phone = gr.Textbox(label="Demo phone")
    with gr.Row():
        county = gr.Textbox(label="County", value="Tulsa")
        source_match_count = gr.Number(label="Public-source matches to review", value=0, precision=0)
        consent = gr.Checkbox(label="Consent recorded", value=False)
        emergency = gr.Checkbox(label="Client marked emergency", value=False)
    run = gr.Button("Generate advisory review packet", variant="primary")
    output = gr.JSON(label="Non-binding assessment")
    run.click(run_assessment, [full_name, date_of_birth, phone, county, consent, emergency, source_match_count], output)


if __name__ == "__main__":
    demo.launch()
