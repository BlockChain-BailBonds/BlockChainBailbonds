# M3rMa1d S1r3n Flipper UI/UX + Codex Automation Implementation Plan

## Objective
Turn the Flipper Zero into the M3rMa1d S1r3n execution surface: a themed command deck that exposes live Codex/ESP32 status, discovers installed Flipper apps, executes declared app functions through ADL, resolves missing scripts/libraries/frequency profiles from approved sources, and fails closed on safety or authorization faults.

The firmware must not expose an unrestricted remote shell. Codex works through typed ADL intents and reviewed/generated adapters. Any transmit, emulation, credential-affecting, destructive, or high-impact action must be gated by explicit policy and, where configured, Deck/operator approval.

## 1. Source tree

```text
m3rma1d-s1r3n/
├── flipper/
│   ├── firmware-overlay/
│   │   ├── applications_user/
│   │   │   └── m3rma1d_s1r3n/
│   │   │       ├── application.fam
│   │   │       ├── m3rma1d_s1r3n.c
│   │   │       ├── m3rma1d_s1r3n.h
│   │   │       ├── scenes/
│   │   │       │   ├── scene_home.c
│   │   │       │   ├── scene_codex.c
│   │   │       │   ├── scene_vision.c
│   │   │       │   ├── scene_flipper_ops.c
│   │   │       │   ├── scene_safety.c
│   │   │       │   ├── scene_telemetry.c
│   │   │       │   ├── scene_settings.c
│   │   │       │   └── scene_about.c
│   │   │       ├── views/
│   │   │       │   ├── command_deck_view.c
│   │   │       │   ├── status_card_view.c
│   │   │       │   ├── approval_view.c
│   │   │       │   └── audit_view.c
│   │   │       ├── services/
│   │   │       │   ├── mermaid_link.c
│   │   │       │   ├── adl_client.c
│   │   │       │   ├── app_catalog.c
│   │   │       │   ├── safety_gate.c
│   │   │       │   └── telemetry.c
│   │   │       └── assets/
│   │   │           ├── icons/
│   │   │           └── animations/
│   │   └── patches/
│   │       ├── desktop_autostart.patch
│   │       ├── menu_labels.patch
│   │       └── splash_resources.patch
│   ├── manifests/
│   │   ├── apps/
│   │   ├── libraries/
│   │   ├── frequency_profiles/
│   │   └── scripts/
│   ├── generated/
│   │   ├── app_catalog.json
│   │   ├── capability_catalog.json
│   │   └── manifest.lock.json
│   ├── scripts/
│   │   ├── discover_apps.mjs
│   │   ├── resolve_dependencies.mjs
│   │   ├── generate_adapter.mjs
│   │   ├── build_flipper.sh
│   │   └── package_update.sh
│   └── tests/
│       ├── app_catalog_test.mjs
│       ├── adl_dispatch_test.mjs
│       ├── resolver_test.mjs
│       ├── approval_test.mjs
│       └── package_test.mjs
├── adl/
│   ├── flipper-run.schema.json
│   ├── codex-runner.mjs
│   ├── resolver.mjs
│   ├── app-registry.mjs
│   ├── policy.mjs
│   └── audit.mjs
└── gateway/
    ├── flipper-transport.mjs
    ├── deck-approval.mjs
    └── catalog-sync.mjs
```

## 2. Flipper app implementation

### `application.fam`
Create a built-in M3rMa1d S1r3n application with a dedicated icon and menu label. It should be buildable as part of the firmware and optionally as a FAP for development.

### `m3rma1d_s1r3n.c/.h`
Own the application lifecycle, scene manager, dispatcher, timers, MermaidLink client, local state cache, and fail-closed boot state.

Boot state:
- STOP asserted
- Codex unknown/offline
- S3 link unknown/offline
- camera unknown
- approvals empty
- no active run

### Scene responsibilities
- `scene_home.c`: Siren Command Deck status overview and page navigation.
- `scene_codex.c`: Codex session, auth, last command, queue, reconnect.
- `scene_vision.c`: camera readiness, snapshot request/result, Vision events.
- `scene_flipper_ops.c`: app/function catalog browser and ADL execution status.
- `scene_safety.c`: STOP/READY, fault reason, approval queue, watchdog state.
- `scene_telemetry.c`: heartbeat, packets, events, audit tail.
- `scene_settings.c`: theme animation, vibro, auto-return, pairing/status.
- `scene_about.c`: firmware/build identifiers and 918 Technologies attribution.

