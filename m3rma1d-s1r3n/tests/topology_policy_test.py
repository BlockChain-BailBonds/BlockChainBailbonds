#!/usr/bin/env python3
"""Static topology guard: only CYD Deck may own a Flipper GPIO/UART path."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTING = ROOT / "adl" / "hardware-routing.json"
CORE = ROOT / "firmware" / "core-s3" / "src" / "main.cpp"
DECK = ROOT / "firmware" / "deck-cyd" / "src" / "main.cpp"
WIRING = ROOT / "docs" / "WIRING.md"

routing = json.loads(ROUTING.read_text(encoding="utf-8"))
assert routing["physical_owner"] == "deck-cyd"
assert routing["bridge"]["power_connection"] is False
assert routing["fallback_physical_route"] is False
assert routing["bridge"]["deck_rx_gpio"] == 22
assert routing["bridge"]["deck_tx_gpio"] == 27
assert routing["bridge"]["flipper_tx_pin"] == 13
assert routing["bridge"]["flipper_rx_pin"] == 14

core = CORE.read_text(encoding="utf-8")
deck = DECK.read_text(encoding="utf-8")
wiring = WIRING.read_text(encoding="utf-8")

for forbidden in ("HardwareSerial Flipper", "FLIP_RX", "FLIP_TX", "Flipper.begin"):
    assert forbidden not in core, f"Core regained forbidden direct Flipper path: {forbidden}"

assert "HardwareSerial Flipper" in deck
assert "FLIPPER_UART_RX" in deck
assert "FLIPPER_UART_TX" in deck
assert "Only the ESP32-32E N4 CYD Deck connects electrically" in wiring

print("topology policy test passed: CYD is sole Flipper GPIO owner")
