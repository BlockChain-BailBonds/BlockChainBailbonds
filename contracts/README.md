# Contract boundary

`AuditRegistry.sol` is intentionally non-custodial. It anchors hashes of
off-chain agreements and workflow events only. It does not hold or transfer
bail, premiums, collateral, or utility tokens.

Any escrow, collateral, payment, or token contract requires a separate legal,
licensing, custody, sanctions, tax, and security review before deployment.
