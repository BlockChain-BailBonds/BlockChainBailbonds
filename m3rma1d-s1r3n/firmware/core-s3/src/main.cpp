#include <Arduino.h>

#include "mermaid_link_core.hpp"

using s1r3n::core::CatalogSummary;
using s1r3n::core::MermaidLinkCore;

namespace {
HardwareSerial MermaidSerial(1);

constexpr int MERMAID_RX_PIN = 18;
constexpr int MERMAID_TX_PIN = 17;
constexpr int CORE_HEARTBEAT_OUT_PIN = 4;
constexpr int SAFETY_ENABLE_IN_PIN = 5;
constexpr uint32_t HEARTBEAT_TOGGLE_MS = 250;
constexpr uint32_t SAFETY_STALE_MS = 1500;

MermaidLinkCore mermaid(MermaidSerial, MERMAID_RX_PIN, MERMAID_TX_PIN);

uint32_t last_heartbeat_toggle = 0;
uint32_t last_safety_edge = 0;
bool heartbeat_level = false;
bool last_safety_level = false;
bool safety_seen = false;

void updateHeartbeat() {
    const uint32_t now = millis();
    if(now - last_heartbeat_toggle >= HEARTBEAT_TOGGLE_MS) {
        last_heartbeat_toggle = now;
        heartbeat_level = !heartbeat_level;
        digitalWrite(CORE_HEARTBEAT_OUT_PIN, heartbeat_level ? HIGH : LOW);
    }
}

bool safetyInterlockHealthy() {
    const uint32_t now = millis();
    const bool level = digitalRead(SAFETY_ENABLE_IN_PIN) == HIGH;
    if(level != last_safety_level) {
        last_safety_level = level;
        last_safety_edge = now;
        safety_seen = true;
    }

    if(!level) return false;
    if(!safety_seen) return false;
    return (now - last_safety_edge) < SAFETY_STALE_MS;
}

void refreshAuthorization() {
    const bool safety_ok = safetyInterlockHealthy();
    mermaid.setExecutionAuthorized(safety_ok);
    if(!safety_ok) mermaid.assertStop();
}
} // namespace

void setup() {
    Serial.begin(115200);
    delay(50);

    pinMode(CORE_HEARTBEAT_OUT_PIN, OUTPUT);
    digitalWrite(CORE_HEARTBEAT_OUT_PIN, LOW);
    pinMode(SAFETY_ENABLE_IN_PIN, INPUT_PULLDOWN);

    mermaid.begin();
    mermaid.setCodexLinked(false);
    mermaid.setCameraReady(false);
    mermaid.setApprovalPending(false);
    mermaid.setExecutionAuthorized(false);
    mermaid.assertStop();

    const CatalogSummary catalog = {
        .total = 0,
        .ready = 0,
        .needs_adapter = 0,
        .blocked = 0,
    };
    mermaid.setCatalog(catalog);

    Serial.println("M3rMa1d S1r3n Core: MermaidLink v2 ready; STOP asserted");
}

void loop() {
    updateHeartbeat();
    refreshAuthorization();
    mermaid.poll();
    delay(2);
}
