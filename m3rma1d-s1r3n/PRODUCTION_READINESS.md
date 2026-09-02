# M3rMa1d S1r3n Production Readiness Gate

This document is the release authority for the M3rMa1d S1r3n appliance. A feature, branch, pull request, or tag is not user-ready merely because host tests pass.

Use only these statuses:

```text
PASS
FAIL
NOT TESTED
BLOCKED
```

## Release rule

A release is permitted only when every required row below is `PASS`, the evidence location is populated, and the exact tested commit and firmware hashes are recorded. Any `FAIL`, `NOT TESTED`, or `BLOCKED` status prevents promotion to `main` or a production tag.

## Software supply chain

| Gate | Required result | Current status | Evidence |
|---|---|---:|---|
| Host deterministic tests | All tests pass on final commit | NOT TESTED | Latest final-commit CI run required |
| Host production static gate | No mock/dry-run/raw-command substitute; route and pins validated | NOT TESTED | Latest final-commit CI run required |
| Dependency policy | Runtime dependency inventory reviewed; immutable revisions recorded | NOT TESTED | `codex/catalog/libraries.json` plus review record |
| Secret scan | No API key, control key, bearer token, Wi-Fi credential, certificate private key, or device key committed | NOT TESTED | Repository secret-scan report |
| SAST | No unresolved critical/high findings in host or firmware | NOT TESTED | Scanner report tied to commit |
| SBOM | Host and firmware SBOM generated and archived | NOT TESTED | Release artifact |
| Reproducible host package | Clean machine produces identical package digest | NOT TESTED | Build log and SHA-256 |

## Host control plane

| Gate | Required result | Current status | Evidence |
|---|---|---:|---|
| Required configuration | Placeholder and missing secrets rejected | NOT TESTED | Unit test/CI log |
| OpenAI structured contract | Strict ADL schema request and refusal handling pass | NOT TESTED | Unit test/CI log |
| Authorization integrity | Codex cannot alter operator authorization or resolution policy | NOT TESTED | Unit test/CI log |
| Adapter integrity | Only content-addressed verified adapters materialize | NOT TESTED | Unit test/CI log |
| Generated logic quarantine | Unpromoted adapter/script execution rejected | NOT TESTED | Unit test/CI log |
| Artifact transfer | Chunk and full SHA-256 verification pass against real Core | NOT TESTED | Hardware-contract log |
| Signed request/response | HMAC, timestamp, request nonce, route, and response payload checks pass | NOT TESTED | Unit and hardware-contract logs |
| STOP behavior | Local and remote STOP assert and shutdown STOP confirmed | NOT TESTED | Hardware-contract log and video/logic trace |
| Audit integrity | Hash-chain verification passes after successful and failed runs | NOT TESTED | Audit verification output |

## Embedded firmware inventory

Required production images:

```text
core-s3
vision-s3-ov3660
c5-guardian
c5-watcher
c5-arbiter
deck-cyd
```

| Image | Required result | Current status | Evidence |
|---|---|---:|---|
| Core ESP32-S3 | Signed HTTPS/control-plane receiver, replay cache, leases, Deck route, C5 quorum, artifact staging | BLOCKED | Current repository firmware is not a complete production implementation |
| Vision ESP32-S3 + OV3660 | Verified GOOUUU V1.5 pin map, camera init, authenticated capture endpoint, health telemetry | BLOCKED | Current repository firmware is not a complete production implementation |
| C5 Guardian | ESP-IDF ESP32-C5 build, provisioned identity, authenticated health vote | BLOCKED | No production C5 image exists |
| C5 Watcher | ESP-IDF ESP32-C5 build, independent STOP/lease observation | BLOCKED | No production C5 image exists |
| C5 Arbiter | ESP-IDF ESP32-C5 build, quorum and split-brain decision | BLOCKED | No production C5 image exists |
| CYD Deck | Display/touch UI, approval lease, STOP, official Flipper Expansion protocol, protobuf RPC interpreter, artifact staging | BLOCKED | Current repository firmware is not a complete production implementation |

