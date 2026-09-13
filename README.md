# M3rMa1d S1r3n — 918 Technologies

This repository's active hardware project is **M3rMa1d S1r3n**, a point-and-click Codex/ADL automation platform using exactly one **ESP32-S3 N16R8 CAM** as the hardware controller for a Flipper Zero.

The active implementation lives in [`m3rma1d-s1r3n/`](m3rma1d-s1r3n/). It consolidates camera, web UI, Flipper bridge, STOP/telemetry and hardware orchestration onto the single S3-CAM. Codex runs as the companion host service and treats the Flipper as a typed tool: installed apps are inventoried, new apps trigger adapter generation, eligible adapters are device-tested, and verified functions are surfaced as point-and-click actions.

No CYD, second ESP32-S3, C3/C5 node, or fallback ESP hardware route is part of the active M3rMa1d S1r3n architecture.

See [`m3rma1d-s1r3n/README.md`](m3rma1d-s1r3n/README.md) for wiring, flashing, Codex configuration, ADL behavior, and the point-and-click workflow.
