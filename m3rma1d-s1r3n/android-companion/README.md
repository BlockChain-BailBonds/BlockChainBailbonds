# M3rMa1d S1r3n Android Companion

Work-in-progress Android control plane for the active two-device M3rMa1d S1r3n architecture: one ESP32-S3 N16R8 CAM and one Flipper Zero.

## Current implemented slice

- Immutable typed operation model and idempotent request registry.
- One-use, expiring Android confirmation authority.
- Emergency-stop mutation gate.
- Closed-schema append-only audit events.
- Authenticated HTTP bridge bound only to Android loopback.
- Bounded headers and request bodies with fail-closed parsing.
- Harmless mock target that separates UI action, app-reported success, and independently verified hardware success.

The Flipper/Marauder Accessibility profiles, Shizuku backend, storage-selected firmware validation, ESP32-S3 flasher, Codex skill, and physical hardware acceptance gates are planned but not complete. Nothing in this directory is evidence that real hardware flashing or Flipper automation has passed.

## Build

Requirements: JDK 21, Android SDK platform 35, and a native `aapt2` when building directly in Termux.

```sh
sh ./gradlew :app:testDebugUnitTest :app:assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk` and is intentionally excluded from Git.

## Design and plans

- `docs/superpowers/specs/2026-09-21-m3rma1d-s1r3n-design.md`
- `docs/superpowers/plans/2026-09-21-android-foundation-plan.md`
- `docs/superpowers/plans/2026-09-21-device-integration-plan.md`
- `docs/superpowers/plans/2026-09-21-codex-skill-and-acceptance-plan.md`
