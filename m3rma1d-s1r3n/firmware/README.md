# M3rMa1d S1r3n firmware boundary

The active appliance contains exactly two embedded targets:

```text
s3-cam/
flipper-m3rma1d-s1r3n/
```

## S3-CAM

`firmware/s3-cam/` is the unified GOOUUU ESP32-S3-CAM V1.5 N16R8 companion firmware. It replaces the obsolete separate Core, Vision, C5, and CYD targets.

Current hard routing contract:

```text
S3 GPIO2 TX -> Flipper pin14 RX
S3 GPIO1 RX <- Flipper pin13 TX
S3 GND      <-> Flipper GND
```

The boards are independently powered; do not join their 3.3 V or 5 V outputs.

The S3 firmware boots fail-closed with STOP asserted, exposes only read-only diagnostic commands plus STOP on the unauthenticated debug console, uses MermaidLink at 230400 8N1, and contains the bounded numeric ActionRequest/ActionResult transport needed by the Codex capability layer. Production execution authorization must come from the authenticated Codex control plane and an active lease, never from the debug console.

The OV3660 camera remains fail-closed until the exact GOOUUU V1.5 internal camera pin map is physically verified. GPIO1/GPIO2 were selected for the Flipper UART to avoid the documented candidate camera signal set, but the final board wiring still requires physical verification.

## Flipper Zero

`firmware/flipper-m3rma1d-s1r3n/` contains the Mermaid control application and MermaidLink endpoint. The final product firmware is Momentum-derived: Momentum apps/resources/themes are preserved and Mermaid apps/themes/resources are added on top.

The target closed loop is:

```text
user click / intent
  -> Codex planner
  -> ADL typed capability
  -> verified adapter
  -> authenticated S3-CAM lease
  -> MermaidLink numeric ActionRequest
  -> registered Flipper capability
  -> ActionResult
  -> before/after observation + evidence hash
  -> Codex result / retry / quarantine
```

Codex does not receive a raw shell or unrestricted CLI. Unknown capability IDs fail closed. STOP preempts execution. Higher-risk physical/transmit operations remain policy-, asset-, region-, frequency-, and approval-gated.

## User-test release gate

A successful compile is not enough. User-test readiness requires reproducible S3 and Flipper builds, signed/hash-bound release manifests, real S3-CAM-to-Flipper UART verification, live inventory, a known safe action, autonomous learning of one newly installed FAP, STOP/replay/timeout/cable-loss/reboot tests, and an exported Hardware Lab proof bundle.

See `../PRODUCTION_READINESS.md`, `../docs/MOMENTUM_BASELINE.md`, and `flipper-m3rma1d-s1r3n/USER_TESTING.md`.
