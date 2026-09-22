package dev.m3rma1d.s1r3n.audit

import java.io.StringWriter
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.Test

class AuditStoreTest {
    @Test
    fun `audit excludes secrets bytes and unrelated screen text`() {
        val sink = StringWriter()
        val store = AuditStore(sink)
        val event = AuditEvent("op-1", "VALIDATE_FIRMWARE", "SUCCEEDED", "abc123", listOf("hash verified"))

        store.append(event)

        val encoded = sink.toString()
        assertTrue(encoded.contains("abc123"))
        assertFalse(encoded.contains("apiKey", ignoreCase = true))
        assertFalse(encoded.contains("firmwareBytes"))
        assertFalse(encoded.contains("screenDump"))
        assertEquals(listOf(event), store.readAll())
    }
}
