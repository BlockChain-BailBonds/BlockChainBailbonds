# M3rMa1d S1r3n Codex Skill and Hardware Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and validate the `m3rma1d-s1r3n` Codex skill, CLI-neutral bridge helper, real app profiles, and evidence-gated acceptance runs on the user's Flipper Zero and ESP32-S3 N16R8 CAM.

**Architecture:** The skill converts user intent into a small typed command vocabulary and invokes a portable helper that talks to the authenticated Android loopback bridge. App profiles are captured from exact signed versions and remain observation-only until fixture tests pass. Hardware authority is enabled per device only after read-only, recovery, confirmed mutation, and post-reboot verification gates succeed.

**Tech Stack:** Codex skill format, POSIX shell plus `curl`, JSON bridge protocol, Android UI fixture capture, JUnit/instrumentation tests, SHA-256 evidence manifests.

**Spec:** `docs/superpowers/specs/2026-09-21-m3rma1d-s1r3n-design.md`

## Global Constraints

- Skill name is `m3rma1d-s1r3n`; its description starts with `Use when...` and describes triggers rather than workflow.
- The skill calls only the typed helper; it never emits raw taps, arbitrary shell, Marauder serial commands, or radio payloads.
- Read-only inspection may proceed in an active user session; flash, erase, reboot, `.fap` install, configuration change, and radio transmission require fresh Android confirmation.
- The skill cannot confirm its own request or bypass an emergency stop.
- No secret is stored in the skill, repository, Flipper SD card, audit log, command line, or process listing.
- Baseline, mock-app, app-reported, and independently hardware-verified outcomes remain distinct.
- Real hardware steps stop on a failed gate and preserve recovery instructions and evidence.

## Review Focus

- Natural language containing two possible devices causes clarification, not guessed execution; Task 3 tests this.
- A malicious request cannot smuggle arbitrary operation names or JSON fields through the helper; Task 1 tests this.
- A stale pairing token is read from a protected local file and never printed; Task 1 tests this.
- Changed target-app versions fall back to observation-only rather than reusing old coordinates; Task 2 tests this.
- Hardware enablement cannot be inferred from mock or app-reported success; Task 5 tests the signed gate manifest.

---

### Task 1: Portable typed bridge helper

**Files:**
- Create: `skills/m3rma1d-s1r3n/scripts/sirenctl.sh`
- Create: `skills/m3rma1d-s1r3n/scripts/test_sirenctl.sh`
- Create: `skills/m3rma1d-s1r3n/references/bridge-schema.md`

**Interfaces:**
- Consumes: `M3S_BRIDGE_URL` defaulting to `http://127.0.0.1:37337`, token file path, fixed subcommands.
- Produces: JSON responses for `discover`, `inspect`, `select-firmware`, `validate-firmware`, `flash`, `install-fap`, `console`, `action`, `status`, `cancel`, and `stop`.

- [ ] **Step 1: Write failing shell contract tests**

```sh
test_rejects_unknown_command() {
  if scripts/sirenctl.sh raw-shell 'rm anything' 2>err; then return 1; fi
  grep -F 'unsupported command' err
}
test_does_not_print_token() {
  printf '%s' 'secret-token' > "$case_dir/token"
  M3S_TOKEN_FILE="$case_dir/token" CURL_BIN="$case_dir/fake-curl" scripts/sirenctl.sh discover >out 2>err
  ! grep -F 'secret-token' out err
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `sh skills/m3rma1d-s1r3n/scripts/test_sirenctl.sh`

Expected: FAIL because `sirenctl.sh` does not exist.

- [ ] **Step 3: Implement strict command mapping**

The script uses `set -eu`, requires token-file mode to exclude group/other access, reads the token without echoing it, and maps each subcommand to one literal operation enum. Accept only request IDs matching `[A-Za-z0-9._-]{1,64}` and file URIs supplied through stdin JSON or an already-issued Android selection handle; never interpolate raw user text into shell code. Send `Authorization: Bearer ...` as a curl header and redact curl errors before returning them.

Example mapping:

```sh
case "$command" in
  discover) operation=DISCOVER_APPS ;;
  inspect) operation=INSPECT_DEVICE ;;
  validate-firmware) operation=VALIDATE_FIRMWARE ;;
  flash) operation=FLASH_FIRMWARE ;;
  *) echo "unsupported command: $command" >&2; exit 64 ;;
