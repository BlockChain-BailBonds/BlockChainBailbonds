#pragma once
// M3rMa1d S1r3n Deck board support.
// Physical board identified as ESP32-32E 2.8in 240x320 resistive-touch CYD.
namespace s1r3n::cyd28 {
constexpr int TFT_MISO=12;
constexpr int TFT_MOSI=13;
constexpr int TFT_SCLK=14;
constexpr int TFT_CS=15;
constexpr int TFT_DC=2;
constexpr int TFT_BL=21;
constexpr int TOUCH_CS=33;
constexpr int TOUCH_IRQ=36;
// Dedicated 4-pin UART connector is labeled RX0/TX0/GND/5V on the physical PCB.
constexpr int UART_RX=3;
constexpr int UART_TX=1;
}
