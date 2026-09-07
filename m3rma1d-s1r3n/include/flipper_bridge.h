#pragma once

#include <Arduino.h>

namespace m3rma1d {
struct FlipperResult {
    uint32_t job_id = 0;
    int16_t code = -1;
    String text;
};

class FlipperBridge {
public:
    explicit FlipperBridge(HardwareSerial& serial) : serial_(serial) {}
    void begin();
    void poll();
    bool linked() const;
    bool stop_asserted() const { return stop_asserted_; }
    void assert_stop(uint32_t job_id = 0);
    void clear_stop();
    bool execute(uint32_t job_id, uint16_t action_id, const String& argument, uint32_t timeout_ms, FlipperResult& result);

private:
    HardwareSerial& serial_;
    uint32_t last_rx_ms_ = 0;
    bool seen_rx_ = false;
    bool stop_asserted_ = true;
    String line_;
};
}
