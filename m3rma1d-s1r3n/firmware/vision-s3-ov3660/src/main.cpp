#include <Arduino.h>

namespace {
constexpr uint32_t HEARTBEAT_MS = 500;
uint32_t last_heartbeat = 0;
bool stop_asserted = true;

void printStatus() {
    Serial.printf("M3rMa1d S1r3n Vision status stop=%s camera=BLOCKED pinmap=UNVERIFIED\n",
                  stop_asserted ? "ASSERTED" : "CLEAR");
}
}

void setup() {
    Serial.begin(115200);
    delay(100);
    stop_asserted = true;
    Serial.println("M3rMa1d S1r3n Vision");
    Serial.println("STOP asserted");
    Serial.println("OV3660 camera init BLOCKED: GOOUUU V1.5 internal camera pin map is not verified");
    printStatus();
}

void loop() {
    const uint32_t now = millis();
    if(now - last_heartbeat >= HEARTBEAT_MS) {
        last_heartbeat = now;
        Serial.printf("VISION_HEARTBEAT %lu STOP=%u\n", static_cast<unsigned long>(now), stop_asserted ? 1U : 0U);
    }

    if(Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if(line.equalsIgnoreCase("STOP")) {
            stop_asserted = true;
            Serial.println("STOP asserted");
        } else if(line.equalsIgnoreCase("status") || line.equalsIgnoreCase("device_info")) {
            printStatus();
        } else if(line.length()) {
            Serial.println("DENY unsupported command");
        }
    }
    delay(2);
}
