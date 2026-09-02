# M3rMa1d S1r3n Codex Control Plane

This directory contains the host-side production candidate for planning, resolving, approving, signing, auditing, and executing ADL 2.0 jobs against an operator-owned Flipper Zero.

## Fixed route

```text
Codex host
  -> HMAC-authenticated Core ESP32-S3
  -> authenticated control plane and three-node ESP32-C5 safety quorum
  -> ESP32-32E N4 CYD Deck
  -> Flipper Expansion UART/RPC
  -> Flipper Zero
```

The CYD Deck is the sole physical Flipper bridge. Every request and response asserts:

```json
{
  "logical_target": "flipper",
  "physical_owner": "deck-cyd",
  "fallback_physical_route": false
}
```

## Runtime characteristics

The production runtime has no mock Core, no simulated Flipper, no dry-run transport, no console approval substitute, and no raw CLI operation. Previewing a run performs validation and materialization only; executing a run requires signed readiness from the real Core and its attached hardware.

The host service provides:

- OpenAI Responses API structured output planning;
- ADL 2.0 validation;
- authorization, expiration, route, and operation bounds;
- real Flipper inventory ingestion from Core/CYD;
- typed adapter and declarative script generation;
- quarantine of generated logic pending physical test evidence;
- immutable adapter, script, artifact, and library identities;
- signed chunked artifact transfer to Core;
- remote CYD approval leases;
- STOP assertion and controlled resume;
- three-C5 safety-quorum readiness checks;
- optional Vision capture and structured verification;
- tamper-evident hash-chained audit logging;
- CLI, authenticated HTTP API, deterministic tests, and real-hardware contract tests.

## Supported bundled Flipper operations

Bundled adapters map to official Flipper RPC concepts rather than free-form commands:

```text
system_device_info
system_power_info
storage_info
storage_list
storage_stat
app_start
app_exit
app_load_file
gui_input
gpio_read
property_get
artifact_stage
```

Application-specific functions must have a typed adapter. Codex may generate a candidate adapter or script, but the generated material is stored as `staged_pending_review` and is not executable. An operator must physically test it, preserve the test evidence, and promote the exact generated SHA-256 with the evidence SHA-256. Generated adapter execution is disabled by default even after promotion and must be explicitly enabled with `S1R3N_ALLOW_GENERATED_ADAPTER_EXECUTION=true`.

## Requirements

- Node.js 20.11 or newer; CI uses Node.js 24
- a real Core endpoint implementing the signed response contract
- a CYD Deck online and attested as `deck-cyd`
- a Flipper online through the CYD only
- all three ESP32-C5 safety nodes online and healthy
- an OpenAI API key
- independent API and control secrets
- production firmware and physical acceptance evidence

## Configuration

Copy the environment template and set real values. Placeholder values are rejected.

```bash
cd m3rma1d-s1r3n/codex
cp .env.example .env
```

Export the values through the process manager or shell. The service does not load `.env` files automatically.

Required:

```text
OPENAI_API_KEY
S1R3N_API_TOKEN          at least 32 characters
S1R3N_CORE_URL           HTTPS by default
S1R3N_CONTROL_KEY        at least 32 characters
```

Optional:

```text
OPENAI_MODEL
S1R3N_STATE_DIR
S1R3N_REGION_PROFILE
S1R3N_VISION_URL
S1R3N_ALLOW_NETWORK_ARTIFACTS
S1R3N_ALLOW_GENERATED_ADAPTER_EXECUTION
S1R3N_ALLOW_INSECURE_LOCAL_HTTP
```

`S1R3N_ALLOW_INSECURE_LOCAL_HTTP=true` is accepted only for private or local addresses and exists for controlled commissioning. Production deployments should terminate TLS at or before Core.

## Deterministic gates

```bash
npm test
npm run check
```

`npm test` runs pure deterministic unit and contract tests. It does not impersonate hardware. `npm run check` rejects development substitutes, raw command operations, missing adapters, mutable library pins, incorrect routing, and other release-policy violations.

## Real-hardware contract

The hardware suite connects to the real Core and checks its signed responses:

```bash
export S1R3N_CORE_URL="https://core-host-or-address"
export S1R3N_CONTROL_KEY="32-or-more-random-characters"
npm run test:hardware
```

By default it verifies:

- Core signed response integrity;
- `deck-cyd` as physical owner;
- no fallback route;
- CYD online;
- Flipper online;
- all three C5 safety nodes online and healthy;
- real Flipper inventory returned through the CYD.

The optional read-only device-information execution is disabled unless deliberately enabled after STOP is cleared:

```bash
export S1R3N_HARDWARE_TEST_EXECUTE_READONLY=true
npm run test:hardware
```

No transmit operation is part of the hardware contract.

## CLI

Readiness:

```bash
node src/cli.mjs readiness
```

Refresh real Flipper inventory:

```bash
node src/cli.mjs inventory --refresh
```

Plan a task:

```bash
node src/cli.mjs plan \
  --task "Read device and external-storage information" \
  --asset flipper-001 \
  --purpose "inventory an owned test Flipper" \
  --operator operator-001
```

Preview a checked ADL file without executing it:

```bash
node src/cli.mjs preview --file examples/read-only-run.json
```

Execute only after host and remote STOP states have been intentionally cleared and readiness passes:

```bash
node src/cli.mjs run --file examples/read-only-run.json
```

Assert STOP:

```bash
node src/cli.mjs stop --reason "operator stop"
```

Resume:

```bash
node src/cli.mjs resume --confirm RESUME --reason "physical system inspected"
```

Stage a real local artifact:

```bash
node src/cli.mjs stage-artifact \
  --id owned-artifact-001 \
  --kind config \
  --file /absolute/path/to/file \
  --sha256 <expected-sha256>
```

Promote a physically tested generated adapter:

```bash
node src/cli.mjs promote-adapter \
  --adapter app.function \
  --operator operator-001 \
  --evidence-sha256 <sha256-of-test-evidence>
```

Promote a physically tested generated script:

```bash
node src/cli.mjs promote-script \
  --script workflow-id \
  --operator operator-001 \
  --evidence-sha256 <sha256-of-test-evidence>
```

## HTTP API

All endpoints except `GET /health` require:

```text
Authorization: Bearer $S1R3N_API_TOKEN
```

Endpoints:

```text
GET  /health
GET  /ready
GET  /v1/status
GET  /v1/catalog
GET  /v1/audit/verify
POST /v1/plan
POST /v1/preview
POST /v1/run
POST /v1/stop
POST /v1/resume
POST /v1/inventory/refresh
POST /v1/assets
POST /v1/adapters/promote
POST /v1/scripts/promote
```

Start the service only after configuration and deterministic gates pass:

```bash
npm start
```

On SIGINT or SIGTERM, the service attempts to assert remote STOP before closing.

## Release boundary

This host code is not evidence that the assembled appliance is user-ready. A production release requires passing `../PRODUCTION_READINESS.md`, including reproducible firmware builds and recorded physical tests for Core, Vision, three C5 nodes, CYD, Flipper Expansion RPC, UART wiring, touchscreen approval/STOP, replay rejection, quorum loss, and power-failure recovery.
