# Contract boundary

`AuditRegistry.sol` is intentionally non-custodial. It anchors hashes of
off-chain agreements and workflow events only. It does not hold or transfer
bail, premiums, collateral, or utility tokens.

Any escrow, collateral, payment, or token contract requires a separate legal,
licensing, custody, sanctions, tax, and security review before deployment.

## so|bond adaptation

`BailAgreementRegistry.sol` applies the useful so|bond ideas to this product's
actual domain: role separation, an explicit lifecycle, participant approvals,
freeze controls, and evidence events. It is not a security-token register. It
never stores private intake data and never holds or transfers bail, premium,
collateral, or ADTV/BBT value.

The API endpoint `GET /api/requests/<request_id>/agreement-manifest` produces a
public-safe deterministic SHA-256 digest. A licensed operator may later anchor
that digest on an approved EVM deployment after legal, custody, security, and
signing review. The digest is not proof that a court, insurer, or bondsman has
approved a case.
