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

## so|bond-inspired agreement audit

This app uses a narrow, non-custodial adaptation of the supplied so|bond model.
`contracts/BailAgreementRegistry.sol` records agreement lifecycle attestations,
participant approvals, freeze state, and hashes of off-chain evidence. It does
not tokenize bail, custody money, replace a licensed bondsman, or make a legal,
eligibility, payment, or court decision.

After a request has a human bondsman decision and fee offer, staff can retrieve
the public-safe manifest and digest at:

`GET /api/requests/<request_id>/agreement-manifest`
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
