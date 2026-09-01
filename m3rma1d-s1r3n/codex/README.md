# M3rMa1d S1r3n Codex

This directory is the host-side Codex implementation for planning, resolving, approving, auditing, and executing ADL 2.0 Flipper runs.

## Fixed topology

Codex never talks directly to the Flipper GPIO header.

```text
Codex service -> Core S3 -> authenticated wireless control plane -> CYD Deck -> 3.3 V UART -> Flipper
```

The ESP32-32E N4 CYD Deck is the sole physical Flipper bridge. Core, Vision, and the three C5 nodes have no Flipper GPIO fallback path.

## What is implemented

- OpenAI Responses API client using strict JSON-schema Structured Outputs
- Natural-language goal to ADL 2.0 planner
- Dynamic app/function adapter generation in a declarative adapter format
- Declarative script generation
- Installed-app inventory ingestion
- Capability, app, script, library, artifact, and frequency resolution
- SHA-256 artifact verification and optional pinned HTTPS retrieval
- Owned-asset frequency profiles; transmit profiles do not resolve without an asset allowlist
- Deck/operator approval services
- HMAC-SHA256 authenticated Core transport
- Deck-only routing invariant in every execution envelope
- Fail-closed STOP state
- Hash-chained JSONL audit log
- Optional Vision S3 closed-loop verification
- CLI and authenticated HTTP API
- Dry-run transport and host-side tests

## Important execution boundary

“Any app or function” means an installed app can be discovered and addressed through a typed adapter. It does not mean unrestricted shell access. When a function is missing, Codex may generate a declarative adapter or script, which is schema-checked, scanned for prohibited primitives, hashed, staged, and then re-resolved. The gateway never lets model text become a raw Flipper command.

Built-in stock functions include device/storage information, app listing/status/open/close, owned-tag inventory workflows, owned IR artifact workflows, and owned/lab Sub-GHz workflows. New app functions enter through the same adapter pipeline.

## Requirements

- Node.js 20.11 or newer
- An OpenAI API key for natural-language planning or adapter/script generation
- No npm runtime dependencies are required
- A Core control-plane endpoint for physical execution
- A random control key at least 32 characters long
- An API bearer token for the HTTP service

## Setup

```bash
cd m3rma1d-s1r3n/codex
cp .env.example .env
# Export values from .env in your shell. The service intentionally does not parse secrets from source files.
npm test
npm run check
```

Start in dry-run mode first:

```bash
export OPENAI_API_KEY="..."
export S1R3N_API_TOKEN="use-a-long-random-token"
export S1R3N_DRY_RUN=true
npm start
```

The OpenAI key remains on this host. It is never compiled into an ESP32 or sent to the Core, Deck, C5 nodes, Vision board, or Flipper.

## CLI

Plan a run without executing it:

```bash
node src/cli.mjs plan \
  --task "List installed apps and report storage" \
  --asset flipper-001 \
  --purpose "inventory my test Flipper"
```

Preview a checked-in ADL file after resolution and materialization:

```bash
node src/cli.mjs preview --file examples/read-only-run.json
```

Dry-run it:

```bash
node src/cli.mjs run --file examples/read-only-run.json
```

Assert STOP:

```bash
node src/cli.mjs stop --reason "bench wiring change"
```

A physical resume requires the Deck online and the C5 safety mesh healthy:

```bash
node src/cli.mjs resume --confirm RESUME --reason "bench verified"
```

Register an exact frequency for an operator-owned lab asset. This does not authorize use against any other device:

```bash
node src/cli.mjs register-asset \
  --asset gate-remote-lab \
  --source "owner equipment record 2026-09-01" \
  --profile subghz.transmit.user_defined \
  --frequency 315000000
```

## HTTP API

All `/v1/*` endpoints require:

```text
Authorization: Bearer $S1R3N_API_TOKEN
```

Endpoints:

```text
GET  /health
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
```

Example plan request:

```bash
curl -sS http://127.0.0.1:9183/v1/plan \
  -H "Authorization: Bearer $S1R3N_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data @examples/task-request.json
```

## Physical mode

After dry-run tests pass:

```bash
export S1R3N_DRY_RUN=false
export S1R3N_CORE_URL="http://<core-ip>:9184"
export S1R3N_CONTROL_KEY="<32-or-more-random-characters>"
export S1R3N_APPROVAL_MODE=deck
npm start
```

Each Core request is wrapped in a signed envelope containing a timestamp, nonce, logical target, physical owner, and `fallback_physical_route=false`. The Core must independently verify the signature, freshness, nonce replay state, STOP state, C5 safety mesh, Deck identity, ADL lease, and per-step approval before forwarding to the CYD.

## Generated adapters and scripts

Generated material is written under `state/artifacts/` and indexed by SHA-256. Generated content is not committed automatically. Review it, run its test plan, and promote it into `catalog/adapters.json` only after physical verification.

Adapters use typed operations such as:

```text
loader_list
loader_info
loader_open
loader_close
named_cli
input_key
wait_ms
artifact_stage
expect
capture_vision
deck_confirm
```

There is no operation for raw shell, raw CLI, arbitrary code execution, jamming, brute force, credential extraction, or access-control bypass.

## Verification

```bash
npm test
npm run check
node src/cli.mjs audit-verify
```

Host tests cover Structured Output request formation, generated-adapter validation, artifact staging, asset-gated frequency resolution, HMAC transport routing, audit-chain verification, and an end-to-end Deck-only dry run.

Physical functions remain `NOT TESTED` until the actual Core, Vision, CYD, three C5 nodes, and Flipper are flashed, wired, and exercised according to `../docs/WIRING.md`.
