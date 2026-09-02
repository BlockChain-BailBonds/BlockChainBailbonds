# M3rMa1d S1r3n ADL 2.0

ADL is the deterministic authority boundary between Codex planning and physical execution.

```text
operator authorization and goal
  -> Codex Structured Output
  -> ADL validation
  -> verified app/script/library/artifact resolution
  -> content-addressed adapter materialization
  -> signed Core request
  -> three-C5 safety quorum
  -> CYD Deck approval and STOP gate
  -> CYD-only Flipper Expansion UART/RPC
  -> signed result and hash-chained audit
```

## Step kinds

- `capability`: a cataloged, adapter-backed system capability.
- `app`: a typed function for an installed Flipper application or service.
- `script`: a bounded sequence of catalog app functions. A script is declarative data, not source code, shell text, or raw protocol bytes.

## Generated logic

When explicitly permitted by the operator's resolution policy, Codex may generate a candidate adapter or script. Generated material is validated, scanned for prohibited fields, canonicalized, SHA-256 hashed, and stored as `staged_pending_review`.

Generated material does **not** become executable merely because it was generated successfully. It requires:

1. physical testing against the intended owned asset or isolated lab;
2. preserved test evidence;
3. operator promotion of the exact generated SHA-256 with the evidence SHA-256;
4. explicit enabling of generated-adapter execution;
5. operator approval and Deck confirmation for the resulting job;
6. Vision verification when required by policy.

## Resolution policies

- `official_and_pinned`: only trusted official sources pinned to immutable revisions.
- `pinned_only`: operator-approved pinned sources permitted by the artifact policy.
- `local_only`: material already staged and verified in the local artifact store.

All resolution booleans are explicit in every run. Codex is not permitted to silently broaden them or alter the authorization envelope.

## Invariants

1. The CYD Deck is the sole physical Flipper GPIO owner.
2. Every executable job targets `flipper-link`; no fallback route exists.
3. Model output never becomes a raw command, CLI string, shell program, or arbitrary protocol frame.
4. Every executable function resolves to a content-addressed adapter whose verification status is `bundled_verified` or `operator_verified`.
5. Unknown and `restricted` operations are denied.
6. Physical-output and transmit operations require approval and an explicit `deck_confirm` operation.
7. Transmit operations additionally require an authorized asset/lab scope, a resolved profile, a transmit declaration, and an owned source artifact outside an isolated lab.
8. Libraries use immutable revisions and verified descriptors. Artifacts use full SHA-256 verification before transfer and again before execution.
9. The host and Core exchange signed envelopes with timestamps, nonces, fixed routing, and signed responses.
10. Core readiness must attest the CYD, Flipper, all three C5 safety nodes, STOP state, and no fallback route.
11. STOP is checked before a run and again before every concrete job.
12. Every request, approval, artifact transfer, result, STOP event, generated-material promotion, and Vision decision enters the tamper-evident audit chain.

## Example

The checked-in read-only contract is `../codex/examples/read-only-run.json`. It uses official RPC-backed device and storage operations and does not contain a transmit step.
