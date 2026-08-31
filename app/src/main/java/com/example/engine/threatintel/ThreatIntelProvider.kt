package com.example.engine.threatintel

import java.time.Duration
import java.time.Instant

data class ThreatLookupBatch(
    val cves: Set<String> = emptySet(),
    val cpes: Set<String> = emptySet(),
    val purls: Set<String> = emptySet(),
    val products: Set<Pair<String?, String>> = emptySet()
)

interface ThreatIntelProvider {
    val name: String
    suspend fun lookup(batch: ThreatLookupBatch): ProviderEnvelope<ThreatIntelRecord>
}

data class CachePolicy(
    val freshFor: Duration,
    val staleIfErrorFor: Duration,
    val maxEntries: Int = 100_000
)

data class CacheEntry<T>(
    val value: T,
    val storedAt: Instant,
    val expiresAt: Instant,
    val staleUntil: Instant
)

interface ThreatIntelCache {
    suspend fun get(provider: String, key: String, now: Instant = Instant.now()): CacheEntry<ThreatIntelRecord>?
    suspend fun put(provider: String, key: String, value: ThreatIntelRecord, policy: CachePolicy, now: Instant = Instant.now())
    suspend fun invalidate(provider: String, key: String)
}

interface ProviderRateController {
    suspend fun acquire(provider: String)
    fun onSuccess(provider: String)
    fun onRateLimited(provider: String, retryAfter: Duration?)
    fun onFailure(provider: String, cause: Throwable)
}

/**
 * Aggregation must operate on a batch derived from all fingerprints in a search run.
 * Implementations must query cache first, deduplicate keys, and call providers only for misses.
 * Provider failures are returned as health state; they must never be converted to an empty
 * successful result.
 */
interface ThreatIntelAggregator {
    suspend fun enrich(batch: ThreatLookupBatch): List<ProviderEnvelope<ThreatIntelRecord>>
}