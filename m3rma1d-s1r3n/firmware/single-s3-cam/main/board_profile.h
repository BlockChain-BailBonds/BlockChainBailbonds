#pragma once
// GOOUUU ESP32-S3-CAM V1.5 N16R8 user-test profile.
// Camera map follows the current community-documented V1.5 mapping and MUST be
// physically verified on the exact board before production promotion.
#define CAM_PIN_PWDN   -1
#define CAM_PIN_RESET  -1
#define CAM_PIN_XCLK   15
#define CAM_PIN_SIOD    4
#define CAM_PIN_SIOC    5
#define CAM_PIN_D0     11
#define CAM_PIN_D1      9
#define CAM_PIN_D2      8
#define CAM_PIN_D3     10
#define CAM_PIN_D4     12
#define CAM_PIN_D5     18
#define CAM_PIN_D6     17
#define CAM_PIN_D7     16
#define CAM_PIN_VSYNC   6
#define CAM_PIN_HREF    7
#define CAM_PIN_PCLK   13
// Dedicated Flipper link: avoid the board's TX0/RX0 USB/programming path.
#define FLIPPER_UART_TX 1
#define FLIPPER_UART_RX 2
