#pragma once

#include <WebServer.h>
#include "codex_autonomous.h"

namespace m3rma1d {
class WebUi {
public:
    WebUi(CodexAutonomous& codex, FlipperBridge& bridge);
    bool begin();
    void poll();
private:
    WebServer server_;
    CodexAutonomous& codex_;
    FlipperBridge& bridge_;
    void routes();
};
}
