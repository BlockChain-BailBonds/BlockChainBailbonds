# M3rMa1d S1r3n Design

## Purpose

M3rMa1d S1r3n is an Android companion and Codex skill for automating a user's requests through installed Flipper and Marauder Android apps. It controls only devices the user has connected and authorized. The first supported hardware is a stock Flipper Zero and an ESP32-S3 N16R8 CAM connected to Android by USB-C/OTG.

Firmware is selected from Android storage for each device. The system must not bundle or silently download firmware.

## Scope

The first release provides:

- Installed-app discovery for Flipper and Marauder apps.
- Android app control through Accessibility Service and Shizuku.
- A localhost-only, CLI-neutral bridge with typed requests and progress events.
- A `m3rma1d-s1r3n` Codex skill that translates user intent into bridge calls.
- Firmware selection, validation, direct ESP32 flashing, target-app workflow observation, console access, supported app actions, confirmations, emergency stop, and audit records.
- Versioned UI profiles for explicitly supported versions of the two target apps.

The first release does not provide direct radio-protocol implementations, background targeting, covert persistence, credential theft, hidden uploads, jamming, or unattended destructive operations.

## Architecture

The request path is:

```text
User request
  -> any Codex CLI
  -> m3rma1d-s1r3n skill
  -> localhost Android bridge
  -> authorization and validation
  -> direct ESP32 flasher or Accessibility/Shizuku backend
  -> installed Flipper or Marauder app when applicable
  -> connected Flipper Zero or ESP32-S3 N16R8 CAM
```

The Android companion owns authorization, validation, execution state, and audit data. The Codex skill may request actions but cannot bypass companion-enforced confirmation or capability restrictions.

### Android control backends

Accessibility Service is the primary semantic UI backend. It reads labeled UI nodes, selects controls, enters values, handles Android's document picker, and observes progress.

Shizuku provides package discovery, signature inspection, reliable app launching, foreground verification, USB diagnostics, screenshots, and a fallback input backend. Coordinate input is permitted only when both the target app version and current screen fingerprint exactly match a reviewed UI profile.

The companion can operate with Accessibility alone at reduced capability. Shizuku-enhanced features remain unavailable until Shizuku is installed, running, and explicitly authorized.

### Marauder Mobile integration

The supported Marauder app is the MIT-licensed `0xsys/ESP32-Marauder-Mobile` project with source package `com.marauder.mobile`. It controls an ESP32 Marauder over USB serial at 115200 baud and consumes the firmware's tagged `@J` JSON messages. M3rMa1d S1r3n uses the installed app as the user-visible live-control surface and automates only reviewed, supported UI flows.

Marauder Mobile revision `cd6722b1bf6a0a6fbae07202592b9135ae5bfacc` includes an in-app stub-less ROM flasher, but its source explicitly limits that flasher to classic ESP32 chips. It lists generic ESP32-S3 firmware profiles as external-flasher-only. Therefore the ESP32-S3 N16R8 CAM target still requires M3rMa1d S1r3n's companion-owned S3 USB flashing path. The companion releases the USB device before launching Marauder Mobile and does not allow the two apps to claim the same USB interface concurrently.

### CLI-neutral local bridge

The companion exposes a versioned protocol on Android loopback only. It does not expose a LAN listener. A short-lived pairing secret binds a local CLI adapter to the companion. Each request includes a unique ID; retries with the same ID are idempotent.

Initial operations are:

- `discover_apps`
- `inspect_device`
- `select_firmware`
- `validate_firmware`
- `flash_firmware`
- `install_flipper_app`
- `open_console`
- `run_supported_action`
- `get_operation`
- `cancel_operation`

Operations return structured progress events. The protocol reports separately that a request was accepted, a UI action occurred, a target app reported success, and hardware behavior was independently verified.

### Codex skill

The `m3rma1d-s1r3n` skill discovers a configured bridge adapter, resolves ambiguous device requests, invokes only typed bridge operations, monitors progress, and reports measured results. It never generates raw tap sequences or shell commands as a substitute for the bridge contract.

The skill supports any Codex CLI capable of running its local helper. Host-specific launch details belong in small adapters rather than in the skill's core instructions.

## App discovery and UI profiles

The companion discovers candidates from installed packages and requires user confirmation before binding a candidate as the Flipper or Marauder app. A binding stores package name, signing-certificate digest, version, and supported UI-profile ID.

