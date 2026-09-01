# Embedded firmware release boundary

No embedded firmware image is published from this directory yet.

The earlier ESP32-S3, CYD, camera, and ESP32-C3 source files were incomplete scaffolds and were removed from the production branch. The actual hardware uses three ESP32-C5 SuperMini nodes, not an ESP32-C3 Sentinel, and the CYD must implement the official Flipper Expansion UART/RPC protocol rather than a free-form CLI bridge.

Production firmware must be implemented and accepted as six separate ESP-IDF images:

```text
core-s3
vision-s3-ov3660
c5-guardian
c5-watcher
c5-arbiter
deck-cyd
```

Each image must include secure provisioning, unique node identity, authenticated control-plane messages, bounded parsers, watchdog and brownout behavior, fail-closed STOP semantics, signed build metadata, and reproducible build instructions. The Deck image additionally owns the only Flipper electrical path and must implement Expansion protocol framing, RPC lifecycle, protobuf messages, artifact verification, touchscreen approval, and STOP.

No file in this directory should be flashed until it has a real implementation, a pinned toolchain, a successful clean build, and physical test evidence recorded in `../PRODUCTION_READINESS.md`.
