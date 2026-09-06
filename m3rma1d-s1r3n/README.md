# M3rMa1d S1r3n

**918 Technologies — single ESP32-S3 N16R8 CAM + Flipper Zero + Codex/ADL point-and-click automation.**

M3rMa1d S1r3n is now a single-ESP32 hardware build. The only ESP board is the **GOOUUU ESP32-S3-CAM V1.5 / ESP32-S3-WROOM-1 N16R8** (16 MB flash, 8 MB octal PSRAM). It owns the camera, local web dashboard, Flipper UART bridge, STOP state, telemetry, and the hardware side of Codex tool execution. There is no CYD, second S3, C3/C5 safety node, or alternate hardware route.

Codex itself runs in the companion `codex/` service rather than trying to run a GPT-class model inside the ESP32. The S3 serves the point-and-click interface and acts as Codex's physical Flipper tool. When a Flipper application first appears in inventory, the Codex service discovers its functions, generates typed ADL adapters, stages them, and machine-verifies eligible observe/local-state adapters on the connected device. Higher-impact actions remain explicit user point-and-click approvals.

## Repository layout

```text
m3rma1d-s1r3n/
├── src/
│   ├── main.cpp
│   ├── codex_autonomous.cpp
│   ├── camera_handler.cpp
│   ├── web_ui.cpp
│   └── flipper_bridge.cpp
├── include/
│   ├── config.h
│   ├── codex_autonomous.h
│   ├── camera_handler.h
│   ├── web_ui.h
│   └── flipper_bridge.h
├── data/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── adl/                 # ADL schema, resolver and fixed hardware route
├── codex/               # Codex planner, adapter generator, watcher, audit and API
├── platformio.ini
├── partitions.csv
└── README.md
```

## What point-and-click means

1. Power the S3-CAM and connect the Flipper UART: **S3 GPIO1 RX <- Flipper pin 13 TX**, **S3 GPIO2 TX -> Flipper pin 14 RX**, and **GND <-> GND**. Do not join the 5 V or 3.3 V power rails.
2. Flash the ESP32 firmware and LittleFS UI.
3. Open the S3 dashboard. The default setup AP is `M3rMa1d_S1r3n`; change the default AP password before deployment.
4. Enter the Codex service URL/token once in the dashboard and click **Connect + sync apps**.
5. Installed Flipper apps appear as cards. Functions with verified adapters appear as buttons. Clicking one asks Codex to plan the exact ADL run, resolve required scripts/libraries/frequency profiles, and execute it through the single S3-CAM route.
6. If an action needs physical output or transmission, the dashboard surfaces a pending approval. The user's **Approve** click is the per-job approval; it is not reusable for another job.

The goal is broad Flipper usability through **typed app/function adapters**, not an unrestricted remote shell. This lets Codex use installed Flipper apps as tools while retaining job correlation, STOP, audit, asset/region declarations, adapter verification, and explicit confirmation for higher-impact output.

## Automatic adapter creation on app install

`codex/src/app-watcher.mjs` checks Flipper inventory every five seconds by default (`S1R3N_APP_WATCH_MS` overrides it). A newly installed app triggers:

```text
Flipper inventory
   -> Codex capability discovery
   -> ADL adapter generation
   -> schema/risk validation
   -> staged content-addressed adapter
   -> closed-loop device test when eligible
   -> machine_verified adapter
   -> point-and-click function button
```

Observe/local-state adapters may be auto-activated only after a real connected-device proof reports observed success. Physical-output/transmit adapters stay user-approved and remain subject to the ADL asset/region/frequency policy. Restricted functions are not promoted.

## Camera

The GOOUUU board family documents the camera signals as matching the ESP32-S3-EYE map. This build therefore uses XCLK15, SIOD4, SIOC5, VSYNC6, HREF7, PCLK13, and D0..D7 = 11,9,8,10,12,18,17,16. The camera uses PSRAM-backed JPEG frame buffers and is exposed at `/api/camera.jpg` for visual verification.

## Build and flash

```bash
cd m3rma1d-s1r3n
pio run
pio run -t upload
pio run -t uploadfs
pio device monitor
```

`platformio.ini` is locked to 16 MB flash + 8 MB OPI PSRAM and uses a 16 MB partition table with OTA slots plus LittleFS.

## Codex service

The model/API key stays on the host, not in ESP32 flash. Configure the companion service with at least:

```text
OPENAI_API_KEY=...
S1R3N_API_TOKEN=<32+ random chars>
S1R3N_CONTROL_KEY=<32+ random chars>
S1R3N_CORE_URL=http://<s3-ip>
S1R3N_ALLOW_INSECURE_LOCAL_HTTP=true   # controlled private LAN commissioning only
S1R3N_VISION_URL=http://<s3-ip>/api/camera.jpg
```

Then start it from `m3rma1d-s1r3n/codex` with `npm start`.

## Current hardware truth

The repository is configured for the single N16R8 CAM topology and the verified GOOUUU/ESP32-S3-EYE camera signal map. Software builds and static tests are separate from physical acceptance. Do not mark camera, UART, Flipper app execution, RF/IR output, or closed-loop adapter proof **PASS** until those checks have actually run on the assembled hardware.
