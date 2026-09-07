#include "flipper_bridge.h"
#include "config.h"

namespace m3rma1d {

void FlipperBridge::begin() {
    serial_.begin(FLIPPER_BAUD, SERIAL_8N1, FLIPPER_RX_GPIO, FLIPPER_TX_GPIO);
    last_rx_ms_ = 0;
    seen_rx_ = false;
    stop_asserted_ = true;
    // This is a bounded commissioning identity probe only. General production
    // execution remains blocked until the typed Expansion/protobuf RPC bridge
    // is active; no free-form command surface is exposed to Codex or the UI.
    serial_.print("device_info\r");
}

void FlipperBridge::poll() {
    while(serial_.available()) {
        const char c = static_cast<char>(serial_.read());
        seen_rx_ = true;
        last_rx_ms_ = millis();
        if(c == '\n') line_ = "";
        else if(c != '\r' && line_.length() < 512) line_ += c;
    }
    if(!linked()) stop_asserted_ = true;
}

bool FlipperBridge::linked() const {
    return seen_rx_ && (millis() - last_rx_ms_) <= FLIPPER_STALE_MS;
}

void FlipperBridge::assert_stop(uint32_t job_id) {
    (void)job_id;
    stop_asserted_ = true;
    // STOP is local and preemptive. It intentionally does not emit an unrestricted CLI command.
}

void FlipperBridge::clear_stop() {
    if(linked()) stop_asserted_ = false;
}

bool FlipperBridge::execute(uint32_t job_id, uint16_t action_id, const String& argument, uint32_t timeout_ms, FlipperResult& result) {
    result.job_id = job_id;
    if(stop_asserted_) { result.code = -10; result.text = "STOP asserted"; return false; }
    if(!linked()) { result.code = -11; result.text = "Flipper offline"; return false; }

    // Only the bounded read-only compatibility probes below may use the
    // commissioning CLI path. Every other operation fails closed until the
    // production typed Expansion/protobuf RPC adapter is implemented.
    String command;
    switch(action_id) {
        case 1: command = "device_info"; break;
        case 2: command = "storage_info"; break;
        case 3: command = "loader list"; break;
        case 4: command = "help"; break;
        default:
            result.code = -12;
            result.text = "typed action requires protobuf RPC adapter";
            return false;
    }
    if(argument.length()) {
        result.code = -13;
        result.text = "unexpected argument";
        return false;
    }

    while(serial_.available()) serial_.read();
    serial_.print(command); serial_.print("\r");
    String response;
    const uint32_t start = millis();
    const uint32_t limit = min<uint32_t>(timeout_ms, 5000);
    while(millis() - start < limit) {
        while(serial_.available()) {
            const char c = static_cast<char>(serial_.read());
            seen_rx_ = true;
            last_rx_ms_ = millis();
            if(c == '\n' && response.length()) {
                result.code = 0;
                result.text = response.substring(0, 512);
                return true;
            }
            if(c != '\r' && response.length() < 512) response += c;
        }
        delay(1);
    }
    result.code = -14;
    result.text = "Flipper response timeout";
    return false;
}
}
