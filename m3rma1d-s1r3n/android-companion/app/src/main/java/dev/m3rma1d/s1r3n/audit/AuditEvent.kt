package dev.m3rma1d.s1r3n.audit

import kotlinx.serialization.Serializable

@Serializable
data class AuditEvent(
    val requestId: String,
    val operation: String,
    val state: String,
    val selectedFileSha256: String? = null,
    val evidence: List<String> = emptyList(),
)
