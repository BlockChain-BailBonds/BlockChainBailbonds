package com.example.engine.threatintel

import java.time.Duration
import java.time.Instant
import kotlin.math.exp
import kotlin.math.ln

data class CampaignMatch(
    val campaign: ThreatCampaign,
    val matchStrength: Double,
    val freshness: Double,
    val relevance: Double,
    val explanation: List<String>
)

class ThreatCorrelationEngine(private val halfLifeDays: Double = 30.0) {
    fun correlateCampaign(
        fingerprint: TechnologyFingerprint,
        matchedCves: Set<String>,
        campaign: ThreatCampaign,
        now: Instant = Instant.now()
    ): CampaignMatch? {
        val evidence = mutableListOf<String>()
        var strength = 0.0

        val cveHits = matchedCves.intersect(campaign.exploitedCves)
        if (cveHits.isNotEmpty()) {
            strength = maxOf(strength, 1.0)
            evidence += "CVE intersection: ${cveHits.sorted().joinToString()}"
        }

        if (fingerprint.cpes.intersect(campaign.targetedCpes).isNotEmpty()) {
            strength = maxOf(strength, 0.95)
            evidence += "Exact CPE match"
        }

        if (fingerprint.purls.intersect(campaign.targetedPurls).isNotEmpty()) {
            strength = maxOf(strength, 0.95)
            evidence += "Exact PURL match"
        }

        val normalizedProduct = listOfNotNull(fingerprint.vendor, fingerprint.product)
            .joinToString(" ").trim().lowercase()
        if (normalizedProduct.isNotBlank() && campaign.targetedProducts.any { it.trim().lowercase() == normalizedProduct }) {
            strength = maxOf(strength, 0.80)
            evidence += "Exact normalized vendor/product match"
        }

        if (strength == 0.0) return null

        val ageDays = Duration.between(campaign.lastObserved, now).toHours().coerceAtLeast(0) / 24.0
        val freshness = exp(-ln(2.0) * ageDays / halfLifeDays)
        val relevance = (strength * campaign.confidence.coerceIn(0.0, 1.0) * freshness).coerceIn(0.0, 1.0)
        evidence += "Campaign freshness decay=$freshness"
        evidence += "Source confidence=${campaign.confidence}"

        return CampaignMatch(campaign, strength, freshness, relevance, evidence)
    }
}