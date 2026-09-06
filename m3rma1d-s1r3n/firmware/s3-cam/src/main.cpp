#include <Arduino.h>

#include "mermaid_link_s3.hpp"

using s1r3n::s3::CatalogSummary;
using s1r3n::s3::MermaidLinkS3;

namespace {
HardwareSerial MermaidSerial(1);

// GOOUUU V1.5 exposed headers selected to avoid the documented camera signal set.
// Physical verification of the exact board/revision is still a release gate.
constexpr int MERMAID_RX_PIN = 1; // <- Flipper TX pin 13
constexpr int MERMAID_TX_PIN = 2; // -> Flipper RX pin 14
constexpr uint32_t HEARTBEAT_MS = 500;
constexpr uint32_t LEASE_MAX_MS = 600000;

MermaidLinkS3 mermaid(MermaidSerial, MERMAID_RX_PIN, MERMAID_TX_PIN);
uint32_t last_heartbeat = 0;
uint32_t lease_expires_at = 0;
bool codex_authenticated = false;
bool camera_ready = false;

bool leaseActive() {
    if(!codex_authenticated || lease_expires_at == 0) return false;
    return static_cast<int32_t>(lease_expires_at - millis()) > 0;
}

void expireLeaseIfNeeded() {
    if(codex_authenticated && !leaseActive()) {
        codex_authenticated = false;
        lease_expires_at = 0;
        mermaid.setCodexLinked(false);
        mermaid.setExecutionAuthorized(false);
        mermaid.assertStop();
        Serial.println("CODEX lease expired; STOP asserted");
    }
}

void printStatus() {
    Serial.printf(
        "M3rMa1d S1r3n S3-CAM status STOP=%s CODEX=%s FLIPPER=%s CAMERA=%s lease_ms=%lu shell=OFF raw_cli=OFF\n",
        mermaid.stopAsserted() ? "ASSERTED" : "CLEAR",
        leaseActive() ? "LEASED" : "LOCKED",
        mermaid.peerFresh() ? "LINKED" : "ADRIFT",
        camera_ready ? "READY" : "UNVERIFIED",
        leaseActive() ? static_cast<unsigned long>(lease_expires_at - millis()) : 0UL);
}

void handleConsoleLine(String line) {
    line.trim();
    if(!line.length()) return;

    if(line.equalsIgnoreCase("STOP")) {
        codex_authenticated = false;
        lease_expires_at = 0;
        mermaid.setCodexLinked(false);
        mermaid.setExecutionAuthorized(false);
        mermaid.assertStop();
        Serial.println("STOP asserted");
        return;
    }

    if(line.equalsIgnoreCase("status") || line.equalsIgnoreCase("device_info") ||
       line.equalsIgnoreCase("codex_status")) {
        printStatus();
        return;
    }

    // Production execution authorization is intentionally not accepted from the
    // unauthenticated debug console. The authenticated control plane owns leases.
    Serial.println("DENY unsupported console request; authenticated Codex control plane required");
}

void heartbeat() {
    const uint32_t now = millis();
    if(now - last_heartbeat < HEARTBEAT_MS) return;
    last_heartbeat = now;
    Serial.printf(
        "S3CAM_HEARTBEAT %lu STOP=%u CODEX=%u FLIPPER=%u CAMERA=%u\n",
        static_cast<unsigned long>(now),
        mermaid.stopAsserted() ? 1U : 0U,
        leaseActive() ? 1U : 0U,
        mermaid.peerFresh() ? 1U : 0U,
        camera_ready ? 1U : 0U);
}
} // namespace

void setup() {
    Serial.begin(115200);
    delay(100);

    mermaid.begin();
    mermaid.setCameraReady(false);
    mermaid.setApprovalPending(false);
    mermaid.setCodexLinked(false);
    mermaid.setExecutionAuthorized(false);
    mermaid.assertStop();

    CatalogSummary catalog;
    mermaid.setCatalog(catalog);

    Serial.println("M3rMa1d S1r3n S3-CAM");
    Serial.println("STOP asserted");
    Serial.println("CODEX registered-capability mode; shell=OFF raw_cli=OFF");
    Serial.println("FLIPPER MermaidLink UART GPIO1/RX GPIO2/TX 230400 8N1");
    Serial.println("OV3660 camera init BLOCKED until exact GOOUUU V1.5 camera pin map is physically verified");
    printStatus();
}

void loop() {
    mermaid.poll();
    expireLeaseIfNeeded();
    heartbeat();

    if(Serial.available()) {
        String line = Serial.readStringUntil('\n');
        handleConsoleLine(line);
    }
    delay(2);
}
