---
title: 918 Bail Bonds Live Demo
emoji: ⚖️
colorFrom: blue
colorTo: red
sdk: static
app_port: 7860
---

# BlockChainBailbonds

Live demo for the 918 bail workflow. The public UI polls realtime ADTV health data and can submit consented intake requests when a workflow API is configured.

## Production boundary

The GitHub Pages landing page is intentionally a privacy-safe, generic notice;
it publishes no booking, client, staff, license, payment, or operational
details. The API and staff surfaces are for authorized, authenticated use only.
Read [SECURITY.md](SECURITY.md) before any production deployment. This software
supports a licensed professional's human review and never makes an automated
legal, eligibility, pricing, detention, identity, or release decision.

## Tulsa booking-monitor source

The Professional and Agency booking-monitor edition expects a deployment of
[Code for Tulsa's inmate-information wrapper](https://github.com/codefortulsa/tulsa-county-inmate-information-center-api).
Set `TULSA_INMATE_API_URL` to that deployment's base URL (for a local instance,
`http://127.0.0.1:3030`). The workflow calls its `/inmateBooking` endpoint,
which the source documents as an hourly-cached JSON conversion of the Tulsa
County inmate-booking report. The source may scrub personal fields for
non-whitelisted callers, so the monitor stores and displays only fields actually
returned by the source. New/changed records are licensed-bondsman review leads,
not automated identity, eligibility, pricing, or release decisions.

Tulsa County retired the legacy `expInmateBookings/Export` PDF endpoint in July
2026 and now routes visitors to a CAPTCHA-protected 365Labs portal. The API
detects that migration and returns `source_migrated` plus the official portal
link. It deliberately does not automate or bypass that human-verification step.

## Emergency readiness and server-side follow-up

A client can create a consented readiness profile and use its one-time
activation token to create a 1–72 hour emergency mandate. The mandate creates
an auditable request and queues a notification for the assigned bondsman; the
client's device is no longer required for later polling. Run
`bash scripts/run-emergency-worker.sh` every five minutes through the deployed
platform's scheduler. Configure a signed internal notification adapter with
`BAILBONDS_NOTIFICATION_WEBHOOK_URL` and
`BAILBONDS_NOTIFICATION_WEBHOOK_SECRET`; until then, notifications remain
explicitly marked `provider_not_configured` rather than claimed as SMS/email.
The mandate never accepts a bond, signs an agreement, or charges a payment.
The companion `emergency-readiness.html` page is the client setup/activation
surface. Back up a production database with `bash scripts/backup-db.sh` from a
trusted scheduled environment; it requires `BAILBONDS_DB` and a protected
`BAILBONDS_BACKUP_DIR`.

## Attention Contribution / Bail Solidarity Fund

The API includes a provider-neutral, administrator-gated five-slot attention
block system. A signed provider callback verifies all five completed slots; one
campaign question then gates a **sponsor pledge** to a separate solidarity-fund
ledger. It is off by default and does not give participants cash, crypto,
tokens, client bail credits, bail priority, or a release decision. Use it only
with a sponsor/ad provider whose written program terms permit a charitable
pledge based on verified participation. Standard AdMob rewards are not a valid
source for this purpose.

## so|bond-inspired agreement audit

This app uses a narrow, non-custodial adaptation of the supplied so|bond model.
`contracts/BailAgreementRegistry.sol` records agreement lifecycle attestations,
participant approvals, freeze state, and hashes of off-chain evidence. It does
not tokenize bail, custody money, replace a licensed bondsman, or make a legal,
eligibility, payment, or court decision.

After a request has a human bondsman decision and fee offer, staff can retrieve
the public-safe manifest and digest at:

`GET /api/requests/<request_id>/agreement-manifest`

## Published demos

- GitHub Pages: https://blockchain-bailbonds.github.io/BlockChainBailbonds/
- Hugging Face static Space: https://huggingface.co/spaces/Nine1Eight/918-bailbonds-advisory-ai
- Kaggle notebook: https://www.kaggle.com/code/wethepeople918/918-bail-bonds-advisory-ai-on-kaggle-gpu

The Kaggle and Hugging Face demos use synthetic values and expose only
non-binding workflow-readiness guidance. They do not provide a criminal-risk,
detention, eligibility, pricing, or legal decision.

Each assessment now includes a `risk_assessment_suggestion` containing a
reasoned next workflow step: request missing information, confirm public-source
evidence with a licensed bondsman, or escalate for licensed case review.
.....
918-tech-blockchain-bailbonds-mvp-final/
│
├── README.md                # Overview, setup, usage, deployment
├── LICENSE                  # License (MIT, Apache 2.0, etc.)
├── package.json             # If using Node.js for build or dependency management
├── .gitignore               # Ignore node_modules, build, etc.
│
├── /src                     # Source files
│   ├── /js
│   │   ├── bondsman-actions.js
│   │   ├── contract-generator.js
│   │   ├── domain-connector.js
│   │   ├── ipfs-storage.js
│   │   ├── oklahoma-data.js
│   │   ├── script.js
│   │   ├── service-worker.js
│   │   ├── translations.js
│   │   └── ...
│   ├── /html
│   │   ├── index.html
│   │   ├── bail-contract-generator.html
│   │   ├── bondsman-portal.html
│   │   ├── domain-structure.html
│   │   ├── domain-wizard.html
│   │   ├── offline.html
│   │   ├── verification.html
│   │   └── ...
│   ├── /css
│   │   └── style.css
│   └── /data
│       └── manifest.json
│
├── /public                  # Deployed static assets
│   ├── /icons
│   └── favicon.ico
│
└── /docs                    # Documentation, screenshots, API spec, architecture notes
    └── architecture.md
