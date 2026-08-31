package com.example.engine.adl

import java.net.URI
import java.time.Instant
import java.util.UUID

data class AdlApprovedQuery(
    val leaseId: UUID,
    val assetId: String,
    val value: String,
    val allowedHosts: Set<String>,
    val issuedAt: Instant,
    val expiresAt: Instant,
    val maxResults: Int,
    val passiveOnly: Boolean = true
) {
    init {
        require(passiveOnly) { "ATEIA queries must be passive" }
        require(allowedHosts.isNotEmpty()) { "An approved query requires explicit scope" }
        require(maxResults in 1..1000)
        require(expiresAt.isAfter(issuedAt))
    }

    fun assertUsable(now: Instant = Instant.now()) {
        require(now.isBefore(expiresAt)) { "ADL query lease expired" }
    }

    fun assertResultInScope(url: String) {
        val host = URI(url).host?.lowercase() ?: error("Result has no host")
        require(allowedHosts.any { allowed -> host == allowed.lowercase() || host.endsWith(".${allowed.lowercase()}" ) }) {
            "Result escaped ADL-authorized scope"
        }
    }
}