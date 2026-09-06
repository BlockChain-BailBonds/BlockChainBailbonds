#pragma once

#include <Arduino.h>
#include "flipper_bridge.h"

namespace m3rma1d {
class CodexAutonomous {
public:
    explicit CodexAutonomous(FlipperBridge& bridge) : bridge_(bridge) {}
    void begin();
    void poll();
    bool ready() const;
    String status_json() const;
    bool run_safe_probe(const String& capability, FlipperResult& result);
private:
    FlipperBridge& bridge_;
    uint32_t next_job_id_ = 1;
};
}
