# M3rMa1d S1r3n Android Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a testable Android companion that accepts authenticated typed requests on loopback, enforces confirmations and operation state, and drives harmless mock target apps before any real hardware authority is added.

**Architecture:** A Kotlin/Compose Android app owns a domain state machine, append-only audit store, short-lived pairing token, and loopback HTTP bridge. Android backends implement narrow interfaces; this stage uses fakes and a bundled mock target activity, so no Flipper, Marauder, USB flash, or radio mutation is possible yet.

**Tech Stack:** Kotlin 2.1.0, Android Gradle Plugin 8.7.3, Gradle 8.9 wrapper, compile/target SDK 35, min SDK 26, Jetpack Compose, Kotlin serialization 1.7.3, coroutines, JUnit 4, AndroidX instrumentation.

**Spec:** `docs/superpowers/specs/2026-09-21-m3rma1d-s1r3n-design.md`

## Global Constraints

- Package/application ID is `dev.m3rma1d.s1r3n`; min SDK 26, compile/target SDK 35.
- The bridge binds only `127.0.0.1`, never a wildcard or LAN address.
- Every mutating operation requires a fresh Android confirmation; a CLI cannot self-confirm.
- Request acceptance, UI action, app-reported result, and independent verification are distinct evidence states.
- No jamming, credential theft, covert persistence, hidden upload, or unattended destructive-operation command exists.
- Firmware contents, credentials, and unrelated screen content never enter audit records.
- No real target app or hardware mutation is enabled by this plan.

## Review Focus

- Replayed request IDs return the original operation and never execute twice; Task 2 pins this.
- Expired or mismatched confirmations cannot authorize another operation; Task 3 pins this.
- A malformed or oversized request gets a bounded error without killing the bridge; Task 5 pins this.
- Emergency stop prevents newly queued mutations and moves cancellable work to `cancelled`; Task 3 pins this.
- Audit serialization redacts secrets and firmware bytes while preserving hashes and evidence; Task 4 pins this.

---

### Task 1: Reproducible Android skeleton and domain types

