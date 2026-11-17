# QR Call — Public concept, authorship and permitted uses

**Published concept declaration, November 16, 2026.**

**Proposed originating author / IP attribution:** Matthew Blake Ward, in association with **918 Technologies**. Product name: **QR Call**. Technology brand: **GlyphMatics**.

## Explicit concept

QR Call is a structured QR permission generator for private communication and restricted distribution. A person grants another person limited contact access **without disclosing their real telephone number**. The printed QR points to a random revocable authorization record. Revocation invalidates the code and its exact copies without forcing a telephone number change. Each code can be subject to absolute validity dates, recurring day/hour windows in a named timezone, quotas, abuse limits, and user cancellation. Approved browser calls are bridged through a provider to the recipient's existing phone.

QR Call also applies the same permission model to product delivery: successful server-verified checkout grants a short-lived, one-time **download** QR, rather than a permanent public executable download link. The recipient's copy can be stored on their own device, but SMS ownership and revocation enforcement require a trusted reachable service.

Sensitive values are sealed with **GlyphMatics GM1**, an application-specific versioned envelope using vetted authenticated encryption (AES-256-GCM and HKDF-SHA-256), rather than an unreviewed replacement cipher.

## Intended lawful uses

Personal harassment mitigation, temporary contact access for acquaintances, business-to-customer callbacks, classified listings, delivery coordination, personal safety cards, job searches, travel contacts, professional networking, private event contact, time-limited family access, lost-property coordination, and gated distribution of original software packages.

## Command and safety constraints

A QR does not run executable code. It carries a URL/opaque authorization token interpreted by an allowlisted app or server. Native phone functions always remain subject to the operating system's permission and security model; payment and SMS ownership proof require independently trusted online services. Neither a mobile web app nor a paper QR can block calls made directly to an already known telephone number.

## Rights and source visibility

Copyright protects qualifying original expression and source implementation, **not ownership of the general idea** of a QR-mediated phone relay. This statement records asserted attribution and intended scope; it is not proof of patent filing, patent issuance, trademark registration, copyright registration, legal priority, or ownership over pre-existing third-party methods. Source made publicly readable does not, without an accompanying license, become open-source software under an OSI-approved license. See `LICENSE` and `TERMS.md`.

## Evidence classification

**Verified locally:** automated tests of schedule logic, QR token privacy, access denials, SMS provider-mock gate, Twilio webhook authorization, Stripe webhook signature verification, single-use download, expiration, and unsafe QR rejection.

**Unverified / blocked:** live payment collection, live SMS delivery, public HTTPS deployment, end-to-end phone calls through a carrier, authentic mobile installation, privacy penetration test, and real-world telecom cost sustainability.