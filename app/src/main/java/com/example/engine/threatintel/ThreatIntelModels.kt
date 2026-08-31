package com.example.engine.threatintel

import java.time.Instant

enum class ProviderHealth { FRESH, STALE, DEGRADED, UNAVAILABLE, RATE_LIMITED }
enum class AffectState { NOT_AFFECTED, POTENTIALLY_AFFECTED, AFFECTED, UNKNOWN }

data class SourceObservation<T>(
    val source: String,
    val value: T,
    val observedAt: Instant,
    val confidence: Double = 1.0
)

data class ProviderEnvelope<T>(
    val provider: String,
    val health: ProviderHealth,
    val records: List<T>,
    val fetchedAt: Instant,
    val cacheAgeSeconds: Long? = null,
    val retryAfterSeconds: Long? = null,
    val errorClass: String? = null
)

data class ThreatIntelRecord(
    val id: String,
    val cve: String? = null,
    val vendor: String? = null,
    val product: String? = null,
    val affectedVersions: List<String> = emptyList(),
    val cpes: Set<String> = emptySet(),
    val purls: Set<String> = emptySet(),
    val cvssObservations: List<SourceObservation<Double>> = emptyList(),
    val epssObservations: List<SourceObservation<Double>> = emptyList(),
    val knownExploitedObservations: List<SourceObservation<Boolean>> = emptyList(),
    val zeroDayObservations: List<SourceObservation<Boolean>> = emptyList(),
    val activeCampaignObservations: List<SourceObservation<Boolean>> = emptyList(),
    val threatActors: Set<String> = emptySet(),
    val malwareFamilies: Set<String> = emptySet(),
    val publishedAt: Instant? = null,
    val updatedAt: Instant? = null,
    val sources: Set<String> = emptySet(),
    val disagreements: Set<String> = emptySet()
) {
    val knownExploited: Boolean get() = knownExploitedObservations.any { it.value }
    val zeroDay: Boolean get() = zeroDayObservations.any { it.value }
    val activeCampaign: Boolean get() = activeCampaignObservations.any { it.value }
}

data class TechnologyFingerprint(
    val host: String,
    val vendor: String? = null,
    val product: String? = null,
    val version: String? = null,
    val cpes: Set<String> = emptySet(),
    val purls: Set<String> = emptySet(),
    val confidence: Double,
    val evidence: List<String> = emptyList()
)

data class ThreatCampaign(
    val campaignId: String,
    val name: String? = null,
    val active: Boolean,
    val exploitedCves: Set<String> = emptySet(),
    val targetedCpes: Set<String> = emptySet(),
    val targetedPurls: Set<String> = emptySet(),
    val targetedProducts: Set<String> = emptySet(),
    val threatActors: Set<String> = emptySet(),
    val malware: Set<String> = emptySet(),
    val lastObserved: Instant,
    val confidence: Double,
    val source: String
)

data class ProviderHealthSummary(
    val states: Map<String, ProviderHealth>,
    val completeness: Double
)

data class ThreatAssessment(
    val assetId: String,
    val fingerprint: TechnologyFingerprint,
    val intelligence: List<ThreatIntelRecord>,
    val campaigns: List<ThreatCampaign>,
    val affectState: AffectState,
    val providerHealth: ProviderHealthSummary,
    val correlationExplanation: List<String>,
    val uncertainty: Double,
    val latentScore: Double,
    val priority: Double,
    val permittedActions: Set<String>
)