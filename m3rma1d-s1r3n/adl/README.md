# M3rMa1d S1r3n ADL

ADL is the declarative authority boundary between Codex and hardware execution. Codex proposes a `flipper-run` document; it never emits a raw Flipper shell command to the device.

## Flow

`Codex -> ADL schema validation -> policy compiler -> Core JobRequest -> Sentinel/Deck gates -> Flipper adapter -> JobResult -> audit log -> Codex`

## Invariants

1. Unknown fields and capabilities are rejected.
2. Maximum 32 steps/run, 5 s/step, 30 s/run.
3. Core re-checks capability policy; gateway validation is not authoritative by itself.
4. Sentinel must be healthy for every hardware step.
5. `ir_transmit` always requires Deck approval. Approval is per step and expires with the step.
6. No ADL primitive exists for raw shell, arbitrary CLI, credential extraction, RF jamming, or unrestricted NFC/RFID/Sub-GHz operations.
7. STOP/E-STOP cancels the active run and no later step executes.
8. Every requested/approved/denied/executed/result transition receives an audit record.

## Example safe run

```json
{
  "adl_version": "1.0",
  "run_id": "bench-001",
  "target": "flipper",
  "description": "Inventory the attached Flipper",
  "max_run_ms": 8000,
  "stop_on_error": true,
  "steps": [
    {"id":"identify","capability":"device_info","timeout_ms":2000,"approval":"none"},
    {"id":"storage","capability":"storage_info","timeout_ms":2000,"approval":"none"},
    {"id":"apps","capability":"loader_list","timeout_ms":2000,"approval":"none"}
  ]
}
```

Codex may select and sequence declared capabilities, but cannot expand the capability vocabulary at runtime. New hardware powers require a reviewed schema/policy/firmware change.
