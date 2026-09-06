# Momentum Baseline Contract for M3rMa1d S1r3n

## Pinned upstream

- Repository: `Next-Flip/Momentum-Firmware`
- Branch: `dev`
- Commit: `d3f89dfe2ef6b01839201598e9be1590cba80322`
- License: GPL-3.0

The M3rMa1d Flipper distribution is an additive derivative of this pinned Momentum baseline.

## Preserve-first rule

The build must retain the full Momentum firmware experience from the pinned revision, including its native and bundled applications, external-app integration, resources, menu functionality, configuration surfaces, and themes. Mermaid content is layered on top.

A future Momentum revision may replace the pinned revision only after compatibility tests pass and the new commit is recorded here.

## Mermaid overlay

The overlay may add:

- `M3rMa1d S1r3n` application and MermaidLink transport
- Codex/ADL app-discovery and typed adapter support
- Mermaid app category, launcher entries, shortcuts, and status pages
- Mermaid icons, dolphin/mermaid resources, animations, splash/boot resources, and theme variants
- S3-CAM companion integration
- point-and-click intent workflows that invoke verified native Momentum/Flipper functions

The overlay must not delete or silently replace unrelated Momentum applications or assets.

## Build strategy

The production firmware build should operate from a complete Momentum source checkout at the pinned revision and apply a deterministic M3rMa1d overlay. The resulting firmware is tested as one image.

Required provenance record:

```text
momentum_repository
momentum_commit
m3rma1d_commit
overlay_digest
firmware_digest
build_toolchain
build_timestamp
```

## Application compatibility

Installed native apps remain manually launchable. Codex autonomy is an additional control path.

For each discovered application:

- `manual`: app may be launched through the normal Momentum UI.
- `discovered`: M3rMa1d knows the application exists.
- `ready`: one or more functions have verified typed adapters.
- `needs_adapter`: the app stays available manually while Codex lacks a verified adapter.
- `restricted`: Codex will not automate restricted functions.

An application must never be removed merely because Codex cannot automate it.

## Theme compatibility

All Momentum themes/resources supplied by the pinned baseline remain available. Mermaid themes are added as additional choices. The default may be Mermaid-branded for a M3rMa1d build, but the user can switch back to preserved Momentum-compatible visuals.

## Upstream synchronization

When Momentum changes:

1. fetch the candidate upstream revision;
2. record its commit;
3. rebuild with the Mermaid overlay;
4. compare application/resource inventories against both the previous M3rMa1d build and new Momentum candidate;
5. run Flipper compile tests and the M3rMa1d hardware contract;
6. promote the new Momentum commit only if required compatibility gates pass.

## Licensing

Momentum Firmware identifies its repository license as GPL-3.0. Any distributed M3rMa1d firmware derived from Momentum must preserve applicable notices and meet the corresponding source/distribution requirements of that license and the licenses of bundled components.
