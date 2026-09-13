#pragma once

#include <Arduino.h>

namespace m3rma1d {
constexpr const char* PRODUCT = "M3rMa1d S1r3n";
constexpr const char* MACHINE_ID = "M3RMA1D_S1R3N";
constexpr const char* BUILD = "single-s3-n16r8-cam";

// GOOUUU ESP32-S3-CAM V1.5 N16R8. Camera routing follows the ESP32-S3-EYE
// signal map documented for this board family. GPIO1/GPIO2 remain free for
// the Flipper UART bridge.
constexpr int CAM_PWDN = -1;
constexpr int CAM_RESET = -1;
constexpr int CAM_XCLK = 15;
constexpr int CAM_SIOD = 4;
constexpr int CAM_SIOC = 5;
constexpr int CAM_D0 = 11;
constexpr int CAM_D1 = 9;
constexpr int CAM_D2 = 8;
constexpr int CAM_D3 = 10;
constexpr int CAM_D4 = 12;
constexpr int CAM_D5 = 18;
constexpr int CAM_D6 = 17;
constexpr int CAM_D7 = 16;
constexpr int CAM_VSYNC = 6;
constexpr int CAM_HREF = 7;
constexpr int CAM_PCLK = 13;

constexpr int FLIPPER_RX_GPIO = 1; // S3 RX <- Flipper pin 13 TX
constexpr int FLIPPER_TX_GPIO = 2; // S3 TX -> Flipper pin 14 RX
constexpr uint32_t FLIPPER_BAUD = 230400;

constexpr const char* AP_SSID = "M3rMa1d_S1r3n";
#ifndef M3RMA1D_AP_PASSWORD
#define M3RMA1D_AP_PASSWORD "M3rMa1d918!"
#endif
constexpr const char* AP_PASSWORD = M3RMA1D_AP_PASSWORD;

// The host-to-S3 HMAC key is intentionally empty in source control. Provision
// it as a build secret (M3RMA1D_CONTROL_KEY) with at least 32 random bytes.
#ifndef M3RMA1D_CONTROL_KEY
#define M3RMA1D_CONTROL_KEY ""
#endif
constexpr const char* CONTROL_KEY = M3RMA1D_CONTROL_KEY;
constexpr size_t CONTROL_KEY_MIN_LENGTH = 32;
constexpr uint32_t CONTROL_CLOCK_SKEW_MS = 30000;
constexpr uint32_t CONTROL_REPLAY_TTL_MS = 120000;
constexpr size_t CONTROL_MAX_REQUEST_BYTES = 32768;
constexpr uint32_t CONTROL_MAX_ARTIFACT_BYTES = 2U * 1024U * 1024U;
constexpr uint16_t CONTROL_ARTIFACT_CHUNK_BYTES = 4096;

constexpr uint16_t HTTP_PORT = 80;
constexpr uint32_t HEARTBEAT_MS = 500;
constexpr uint32_t FLIPPER_STALE_MS = 3000;
}