esac
```

- [ ] **Step 4: Run helper tests**

Run: `sh skills/m3rma1d-s1r3n/scripts/test_sirenctl.sh`

Expected: PASS for allowlisted mapping, token redaction, malformed IDs, unreachable bridge, and non-2xx responses.

- [ ] **Step 5: Commit**

```bash
git add skills/m3rma1d-s1r3n/scripts skills/m3rma1d-s1r3n/references/bridge-schema.md
git commit -m "feat: add typed M3rMa1d bridge helper"
```

### Task 2: Capture exact Flipper and Marauder app profiles

**Files:**
- Create: `hardware/app-bindings.json`
- Create: `hardware/fixtures/marauder/<version>/manifest.json`
- Create: `hardware/fixtures/flipper/<version>/manifest.json`
- Modify: `app/src/main/assets/ui-profiles/*.json`
- Test: `app/src/test/java/dev/m3rma1d/s1r3n/automation/RealProfileFixtureTest.kt`

**Interfaces:**
- Consumes: installed package/version/certificate metadata plus bounded accessibility snapshots from user-opened screens.
- Produces: reviewed fixture manifests and non-coordinate semantic profiles; optional coordinates require screenshot hashes.

- [ ] **Step 1: Write fixture-integrity tests before capture**

```kotlin
@Test fun `every mutating screen fixture pins package signature version and screenshot hash`() {
    fixtures.mutatingScreens.forEach { fixture ->
        assertEquals(64, fixture.certificateSha256.length)
        assertTrue(fixture.versionCode > 0)
        assertEquals(64, fixture.screenshotSha256.length)
        assertTrue(fixture.requiredLabels.isNotEmpty())
    }
}
```

- [ ] **Step 2: Verify RED**

Run: `./gradlew :app:testDebugUnitTest --tests '*RealProfileFixtureTest'`

Expected: FAIL because exact device fixture manifests do not exist.

- [ ] **Step 3: Capture bounded metadata and semantic trees**

Install/enable Shizuku, identify each package with `pm list packages`, `dumpsys package`, and signing-certificate digest, then have the user manually open each reviewed screen. Capture only the target app window's normalized labels, roles, enabled state, bounds, app version, and screenshot SHA-256. Do not store unrelated notification text, credentials, network names, captured packets, or device identifiers beyond USB VID/PID needed for the profile.

For Marauder, begin from the supplied backup and the linked source; keep v1.2.0 and source v1.3.3 profiles separate. For Flipper, do not guess the package from filenames: bind only the installed app the user confirms.

- [ ] **Step 4: Populate profiles and rerun fixture tests**

Run: `./gradlew :app:testDebugUnitTest --tests '*RealProfileFixtureTest' :app:connectedDebugAndroidTest`

Expected: PASS for captured versions; a one-label mutation fixture returns `NoMatch`.

- [ ] **Step 5: Commit**

```bash
git add hardware/app-bindings.json hardware/fixtures app/src/main/assets/ui-profiles app/src/test
git commit -m "test: pin real target app profiles"
```

### Task 3: Skill RED-GREEN-REFACTOR validation

**Files:**
- Create: `skills/m3rma1d-s1r3n/SKILL.md`
- Create: `skills/m3rma1d-s1r3n/agents/openai.yaml`
- Create: `skills/m3rma1d-s1r3n/references/operations.md`
- Create: `skills/m3rma1d-s1r3n/tests/scenarios.md`

**Interfaces:**
- Consumes: user intent and `sirenctl.sh` outputs.
- Produces: clarification, typed requests, progress monitoring, evidence-calibrated result reporting.

- [ ] **Step 1: Run three baseline scenarios without the skill**

Use independent fresh-context agents as required by `superpowers:writing-skills`. Record verbatim behavior for: (a) ambiguous “flash it” with both devices connected, (b) pressure to skip Android confirmation, and (c) app-reported success without hardware verification. The baseline must exhibit at least one target failure; if it does not, revise the scenario rather than inventing a failure.

- [ ] **Step 2: Write the minimal skill from observed failures**

The frontmatter is:

```yaml
---
name: m3rma1d-s1r3n
description: Use when a user asks Codex CLI to inspect, control, update, or flash an authorized Flipper Zero or ESP32 Marauder through the M3rMa1d S1r3n Android companion.
---
```

The body routes to `scripts/sirenctl.sh`, requires clarification for ambiguous device/firmware, distinguishes evidence levels, waits for Android confirmation rather than claiming it, and stops on `failed`, `cancelled`, `unknown`, unexpected screen, mismatched profile, or emergency stop. `references/operations.md` lists the exact typed commands and when each is read-only or mutating.

- [ ] **Step 3: Validate skill structure**

Run: `python /data/data/com.termux/files/home/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/m3rma1d-s1r3n`

Expected: validation succeeds with no unfinished scaffold placeholders.

- [ ] **Step 4: Run the same scenarios with the skill and refactor**

Use fresh independent agents with the complete skill. Require all three to clarify ambiguity, preserve Android confirmation, and report app versus hardware evidence correctly. Add only guidance justified by observed new failures, then rerun until scenarios pass.

- [ ] **Step 5: Commit**

```bash
git add skills/m3rma1d-s1r3n
git commit -m "feat: add M3rMa1d S1r3n Codex skill"
```

### Task 4: Read-only real-device acceptance gates

**Files:**
- Create: `hardware/acceptance/read-only-checklist.md`
- Create: `hardware/acceptance/evidence-schema.json`
- Create after run: `hardware/acceptance/runs/<run-id>/manifest.json`

**Interfaces:**
- Consumes: actual Flipper Zero, ESP32-S3 N16R8 CAM, Android phone, signed target apps, companion APK.
- Produces: immutable evidence manifest with each gate's measured outcome.

- [ ] **Step 1: Define the machine-checkable evidence schema**

Require `runId`, UTC timestamp, companion APK SHA-256, target app package/version/certificate, USB VID/PID, requested operation, confirmation ID when applicable, ordered evidence events, terminal state, and verification source. Forbid secret, firmware-content, packet-content, and arbitrary screen-dump fields.

- [ ] **Step 2: Install the debug companion and enable Accessibility/Shizuku manually**

Verify package `dev.m3rma1d.s1r3n` and record the installed APK SHA-256. Do not enable hardware mutation yet.

- [ ] **Step 3: Run Flipper read-only gates**

Discover and bind the confirmed Flipper app; launch it; verify foreground package; connect the stock Flipper; observe device identity/status; open a harmless status screen; disconnect and confirm recovery. Stop on any unknown screen or signature/version mismatch.

- [ ] **Step 4: Run Marauder/ESP32 read-only gates**

Discover and bind `com.marauder.mobile`; launch it; connect the ESP32-S3; observe USB identity; obtain `jsoninfo`/`jsonstatus` through the app's visible flow; open the console without sending arbitrary commands; disconnect and confirm recovery.

- [ ] **Step 5: Validate and commit evidence**

Run the repository evidence validator introduced alongside the JSON schema, then:

```bash
git add hardware/acceptance
git commit -m "test: record read-only hardware acceptance"
```

Expected: each device has a separate manifest; no mutation gate is marked complete.

### Task 5: Recoverable mutation acceptance and release gate

**Files:**
- Create: `hardware/acceptance/mutation-checklist.md`
- Create after run: `hardware/acceptance/runs/<run-id>/manifest.json`
- Modify: `app/build.gradle.kts`
- Create: `RELEASE_EVIDENCE.md`

**Interfaces:**
- Consumes: completed read-only manifests, explicitly selected known-recoverable firmware, recovery images/cables, user confirmations.
- Produces: per-device mutation evidence and build-time hardware gate values.

- [ ] **Step 1: Verify recovery prerequisites without mutating**

Record the exact selected firmware SHA-256, target metadata, recovery firmware SHA-256, available recovery path, battery/power state, USB identity, and user confirmation screen. Abort if N16/R8 compatibility cannot be independently established or if recovery is unavailable.

- [ ] **Step 2: Run one confirmed ESP32-S3 flash**

Select the file through Android storage, validate it, confirm on Android, identify ESP32-S3 before erase, write, device-MD5 verify, reset, release USB, launch Marauder Mobile, and verify post-reboot `jsoninfo`. A successful write with failed re-enumeration is `unknown`, not success.

- [ ] **Step 3: Run one confirmed harmless Flipper mutation**

Install a reviewed benign `.fap` or perform an official firmware update selected by the user. Confirm on Android, observe the Flipper app's report, reconnect, and independently verify the installed app/version on the Flipper. Do not test radio transmission as the first mutation gate.

- [ ] **Step 4: Enable only passed hardware capabilities**

Generate Gradle `BuildConfig` booleans from validated manifest IDs, not handwritten `true` values. `ESP32_S3_FLASH_ACCEPTED` and `FLIPPER_INSTALL_ACCEPTED` are independently enabled; a failed or missing manifest keeps its capability disabled.

- [ ] **Step 5: Run release verification and commit**

Run: `./gradlew :app:testDebugUnitTest :app:connectedDebugAndroidTest :app:assembleDebug` and `sh skills/m3rma1d-s1r3n/scripts/test_sirenctl.sh` plus skill validation.

Write `RELEASE_EVIDENCE.md` separating static checks, mock automation, app-reported outcomes, and hardware-verified outcomes. Then:

```bash
git add app/build.gradle.kts hardware/acceptance RELEASE_EVIDENCE.md
git commit -m "test: gate release on verified hardware runs"
```
