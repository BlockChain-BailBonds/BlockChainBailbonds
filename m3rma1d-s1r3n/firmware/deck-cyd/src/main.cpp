#include <Arduino.h>
#include "protocol.hpp"
#include "board_pins.hpp"

using namespace s1r3n;

// The CYD Deck is the only device allowed to touch the Flipper GPIO header.
HardwareSerial Flipper(s1r3n::cyd28::FLIPPER_UART_PORT);

static volatile bool stopAsserted = true;
static volatile bool authenticatedControlPlane = false;

static void setResult(JobResult& out, uint32_t jobId, int16_t code, const char* text) {
  out.job_id = jobId;
  out.code = code;
  snprintf(out.text, sizeof(out.text), "%s", text ? text : "");
}

void deckAssertStop() {
  stopAsserted = true;
}

bool deckClearStop(bool authenticated) {
  if (!authenticated || !authenticatedControlPlane) return false;
  stopAsserted = false;
  return true;
}

void deckSetControlPlaneAuthenticated(bool authenticated) {
  authenticatedControlPlane = authenticated;
  if (!authenticated) deckAssertStop();
}

static String commandFor(const JobRequest& job) {
  switch (job.capability) {
    case Capability::Help: return "help\r";
    case Capability::DeviceInfo: return "device_info\r";
    case Capability::StorageInfo: return "storage_info\r";
    case Capability::LoaderList: return "loader list\r";
    case Capability::GpioRead: return String("gpio read ") + job.argument + "\r";
    // Transmit/app-specific operations require a reviewed Deck adapter and a
    // resolved artifact. Never guess or forward a raw command here.
    case Capability::IrTransmit: return "";
    default: return "";
  }
}

static void drainFlipperInput() {
  while (Flipper.available()) Flipper.read();
}

bool deckExecuteFlipperJob(const JobRequest& job, bool approved, JobResult& out) {
  if (stopAsserted) {
    setResult(out, job.job_id, -20, "deck STOP asserted");
    return false;
  }
  if (!authenticatedControlPlane) {
    setResult(out, job.job_id, -21, "control plane not authenticated");
    return false;
  }
  if (!capabilityAllowed(job.capability)) {
    setResult(out, job.job_id, -11, "capability denied");
    return false;
  }
  if (needsApproval(job.capability) && !approved) {
    setResult(out, job.job_id, -12, "deck approval required");
    return false;
  }

  const String command = commandFor(job);
  if (!command.length()) {
    setResult(out, job.job_id, -13, "no reviewed Deck adapter for operation");
    return false;
  }

  drainFlipperInput();
  Flipper.print(command);
  Flipper.flush();

  const uint32_t timeoutMs = min<uint16_t>(job.timeout_ms, 5000);
  const uint32_t started = millis();
  uint32_t lastByteAt = started;
  bool received = false;
  String response;
  response.reserve(sizeof(out.text) - 1);

  while (millis() - started < timeoutMs) {
    while (Flipper.available()) {
      const char c = static_cast<char>(Flipper.read());
      received = true;
      lastByteAt = millis();
      if (c >= 0x20 && c <= 0x7e && response.length() < sizeof(out.text) - 1) {
        response += c;
      } else if ((c == '\r' || c == '\n') && response.length() && response.length() < sizeof(out.text) - 1) {
        response += ' ';
      }
    }
    if (received && millis() - lastByteAt >= 120) break;
    delay(1);
  }

  if (!received) {
    setResult(out, job.job_id, -14, "Flipper UART timeout");
    return false;
  }

  response.trim();
  setResult(out, job.job_id, 0, response.c_str());
  return true;
}

void setup() {
  Serial.begin(115200); // P1/UART0 remains available for flashing and logs.
  Flipper.begin(
      s1r3n::cyd28::FLIPPER_UART_BAUD,
      SERIAL_8N1,
      s1r3n::cyd28::FLIPPER_UART_RX,
      s1r3n::cyd28::FLIPPER_UART_TX);

  deckAssertStop();
  deckSetControlPlaneAuthenticated(false);
  Serial.println("M3rMa1d S1r3n Deck ready");
  Serial.println("Flipper GPIO owner: CYD UART2 GPIO22/GPIO27; bridge fail-closed");
}

void loop() {
  // The authenticated Deck transport and touch UI call the functions above.
  // Until both are bound and STOP is explicitly cleared, no job is executed.
  delay(20);
}
