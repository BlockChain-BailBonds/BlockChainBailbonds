# M3rMa1d S1r3n Device Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fail-closed automation for the installed Flipper and Marauder Android apps plus a verified ESP32-S3 N16R8 CAM flashing path selected from Android storage.

**Architecture:** Signed package bindings and versioned UI profiles feed semantic Accessibility actions with a Shizuku verification/fallback backend. Firmware validation is independent of UI automation. A companion-owned ESP ROM transport identifies ESP32-S3 before writing, verifies every image, resets, releases USB, and only then launches Marauder Mobile for post-reboot control.

**Tech Stack:** Existing Android foundation, Android Accessibility APIs, Shizuku API, Storage Access Framework, usb-serial-for-android 3.8.1, Kotlin coroutines/serialization, JUnit transcript tests, Android instrumentation fixtures.

**Spec:** `docs/superpowers/specs/2026-09-21-m3rma1d-s1r3n-design.md`

## Global Constraints

- Marauder reference source is `https://github.com/0xsys/ESP32-Marauder-Mobile` revision `cd6722b1bf6a0a6fbae07202592b9135ae5bfacc`, package `com.marauder.mobile`.
- ESP ROM protocol reference is `https://github.com/espressif/esptool` revision `c85144be5f4edff13e818033a7a9a060f2f607cb`; implementation comments must cite the exact source file and symbol at that revision.
- The backup `MarauderMobile-v1.2.0.apk` certificate SHA-256 is `fcf2a641d098dd97039ac16c252730032d00cca1d4c131dd1dc685603918bec7`; other signatures require explicit rebinding.
- The linked Marauder flasher supports classic ESP32 only; it must not be invoked for ESP32-S3 N16R8.
- Firmware comes only from the user's Storage Access Framework selection; no bundled or silent download.
- Package signature, version, visible screen, USB identity, firmware hash, and chip identity are checked before mutation.
- Unknown signatures, versions, layouts, dialogs, or chips are observation-only and fail closed.
- Accessibility is semantic-first. Coordinate fallback requires Shizuku plus exact app-version and screen-fingerprint match.
- Flash/erase/install/transmit operations require the Android confirmation built in Stage 1.

## Review Focus

- An APK with the right package name but wrong signing certificate cannot bind; Task 1 tests this.
- A translated, relabeled, or updated screen cannot accidentally match by coordinates; Task 2 tests this.
- A CYD classic-ESP32 image is rejected for an identified ESP32-S3 even when its filename says S3; Task 5 tests this.
- USB ownership is exclusive and always released on success, failure, and cancellation; Task 4 tests this.
- Partial writes and incorrect device MD5 never report success or launch Marauder; Task 5 tests this.

---

### Task 1: Signed package discovery and explicit binding

**Files:**
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/apps/AppBinding.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/apps/InstalledAppDiscovery.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/apps/AppBindingStore.kt`
- Test: `app/src/test/java/dev/m3rma1d/s1r3n/apps/AppBindingTest.kt`

**Interfaces:**
- Consumes: Android `PackageInfo` projected behind `PackageRecord`.
- Produces: `AppCandidate`, confirmed `AppBinding`, and `BindingDecision`.

- [ ] **Step 1: Write the wrong-certificate test**

```kotlin
@Test fun `matching package with different certificate requires rebind`() {
    val expected = AppBinding(TargetApp.MARAUDER, "com.marauder.mobile", "fcf2a641", 6L, "marauder-1.3.3")
    val installed = PackageRecord("com.marauder.mobile", "deadbeef", 6L, "1.3.3")
    assertEquals(BindingDecision.REQUIRES_USER_REBIND, expected.evaluate(installed))
}
```

- [ ] **Step 2: Verify RED**

Run: `./gradlew :app:testDebugUnitTest --tests '*AppBindingTest'`

Expected: compilation fails because binding types are missing.

- [ ] **Step 3: Implement closed binding records**

```kotlin
enum class TargetApp { FLIPPER, MARAUDER }
enum class BindingDecision { MATCH, ABSENT, VERSION_UNSUPPORTED, REQUIRES_USER_REBIND }
data class PackageRecord(val packageName: String, val certificateSha256: String, val versionCode: Long, val versionName: String)
data class AppBinding(val target: TargetApp, val packageName: String, val certificateSha256: String, val versionCode: Long, val profileId: String) {
    fun evaluate(record: PackageRecord?): BindingDecision = when {
        record == null || record.packageName != packageName -> BindingDecision.ABSENT
        !record.certificateSha256.equals(certificateSha256, true) -> BindingDecision.REQUIRES_USER_REBIND
        record.versionCode != versionCode -> BindingDecision.VERSION_UNSUPPORTED
        else -> BindingDecision.MATCH
    }
}
```

Use `PackageManager.GET_SIGNING_CERTIFICATES` and SHA-256 over the current signing certificate. Persist a binding only after an Android confirmation shows package, label, version, and full certificate digest.

- [ ] **Step 4: Run all unit tests**

Run: `./gradlew :app:testDebugUnitTest`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/dev/m3rma1d/s1r3n/apps app/src/test
git commit -m "feat: bind target apps by signature"
```

