# M3rMa1d S1r3n wiring

All logic/UART is 3.3 V. Common ground for wired devices. Power major boards from regulated USB/5 V supplies; never power another board from a GPIO.

## Core ESP32-S3 N16R8
- GPIO17 TX -> Flipper pin 14 RX
- GPIO18 RX <- Flipper pin 13 TX
- GND <-> Flipper pin 18 GND
- GPIO4 <- Sentinel GPIO5 ENABLE (active HIGH; use 10 kOhm pulldown at Core)
- GPIO5 -> Sentinel GPIO4 HEARTBEAT

## Vision ESP32-S3 N16R8 CAM
Camera pinouts vary by manufacturer. Firmware intentionally requires an explicit camera profile rather than guessing. Core transport is ESP-NOW/Wi-Fi.

## Deck ESP32-WROOM-32E CYD 2.8
Common ESP32-2432S028R profile: TFT MOSI13/MISO12/SCK14/CS15/DC2/BL21; XPT2046 touch MOSI32/MISO39/SCK25/CS33/IRQ36. Clones vary: verify board/controller before power and override profile when necessary.

## Sentinel ESP32-C3 SuperMini
- GPIO4 <- Core GPIO5 heartbeat
- GPIO5 -> Core GPIO4 ENABLE
- GPIO6 <- physical E-STOP, active LOW, INPUT_PULLUP
- GPIO7 -> fault LED
ENABLE defaults LOW at reset and falls LOW on stale Core heartbeat or E-STOP.

## Flipper Zero
- pin 13 TX -> Core GPIO18 RX
- pin 14 RX <- Core GPIO17 TX
- pin 18 GND <-> Core GND
3.3 V UART only. Adapter exposes named capabilities, never arbitrary shell execution.

## Physical acceptance tests
1. With power off, continuity-check all grounds and confirm no 5 V is connected to a 3.3 V signal.
2. Boot Sentinel alone: ENABLE must remain LOW until a valid Core heartbeat is present.
3. Press E-STOP: ENABLE must fall LOW immediately and Core must reject a job.
4. UART loopback Core TX/RX, then connect Flipper and verify `device_info` response.
5. CYD: verify display, touch coordinates, approval/reject, and STOP before enabling jobs.
6. Vision: verify exact camera profile, one captured frame, then VisionEvent delivery.
7. Remove Core heartbeat wire: Sentinel must revoke ENABLE within 2 seconds.
