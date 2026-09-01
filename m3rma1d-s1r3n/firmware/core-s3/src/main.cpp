#include <Arduino.h>
#include "protocol.hpp"

using namespace s1r3n;

// Core owns orchestration and ADL policy. It has no electrical connection to
// the Flipper. Every authorized job is routed through the CYD Deck bridge.
static volatile bool deckOnline = false;
static volatile bool safetyMeshHealthy = false;
static volatile bool stopAsserted = true;

static void setResult(JobResult& out, uint32_t jobId, int16_t code, const char* text) {
  out.job_id = jobId;
  out.code = code;
  snprintf(out.text, sizeof(out.text), "%s", text ? text : "");
}

void coreSetDeckOnline(bool online) {
  deckOnline = online;
  if (!online) stopAsserted = true;
}

void coreSetSafetyMeshHealthy(bool healthy) {
  safetyMeshHealthy = healthy;
  if (!healthy) stopAsserted = true;
}

void coreAssertStop() {
  stopAsserted = true;
}

bool coreClearStop(bool authenticated) {
  if (!authenticated || !deckOnline || !safetyMeshHealthy) return false;
  stopAsserted = false;
  return true;
}

bool coreAuthorizeJobForDeck(const JobRequest& job, bool approved, JobResult& out) {
  if (stopAsserted) {
    setResult(out, job.job_id, -20, "core STOP asserted");
    return false;
  }
  if (!safetyMeshHealthy) {
    setResult(out, job.job_id, -10, "safety mesh unhealthy");
    return false;
  }
  if (!deckOnline) {
    setResult(out, job.job_id, -22, "CYD Deck bridge offline");
    return false;
  }
  if (!capabilityAllowed(job.capability)) {
    setResult(out, job.job_id, -11, "capability denied");
    return false;
  }
  if (needsApproval(job.capability) && !approved) {
    setResult(out, job.job_id, -12, "Deck approval required");
    return false;
  }

  setResult(out, job.job_id, 1, "authorized; route to CYD Deck");
  return true;
}

void setup() {
  Serial.begin(115200);
  coreAssertStop();
  Serial.println("M3rMa1d S1r3n Core ready");
  Serial.println("No Flipper GPIO on Core; all jobs route through CYD Deck");
}

void loop() {
  // The wireless/control-plane transport updates Deck and safety-node health,
  // accepts ADL jobs, calls coreAuthorizeJobForDeck(), and forwards only an
  // authorized job to the CYD. It must never fall back to a direct GPIO path.
  delay(10);
}
