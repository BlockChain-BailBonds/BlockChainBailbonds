# ADL Threat Exposure Intelligence Agent (ATEIA)

## Purpose
ATEIA is an authorized, passive external-exposure intelligence control plane. It combines ADL-governed search planning with live defensive threat intelligence and GhostBridge telemetry. It identifies potential exposures and prioritizes defensive validation; it does not authenticate to targets, bypass access controls, execute exploits, or retrieve private data.

## Invariants
1. ADL is the sole authority for scope and capabilities.
2. A planning model can propose queries and urgency but cannot grant itself authority.
3. Only explicitly authorized assets may be searched.
4. External reconnaissance remains passive and metadata-oriented.
5. Threat-intelligence provenance and provider health are preserved.
6. Unknown/degraded provider state is never interpreted as a negative finding.
7. Version uncertainty produces POTENTIALLY_AFFECTED, never VULNERABLE.
8. GhostBridge is observation/telemetry only; it does not bypass ADL.

## Pipeline
Authorized Asset Registry -> ADL Query Gate -> Query Planner -> Passive Search Provider -> Result Normalizer -> Technology/Package Fingerprinter -> Batch Enrichment Planner -> ThreatIntelCache -> Provider Adapters -> ThreatIntelAggregator -> ThreatCorrelationEngine -> ThreatRiskScorer -> ADL Action Gate -> GhostBridge -> Defender/WARD.

## Components
### ADL control plane
- `AdlApprovedQuery`: immutable capability lease for one approved passive query.
- `AdlThreatPolicy`: provider, correlation and action policy.
- `AdlThreatGate`: validates scope, operators, budgets, expiry and allowed actions.
- `AuthorizedAssetRegistry`: canonical domain/asset allowlist.

### Passive exposure plane
- `PassiveSearchProvider`: executes only an `AdlApprovedQuery`.
- `ResultNormalizer`: canonical URL/host/title/snippet metadata.
- `FingerprintEngine`: derives vendor/product/version/package/CPE/PURL candidates from public metadata.

### Threat-intelligence plane
Provider adapters normalize source-specific records. Initial adapters: CISA KEV, NVD, FIRST EPSS, GitHub Security Advisories, and licensed/public campaign intelligence. Optional STIX/TAXII/MISP adapters use the same contract.

`ThreatIntelCache` sits before provider fan-out. Correlation batches unique CVEs/products/packages from the entire search result set, checks cache first, and only requests misses. Provider requests are not performed once per result.

### Provider state semantics
Every provider returns an envelope with `FRESH`, `STALE`, `DEGRADED`, `UNAVAILABLE`, or `RATE_LIMITED`. A provider failure therefore cannot masquerade as an empty negative result. Assessments carry completeness and provider-health summaries.

### Provenance and disagreement
A normalized record retains per-source observations for CVSS, EPSS, affected ranges, exploitation state and timestamps. A derived value may be selected by explicit policy, but source disagreement is surfaced in `disagreements` and emitted through GhostBridge.

### Campaign correlation
Matching is evidence based: CVE intersection > CPE/PURL exact match > normalized vendor/product/version match > bounded alias match. Free-form fuzzy matching cannot independently create a critical correlation.

Campaign relevance decays exponentially:
`decay = exp(-ln(2) * ageDays / halfLifeDays)`.
The half-life is policy controlled and campaign-specific intelligence can override it. Final relevance combines match strength, source confidence, freshness and targeting relevance.

### Risk scoring
Avoid multiplicative saturation and hard clamping. Convert evidence into a weighted latent score and map it through a sigmoid:

`z = bias + wExposure*logit(exposure) + wAsset*logit(asset) + wSeverity*severity + wEpss*logit(epss) + wKev*kev + wCampaign*campaign + wZeroDay*zeroDay + wFresh*freshness - wUncertainty*uncertainty`

`priority = sigmoid(z)`

Ranking uses the unbounded `z` as the primary sort key so very-high-risk findings remain separable even when displayed probabilities approach 1.0. The probability is presentation/calibration output, not the ranking key.

## Cache/backoff contract
Suggested defaults are policy values, not hard-coded source guarantees:
- KEV: 30 min freshness; conditional refresh when supported.
- NVD CVE lookup: 30 min fresh, 24 h stale-if-error.
- EPSS: daily dataset/bulk refresh; never fan out one request per result.
- GitHub advisories: 30 min fresh, 6 h stale-if-error.
- Campaign feeds: 10 min fresh by default; provider-specific override.

Adapters honor Retry-After, use exponential backoff with jitter, enforce per-provider concurrency and token-bucket budgets, and implement circuit breaking. Stale cached intelligence may be used only with an explicit stale marker and confidence penalty.

## Correlation output
Each `ThreatAssessment` contains exposure evidence, fingerprint, matched CVEs/advisories/campaigns, provider health, data completeness, disagreement flags, uncertainty, latent ranking score, calibrated priority, and permitted defensive actions.

## Allowed actions
- passive enrichment
- defensive alerting
- ticket/report generation
- additional ADL-approved passive search

## Denied by default
- authentication to discovered surfaces
- credential submission
- access-control bypass
- exploit execution
- persistence
- destructive testing
- retrieval of non-public/private data

## GhostBridge telemetry
Emit query lease ID, asset ID, normalized exposure, fingerprint evidence, source observations, provider health, cache age, correlation explanation, uncertainty, risk score, ADL decision, and timestamps. This makes scoring and degraded-data decisions reconstructable for audit.