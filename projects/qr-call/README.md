# QR Call — 918 Technologies

**Status:** testable MVP source. **Not live/production-certified.** Automatic tests pass in a synthetic test environment; external payment, SMS, WebRTC, telephone calls, mobile-install flows, and deployment operations have not yet received end-to-end acceptance evidence.

**Attribution:** QR Call concept and implementation © 2026 Matthew Blake Ward, in association with 918 Technologies. See `IP_AND_USES.md` and `LICENSE`.

## What it is

QR Call is a structured QR permission generator. A person can issue a printed QR credential that connects a scanner to their **existing, private telephone number** via a provider-hosted masked caller relay. The paper QR can be revoked, capped to a maximum number of calls, and scheduled by start/end date, weekday, time range, and timezone. The code contains an opaque random URL only, not telephone numbers or executable commands.

The **download QR** is separate from the **calling QR**. After an authorized checkout, a short-lived QR points to a one-time confirmation and download. It is not consumed by GET requests/link previews and becomes void upon confirmed redemption.

An authenticated owner cannot generate or administer calling QR credentials until they complete the independent SMS challenge for their intended recipient number. The restricted application UI is accessible for activation, but it cannot operate the calling features before verification. The phone number is not silently obtained from the phone OS.

## Practical deployment split

- **GitHub Pages** hosts `site/` as a public, static marketing and checkout launch page. It cannot hold merchant or telecommunications secrets, deliver legally enforceable payment verification, or provide a trustworthy offline global revocation service.
- **FastAPI / PostgreSQL / HTTPS gateway** handles Stripe checkout confirmation via signed webhooks, SMS verification via Twilio Verify, QR permissions, encrypted destination numbers, telephone calling, and revocation. Credentials live in the server's environment, not GitHub Pages or the mobile web app.
- **Installable PWA**: the owner interface can be added to the phone home screen on compatible Android and iOS browsers. Its static assets can use phone storage via the service worker. Calling and permission revocation require network access. No native Android APK/iOS IPA is included. No claim is made that a web app can control *all* phone settings or run arbitrary OS commands.
- **GlyphMatics GM1** is a versioned envelope using **HKDF-SHA-256 + AES-256-GCM** for sensitive database fields. The name does not claim an independently validated custom encryption algorithm. TLS and the telecom provider still protect communications in transit; a PSTN call is not end-to-end encrypted.

## Verification and production acceptance

Run the included automated tests:

```sh
python -m pip install -r requirements.txt -r requirements-test.txt
python -m pytest -q
```

Generate the release package (also produces a SHA-256 manifest):

```sh
python tools/build_release.py
```

Before accepting **real users**:

1. Acquire a domain with HTTPS and persistent PostgreSQL, Twilio Voice/Verify credentials, and a Stripe account with a genuine one-time Price ID. Purchase or verify the Twilio sender phone number. Configure a TwiML App to `https://YOUR_DOMAIN/twilio/voice` using POST, and configure Stripe webhook POST to `https://YOUR_DOMAIN/gate/stripe/webhook`. Secret values are never stored in GitHub Pages or repo.
2. Provision `.env` using `python -m app.manage configure`. Run `docker compose up -d --build`. Publish the `site` folder via GitHub Pages and set `site/config.js` to the HTTPS origin of the gateway. The Docker build must successfully obtain the Twilio Voice SDK and Python requirements. Run database migrations for any existing database; this MVP uses `create_all` for an empty install and is not a migration framework.
3. Pay with a Stripe **test-mode** transaction. Confirm that the signed webhook creates exactly one receipt, that a QR appears only after payment, and that confirmation consumes the QR only once. Validate expired and concurrent redemption paths under PostgreSQL.
4. Complete **real Twilio SMS verification** with a destination you control. Confirm failed/expired OTP never unlocks the app. Confirm that SMS re-verification is required for a new authenticated session and that the registered number cannot be switched to a different one without recovery.
5. Place an actual WebRTC-to-PSTN call between two controlled devices. Verify the browser never exposes the destination number, the recipient sees only the relay caller ID, and scans after revocation or outside scheduled hours fail. Test NAT, microphone permissions, delayed webhooks, accessibility, local DST transitions, and load. Confirm rate limits and telecom abuse protection with the provider.
6. Review personal information retention, consumer marketing, Stripe tax/refund disclosures, telephony compliance, accessibility, backups and recovery, abuse handling, and purchased third-party SMS/call costs with your legal and operations teams before production launch.

## One-time fee and support boundaries

The purchaser is entitled to security and compatibility updates for the **QR Call core version family** during the maintained life of that product. The single-purchase grant does **not** promise free SMS, carrier minutes, Twilio/Stripe costs, hosting, an indefinite cloud service, or unrelated future products. No live purchase price or merchant is configured in the distributed source. This is a **paid access** transaction and should not be misleadingly described as a tax-deductible charitable donation. See `TERMS.md`.

## Architecture

```text
GitHub Pages storefront -> Stripe-hosted Checkout -> signed backend webhook
  -> one-time download QR -> gated ZIP delivery -> local/mobile PWA install

Mobile owner login -> independent Twilio SMS OTP -> active owner session
  -> create structured calling QR (date/time/rate limits)
  -> scanner opens browser -> server validates credential
  -> Twilio client-to-PSTN bridge -> owner regular phone

Owner revoke -> all copies of affected calling QR denied on future calls
```

QR links cannot execute arbitrary mobile OS commands. The allowed command types in `app/qr_commands.py` are **call** and **download**. Both are interpreted by the trusted service. Expanding the command allowlist requires an explicit threat model and OS-approved permissions.

## Known limitations

This is a **single-owner, single-destination test instance**, not a multi-tenant service. It supports US/NANP destination numbers (`+1...`). A public GitHub repository cannot hide public source code behind a donation gate; the provided gate only governs the merchant-hosted release distribution, not copying publicly visible code. Backups, schema migrations, service monitoring and verified mobile/browser voice acceptance remain deployment work. Existing calls may finish after a scheduled window ends; the call duration cap is 15 minutes by default. The release ZIP is **source code, not an APK or IPA**; a compatible mobile browser can install the hosted PWA once deployed.

No installation is live until credentials, domains, merchant checkout, providers and infrastructure are configured and acceptance checks succeed. Do not turn on billing for real users based only on unit tests.