## 3. Visual implementation

Use monochrome-safe Mermaid motifs: wave header, tail/fin glyph, bubbles, scale separators, sonar rings, siren icon, and trident accents. Keep text high contrast and fit the 128x64 display.

Required asset groups:
- `I_Mermaid_10x10`
- `I_Siren_10x10`
- `I_Codex_10x10`
- `I_Vision_10x10`
- `I_Telemetry_10x10`
- `I_Stop_10x10`
- `I_Link_10x10`
- `A_SirenSplash_*`
- `A_WaveHeader_*`
- `A_Bubbles_*`

Theme strings:
- Booting -> Diving
- Loading -> Scanning currents
- Connected -> Linked
- Disconnected -> Adrift
- Ready -> Siren Ready
- Stopped -> Stop Asserted
- Error -> Current Fault
- Settings -> Siren Settings
- Applications -> SD Apps
- About -> About the Siren

## 4. Codex app/function automation

Codex should not be limited to a fixed six-command vocabulary. ADL v2 describes an intent as one of:
- `capability`: system-level typed operation
- `app`: invoke a registered Flipper app function
- `script`: execute a reviewed/generated helper script through a registered adapter

Every installed app is represented by an app manifest, for example:

```json
{
  "app_id": "infrared",
  "display_name": "Infrared",
  "launch": {"type": "loader", "name": "Infrared"},
  "functions": {
    "open": {"risk": "read_only"},
    "send_profile": {
      "risk": "transmit",
      "requires": ["ir_profile"],
      "approval": "deck"
    }
  }
}
```

The app registry can describe any built-in or external Flipper app, but an app/function is executable only after the registry has a typed adapter and policy class for it. Unknown apps may be discovered and displayed immediately; execution remains blocked until an adapter is generated and validated.

## 5. App discovery

`discover_apps.mjs` should:
1. query the Flipper loader app list;
2. inspect mounted SD app metadata where available;
3. match discovered apps to local manifests;
4. mark each entry as `ready`, `needs_adapter`, `missing_dependency`, or `blocked`;
5. emit `generated/app_catalog.json`;
6. send the catalog to Codex and the Command Deck.

Official Flipper firmware exposes loader operations for listing, opening, inspecting, and closing apps, so app discovery/launch should use that loader interface rather than inventing app names.

## 6. Dependency resolver

`adl/resolver.mjs` and `flipper/scripts/resolve_dependencies.mjs` fill missing prerequisites before a run.

Resolution order:
1. local pinned manifest/library/profile;
2. repository-pinned artifact with checksum;
3. official upstream source allowed by `source_policy`;
4. generated adapter/script when allowed;
5. fail closed with a structured `MissingDependency` result.

Each resolved artifact is written to `manifest.lock.json` with:
- logical ID
- source
- version or commit
- SHA-256
- generated/fetched flag
- license metadata when available
- resolver timestamp
- policy decision

No runtime dependency may silently float to `latest` in a production build.

## 7. Script generation

When a function requires glue that is not present, Codex may generate a helper only when `resolution.allow_generate_script` or `allow_generate_adapter` is true.

Generated code lifecycle:
1. Codex emits requirement, not shell text.
2. resolver selects a template/API surface.
3. generator creates source in a run-scoped staging directory.
4. static checks reject unrestricted command execution, undeclared file/network access, and undeclared hardware effects.
5. unit/integration test executes in the host simulator where possible.
6. artifact receives hash and manifest entry.
7. high-impact functions still require their normal approval gate.

Generated scripts never expand authorization beyond the ADL run lease.

## 8. Frequency/profile resolution

Frequency-bearing actions must use a named `frequency_profile`; raw unrestricted RF parameters are not treated as a universal capability.

A frequency profile should contain:
- `profile_id`
- region profile
- technology/app
- center/channel information
- modulation/preset identifier when applicable
- source/provenance
- receive/transmit permission
- approval class
- validation constraints

For receive/analysis functions, Codex may auto-resolve an appropriate allowed profile. For transmit/emulation functions, the resolver must verify the ADL authorization scope, region profile, app manifest policy, and any configured Deck/operator approval before execution.

## 9. Libraries

Library manifests should use stable IDs and pinned sources:

```json
{
  "library_id": "example-lib",
  "version": "1.2.3",
  "source": "official",
  "sha256": "...",
  "targets": ["gateway"],
  "provides": ["example_feature"]
}
```