**Files:**
- Create: `settings.gradle.kts`
- Create: `build.gradle.kts`
- Create: `gradle/libs.versions.toml`
- Create: `gradle/wrapper/gradle-wrapper.properties`
- Create: `app/build.gradle.kts`
- Create: `app/src/main/AndroidManifest.xml`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/MainActivity.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/domain/Operation.kt`
- Test: `app/src/test/java/dev/m3rma1d/s1r3n/domain/OperationTest.kt`

**Interfaces:**
- Consumes: none.
- Produces: `OperationId`, `OperationKind`, `OperationState`, `Evidence`, and immutable `Operation`.

- [ ] **Step 1: Create Gradle configuration and the failing state test**

Use the pinned versions in the header and configure `namespace = "dev.m3rma1d.s1r3n"`, `applicationId = "dev.m3rma1d.s1r3n"`, Java/Kotlin 17, Compose, serialization, JUnit, and AndroidX test dependencies. Set the wrapper distribution to `gradle-8.9-bin.zip`. Write:

```kotlin
class OperationTest {
    @Test fun `terminal operation cannot transition`() {
        val done = Operation(OperationId("op-1"), OperationKind.INSPECT_DEVICE, OperationState.SUCCEEDED)
        assertFailsWith<IllegalStateException> { done.transitionTo(OperationState.EXECUTING) }
    }
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `./gradlew :app:testDebugUnitTest --tests '*OperationTest'`

Expected: compilation fails because `Operation`, `OperationId`, `OperationKind`, and `OperationState` do not exist.

- [ ] **Step 3: Implement the minimal immutable domain model**

```kotlin
@JvmInline value class OperationId(val value: String)
enum class OperationKind { DISCOVER_APPS, INSPECT_DEVICE, SELECT_FIRMWARE, VALIDATE_FIRMWARE, FLASH_FIRMWARE, INSTALL_FLIPPER_APP, OPEN_CONSOLE, RUN_SUPPORTED_ACTION }
enum class OperationState { REQUESTED, VALIDATED, AWAITING_CONFIRMATION, EXECUTING, SUCCEEDED, FAILED, CANCELLED, UNKNOWN }
data class Evidence(val kind: String, val detail: String, val atEpochMs: Long)
data class Operation(val id: OperationId, val kind: OperationKind, val state: OperationState, val evidence: List<Evidence> = emptyList()) {
    fun transitionTo(next: OperationState): Operation {
        check(state !in setOf(OperationState.SUCCEEDED, OperationState.FAILED, OperationState.CANCELLED, OperationState.UNKNOWN))
        return copy(state = next)
    }
}
```

Create a minimal Compose `MainActivity` that renders `M3rMa1d S1r3n` and `Bridge stopped`.

- [ ] **Step 4: Run unit tests and assemble**

Run: `./gradlew :app:testDebugUnitTest :app:assembleDebug`

Expected: PASS and `app/build/outputs/apk/debug/app-debug.apk` exists.

- [ ] **Step 5: Commit**

```bash
git add settings.gradle.kts build.gradle.kts gradle app
git commit -m "build: scaffold Android companion"
```

### Task 2: Idempotent operation registry and request schema

**Files:**
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/bridge/BridgeModels.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/domain/OperationRegistry.kt`
- Test: `app/src/test/java/dev/m3rma1d/s1r3n/domain/OperationRegistryTest.kt`

**Interfaces:**
- Consumes: `Operation`, `OperationId`, `OperationKind`.
- Produces: `BridgeRequest(requestId: String, operation: OperationKind, arguments: JsonObject)`, `BridgeResponse`, and `OperationRegistry.createOrGet(request)`.

- [ ] **Step 1: Write the duplicate-request test**

```kotlin
@Test fun `same request ID creates one operation`() {
    val registry = OperationRegistry()
    val request = BridgeRequest("op-7", OperationKind.INSPECT_DEVICE, buildJsonObject {})
    val first = registry.createOrGet(request)
    val second = registry.createOrGet(request)
    assertSame(first, second)
    assertEquals(1, registry.all().size)
}
```

- [ ] **Step 2: Verify RED**

Run: `./gradlew :app:testDebugUnitTest --tests '*OperationRegistryTest'`

Expected: compilation fails because registry and bridge models are missing.

- [ ] **Step 3: Implement serialization models and synchronized registry**

```kotlin
@Serializable data class BridgeRequest(val requestId: String, val operation: OperationKind, val arguments: JsonObject)
@Serializable data class BridgeError(val code: String, val message: String)
@Serializable data class BridgeResponse(val operation: Operation? = null, val error: BridgeError? = null)

class OperationRegistry {
    private val entries = linkedMapOf<String, Operation>()
    @Synchronized fun createOrGet(request: BridgeRequest): Operation =
        entries.getOrPut(request.requestId) { Operation(OperationId(request.requestId), request.operation, OperationState.REQUESTED) }
    @Synchronized fun all(): List<Operation> = entries.values.toList()
}
```

Annotate the enums and `Operation` with `@Serializable`, and add `@Serializable(with = OperationIdSerializer::class)` to `OperationId`; `OperationIdSerializer` encodes and decodes one JSON string. Add a round-trip assertion for `BridgeRequest("op-7", INSPECT_DEVICE, {})`.

- [ ] **Step 4: Run focused and full tests**

Run: `./gradlew :app:testDebugUnitTest --tests '*OperationRegistryTest' && ./gradlew :app:testDebugUnitTest`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/dev/m3rma1d/s1r3n/bridge app/src/main/java/dev/m3rma1d/s1r3n/domain app/src/test
git commit -m "feat: add idempotent operation registry"
```

### Task 3: Confirmation authority and emergency stop

**Files:**
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/domain/AuthorityPolicy.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/domain/ConfirmationStore.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/domain/EmergencyStop.kt`
- Test: `app/src/test/java/dev/m3rma1d/s1r3n/domain/AuthorityPolicyTest.kt`

**Interfaces:**
- Consumes: operation IDs, kinds, and states.
- Produces: `AuthorityPolicy.requiresConfirmation`, one-use `ConfirmationStore.consume`, and `EmergencyStop.isEngaged`.

- [ ] **Step 1: Write failing confirmation and stop tests**

```kotlin
@Test fun `confirmation is operation-bound one-use and expires`() {
    val clock = MutableClock(1_000)
    val store = ConfirmationStore(clock, ttlMs = 500)
    store.grant(OperationId("a"))
    assertFalse(store.consume(OperationId("b")))
    assertTrue(store.consume(OperationId("a")))
    assertFalse(store.consume(OperationId("a")))
    store.grant(OperationId("c")); clock.now = 1_501
    assertFalse(store.consume(OperationId("c")))
}

@Test fun `emergency stop rejects mutation`() {
    val stop = EmergencyStop().apply { engage() }
    assertFalse(stop.mayStart(OperationKind.FLASH_FIRMWARE))
    assertTrue(stop.mayStart(OperationKind.INSPECT_DEVICE))
}
```

- [ ] **Step 2: Verify RED**

Run: `./gradlew :app:testDebugUnitTest --tests '*AuthorityPolicyTest'`

Expected: compilation fails on the missing authority types.

- [ ] **Step 3: Implement exact authority rules**

```kotlin
object AuthorityPolicy {
    private val mutating = setOf(OperationKind.FLASH_FIRMWARE, OperationKind.INSTALL_FLIPPER_APP, OperationKind.RUN_SUPPORTED_ACTION)
    fun requiresConfirmation(kind: OperationKind) = kind in mutating
}
interface Clock { fun nowMs(): Long }
class ConfirmationStore(private val clock: Clock, private val ttlMs: Long = 60_000) {
    private val grants = mutableMapOf<OperationId, Long>()
    @Synchronized fun grant(id: OperationId) { grants[id] = clock.nowMs() + ttlMs }
    @Synchronized fun consume(id: OperationId): Boolean = grants.remove(id)?.let { it >= clock.nowMs() } == true
}
class EmergencyStop {
    @Volatile var isEngaged = false; private set
    fun engage() { isEngaged = true }
    fun reset() { isEngaged = false }
    fun mayStart(kind: OperationKind) = !isEngaged || !AuthorityPolicy.requiresConfirmation(kind)
}
```

- [ ] **Step 4: Run all unit tests**

Run: `./gradlew :app:testDebugUnitTest`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/dev/m3rma1d/s1r3n/domain app/src/test
git commit -m "feat: enforce confirmations and emergency stop"
```

### Task 4: Redacted append-only audit store

**Files:**
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/audit/AuditEvent.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/audit/AuditStore.kt`
- Test: `app/src/test/java/dev/m3rma1d/s1r3n/audit/AuditStoreTest.kt`

**Interfaces:**
- Consumes: operation ID, type, state, selected-file SHA-256, evidence.
- Produces: newline-delimited JSON via `AuditStore.append(event)` and `AuditStore.readAll()`.

- [ ] **Step 1: Write the redaction test**

```kotlin
@Test fun `audit excludes secrets bytes and unrelated screen text`() {
    val sink = StringWriter()
    val store = AuditStore(sink)
    store.append(AuditEvent("op-1", "VALIDATE_FIRMWARE", "SUCCEEDED", "abc123", listOf("hash verified")))
    val json = sink.toString()
    assertTrue(json.contains("abc123"))
    assertFalse(json.contains("apiKey", ignoreCase = true))
    assertFalse(json.contains("firmwareBytes"))
    assertFalse(json.contains("screenDump"))
}
```

- [ ] **Step 2: Verify RED**

Run: `./gradlew :app:testDebugUnitTest --tests '*AuditStoreTest'`

Expected: compilation fails because audit types do not exist.

- [ ] **Step 3: Implement the closed audit schema**

```kotlin
@Serializable data class AuditEvent(
    val requestId: String,
    val operation: String,
    val state: String,
    val selectedFileSha256: String? = null,
    val evidence: List<String> = emptyList(),
)
class AuditStore(private val writer: Writer, private val json: Json = Json) {
    @Synchronized fun append(event: AuditEvent) { writer.append(json.encodeToString(event)).append('\n'); writer.flush() }
}
```

Do not add maps or arbitrary metadata fields; the closed schema is the redaction boundary.

- [ ] **Step 4: Run all unit tests**

Run: `./gradlew :app:testDebugUnitTest`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/dev/m3rma1d/s1r3n/audit app/src/test
git commit -m "feat: add redacted audit log"
```

### Task 5: Authenticated bounded loopback bridge

**Files:**
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/bridge/PairingTokenStore.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/bridge/LoopbackBridge.kt`
- Test: `app/src/test/java/dev/m3rma1d/s1r3n/bridge/LoopbackBridgeTest.kt`

**Interfaces:**
- Consumes: `BridgeRequest`, registry, authority policy, pairing token.
- Produces: HTTP `POST /v1/operations`, `GET /v1/operations/{id}`, and `POST /v1/emergency-stop` on `127.0.0.1`.

- [ ] **Step 1: Write failing transport tests**

```kotlin
@Test fun `bridge rejects non-loopback bind and oversized body`() {
    assertFailsWith<IllegalArgumentException> { LoopbackBridge(InetAddress.getByName("0.0.0.0"), 0, deps()) }
    bridge().use { running ->
        val response = running.post("/v1/operations", "x".repeat(65_537), token = "valid")
        assertEquals(413, response.code)
    }
}

@Test fun `bridge requires pairing token and survives malformed JSON`() {
    bridge().use { running ->
        assertEquals(401, running.post("/v1/operations", "{}", token = "wrong").code)
        assertEquals(400, running.post("/v1/operations", "{", token = "valid").code)
        assertEquals(200, running.get("/v1/health").code)
    }
}
```

- [ ] **Step 2: Verify RED**

Run: `./gradlew :app:testDebugUnitTest --tests '*LoopbackBridgeTest'`

Expected: compilation fails because bridge transport is missing.

- [ ] **Step 3: Implement a small `ServerSocket` HTTP/1.1 bridge**

Bind with `ServerSocket(port, 16, bindAddress)` after enforcing `bindAddress.isLoopbackAddress`. Read headers until CRLF-CRLF with an 8 KiB header limit, require numeric `Content-Length <= 65536`, read exactly that body, require `Authorization: Bearer <token>`, and always send `Connection: close` plus JSON with an explicit `Content-Length`. Catch per-connection parse errors and return bounded `400`, `401`, `404`, `409`, or `413` responses without stopping the accept loop.

Use a random 32-byte token encoded as URL-safe Base64 without padding; keep it in Android encrypted preferences when available and rotate it from the UI.

- [ ] **Step 4: Run focused tests and assembly**

Run: `./gradlew :app:testDebugUnitTest --tests '*LoopbackBridgeTest' && ./gradlew :app:testDebugUnitTest :app:assembleDebug`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/dev/m3rma1d/s1r3n/bridge app/src/test
git commit -m "feat: expose authenticated loopback bridge"
```

### Task 6: Mock target backend and evidence separation

**Files:**
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/target/TargetBackend.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/target/MockTargetBackend.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/mock/MockTargetActivity.kt`
- Modify: `app/src/main/AndroidManifest.xml`
- Test: `app/src/test/java/dev/m3rma1d/s1r3n/target/MockTargetBackendTest.kt`

**Interfaces:**
- Consumes: validated operation and confirmation result.
- Produces: `TargetResult(uiActionPerformed, appReportedSuccess, hardwareVerified, detail)`.

- [ ] **Step 1: Write the truthful-result test**

```kotlin
@Test fun `tap success is not hardware success`() = runTest {
    val result = MockTargetBackend(appReportsSuccess = true).execute(OperationKind.RUN_SUPPORTED_ACTION)
    assertTrue(result.uiActionPerformed)
    assertTrue(result.appReportedSuccess)
    assertFalse(result.hardwareVerified)
}
```

- [ ] **Step 2: Verify RED**

Run: `./gradlew :app:testDebugUnitTest --tests '*MockTargetBackendTest'`

Expected: compilation fails because target interfaces do not exist.

- [ ] **Step 3: Implement the backend contract and mock activity**

```kotlin
data class TargetResult(val uiActionPerformed: Boolean, val appReportedSuccess: Boolean, val hardwareVerified: Boolean, val detail: String)
interface TargetBackend { suspend fun execute(kind: OperationKind): TargetResult }
class MockTargetBackend(private val appReportsSuccess: Boolean) : TargetBackend {
    override suspend fun execute(kind: OperationKind) = TargetResult(true, appReportsSuccess, false, "mock target only")
}
```

The mock activity exposes stable accessibility labels `Connect`, `Choose firmware`, `Flash`, `Cancel`, and `Reported success`; it never opens USB or radio APIs.

- [ ] **Step 4: Run tests and debug assembly**

Run: `./gradlew :app:testDebugUnitTest :app:assembleDebug`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main app/src/test
git commit -m "test: add harmless automation target"
```

### Task 7: Companion dashboard, confirmation UI, and instrumented smoke test

**Files:**
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/ui/CompanionViewModel.kt`
- Create: `app/src/main/java/dev/m3rma1d/s1r3n/ui/CompanionScreen.kt`
- Modify: `app/src/main/java/dev/m3rma1d/s1r3n/MainActivity.kt`
- Test: `app/src/androidTest/java/dev/m3rma1d/s1r3n/CompanionFlowTest.kt`

**Interfaces:**
- Consumes: registry, confirmation store, emergency stop, bridge lifecycle.
- Produces: visible bridge state/token rotation, pending-operation confirmation, operation history, and emergency-stop control.

- [ ] **Step 1: Write the failing instrumentation flow**

```kotlin
@Test fun mutationShowsDetailsAndRequiresAndroidConfirmation() {
    composeRule.onNodeWithText("Pending request").assertDoesNotExist()
    testRequests.enqueueFlash("op-flash", "firmware.bin", "abc123")
    composeRule.onNodeWithText("firmware.bin").assertIsDisplayed()
    composeRule.onNodeWithText("abc123").assertIsDisplayed()
    composeRule.onNodeWithText("Confirm on Android").performClick()
    assertTrue(testConfirmations.wasGranted(OperationId("op-flash")))
}
```

- [ ] **Step 2: Verify RED**

Run: `./gradlew :app:connectedDebugAndroidTest`

Expected: test fails because the companion screen and confirmation UI are absent.

- [ ] **Step 3: Implement the dashboard**

Render bridge running/stopped state, loopback port, token-rotation button, pending request details, separate confirm/cancel buttons, emergency stop, and operation rows showing the four evidence levels. Never display the full pairing token after its one-time copy event.

- [ ] **Step 4: Run complete stage verification**

Run: `./gradlew :app:testDebugUnitTest :app:connectedDebugAndroidTest :app:assembleDebug`

Expected: all tests PASS; debug APK exists; mock target is the only executable backend.

- [ ] **Step 5: Commit**

```bash
git add app/src
git commit -m "feat: add companion authorization dashboard"
```