### Task 2: Versioned semantic UI profiles

**Files:**
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/automation/UiProfile.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/automation/ScreenMatcher.kt`
- Create: `app/src/main/assets/ui-profiles/marauder-1.3.3.json`
- Create: `app/src/main/assets/ui-profiles/flipper-observation-only.json`
- Test: `app/src/test/java/dev/m3rma1d/s1r3n/automation/ScreenMatcherTest.kt`

**Interfaces:**
- Consumes: normalized accessibility tree `UiSnapshot`.
- Produces: exact `ScreenMatch(profileId, screenId, confidence)` or `NoMatch`.

- [ ] **Step 1: Write fail-closed matcher tests**

```kotlin
@Test fun `missing required semantic label never enables coordinates`() {
    val profile = screen(required = setOf("Flash & Update", "Select a device to flash"), fingerprint = "abc")
    val snapshot = UiSnapshot(labels = setOf("Flash & Update"), fingerprint = "abc")
    assertEquals(ScreenMatch.NoMatch, ScreenMatcher.match(profile, snapshot))
}

@Test fun `fingerprint mismatch blocks coordinate fallback`() {
    val result = ScreenMatcher.coordinateAllowed(screen(fingerprint = "abc"), UiSnapshot(emptySet(), "def"))
    assertFalse(result)
}
```

- [ ] **Step 2: Verify RED**

Run: `./gradlew :app:testDebugUnitTest --tests '*ScreenMatcherTest'`

Expected: compilation fails because profile and matcher types are missing.

- [ ] **Step 3: Implement profile schema and matcher**

```kotlin
@Serializable data class UiProfile(val id: String, val packageName: String, val versionCode: Long, val screens: List<UiScreen>)
@Serializable data class UiScreen(val id: String, val requiredLabels: Set<String>, val forbiddenLabels: Set<String> = emptySet(), val fingerprint: String? = null)
data class UiSnapshot(val labels: Set<String>, val fingerprint: String)
sealed interface ScreenMatch { data class Exact(val profileId: String, val screenId: String) : ScreenMatch; data object NoMatch : ScreenMatch }
object ScreenMatcher {
    fun match(profile: UiProfile, snapshot: UiSnapshot): ScreenMatch = profile.screens.firstOrNull {
        snapshot.labels.containsAll(it.requiredLabels) && it.forbiddenLabels.intersect(snapshot.labels).isEmpty()
    }?.let { ScreenMatch.Exact(profile.id, it.id) } ?: ScreenMatch.NoMatch
    fun coordinateAllowed(screen: UiScreen, snapshot: UiSnapshot) = screen.fingerprint != null && screen.fingerprint == snapshot.fingerprint
}
```

The Marauder profile may recognize read-only connect/status/console screens and the `Flash & Update` screen, but marks S3 flashing unavailable. The Flipper profile remains observation-only until its exact package, certificate, version, and real fixture are captured.

- [ ] **Step 4: Run all unit tests**

Run: `./gradlew :app:testDebugUnitTest`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/dev/m3rma1d/s1r3n/automation app/src/main/assets app/src/test
git commit -m "feat: add fail-closed UI profiles"
```

### Task 3: Accessibility execution and Shizuku verification backend

