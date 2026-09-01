# Codex to Core Control-Plane Contract

The Codex host sends JSON over HTTP to the Core S3. Every request is wrapped in an HMAC-SHA256 envelope. The Core must reject unsigned, stale, replayed, malformed, or incorrectly routed requests before inspecting the job payload.

## Envelope

```json
{
  "version":1,
  "type":"job.execute",
  "timestamp":"2026-09-01T12:00:00.000Z",
  "nonce":"32-lowercase-hex-characters",
  "route":{
    "logical_target":"flipper",
    "physical_owner":"deck-cyd",
    "fallback_physical_route":false
  },
  "payload":{},
  "signature":"64-lowercase-hex-characters"
}
```

The signature is HMAC-SHA256 over the deterministic, recursively key-sorted JSON representation of the envelope with the `signature` field removed. The host and Core share `S1R3N_CONTROL_KEY`, which must contain at least 32 random characters.

## Required Core endpoints

```text
POST /v1/jobs       job.execute
POST /v1/approvals  approval.request
POST /v1/inventory  inventory.request
POST /v1/status     status.request
POST /v1/stop       stop.assert
POST /v1/resume     stop.clear
```

## Core checks

1. Require `version=1`.
2. Require `physical_owner=deck-cyd` and `fallback_physical_route=false`.
3. Reject timestamps outside the configured clock-skew window.
4. Reject a nonce already observed within the replay cache.
5. Verify the HMAC in constant time.
6. Require the C5 safety quorum, Deck identity, and Deck liveness.
7. Require STOP clear and the ADL lease unexpired.
8. Re-check risk, authorization, approval, frequency/artifact identity, and target.
9. Forward only the typed Deck adapter program, never raw model text.
10. Return one structured `JobResult` and append an audit event.

## Mock Core

For host integration testing only:

```bash
export S1R3N_CONTROL_KEY="0123456789abcdef0123456789abcdef"
node codex/src/mock-core.mjs
```

The mock starts with STOP asserted, verifies signatures and replay state, denies approvals, and never touches hardware.
