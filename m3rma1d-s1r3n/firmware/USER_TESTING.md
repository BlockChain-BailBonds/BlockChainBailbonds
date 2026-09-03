# M3rMa1d S1r3n Embedded User-Test Plan

Status values: PASS, FAIL, NOT TESTED, BLOCKED. Never mark physical behavior PASS from CI alone.

## Build gate

The six ESP-IDF projects must build on the pinned CI matrix:

- core-s3 -> esp32s3
- vision-s3-ov3660 -> esp32s3
- c5-guardian -> esp32c5
- c5-watcher -> esp32c5
- c5-arbiter -> esp32c5
- deck-cyd -> esp32

Record each binary SHA-256 before flashing.

## Flash order

1. C5 Guardian
2. C5 Watcher
3. C5 Arbiter
4. Core S3
5. Vision S3 only after the exact GOOUUU V1.5 OV3660 internal camera pin map is verified
6. CYD Deck
7. Install the M3rMa1d S1r3n FAP on Flipper Zero
8. Connect CYD to Flipper only after both devices are independently powered and stopped

## Expected boot behavior

Every M3rMa1d controller must boot fail-closed. Core reports C5 quorum BLOCKED until all three authenticated safety votes are current. CYD does not retain operator approval across boot, STOP, timeout, or job changes. Vision capture remains disabled while the camera profile guard is unverified.

## CYD / Flipper electrical boundary

- CYD GPIO27 TX -> Flipper pin 14 RX
- CYD GPIO22 RX <- Flipper pin 13 TX
- common GND -> Flipper pin 18 GND
- do not connect board power rails together

The Flipper Expansion module protocol starts at 9600 baud, negotiates the selected baud, waits the protocol dead time, starts RPC with a control frame, chunks RPC bytes into <=64 byte DATA frames, checks XOR framing, acknowledges transactions, maintains heartbeat below the 250 ms timeout, and stops RPC on STOP/approval loss.

## Acceptance sequence

1. Power each node separately and verify role identity and STOPPED state.
2. Remove one C5 node and verify Core remains BLOCKED.
3. Restore all three and verify quorum can become READY only from current non-STOP votes.
4. Attempt a stale/replayed authenticated envelope and verify rejection.
5. Power CYD and Flipper independently, then connect UART/GND.
6. Verify 9600-baud Expansion discovery and baud negotiation on a logic analyzer.
7. Verify Start RPC only after a current per-job approval lease.
8. Verify approval cannot authorize a different job and expires automatically.
9. Press/assert STOP and verify active RPC stops and approval is cleared.
10. Remove UART cable and verify the bridge returns to STOP rather than falling back.
11. Run a read-only device-info/storage workflow through Codex -> ADL -> Core -> C5 quorum -> CYD -> Flipper -> signed result.
12. Export the audit chain and record commit, firmware hashes, Flipper firmware version, and test evidence.

## Intentionally blocked tests

Camera capture is BLOCKED until the authoritative GOOUUU ESP32-S3-CAM V1.5 OV3660 pin mapping is recorded. Touchscreen approval is BLOCKED until the exact XPT2046 calibration/orientation is physically verified on the user's CYD revision. Transmit-capable application workflows remain operator-approved and scoped to owned/isolated-lab assets.