Each UI profile defines recognizable screens, required semantic labels, permitted transitions, success indicators, failure indicators, and optional exact screen fingerprints for coordinate fallback. An unknown signature, version, or layout enters observation-only mode. It cannot flash, erase, install, or transmit until a compatible reviewed profile is installed.

## Firmware handling

The user selects firmware with Android's Storage Access Framework. The companion receives scoped access to the selected file and records its display name, size, SHA-256 digest, and source URI without copying unrelated storage content.

Before enabling a flash request, validation checks:

- The selected target device and connected USB identity.
- File readability, nonzero length, expected container or binary format, and reasonable size.
- Target-family metadata when available.
- Flash offsets and partition ranges when multiple images are selected.
- User acknowledgement when firmware lacks trustworthy target metadata.

Firmware for the CYD ESP32 N4 must never be inferred compatible with the ESP32-S3 N16R8 CAM. A filename alone is not compatibility evidence.

ESP32 flashing uses a companion-owned USB transport rather than UI automation of Marauder Mobile. The flasher must identify the ESP chip before erase or write, reject an identified chip that conflicts with trustworthy firmware metadata, stream bounded progress, verify written data, reset the board, release USB ownership, and then permit Marauder Mobile to connect for post-reboot inspection.

## Authority and confirmations

Read-only discovery, status, hashing, compatibility checks, log collection, and serial observation may run without per-action confirmation after the user starts a session.

Flashing, erasing, rebooting, installing `.fap` files, changing device configuration, and transmitting radio commands require a fresh Android confirmation. The confirmation shows the app, device, requested operation, firmware name and SHA-256 when applicable, and expected effect. Confirmation expires and cannot be reused for a different request.

An emergency stop cancels queued operations, blocks new mutations, attempts to stop the current UI workflow without adding further destructive input, and releases automation control. It cannot promise to interrupt a flash already committed inside third-party firmware.

## Safety boundaries

The bridge does not expose commands for jamming, covert persistence, credential theft, hidden uploads, or unauthorized targeting. It does not execute the discovered `marauder_install.txt`, which contains hidden installation, persistence, scheduled scanning, and upload behavior.

Supported radio actions must be explicit in a reviewed UI profile, tied to an active user-confirmed session, and limited to the user's authorized devices and test environment. The companion does not infer authorization merely because an app exposes a button.

## State and audit records

Every operation is a state machine: `requested`, `validated`, `awaiting_confirmation`, `executing`, and one terminal state of `succeeded`, `failed`, `cancelled`, or `unknown`.

The append-only audit record contains timestamps, request ID, CLI adapter identity, target app binding, device identity, operation type, confirmation event, selected-file digest, UI-profile version, progress evidence, verification evidence, and terminal state. Secrets, firmware contents, captured credentials, and raw unrelated screen content are excluded.

An operation reaches `succeeded` only when its operation-specific verification passes. A completed tap or third-party success message is recorded as evidence but is not independent hardware verification.

## Failure handling

Automation stops safely on an unexpected dialog, unknown screen, mismatched package signature, changed layout, ambiguous device, lost USB connection, validation failure, verification failure, expired confirmation, or backend loss.

The system does not guess through unexpected UI. It captures bounded diagnostic evidence, marks the operation `failed` or `unknown` according to what can be proven, and tells the user how to recover manually.

## Testing

Unit tests cover protocol schemas, state transitions, authorization gates, confirmation expiry, firmware validation, hashes, idempotency, backend selection, and audit redaction.

Recorded UI fixtures cover supported Flipper and Marauder screens. Fixture tests prove that altered labels, layout fingerprints, signatures, and app versions fail closed. Android instrumentation tests use harmless mock target apps before real target apps.

Hardware testing proceeds in gates:

1. Package discovery and launch.
2. Foreground and screen-state recognition.
3. USB detection and read-only device status.
4. Console observation and disconnect recovery.
5. File selection and validation without flashing.
6. Confirmed flashing of explicitly selected, known-recoverable firmware.
7. Post-reboot device identification and operation-specific verification.

Skill tests start with baseline requests without the skill, then verify that the completed skill resolves ambiguity, invokes typed tools, respects confirmations, rejects unavailable operations, and reports evidence accurately.

## Release acceptance

A release requires a reproducible Android build, passing unit and instrumentation suites, validated skill structure, and documented end-to-end runs on an actual Flipper Zero and ESP32-S3 N16R8 CAM. Mock-app, emulator, app-reported, and hardware-verified results remain separate facts in the release report.
