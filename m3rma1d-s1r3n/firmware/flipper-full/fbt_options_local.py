# M3rMa1d S1r3n full Flipper Zero firmware configuration.
# Loaded by fbt as the local options file for this fork.

FIRMWARE_ORIGIN = "M3rMa1d S1r3n"
DIST_SUFFIX = "m3rma1d-s1r3n"
UPDATE_VERSION_STRING = "M3rMa1d-S1r3n-themed-v2"
UPDATE_SPLASH = "mermaid_siren"

# Boot directly into the Siren Command Deck. BACK returns to the normal launcher.
LOADER_AUTOSTART = "M3rMa1d S1r3n"

FIRMWARE_APPS["m3rma1d"] = [
    *FIRMWARE_APPS["default"],
    "m3rma1d_s1r3n",
]
FIRMWARE_APP_SET = "m3rma1d"
