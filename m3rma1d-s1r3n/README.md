# M3rMa1d S1r3n

M3rMa1d S1r3n is the 918 Technologies Codex/ADL control system for an operator-owned Flipper Zero.

## Hardware inventory

- 1 x GOOUUU ESP32-S3-CAM V1.5 N16R8 Core, camera removed
- 1 x GOOUUU ESP32-S3-CAM V1.5 N16R8 Vision node with OV3660
- 3 x ESP32-C5 SuperMini safety nodes
- 1 x ESP32-32E N4 CYD Deck, 2.8 inch ILI9341/XPT2046 touchscreen
- 1 x Flipper Zero

## Non-negotiable physical boundary

The **CYD Deck is the sole electrical connection to the Flipper GPIO header**. The production route is:

```text
Codex host -> signed Core request -> three-C5 safety quorum -> CYD Deck -> Flipper Expansion UART/RPC
```

The Core, Vision node, and C5 nodes have no direct Flipper GPIO route. `fallback_physical_route` is permanently `false`.

CYD/Flipper wiring:

```text
CYD GPIO27 UART2 TX -> Flipper pin 14 RX
CYD GPIO22 UART2 RX <- Flipper pin 13 TX
CYD GND              <-> Flipper pin 18 GND
```

Power the CYD and Flipper independently. Do not join their 3.3 V or 5 V outputs.

## Production host control plane

The `codex/` service provides:

- OpenAI Responses API structured planning into ADL 2.0;
- deterministic authorization and route validation;
- content-addressed typed Flipper adapters;
- official Flipper Expansion RPC operation materialization;
- SHA-256 artifact verification and signed chunk transfer;
- HMAC-SHA256 Core request and response authentication;
- nonce, timestamp, route, STOP, Deck, Flipper, and C5 readiness checks;
- operator-evidence promotion for generated adapters and scripts;
- owned-asset frequency profiles for future verified transmit adapters;
- tamper-evident hash-chained audit records;
- a real-hardware contract test for Core, all three C5 nodes, CYD, and Flipper.

There is no mock Core, simulated Flipper transport, dry-run execution path, console approval substitute, raw CLI adapter, or arbitrary command field in the production runtime.

## Execution policy

Codex may plan and generate candidate declarative logic, but generated adapters and scripts are stored as `staged_pending_review`. They cannot execute until an identified operator promotes the exact SHA-256 and supplies the SHA-256 of physical test evidence. Generated adapter execution also defaults to disabled.

Bundled adapters currently cover only operations represented by the official Flipper RPC service catalog: system information, storage information/list/stat, app start/exit/load-file, GUI input, GPIO read, property read, and approved artifact staging.

## Release status

The host control plane is a **production candidate**, not a released appliance. Deterministic CI and the real-hardware contract are separate gates. The project must not be merged or tagged as user-ready until:

1. deterministic GitHub Actions gates pass on the final commit;
2. production firmware exists for Core, Vision, all three ESP32-C5 nodes, and CYD;
3. all firmware builds are reproducible from pinned toolchains;
4. the real-hardware contract passes on the assembled system;
5. touchscreen STOP/approval, UART electrical behavior, Expansion RPC, camera capture, C5 quorum loss, replay rejection, and power-failure behavior are physically recorded as PASS.

See `PRODUCTION_READINESS.md`, `docs/WIRING.md`, and `codex/README.md`.