The older `sentinel-c3` source and legacy PlatformIO target are not valid for the three ESP32-C5 SuperMini devices and must not ship.

## Hardware and electrical acceptance

| Gate | Required result | Current status | Evidence |
|---|---|---:|---|
| CYD-to-Flipper wiring | GPIO27 TX to pin 14 RX; GPIO22 RX to pin 13 TX; common GND pin 18; no shared power output | NOT TESTED | Continuity photos and signed checklist |
| Logic voltage | 3.3 V signal levels verified under power | NOT TESTED | Oscilloscope capture |
| UART/Expansion framing | Heartbeat, baud negotiation, StartRpc, RPC data, StopRpc, recovery verified | NOT TESTED | Logic-analyzer trace |
| CYD touchscreen | Calibration, approval, deny, STOP, timeout, reboot defaults | NOT TESTED | Test record and video |
| Flipper compatibility | Exact Flipper firmware version recorded and all bundled RPC adapters pass | NOT TESTED | Device inventory and contract log |
| Power isolation | CYD and Flipper independently powered; no supply backfeed | NOT TESTED | Meter measurements |
| Brownout/reboot | Every node returns to STOP/fail-closed after power interruption | NOT TESTED | Test record |
| Cable removal | UART removal reports bridge offline and cannot trigger fallback | NOT TESTED | Test record |

## Security and fault injection

| Gate | Required result | Current status | Evidence |
|---|---|---:|---|
| Replay attack | Duplicate nonce rejected | NOT TESTED | Packet trace and Core log |
| Stale request | Expired timestamp and ADL lease rejected | NOT TESTED | Test log |
| Signature tamper | Modified request and response rejected | NOT TESTED | Test log |
| Route tamper | Any owner other than `deck-cyd` or fallback=true rejected | NOT TESTED | Test log |
| Artifact tamper | Wrong chunk hash, wrong offset, wrong final hash, and changed staged file rejected | NOT TESTED | Test log |
| Approval replay | Approval cannot authorize another job/program digest | NOT TESTED | Test log |
| C5 loss | Loss of any required node revokes readiness and active execution | NOT TESTED | Packet/logic trace |
| Split brain | Conflicting Core/Deck state cannot produce execution | NOT TESTED | Fault-injection log |
| Vision loss | Vision-required job stops or requests operator; never silently succeeds | NOT TESTED | Test log |
| Host loss | Core/Deck stop after lease expiration | NOT TESTED | Timed trace |
| Flipper reset | RPC link recovers without replaying prior operations | NOT TESTED | Test log |

## End-user acceptance

| Gate | Required result | Current status | Evidence |
|---|---|---:|---|
| Installation | A new authorized tester can install from written instructions | NOT TESTED | Tester record |
| Provisioning | Unique device identities, keys, certificates, Wi-Fi, and operator account provisioned without source edits | NOT TESTED | Provisioning log |
| Read-only run | Device info and storage inventory succeed end to end | NOT TESTED | Hardware contract output |
| App lifecycle | Known harmless installed app starts, receives approved input, and exits | NOT TESTED | Run/audit/video evidence |
| Artifact stage | Approved owned file is staged and verified by readback | NOT TESTED | Hash comparison |
| Approval UX | Operator can understand target, risk, artifact, and action before approving | NOT TESTED | User-test report |
| STOP UX | Operator STOP is visible, immediate, persistent, and recoverable only by explicit resume | NOT TESTED | User-test report |
| Audit export | Operator can verify and export run evidence | NOT TESTED | Exported evidence bundle |

## Current release decision

```text
RELEASE: BLOCKED
REASON: production embedded firmware and physical hardware evidence are incomplete.
```

The host control-plane hardening can continue and deterministic tests can pass independently. That does not change the release decision until the embedded and physical gates pass.
