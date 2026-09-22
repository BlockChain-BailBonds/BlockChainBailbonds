package dev.m3rma1d.s1r3n.domain

import dev.m3rma1d.s1r3n.bridge.BridgeRequest
import kotlin.test.assertEquals
import kotlin.test.assertSame
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import org.junit.Test

class OperationRegistryTest {
    @Test
    fun `same request ID creates one operation`() {
        val registry = OperationRegistry()
        val request = BridgeRequest("op-7", OperationKind.INSPECT_DEVICE, buildJsonObject {})

        val first = registry.createOrGet(request)
        val second = registry.createOrGet(request)

        assertSame(first, second)
        assertEquals(1, registry.all().size)
    }

    @Test
    fun `bridge request survives JSON round trip`() {
        val request = BridgeRequest("op-7", OperationKind.INSPECT_DEVICE, buildJsonObject {})

        val decoded = Json.decodeFromString<BridgeRequest>(Json.encodeToString(request))

        assertEquals(request, decoded)
    }
}
