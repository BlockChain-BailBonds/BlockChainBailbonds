# M3rMa1d S1r3n wiring

## Fixed topology rule

**Only the ESP32-32E N4 CYD Deck connects electrically to the Flipper Zero GPIO header.**

The Core S3, Vision S3, and all three ESP32-C5 SuperMini nodes must not be wired to any Flipper GPIO, UART, power, SWD, SPI, or I2C pin. They communicate with the Deck through the authenticated S1r3n wireless/control-plane transport.

All signal logic is 3.3 V. Power the CYD and Flipper independently from appropriate USB supplies. Never power either device through a signal pin, and do not join their 5 V or 3.3 V supply outputs. The only required shared electrical reference is GND.

## CYD Deck -> Flipper Zero

Use the CYD **CN1** expansion connector and map ESP32 UART2 through the GPIO matrix. This keeps the CYD P1/UART0 connector available for flashing and USB serial diagnostics.

| CYD Deck | Direction | Flipper Zero GPIO |
|---|---:|---|
| CN1 GPIO27 / UART2 TX | -> | pin 14 UART RX |
| CN1 GPIO22 / UART2 RX | <- | pin 13 UART TX |
| CN1 GND | <-> | pin 18 GND |
| CN1 3V3 | not connected | no connection |

Firmware settings:

```text
UART port: 2
Baud: 230400
Format: 8-N-1
CYD RX: GPIO22
CYD TX: GPIO27
```

Cross TX to RX and RX to TX. Confirm continuity with power removed before connecting either USB supply.

## CYD resources reserved by the board

- TFT: MOSI13, MISO12, SCLK14, CS15, DC2, backlight21
- XPT2046 touch: CS33, IRQ36, with its board SPI wiring
- UART0/programming: GPIO1 TX0 and GPIO3 RX0
- Flipper UART2: GPIO27 TX and GPIO22 RX

Do not use the P1 5 V pin to power the Flipper. Do not use Flipper pin 1 or pin 9 to power the CYD.

## Other devices

### Core — GOOUUU ESP32-S3-CAM V1.5 N16R8, camera removed

No electrical connection to the Flipper. It runs Codex/ADL orchestration, policy, catalog resolution, audit coordination, and routes approved jobs to the CYD Deck.

### Vision — GOOUUU ESP32-S3-CAM V1.5 N16R8 + OV3660

No electrical connection to the Flipper. It supplies camera/vision events to the control plane.

### ESP32-C5 SuperMini nodes x3

No electrical connection to the Flipper. Their exact roles and board pin profile are maintained separately; they join the S1r3n control plane only.

## Physical acceptance tests

1. With all power removed, verify CYD GND to Flipper pin 18 continuity.
2. Confirm no continuity from CYD CN1 3V3 to any Flipper pin.
3. Confirm CYD GPIO27 reaches only Flipper pin 14 and CYD GPIO22 reaches only Flipper pin 13.
4. Flash the CYD before connecting the three Flipper wires.
5. Power both devices independently and run a UART loopback test on CYD GPIO22/GPIO27 before attaching the Flipper.
6. Attach the Flipper and verify only read-only commands first: `help`, `device_info`, `storage_info`, and `loader list`.
7. Remove the CYD-to-Flipper UART wires and verify Core reports the Deck bridge offline rather than attempting another physical path.
8. Verify STOP on the Deck prevents all later ADL steps from reaching the Flipper.
9. Verify the Core, Vision, and three C5 nodes have no electrical connection to the Flipper GPIO header.

Physical tests remain `NOT TESTED` until run on the actual assembled hardware.
