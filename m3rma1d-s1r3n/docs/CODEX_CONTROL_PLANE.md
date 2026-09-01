# Codex-to-Core Production Control-Plane Contract

The Codex host sends authenticated JSON requests to the Core ESP32-S3. Every request and response is HMAC-SHA256 authenticated. The Core must reject unsigned, stale, replayed, malformed, or incorrectly routed requests before inspecting the payload.

## Request envelope

```json
{
  "version": 1,
  "type": "job.execute",
  "timestamp": "2026-09-01T12:00:00.000Z",
  "nonce": "32-lowercase-hex-characters",
  "route": {
    "logical_target": "flipper",
    "physical_owner": "deck-cyd",
    "fallback_physical_route": false
  },
  "payload": {},
  "signature": "64-lowercase-hex-characters"
}
```

The signature is HMAC-SHA256 over the deterministic recursively key-sorted JSON representation with the `signature` field removed. `S1R3N_CONTROL_KEY` must contain at least 32 random characters and must be provisioned outside source control.

## Response envelope

```json
{
  "version": 1,
  "type": "job.execute.result",
  "timestamp": "2026-09-01T12:00:01.000Z",
  "request_nonce": "the-request-nonce",
  "route": {
    "logical_target": "flipper",
    "physical_owner": "deck-cyd",
    "fallback_physical_route": false
  },
  "payload": {
    "job_id": "run-id:0",
    "code": 0,
    "text": "completed",
    "data": {}
  },
  "signature": "64-lowercase-hex-characters"
}
```

The host verifies the response type, request nonce, timestamp, route, payload shape, and HMAC before using the result.

## Required Core endpoints

```text
POST /v1/jobs             job.execute
POST /v1/approvals        approval.request
POST /v1/inventory        inventory.request
POST /v1/status           status.request
POST /v1/stop             stop.assert
POST /v1/resume           stop.clear
POST /v1/artifacts/begin  artifact.begin
POST /v1/artifacts/chunk  artifact.chunk
POST /v1/artifacts/commit artifact.commit
```

## Core validation order

1. Enforce request-size and JSON-depth limits.
2. Require `version=1` and a known message type.
3. Require `logical_target=flipper`, `physical_owner=deck-cyd`, and `fallback_physical_route=false`.
4. Reject timestamps outside the configured clock-skew window.
5. Reject nonces already observed within the replay-cache lifetime.
6. Verify HMAC in constant time.
7. Require the identified CYD Deck online.
8. Require the Flipper online through that Deck.
9. Require all three ESP32-C5 safety nodes online and a healthy quorum.
10. Require STOP clear for execution and approval operations.
11. Require the ADL run and job leases unexpired.
12. Verify the materialized Flipper program SHA-256 and adapter verification status.
13. Verify each referenced artifact is completely staged and matches its expected size and SHA-256.
14. Re-check risk, authorization, approval lease, frequency profile, asset identity, and target.
15. Forward only the typed Flipper program to the CYD. Never forward model text, shell input, raw CLI, or an alternate route.
16. Sign the structured response and record the event.

## Artifact transfer

Artifacts are transferred in signed chunks:

1. `artifact.begin` declares the ID, kind, total size, and full SHA-256.
2. Core returns a unique upload ID and bounded chunk size.
3. Each `artifact.chunk` includes offset, base64 data, and chunk SHA-256.
4. Core rejects gaps, overlaps, duplicate offsets with different bytes, oversized chunks, and digest mismatches.
5. `artifact.commit` succeeds only after exact byte count and full SHA-256 verification.
6. A committed artifact remains content-addressed and read-only for the duration of the ADL run.

## Approval lease

A positive CYD response must contain:

```json
{
  "job_id": "run-id:0",
  "approved": true,
  "approval_id": "unique-approval-id",
  "expires_at": "2026-09-01T12:00:20.000Z",
  "physical_owner": "deck-cyd"
}
```

Approval is bound to one job, one program digest, one operator decision, and a short expiration. It cannot be reused for another job.

## Transport requirement

Use HTTPS in production. Plain HTTP is accepted by the host only when explicitly enabled and only for private or local addresses during controlled commissioning. Network isolation is not a substitute for message authentication.

## Verification

The repository contains deterministic envelope tests and a separate real-hardware contract. The real-hardware contract requires a reachable Core and validates the signed route, CYD, Flipper, three-C5 quorum, real inventory, and optionally one read-only device-information execution. It does not use a mock Core.
