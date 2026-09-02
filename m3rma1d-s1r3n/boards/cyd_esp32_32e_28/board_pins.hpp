#pragma once
// M3rMa1d S1r3n Deck board support.
// Physical board: ESP32-32E N4 CYD, 2.8 in 240x320 ILI9341 + XPT2046.
namespace s1r3n::cyd28 {
constexpr int TFT_MISO=12;
constexpr int TFT_MOSI=13;
constexpr int TFT_SCLK=14;
constexpr int TFT_CS=15;
constexpr int TFT_DC=2;
constexpr int TFT_BL=21;
constexpr int TOUCH_CS=33;
constexpr int TOUCH_IRQ=36;

// P1 UART0 remains dedicated to flashing and USB serial diagnostics.
constexpr int PROGRAM_UART_RX=3;
constexpr int PROGRAM_UART_TX=1;

// CN1 is the sole M3rMa1d S1r3n electrical connection to Flipper GPIO.
// ESP32 GPIO matrix maps UART2 to these pins, avoiding UART0 contention.
constexpr int FLIPPER_UART_PORT=2;
constexpr int FLIPPER_UART_RX=22; // CN1 GPIO22 <- Flipper pin 13 TX
constexpr int FLIPPER_UART_TX=27; // CN1 GPIO27 -> Flipper pin 14 RX
constexpr unsigned long FLIPPER_UART_BAUD=230400;
}
