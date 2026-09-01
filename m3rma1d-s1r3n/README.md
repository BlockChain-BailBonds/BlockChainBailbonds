# M3rMa1d S1r3n
Integrated embedded control stack for ESP32-S3 N16R8 Core, ESP32-S3 camera Vision, ESP32-WROOM-32E CYD Deck, ESP32-C3 SuperMini Sentinel, and Flipper Zero over 3.3 V UART.

Safety model: named capabilities only; no raw CLI job; Sentinel is an independent fail-closed interlock; IR transmission requires approval.

## Verified host-side
- CRC32 standard vector
- capability allowlist
- raw-shell denial
- approval requirement
- E-STOP interlock
- stale-heartbeat interlock

## Not yet physically verified
Actual attached-device display/touch, camera, UART/Flipper, E-STOP timing and ESP-NOW tests require the hardware. Follow `docs/WIRING.md` acceptance tests before treating a board as verified.
