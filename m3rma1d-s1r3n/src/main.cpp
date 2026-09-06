#include <Arduino.h>
#include <WiFi.h>
#include "camera_handler.h"
#include "codex_autonomous.h"
#include "config.h"
#include "flipper_bridge.h"
#include "web_ui.h"

using namespace m3rma1d;

HardwareSerial FlipperSerial(1);
FlipperBridge flipper(FlipperSerial);
CodexAutonomous codex(flipper);
WebUi web(codex, flipper);
uint32_t lastHeartbeat = 0;

void setup() {
    Serial.begin(115200);
    delay(100);
    Serial.printf("%s | %s\n", PRODUCT, BUILD);
    Serial.printf("PSRAM: %s, size=%u\n", psramFound() ? "READY" : "MISSING", ESP.getPsramSize());

    flipper.begin();
    codex.begin();
    const bool cam = camera_begin();
    const bool ui = web.begin();

    Serial.printf("CAMERA=%s WEB_UI=%s AP=%s IP=%s\n",
        cam ? "READY" : "FAULT",
        ui ? "READY" : "FAULT",
        AP_SSID,
        WiFi.softAPIP().toString().c_str());
    Serial.println("M3rMa1d S1r3n point-and-click control ready; STOP starts asserted.");
}

void loop() {
    codex.poll();
    web.poll();
    const uint32_t now = millis();
    if(now - lastHeartbeat >= HEARTBEAT_MS) {
        lastHeartbeat = now;
        Serial.printf("S1R3N HB flipper=%u camera=%u stop=%u heap=%u psram=%u\n",
            flipper.linked() ? 1U : 0U,
            camera_ready() ? 1U : 0U,
            flipper.stop_asserted() ? 1U : 0U,
            ESP.getFreeHeap(),
            ESP.getFreePsram());
    }
    delay(2);
}
