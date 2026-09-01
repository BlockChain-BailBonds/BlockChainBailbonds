# M3rMa1d S1r3n

Integrated Codex/ADL automation stack for:

- 1 x GOOUUU ESP32-S3-CAM V1.5 N16R8 Core, camera removed
- 1 x GOOUUU ESP32-S3-CAM V1.5 N16R8 Vision with OV3660
- 3 x ESP32-C5 SuperMini control-plane nodes
- 1 x ESP32-32E N4 CYD Deck, 2.8 in ILI9341/XPT2046 touchscreen
- 1 x Flipper Zero

## Physical boundary

The **CYD Deck is the only device electrically connected to the Flipper GPIO header**. It uses UART2 mapped to CYD GPIO22/GPIO27. Core, Vision, and all three C5 nodes communicate with the Deck through the authenticated control plane and have no direct Flipper GPIO path.

## Codex implementation

The complete host-side implementation is under `codex/`. It provides:

- OpenAI Responses API Structured Output planning;
- ADL 2.0 validation and execution;
- dynamic typed adapters for installed apps;
- declarative script generation;
- pinned library and artifact resolution;
- owned-asset frequency profiles;
- Deck approvals, STOP, audit, CLI, HTTP API, Vision verification, and dry-run tests.

Start with:

```bash
cd codex
npm test
npm run check
node src/cli.mjs preview --file examples/read-only-run.json
```

## Authority boundary

Codex produces ADL intent. The host resolves app adapters, declarative scripts, pinned libraries, and region/asset frequency profiles. Core applies run policy, the CYD presents required approvals and STOP, and only the CYD bridge translates an approved typed operation into the Flipper-facing adapter protocol. No physical fallback route is permitted.

“Any app or function” is implemented through discovery plus a typed adapter registry. Unsupported functions may receive a generated declarative adapter, but model text is never forwarded as shell or raw CLI.

## Verified host-side

- CRC32 standard vector
- capability allowlist and raw-shell denial
- approval requirement
- E-STOP/stale-health simulation
- CYD-only Flipper routing policy static test
- Codex Structured Output request formation
- adapter validation and artifact hashing
- asset-gated frequency resolution
- signed Core transport envelope
- audit hash-chain verification
- end-to-end Deck-only dry-run execution

## Not yet physically verified

Actual display/touch, OV3660 camera, C5 control-plane transport, Core HTTP/control-plane receiver, CYD-to-Flipper UART, STOP timing, generated app adapters, and end-to-end physical ADL runs require the assembled hardware. Follow `docs/WIRING.md` and record unperformed hardware checks as `NOT TESTED`.
