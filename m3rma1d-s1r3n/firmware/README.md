# M3rMa1d S1r3n firmware boundary

This directory now contains the first Flipper-side **user-test candidate** for **M3rMa1d S1r3n** under:

```text
flipper-m3rma1d-s1r3n/
```

That component is a Flipper Application Package (FAP), not a replacement Flipper system-firmware image. It provides the operator-visible M3rMa1d S1r3n state/control surface and is built with the official uFBT toolchain in CI.

The appliance still requires six separate embedded controller images before the complete Codex/ADL hardware system can be called user-ready:

```text
core-s3
vision-s3-ov3660
c5-guardian
c5-watcher
c5-arbiter
deck-cyd
```

The older ESP32-S3/CYD/camera scaffolds and ESP32-C3 Sentinel source were removed because they were not production implementations. The physical system uses three ESP32-C5 SuperMini safety nodes, and the CYD Deck owns the only electrical Flipper bridge. The Deck must use the official Flipper Expansion UART/RPC protocol instead of a free-form CLI bridge.

Each controller image must include secure provisioning, unique node identity, authenticated control-plane messages, bounded parsers, watchdog/brownout behavior, fail-closed STOP semantics, signed build metadata, and reproducible build instructions. The Deck additionally requires Expansion framing/RPC lifecycle, artifact verification, touchscreen approval, and STOP handling.

## User-test candidate

The current FAP identity is:

```text
Name: M3rMa1d S1r3n
App ID: m3rma1d_s1r3n
Version: 0.1.0-ut
Category: Tools
```

See `flipper-m3rma1d-s1r3n/USER_TESTING.md` for build, install, and acceptance steps.

A successful FAP build or Flipper UI test does **not** satisfy the complete appliance release gate. The authoritative hardware and security acceptance status remains in `../PRODUCTION_READINESS.md`; physical tests must not be marked PASS until actually performed on the assembled system.
