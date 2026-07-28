# Kaggle write-up: 918 Bail Bonds Advisory AI on Kaggle GPU

## Summary

This notebook demonstrates a GPU-ready, privacy-preserving workflow assistant
for a bail-bonds operator. It organizes consented intake completeness and
public-source evidence review, then returns explicit next actions for a
licensed bondsman.

It deliberately does not calculate criminal risk, flight risk, detention risk,
bail eligibility, pricing, or a recommendation about liberty. Every example is
synthetic, and every packet ends in `human_review_required`.

## GPU optimization

- Detects CUDA at runtime and reports the accelerator.
- Uses `sentence-transformers/all-MiniLM-L6-v2` when available for batched,
  public-safe evidence organization.
- Uses `batch_size=32`, normalized embeddings, and GPU placement only for the
  optional semantic organization step.
- Falls back to a transparent keyword path when downloads or GPU access are
  unavailable.

The GPU is never used to create a bail or detention score.

## Reproduce

1. Open the notebook with GPU enabled and Internet enabled if model download is
   desired.
2. Run all cells from top to bottom.
3. Review the assertions proving that no risk score is emitted and that human
   review remains mandatory.

For the local application, the corresponding endpoint is:

`GET /api/requests/<request_id>/assessment`

## Responsible-use boundary

Do not upload real names, dates of birth, phone numbers, booking reports, or
other personal information to this public notebook. The notebook is an
engineering demonstration, not legal advice, a risk model, or a substitute for
a licensed bondsman, court, insurer, attorney, or applicable jurisdictional
process.
