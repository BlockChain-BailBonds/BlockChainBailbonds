# M3rMa1d S1r3n

Integrated Codex/ADL automation stack for:

- 1 x GOOUUU ESP32-S3-CAM V1.5 N16R8 Core, camera removed
- 1 x GOOUUU ESP32-S3-CAM V1.5 N16R8 Vision with OV3660
- 3 x ESP32-C5 SuperMini control-plane nodes
- 1 x ESP32-32E N4 CYD Deck, 2.8 in ILI9341/XPT2046 touchscreen
- 1 x Flipper Zero

## Physical boundary

The **CYD Deck is the only device electrically connected to the Flipper GPIO header**. It uses UART2 mapped to CYD GPIO22/GPIO27. Core, Vision, and all three C5 nodes communicate with the Deck through the authenticated control plane and have no direct Flipper GPIO path.

## Authority boundary

Codex produces ADL intent. The gateway resolves app adapters, scripts, pinned libraries, and region/asset frequency profiles. Core applies run policy, the CYD presents required approvals and STOP, and only the CYD bridge translates an approved operation into the Flipper-facing adapter command. No physical fallback route is permitted.

## Verified host-side

- CRC32 standard vector
- capability allowlist
- raw-shell denial
- approval requirement
- E-STOP/stale-health simulation
- CYD-only Flipper routing policy static test

## Not yet physically verified

Actual display/touch, OV3660 camera, C5 control-plane transport, CYD-to-Flipper UART, STOP timing, and end-to-end ADL runs require the assembled hardware. Follow `docs/WIRING.md` and record unperformed hardware checks as `NOT TESTED`.
