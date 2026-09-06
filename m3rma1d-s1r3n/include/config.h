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
constexpr uint16_t HTTP_PORT = 80;
constexpr uint32_t HEARTBEAT_MS = 500;
constexpr uint32_t FLIPPER_STALE_MS = 3000;
}