Codex may request a library by feature. The resolver chooses the pinned implementation and records it in the lock file. Libraries for host/gateway, ESP32 firmware, and Flipper firmware must be tagged by target so packages are not mixed.

## 10. ADL runtime pipeline

```text
User/Codex intent
   -> ADL v2 validation
   -> authorization lease validation
   -> app/function lookup
   -> dependency resolver
   -> adapter/script generation if needed
   -> static policy check
   -> optional Deck/operator approval
   -> Core/Flipper transport
   -> app/function execution
   -> typed result
   -> audit ledger
   -> Codex feedback
```

Codex may autonomously retry recoverable failures, resolve dependencies, regenerate an adapter, or choose an alternate registered implementation while the original run lease remains valid. It must not widen the asset, region, or function authorization to make a run succeed.

## 11. Gateway transport

Implement `gateway/flipper-transport.mjs` to translate compiled ADL jobs to numeric firmware job IDs and correlate replies. The existing gateway runner currently emits string job IDs while the ESP32 protocol uses `uint32_t`; v2 must hash/map `run_id + step_id + ordinal` to a collision-checked 32-bit ID and keep human-readable IDs in gateway audit metadata.

Transport requirements:
- framing version + CRC
- numeric job ID
- timeout/deadline
- STOP cancellation
- correlation map
- duplicate protection
- reconnect behavior
- bounded response collection
- structured fault mapping

## 12. Core/Sentinel integration

Before physical release:
- Core must emit the heartbeat expected by Sentinel.
- Sentinel ENABLE must remain low until heartbeat is healthy.
- STOP must cancel the active run.
- every hardware action must re-check Sentinel state immediately before execution.
- approvals must be single-use and bound to numeric job ID plus expiry.

## 13. Menu/autostart/theme integration

Use an overlay/patch system against a pinned Flipper upstream commit rather than maintaining a full fork by hand.

Required patches:
- add M3rMa1d S1r3n application to launcher/menu;
- optionally autostart Command Deck after boot;
- add Mermaid resource bundle and splash;
- change only explicit user-facing labels needed for the theme;
- preserve recovery/update paths so a broken theme app cannot prevent firmware recovery.

The upstream desktop main scene is the integration point for desktop behavior, while application launch/listing should remain through the Flipper loader service.

## 14. Package output

Build outputs:

```text
artifacts/flipper/
├── m3rma1d-s1r3n-update.tgz
├── flipper-z-f7-full-m3rma1d-s1r3n.dfu
├── flipper-z-f7-update-m3rma1d-s1r3n.dfu
├── manifest.lock.json
├── checksums.sha256
└── build-report.md
```

The update package should include firmware/resources/splash needed by the selected upstream build system. Do not fabricate updater components; copy only artifacts actually produced by the pinned Flipper firmware build.

## 15. Tests

Host tests:
- ADL v2 schema acceptance/rejection
- app discovery and catalog state
- numeric job ID determinism/collision handling
- resolver lockfile integrity
- missing-library resolution
- generated adapter rejection on undeclared effects
- approval one-shot behavior
- STOP cancellation
- run lease expiry
- audit event ordering

Firmware/simulator tests:
- Mermaid app launches
- all scenes render without crash
- loader list/open/info/close adapter works
- link disconnect asserts fail-closed state
- approval UI cannot be replayed

Physical acceptance tests remain `NOT TESTED` until executed on the actual Flipper/S3/CYD/Sentinel hardware.

## 16. Build order

1. Complete ADL v2 runner/resolver/registry.
2. Implement Gateway transport and numeric job IDs.
3. Fix Core heartbeat output and one-shot approvals.
4. Build Flipper M3rMa1d S1r3n app and scene shell.
5. Add app discovery/catalog sync.
6. Add manifest-driven adapters.
7. Add dependency/script/frequency resolution.
8. Add Mermaid splash/icons/animations.
9. Patch autostart/menu/theme labels.
10. Build pinned Flipper firmware update package.
11. Run host/simulator tests.
12. Flash test hardware in Sentinel -> Core -> Vision -> Deck -> Flipper order.
13. Record every physical result as PASS/FAIL/NOT TESTED.

## Definition of done
The system is complete when Codex can request a user-authorized goal, discover the required Flipper app/function, resolve its declared script/library/profile dependencies, execute it through a typed ADL adapter, show live state and approvals on the Mermaid UI, return the result to Codex, and produce an auditable record without exposing unrestricted remote shell authority.
