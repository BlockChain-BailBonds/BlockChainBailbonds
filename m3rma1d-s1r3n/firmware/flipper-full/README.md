# M3rMa1d S1r3n Full Flipper Zero Firmware

This build starts from the pinned official Flipper Zero firmware source and adds the M3rMa1d S1r3n control surface as a built-in application.

Pinned upstream commit:
`7f0b6e1c14431708cfde75ae1ba13df59e868041`

CI builds an official-style `updater_package` with release flags (`COMPACT=1 DEBUG=0`) and uploads the generated `.tgz` updater package plus flashable binaries emitted by the upstream build.

## Install

Preferred user-test path: install the generated `.tgz` updater package with qFlipper or place/extract the updater package using the normal Flipper update workflow. Keep an official firmware package available for recovery.

The M3rMa1d app is compiled into the firmware app set and appears as `M3rMa1d S1r3n` on the device.

## Hardware companion

The companion ESP32-S3 firmware uses a dedicated UART to the Flipper expansion pins. Keep ESP32 and Flipper powered independently over USB and connect only TX/RX/GND as documented by the companion firmware.

This branch is a user-test build. A successful CI build proves source/build/package validity, not physical-device verification.
