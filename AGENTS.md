# Codex handoff: M3rMa1d S1r3n

## Mission
Finish, test, and harden the **single ESP32-S3 N16R8 CAM + Flipper Zero** M3rMa1d S1r3n appliance until the user-ready gates in `m3rma1d-s1r3n/PRODUCTION_READINESS.md` pass with real evidence.

Do not restore the obsolete CYD, C3/C5, second-S3, separate Core, or separate Vision topology. The only active physical route is:

```text
Codex host -> GOOUUU ESP32-S3-CAM V1.5 N16R8 -> Flipper Zero
```

UART wiring is fixed: S3 GPIO1 RX <- Flipper pin 13 TX; S3 GPIO2 TX -> Flipper pin 14 RX; common GND; no shared power rail.

## Non-negotiable product behavior

- The browser UI is point-and-click and the user does not need to write commands.
- Codex discovers installed Flipper apps and creates typed adapters for newly discovered functions.
- No raw shell or unrestricted CLI is exposed to the model or browser.
- Observe/local-state generated adapters may become autonomous only after correlated real-device proof.
- Physical-output/transmit actions require an explicit per-job user approval and applicable owned-asset/region/frequency policy.
- Restricted/destructive/access-bypass/credential-dump/jamming/brute-force functionality remains denied.
- STOP is fail-closed, local, persistent, and preempts execution.
- Never report a hardware PASS without real hardware evidence.

## Start here

1. Run `npm test` and `npm run check` from `m3rma1d-s1r3n/codex`.
2. Run `pio run` and `pio run -t buildfs` from `m3rma1d-s1r3n`.
3. Inspect the current GitHub Actions failures before changing code. Preserve passing gateway/Flipper tests.
4. Treat `m3rma1d-s1r3n/PRODUCTION_READINESS.md` as the release authority and update it only from evidence.

## Highest-priority implementation gap

The host `HttpCoreTransport` expects authenticated signed S3 endpoints for status, inventory, jobs, artifacts, STOP/resume and correlated results. The current S3 firmware does not yet implement that full contract. Complete that contract or replace it coherently with one documented transport. Do not leave host and firmware APIs mismatched.

For broad Flipper app coverage, prefer Flipper's typed protobuf RPC services over free-form CLI. Implement the minimum bounded bridge needed for system/storage/app/GUI/GPIO/property operations, app inventory, loader lifecycle, and GUI input. Keep action schemas typed and validated. A foreground Flipper companion app must not prevent launching arbitrary installed apps.

## Required finish sequence

- Make deterministic host tests and static checks green.
- Make S3 PlatformIO firmware + LittleFS builds green from the repository root target.
- Add/complete the signed S3 control-plane contract and tests: HMAC, timestamp window, nonce/replay rejection, fixed route, STOP, artifact chunk/final hashes, and correlated job results.
- Implement real Flipper inventory and typed RPC execution for the adapter operation set used by the catalog.
- Return `before_state`, `after_state`, `observed_success`, and `evidence_sha256` for closed-loop adapter tests.
- Make new-app integration retry incomplete/failed integrations rather than permanently skipping an app after inventory is stored.
- Verify the OV3660 camera mapping on the actual GOOUUU V1.5 board before calling it PASS.
- Exercise the point-and-click browser flow end-to-end, including CORS, approvals, STOP/resume, app sync, harmless app launch/input/exit, and audit verification.
- Run the real hardware contract on the labeled hardware runner. Add failure-injection tests for replay, stale/tampered messages, cable loss, reboot, STOP persistence and recovery.
- Generate reproducible firmware artifacts and SHA-256 manifests. Do not merge/tag user-ready until all required release rows are PASS.

## Current known constraints

The S3 dashboard may call the Codex host cross-origin. `S1R3N_CORS_ORIGINS` is a comma-separated allowlist and defaults to `http://192.168.4.1`; do not replace it with wildcard CORS. API bearer tokens remain host/browser runtime secrets and must not be committed.

The setup AP credential must not be treated as a production credential. Replace the predictable build default with a provisioning/unique-secret flow before release.

Use `S1R3N_CORE_URL` and `S1R3N_CONTROL_KEY` for the authenticated host-to-S3 control plane. Insecure HTTP is permitted only when explicitly enabled for a controlled private commissioning network.

## Definition of user-ready

User-ready means an authorized tester can flash/provision the device from written instructions, connect the Flipper, open the dashboard, sync installed apps, execute a harmless verified function, approve a higher-impact test only when explicitly requested, use STOP/resume predictably, and export/verify audit evidence. All software, firmware, and hardware release gates must be tied to the exact tested commit and artifact hashes.
