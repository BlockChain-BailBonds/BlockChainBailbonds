# M3rMa1d S1r3n ADL 2.0

ADL is the deterministic authority boundary between Codex planning and hardware execution.

```text
operator goal
  -> Codex Structured Output
  -> ADL validation
  -> app/script/library/frequency resolution
  -> adapter materialization
  -> Core authorization
  -> CYD Deck approval and STOP gate
  -> CYD-only Flipper GPIO bridge
  -> result and hash-chained audit
```

## ADL step kinds

- `capability`: a cataloged system capability such as device information or app inventory.
- `app`: an installed Flipper app and a typed function.
- `script`: a declarative sequence of app functions. It is not shell or executable source code.

An unknown app function can trigger Codex adapter generation when `allow_generate_adapter=true`. The generated manifest is schema-checked, scanned for prohibited primitives, hashed, staged, registered, and resolved again before it can become a job.

## Resolution

A run controls whether the resolver may:

- install or build reviewed components;
- generate declarative scripts or adapters;
- resolve pinned libraries;
- resolve an operator-maintained frequency profile.

`official_and_pinned` accepts trusted, pinned sources. `pinned_only` accepts any explicitly pinned source permitted by the artifact policy. `local_only` requires locally staged material.

## Execution invariants

1. The CYD Deck is the only physical Flipper GPIO owner.
2. Every job target is `flipper-link`; no physical fallback route exists.
3. Model output never becomes a raw command.
4. Unknown risk classes and `restricted` operations are denied.
5. Physical output and transmit operations require Deck approval.
6. Transmit operations require an authorization scope, a resolved frequency/carrier profile, a transmit declaration, and—outside an isolated lab—an owned source artifact.
7. Libraries and generated artifacts must be pinned by SHA-256 or immutable revision.
8. STOP cancels the active run before the next job.
9. Each transition is recorded in a hash-chained audit log.
10. Core and Deck re-check policy; gateway validation is not the sole authority.

## Example

See `../codex/examples/read-only-run.json` and `../codex/examples/owned-ir-run.json`.
