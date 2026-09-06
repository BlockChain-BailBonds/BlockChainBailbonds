# M3rMa1d S1r3n

M3rMa1d S1r3n is a 918 Technologies Flipper Zero distribution built as an additive layer on top of Momentum Firmware. The user keeps the Momentum experience, apps, resources, and themes, while M3rMa1d adds Codex/ADL automation, Mermaid-native apps, MermaidLink control, and Mermaid visual themes.

## Hardware

The active appliance is intentionally two-device:

- 1 x GOOUUU ESP32-S3-CAM V1.5 N16R8 + OV3660
- 1 x Flipper Zero

The S3-CAM is the companion controller and Codex bridge. The Flipper remains the user-facing point-and-click device.

## Firmware inheritance rule

Momentum Firmware is the base, not something M3rMa1d replaces.

Required release invariant:

```text
M3rMa1d Flipper image = pinned Momentum base + all Momentum apps/resources/themes + Mermaid additions
```

A M3rMa1d build must preserve every app, asset, menu feature, setting, and theme delivered by the pinned Momentum baseline unless a specific upstream item is impossible to build or has been explicitly excluded for a documented compatibility reason. Any such exclusion is a release blocker until recorded and approved.

Current pinned upstream baseline:

```text
repository: Next-Flip/Momentum-Firmware
branch: dev
commit: d3f89dfe2ef6b01839201598e9be1590cba80322
license: GPL-3.0
```

M3rMa1d changes are additive:

- M3rMa1d S1r3n control application
- MermaidLink UART integration
- Codex intent and workflow interface
- ADL typed capability registry
- native Momentum/Flipper app discovery and adapters
- Mermaid app group and shortcuts
- Mermaid boot/splash/resources
- Mermaid desktop and menu visuals
- Mermaid themes, icons, animations, and status surfaces
- S3-CAM companion status/camera integration
- hardware tester, flasher, and proof system

## User experience

The normal Flipper menus remain available. M3rMa1d adds a point-and-click automation layer rather than removing native operation.

```text
User intent / click
       |
       v
M3rMa1d UI on Flipper
       |
       v
Codex planner -> ADL resolver -> installed app/capability registry
       |
       v
verified adapter / approved workflow / permitted frequency profile
       |
       v
native Momentum or Flipper function
       |
       v
result -> M3rMa1d UI
```

Codex may discover installed applications, select native functions, generate bounded adapters/scripts, resolve permitted receive/transmit profiles for declared owned/lab assets, sequence apps, handle retries, and return results without requiring the user to navigate each underlying app manually.

Codex does not receive a raw shell or unrestricted CLI. STOP preempts execution. Restricted capabilities remain denied, and transmit operations remain governed by region, declared asset, active lease, and policy.

## Momentum compatibility contract

Every firmware build must prove:

1. the pinned Momentum source revision is recorded;
2. Momentum external applications are present after the M3rMa1d overlay is applied;
3. Momentum resources and themes remain present;
4. Mermaid apps/resources/themes are added without overwriting unrelated Momentum assets;
5. the firmware builds from source under the applicable GPL-3.0 obligations;
6. app discovery produces the native Momentum catalog plus Mermaid additions;
7. existing Momentum apps can still be launched manually even when no Codex adapter exists;
8. Codex execution occurs only through verified typed capability adapters;
9. a Momentum upstream update is regression-tested before the M3rMa1d baseline is advanced.

## Identity

Momentum is the firmware foundation. M3rMa1d S1r3n is the integrated product experience:

```text
Momentum firmware + Momentum apps + Momentum themes
                    +
Mermaid apps + Mermaid theme pack + Codex/ADL autonomy
                    +
ESP32-S3-CAM companion
                    =
              M3rMa1d S1r3n
```

See `docs/MOMENTUM_BASELINE.md`, `docs/FLIPPER_THEME_IMPLEMENTATION_PLAN.md`, `adl/`, `codex/`, and `firmware/flipper-m3rma1d-s1r3n/`.
