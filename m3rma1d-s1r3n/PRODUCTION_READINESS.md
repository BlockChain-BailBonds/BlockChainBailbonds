# M3rMa1d S1r3n Release Readiness

This file is the release authority for the active M3rMa1d S1r3n appliance. Use only `PASS`, `FAIL`, `NOT TESTED`, or `BLOCKED`. Never infer a hardware PASS from compilation or simulation.

## Active product

```text
Browser point-and-click UI
        |
        v
Codex/ADL host service
        |
        v
GOOUUU ESP32-S3-CAM V1.5 N16R8 + OV3660
        |
        v
Flipper Zero
```

No CYD, C3/C5 node, second S3, separate Core board, or fallback ESP route is active.

## Release rule

Promotion to `main` or a user-ready tag is allowed only when every required gate is PASS and evidence is tied to the exact tested commit and artifact SHA-256 values.

| Gate | Required result | Current status | Evidence / next action |
|---|---|---:|---|
| Codex deterministic tests | `npm test` passes | FAIL | Previous CI: 9/10 passed; machine-verified adapter integrity test failed. Fix staged in Codex-ready pass; rerun CI required. |
| Codex static production gate | `npm run check` passes | NOT TESTED | Was skipped after previous test failure; rerun on new commit. |
| S3 firmware build | `pio run` succeeds from `m3rma1d-s1r3n` | NOT TESTED | Workflow previously pointed at deleted `firmware/s3-cam`; workflow corrected; rerun required. |
| LittleFS UI build | `pio run -t buildfs` succeeds | NOT TESTED | New workflow gate; rerun required. |
| Point-click approvals | Pending list + one-time decision works from S3 UI | NOT TESTED | Host endpoints/CORS added; browser integration test required. |
| Host-to-S3 control plane | Signed status/inventory/job/artifact/STOP endpoints match `HttpCoreTransport` | BLOCKED | S3 firmware contract is incomplete. Highest-priority implementation task. |
| Flipper typed execution | Real app inventory and typed RPC operations execute without raw shell | BLOCKED | Current S3 bridge only has bounded read-only CLI probes; implement typed protobuf RPC bridge. |
| Closed-loop proof | Result has correlated job id, before/after state, observed success and evidence SHA-256 | BLOCKED | Requires completed S3/RPC execution path. |
| Camera | OV3660 init/capture passes on actual GOOUUU V1.5 board | NOT TESTED | Compile is insufficient; record real hardware evidence. |
| UART wiring | GPIO1 RX <- pin13 TX, GPIO2 TX -> pin14 RX, common GND, no power rail | NOT TESTED | Continuity + live link evidence required. |
| STOP | Defaults asserted; preempts execution; persists/recoverable only by explicit resume | NOT TESTED | Real fault-injection test required. |
| Replay/tamper | Duplicate nonce, stale timestamp, bad signature/route/artifact hash rejected | NOT TESTED | Add and run control-plane tests. |
| App lifecycle | Harmless installed app start/input/exit works end-to-end | NOT TESTED | Real Flipper test required. |
| New-app learning | Newly installed harmless FAP is discovered, adapted, tested and surfaced | NOT TESTED | Real newly installed app test required. |
| Provisioning | Fresh tester can configure unique secrets without source edits | BLOCKED | Replace predictable setup AP credential with unique/provisioned secret. |
| Reproducible artifacts | S3/Flipper artifacts + manifest SHA-256 archived | NOT TESTED | Generate after all final builds pass. |
| User acceptance | Fresh authorized tester completes documented point-click flow | NOT TESTED | Final acceptance after all prior gates PASS. |

## Security invariants

Raw shell/unrestricted CLI stays unavailable to Codex and the browser. Observe/local-state generated adapters require correlated device proof before autonomous activation. Physical-output/transmit actions require explicit per-job approval plus applicable owned-asset/region/frequency policy. Restricted destructive/access-bypass/credential-dump/jamming/brute-force functions stay denied. STOP preempts execution and there is no fallback physical route.

## Current release decision

```text
RELEASE: BLOCKED
REASON: deterministic CI must be rerun, and the authenticated S3 control plane + typed Flipper RPC + physical hardware evidence are incomplete.
```

See root `AGENTS.md` for the Codex finish sequence.
