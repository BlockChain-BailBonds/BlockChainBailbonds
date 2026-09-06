# M3rMa1d S1r3n — Flipper + single ESP32-S3 N16R8 CAM

This is the reduced two-device user-test build:

`Codex host <-> ESP32-S3 N16R8 CAM <-> Flipper Zero`

The S3 combines the former Core/Vision/Deck roles. The three C5 nodes and CYD are not required by this profile.

## Wiring

- S3 GPIO1 (TX) -> Flipper GPIO pin 14 (RX)
- S3 GPIO2 (RX) <- Flipper GPIO pin 13 (TX)
- S3 GND <-> Flipper GPIO pin 18 (GND)
- Power the S3 independently. Do not tie 3.3V/5V rails together.

## User-test behavior

- Boots fail-closed in STOPPED state.
- Initializes OV3660-compatible camera through Espressif `esp32-camera`.
- Negotiates the official Flipper Expansion UART/RPC transport.
- Creates WPA2 AP `M3rMa1d-S1r3n` with user-test password `M3rMa1d918`.
- `GET /health` returns S3/camera/Flipper readiness.
- `GET /snapshot.jpg` captures a JPEG.
- `POST /stop` asserts STOP and closes the RPC session.
- `POST /ready` only clears STOP when both camera and Flipper link are ready.

The AP password is intentionally a user-test credential, not a production secret. Production promotion requires first-boot credential provisioning and TLS/authenticated control requests.

## Camera mapping gate

The GOOUUU V1.5 camera map is the current community-documented mapping and has not yet been physically verified on the exact board. Build success is not proof of camera wiring correctness. A failed camera initialization leaves the appliance unable to enter READY.

## Build

ESP-IDF 5.5 / target `esp32s3`.

```sh
idf.py set-target esp32s3
idf.py build
```

The GitHub workflow publishes a ZIP containing the application, bootloader, partition table, flash arguments, ELF, and SHA-256 manifest.
