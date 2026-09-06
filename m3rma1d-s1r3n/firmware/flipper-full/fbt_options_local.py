# M3rMa1d S1r3n full Flipper Zero firmware overlay.
# Executed by the upstream Flipper build after fbt_options.py is loaded.

FIRMWARE_ORIGIN = "M3rMa1d S1r3n"
DIST_SUFFIX = "m3rma1d-s1r3n"

FIRMWARE_APPS["m3rma1d"] = [
    *FIRMWARE_APPS["default"],
    "m3rma1d_s1r3n",
]
FIRMWARE_APP_SET = "m3rma1d"
