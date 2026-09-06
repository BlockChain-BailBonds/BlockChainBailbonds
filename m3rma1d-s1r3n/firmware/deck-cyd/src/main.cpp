#include <Arduino.h>

namespace {
constexpr uint32_t HEARTBEAT_MS = 500;
uint32_t last_heartbeat = 0;
bool stop_asserted = true;
bool approval_pending = false;

void printStatus() {
    Serial.printf("M3rMa1d S1r3n Deck status stop=%s approval=%s touch=BLOCKED display=BLOCKED\n",
                  stop_asserted ? "ASSERTED" : "CLEAR",
                  approval_pending ? "PENDING" : "NONE");
}
}

void setup() {
    Serial.begin(115200);
    delay(100);
    stop_asserted = true;
    Serial.println("M3rMa1d S1r3n Deck");
    Serial.println("STOP asserted");
    Serial.println("CYD display/touch init BLOCKED until exact board revision GPIO map is verified");
    printStatus();
}

void loop() {
    const uint32_t now = millis();
    if(now - last_heartbeat >= HEARTBEAT_MS) {
        last_heartbeat = now;
        Serial.printf("DECK_HEARTBEAT %lu STOP=%u\n", static_cast<unsigned long>(now), stop_asserted ? 1U : 0U);
    }

    if(Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if(line.equalsIgnoreCase("STOP")) {
            stop_asserted = true;
            approval_pending = false;
            Serial.println("STOP asserted");
        } else if(line.equalsIgnoreCase("status") || line.equalsIgnoreCase("device_info")) {
            printStatus();
        } else if(line.equalsIgnoreCase("approve")) {
            Serial.println("DENY approval unavailable until touch UI is verified");
        } else if(line.length()) {
            Serial.println("DENY unsupported command");
        }
    }
    delay(2);
}
