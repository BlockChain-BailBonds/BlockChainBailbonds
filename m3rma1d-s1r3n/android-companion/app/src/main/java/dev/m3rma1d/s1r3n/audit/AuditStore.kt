package dev.m3rma1d.s1r3n.audit

import java.io.Writer
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class AuditStore(
    private val writer: Writer,
    private val json: Json = Json,
) {
    private val events = mutableListOf<AuditEvent>()

    @Synchronized
    fun append(event: AuditEvent) {
        writer.append(json.encodeToString(event)).append('\n')
        writer.flush()
        events += event
    }

    @Synchronized
    fun readAll(): List<AuditEvent> = events.toList()
}