**Files:**
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/automation/SirenAccessibilityService.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/automation/SemanticActionExecutor.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/shizuku/ShizukuVerifier.kt`
- Create: `app/src/main/res/xml/accessibility_service_config.xml`
- Modify: `app/src/main/AndroidManifest.xml`
- Test: `app/src/androidTest/java/dev/m3rma1d/s1r3n/automation/AutomationFailClosedTest.kt`

**Interfaces:**
- Consumes: confirmed `AppBinding`, exact `ScreenMatch`, and `UiAction.ClickLabel`/`SetText`/`Back`.
- Produces: `AutomationResult.Performed`, `Unavailable`, or `UnexpectedScreen`.

- [ ] **Step 1: Write the unexpected-dialog instrumentation test**

```kotlin
@Test fun unexpectedDialogStopsBeforeTap() {
    mockTarget.showLabels("Flash & Update", "Unknown permission dialog", "Flash")
    val result = executor.execute(boundMarauder, UiAction.ClickLabel("Flash"))
    assertEquals(AutomationResult.UnexpectedScreen, result)
    assertEquals(0, mockTarget.clickCount("Flash"))
}
```

- [ ] **Step 2: Verify RED**

Run: `./gradlew :app:connectedDebugAndroidTest`

Expected: compilation fails because automation service and executor are absent.

- [ ] **Step 3: Implement semantic-first execution**

Only inspect windows belonging to the bound package. Normalize visible text/content descriptions, match one exact profile screen, require exactly one enabled target node, call `ACTION_CLICK` or `ACTION_SET_TEXT`, then resnapshot and require an allowed transition. Return `UnexpectedScreen` for additional dialogs, duplicate targets, stale nodes, or backend loss.

`ShizukuVerifier` exposes only `isRunning()`, `launch(packageName)`, `foregroundPackage()`, `usbSummary()`, `screenshotHash()`, and `tap(x,y)`; `tap` additionally requires a matching fingerprint proof passed by the executor.

- [ ] **Step 4: Run instrumentation and unit suites**

Run: `./gradlew :app:testDebugUnitTest :app:connectedDebugAndroidTest`

Expected: PASS; mock unexpected dialogs receive no tap.

- [ ] **Step 5: Commit**

```bash
git add app/src/main app/src/androidTest
git commit -m "feat: automate bound apps fail closed"
```

### Task 4: Storage-selected firmware inspection and exclusive USB lease

**Files:**
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/firmware/FirmwareArtifact.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/firmware/FirmwareInspector.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/usb/UsbLease.kt`
- Test: `app/src/test/java/dev/m3rma1d/s1r3n/firmware/FirmwareInspectorTest.kt`
- Test: `app/src/test/java/dev/m3rma1d/s1r3n/usb/UsbLeaseTest.kt`

**Interfaces:**
- Consumes: selected content URI stream and USB device key.
- Produces: `FirmwareArtifact(name, size, sha256, declaredChip, segments)` and one-owner `UsbLease`.

- [ ] **Step 1: Write hash, range, and release-on-error tests**

```kotlin
@Test fun `overlapping segments are rejected`() {
    val parts = listOf(FirmwareSegment(0x0, 4096), FirmwareSegment(0x800, 4096))
    assertFailsWith<FirmwareValidationException> { FirmwareInspector.validateRanges(parts) }
}

@Test fun `lease releases after exception`() {
    val leases = UsbLeaseRegistry()
    assertFailsWith<IllegalStateException> { leases.withLease("usb-1", "flasher") { error("boom") } }
    assertNull(leases.owner("usb-1"))
}
```

- [ ] **Step 2: Verify RED**

Run: `./gradlew :app:testDebugUnitTest --tests '*FirmwareInspectorTest' --tests '*UsbLeaseTest'`

Expected: compilation fails because firmware and lease types are missing.

- [ ] **Step 3: Implement bounded streaming inspection and exclusive lease**

Hash while streaming with a maximum accepted size of 16 MiB per selected image. Reject empty data, offsets outside `0x0..0xFFFFFF`, integer overflow, overlaps, and total end above 16 MiB for an N16 target. Treat chip family as `UNKNOWN` unless trustworthy metadata or explicit image format establishes it; filenames are display data only.

Implement `withLease` using `try/finally`; a second owner receives `UsbBusy(currentOwner)` and performs no USB I/O.

- [ ] **Step 4: Run all unit tests**

Run: `./gradlew :app:testDebugUnitTest`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/dev/m3rma1d/s1r3n/firmware app/src/main/java/dev/m3rma1d/s1r3n/usb app/src/test
git commit -m "feat: validate selected firmware and USB ownership"
```

### Task 5: ESP32-S3 ROM flasher with transcript verification

**Files:**
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/esp/SerialLink.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/esp/EspRomProtocol.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/esp/Esp32S3Flasher.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/esp/UsbSerialLink.kt`
- Test: `app/src/test/java/dev/m3rma1d/s1r3n/esp/Esp32S3FlasherTest.kt`
- Test fixture: `app/src/test/resources/esp32s3/success-transcript.json`
- Test fixture: `app/src/test/resources/esp32s3/md5-mismatch-transcript.json`

**Interfaces:**
- Consumes: confirmed operation, `FirmwareArtifact`, `SerialLink`, and held USB lease.
- Produces: `Flow<FlashProgress>` ending only in verified `DONE` or an explicit exception.

