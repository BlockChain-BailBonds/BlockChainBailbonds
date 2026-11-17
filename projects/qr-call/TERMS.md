# QR Call — Proposed commercial and privacy boundaries

**This text is a prelaunch policy draft, not legal review or an active offer.**

- **Purchase:** one-time fee payable through the operator's configured Stripe Checkout. Do not call an obligatory payment a charitable donation. Price, taxes, and refunds must be disclosed before checkout.
- **Lifetime upgrades within boundaries:** maintenance, security fixes, and compatible feature updates to the QR Call core product during the life of that supported product family. No right to unrelated new products, indefinite cloud hosting, guaranteed carrier access, or unlimited third-party SMS/voice services. Published versions and upgrade eligibility must be recorded and communicated to customers.
- **Phone verification:** the owner must prove possession/control of the selected number through an independent SMS OTP before calling features unlock. Another person's number must not be registered without their consent.
- **Privacy:** destination numbers and bearer QR tokens are protected at rest using GlyphMatics GM1 and TLS in transport, and are not embedded in public QR codes. The telephone provider necessarily handles destination numbers and call signaling. Call activity metadata is subject to short retention. PSTN audio is not end-to-end encrypted.
- **User choice:** owners may revoke individual access cards and opt out; a recipient may stop a call. User consent, abuse prevention, and telecom laws govern operation. No claim that a printed QR can prevent unwanted calls to a number already known to an abuser.
- **Data:** test installation retention is 30 days for call metadata; payment records, proofs of consent, and legal compliance may require longer retention. Full policy must be written before commercial launch.
- **Known technical limits:** installed PWA uses browser storage for app assets, but the trusted gateway is necessary to validate payment, SMS challenge, global revocation, timed permissions and PSTN bridges. The application does not control unrestricted mobile OS functions.

No real money should be collected under these terms until a legally reviewed consumer agreement, privacy notice, and refund/cancellation handling are published.

## Human approval and failed transactions

QR Call distribution is not automatic. Payment alone does not authorize delivery: the merchant record, scoped Codex review and a logged-in operator approval must succeed. A denied or disputed purchase must be handled using the stated merchant refund policy and applicable consumer rights. Do not represent withheld software as an unconditional instant purchase. The operator cannot recover already-redeemed release bytes; Deny stops subsequent access only.