package com.example.engine.threatintel

import kotlin.math.exp
import kotlin.math.ln

data class RiskWeights(
    val bias: Double = -3.0,
    val exposure: Double = 1.20,
    val asset: Double = 1.10,
    val severity: Double = 1.00,
    val epss: Double = 1.15,
    val kev: Double = 1.60,
    val campaign: Double = 1.25,
    val zeroDay: Double = 1.20,
    val freshness: Double = 0.50,
    val uncertainty: Double = -1.00
)

data class RiskEvidence(
    val exposureConfidence: Double,
    val assetCriticality: Double,
    val cvss: Double?,
    val epss: Double?,
    val knownExploited: Boolean,
    val campaignRelevance: Double,
    val zeroDay: Boolean,
    val freshness: Double,
    val uncertainty: Double
)

data class RiskScore(val latent: Double, val probability: Double)

class ThreatRiskScorer(private val w: RiskWeights = RiskWeights()) {
    fun score(e: RiskEvidence): RiskScore {
        val severity = (e.cvss ?: 0.0).coerceIn(0.0, 10.0) / 10.0
        val z = w.bias +
            w.exposure * logit(e.exposureConfidence) +
            w.asset * logit(e.assetCriticality) +
            w.severity * severity +
            w.epss * logit(e.epss ?: 0.01) +
            w.kev * if (e.knownExploited) 1.0 else 0.0 +
            w.campaign * e.campaignRelevance.coerceIn(0.0, 1.0) +
            w.zeroDay * if (e.zeroDay) 1.0 else 0.0 +
            w.freshness * e.freshness.coerceIn(0.0, 1.0) +
            w.uncertainty * e.uncertainty.coerceIn(0.0, 1.0)
        return RiskScore(latent = z, probability = sigmoid(z))
    }

    private fun sigmoid(x: Double) = 1.0 / (1.0 + exp(-x))

    private fun logit(p: Double): Double {
        val q = p.coerceIn(1e-6, 1.0 - 1e-6)
        return ln(q / (1.0 - q))
    }
}