- [ ] **Step 1: Write chip-mismatch and MD5-mismatch tests**

```kotlin
@Test fun `classic ESP32 response is rejected before erase`() = runTest {
    val link = TranscriptLink.classicEsp32()
    assertFailsWith<ChipMismatch> { Esp32S3Flasher(link).flash(s3Artifact()) {} }
    assertFalse(link.commands.any { it.opcode == EspOpcode.FLASH_BEGIN })
}

@Test fun `device MD5 mismatch never reports done`() = runTest {
    val progress = mutableListOf<FlashProgress>()
    assertFailsWith<VerificationFailure> { Esp32S3Flasher(TranscriptLink.md5Mismatch()).flash(s3Artifact(), progress::add) }
    assertTrue(progress.none { it.stage == FlashStage.DONE })
}
```

- [ ] **Step 2: Verify RED**

Run: `./gradlew :app:testDebugUnitTest --tests '*Esp32S3FlasherTest'`

Expected: compilation fails because S3 flasher types are missing.

- [ ] **Step 3: Implement the protocol from reviewed upstream behavior**

Port only the ESP32-S3 operations exercised by the fixtures: SLIP framing, sync, security-info/chip identification, SPI attach, flash parameters for 16 MiB, compressed begin/data/end, per-segment flash MD5, and hard reset. Keep opcodes and register constants in `EspRomProtocol`; cite espressif/esptool revision `c85144be5f4edff13e818033a7a9a060f2f607cb` plus the exact source file and symbol beside each non-obvious constant. Reject secure-download/encryption states that the implementation cannot verify. Never fall back to another chip family.

Use native USB-CDC or supported usb-serial drivers through `UsbSerialLink`. Reset sequences are driver/profile-specific and must be selected from an explicit `Esp32S3BoardProfile`; no generic guessed GPIO sequence is allowed.

- [ ] **Step 4: Run transcript tests and full unit suite**

Run: `./gradlew :app:testDebugUnitTest --tests '*Esp32S3FlasherTest' && ./gradlew :app:testDebugUnitTest`

Expected: PASS; mismatch fixtures issue no erase/write or `DONE` event.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/dev/m3rma1d/s1r3n/esp app/src/test app/src/test/resources
git commit -m "feat: add verified ESP32-S3 flashing protocol"
```

### Task 6: Confirmed flash orchestration and Marauder handoff

**Files:**
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/firmware/FlashCoordinator.kt`
- Modify: `app/src/main/java/dev/m3rma1d/s1r3n/ui/CompanionViewModel.kt`
- Modify: `app/src/main/java/dev/m3rma1d/s1r3n/ui/CompanionScreen.kt`
- Test: `app/src/test/java/dev/m3rma1d/s1r3n/firmware/FlashCoordinatorTest.kt`

**Interfaces:**
- Consumes: operation, artifact, confirmation, USB lease, chip probe, S3 flasher, app launcher.
- Produces: state/evidence events and verified handoff to `com.marauder.mobile`.

- [ ] **Step 1: Write the handoff-order test**

```kotlin
@Test fun `Marauder launches only after verify reset and USB release`() = runTest {
    val events = mutableListOf<String>()
    coordinator(events).flash(confirmedRequest())
    assertEquals(listOf("lease", "identify:S3", "write", "verify", "reset", "release", "launch:com.marauder.mobile"), events)
}
```

- [ ] **Step 2: Verify RED**

Run: `./gradlew :app:testDebugUnitTest --tests '*FlashCoordinatorTest'`

Expected: compilation fails because coordinator is absent.

- [ ] **Step 3: Implement orchestration and UI evidence**

The coordinator validates the one-use confirmation, acquires USB, independently identifies S3, runs flash/verify/reset, releases in `finally`, waits for USB re-enumeration with a bounded timeout, and launches Marauder only when all prior gates pass. A timeout after verified write becomes `UNKNOWN`, not `SUCCEEDED`. The UI shows filename, SHA-256, chip, offsets, flash-size expectation, current stage, cancel availability, and emergency stop limitations.

- [ ] **Step 4: Run complete integration-stage verification**

Run: `./gradlew :app:testDebugUnitTest :app:connectedDebugAndroidTest :app:assembleDebug`

Expected: PASS. Real hardware flashing remains disabled behind a build-time `hardwareAcceptanceComplete=false` gate until Stage 3 records the acceptance run.

- [ ] **Step 5: Commit**

```bash
git add app/src
git commit -m "feat: coordinate confirmed S3 flashing"
```
