#include <Arduino.h>
#include "esp_camera.h"
#ifndef S1R3N_CAMERA_PROFILE
#error "Define S1R3N_CAMERA_PROFILE for the exact ESP32-S3 camera board; camera pin guessing is disabled."
#endif
void setup(){Serial.begin(115200);Serial.println("M3rMa1d S1r3n Vision: board-specific camera profile required; publish VisionEvent via ESP-NOW/Wi-Fi");}
void loop(){delay(1000);}
