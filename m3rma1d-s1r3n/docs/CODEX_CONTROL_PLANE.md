# Codex-to-S3-CAM Production Control-Plane Contract

The active M3rMa1d S1r3n appliance has exactly two devices:

```text
Codex/ADL host -> GOOUUU ESP32-S3-CAM V1.5 N16R8 -> Flipper Zero
```

There is no CYD, C3/C5 safety mesh, second S3, separate Core board, separate Vision board, or fallback ESP route.

## Authentication and route

Every normal host request and S3 response uses an HMAC-SHA256 envelope. The HMAC key is provisioned outside source control and must contain at least 32 random characters. The route is fixed:

```json
{
  "logical_target": "flipper",
  "physical_owner": "s3-cam",
  "fallback_physical_route": false
}
```

The signature is HMAC-SHA256 over the recursively key-sorted JSON representation with the `signature` field removed. The S3 verifies the envelope before inspecting job/artifact payload semantics. Successful and operational-error responses are correlated to the request nonce and signed before the host accepts them.

## Required endpoints

| Endpoint | Envelope type | Purpose |
|---|---|---|
| `POST /v1/status` | `status.request` | Attest route, link state, camera state, STOP, and disabled raw-shell surfaces. |
| `POST /v1/inventory` | `inventory.request` | Return live Flipper app inventory once typed protobuf RPC inventory is available. Until then this fails closed. |
| `POST /v1/jobs` | `job.execute` | Execute a content-addressed typed Flipper program. General operations fail closed until protobuf RPC is implemented. |
| `POST /v1/approvals` | `approval.request` | Correlate the host point-click approval surface with the S3 route. |
| `POST /v1/stop` | `stop.assert` | Assert local fail-closed STOP. |
| `POST /v1/resume` | `stop.clear` | Clear STOP only while the Flipper link is live. |
| `POST /v1/artifacts/begin` | `artifact.begin` | Declare a bounded content-addressed artifact upload. |
| `POST /v1/artifacts/chunk` | `artifact.chunk` | Append a sequential base64 chunk after per-chunk SHA-256 verification. |
| `POST /v1/artifacts/commit` | `artifact.commit` | Commit only after exact size and full SHA-256 verification. |

## Request validation

The S3 performs these checks before any job is allowed to act on the Flipper:

1. Require a provisioned control key and `x-s1r3n-protocol: 1`.
2. Enforce the request-size and JSON nesting limits.
3. Require the exact seven-field envelope and exact three-field route.
4. Require `version=1`, the endpoint-specific message type, a 32-hex nonce, and 64-hex HMAC.
5. Require `logical_target=flipper`, `physical_owner=s3-cam`, and `fallback_physical_route=false`.
6. Verify HMAC in constant time over canonical JSON.
7. Parse the signed UTC timestamp and enforce the 30-second clock-skew window.
8. Reject a nonce already present in the replay cache. A bounded nonce window and timestamp high-water mark are retained in NVS to cover reboot replay attempts.
9. Require STOP clear and a live Flipper link for job execution.
10. Require the materialized Flipper program SHA-256 to match its canonical content.
11. Permit only explicitly implemented typed operations. Unsupported operations fail closed; no model text, shell command, or raw CLI string is forwarded.

The S3 has no trusted RTC during isolated AP commissioning. The first valid HMAC-authenticated host timestamp anchors monotonic time for the boot. NVS high-water and recent nonce state reject older/replayed signed requests across reboot. Once anchored, every later request must remain inside the configured skew window.

## Artifact integrity

Only one bounded upload is active at a time. `artifact.begin` fixes ID, kind, size, and final SHA-256. Chunks must be sequential, within the negotiated size, valid base64, and match their declared chunk SHA-256. Commit requires exact byte count and full-file SHA-256. Committed files are stored under their content hash.

## STOP behavior

STOP defaults asserted at boot and automatically reasserts when the Flipper link becomes stale. Resume succeeds only while the live link is present. Status and STOP assertion remain available independently of the typed RPC execution gate.

## Flipper execution boundary

The current S3 firmware retains a small bounded commissioning-only read-only CLI probe for device identity. That probe is not the production RPC bridge and is not presented as one. Live app inventory plus system/storage/app/GUI/GPIO/property operations remain blocked until the official Flipper Expansion protocol is used to start a protobuf RPC session and those typed services are implemented.

The production adapter catalog remains `flipper-expansion-rpc-v1`; no unrestricted CLI or alternate physical route may be introduced to make tests pass.

## Verification

Deterministic host tests cover all route/type bindings, signed non-2xx responses, schema ownership, and firmware contract drift. The PlatformIO workflow compiles the actual S3 source and LittleFS image. Real hardware remains required for camera, UART, STOP/replay/tamper/cable-loss/reboot, live inventory, app lifecycle, and typed RPC acceptance.
