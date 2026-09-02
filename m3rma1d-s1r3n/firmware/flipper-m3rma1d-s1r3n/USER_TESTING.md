# M3rMa1d S1r3n — Flipper User-Test Candidate

This folder contains the Flipper-side user-test candidate for **M3rMa1d S1r3n**. It is a FAP application, not a replacement Flipper system firmware image.

The app is intentionally limited to operator-visible state and control while the Codex/ADL automation plane remains on the host/Core/Deck side. This preserves the existing hardware boundary and avoids giving Codex an unrestricted Flipper shell.

## Build

GitHub Actions builds against both the official Flipper `release` and `dev` SDK channels using `flipperdevices/flipperzero-ufbt-action@v0.1`.

Local build:

```bash
python3 -m pip install --upgrade ufbt
cd m3rma1d-s1r3n/firmware/flipper-m3rma1d-s1r3n
ufbt update --channel release
ufbt
```

The resulting `.fap` is written under `dist/`.

## Install on a test Flipper

Use a Flipper Zero you own or are authorized to test.

1. Record the Flipper firmware version before installation.
2. Build the FAP using the matching official SDK channel.
3. Copy `m3rma1d_s1r3n.fap` to the microSD card under `apps/Tools/` using qFlipper or another supported file-transfer method.
4. Open `Apps -> Tools -> M3rMa1d S1r3n`.
5. Confirm the first screen shows `STATE: STOPPED`.
6. Press OK once and confirm it changes to `STATE: READY`.
7. Press OK again and confirm it returns to `STATE: STOPPED`.
8. Press BACK and relaunch the app; confirm it starts `STOPPED` again.

## Required user-test evidence

Record each result as `PASS`, `FAIL`, or `NOT TESTED`.

| Test | Expected result | Status |
|---|---|---|
| FAP release build | Build succeeds with no compiler error | NOT TESTED |
| FAP dev build | Build succeeds with no compiler error | NOT TESTED |
| Install | FAP copies to Flipper and appears under Apps/Tools | NOT TESTED |
| Launch default | Screen starts in `STATE: STOPPED` | NOT TESTED |
| READY toggle | OK changes STOPPED to READY | NOT TESTED |
| STOP toggle | OK changes READY to STOPPED | NOT TESTED |
| Exit | BACK exits without crash | NOT TESTED |
| Fail-closed relaunch | Relaunch returns to STOPPED | NOT TESTED |
| 20-cycle stability | 20 launch/toggle/exit cycles without crash | NOT TESTED |
| Host audit correlation | Operator state event can be correlated with host-side run evidence | NOT TESTED |

## Codex/ADL integration acceptance

The complete appliance test is separate from the FAP UI test. Before calling the appliance user-ready, verify the real host/Core/C5/Deck/Flipper path and the gates in `../../PRODUCTION_READINESS.md`.

At minimum:

```text
Codex task
 -> ADL 2.0 validation
 -> signed Core request
 -> C5 safety quorum
 -> CYD Deck approval / STOP state
 -> official Flipper Expansion RPC
 -> typed Flipper operation
 -> signed result
 -> hash-chained audit record
```

The FAP must never be treated as proof that the complete automated appliance has passed physical integration testing.

## Release naming

Human-facing name: `M3rMa1d S1r3n`

Flipper application ID: `m3rma1d_s1r3n`

Initial user-test version: `0.1.0-ut`
