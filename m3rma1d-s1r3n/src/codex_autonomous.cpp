#include "codex_autonomous.h"
#include "camera_handler.h"
#include <ArduinoJson.h>

namespace m3rma1d {
void CodexAutonomous::begin() {}
void CodexAutonomous::poll() { bridge_.poll(); }
bool CodexAutonomous::ready() const { return bridge_.linked() && !bridge_.stop_asserted(); }

String CodexAutonomous::status_json() const {
    JsonDocument d;
    d["product"] = "M3rMa1d S1r3n";
    d["hardware"] = "ESP32-S3 N16R8 CAM";
    d["physical_owner"] = "s3-cam";
    d["flipper_online"] = bridge_.linked();
    d["camera_ready"] = camera_ready();
    d["stop_asserted"] = bridge_.stop_asserted();
    d["point_click"] = true;
    d["adl"] = "2.0";
    d["raw_cli"] = false;
    d["shell"] = false;
    String out;
    serializeJson(d, out);
    return out;
}

bool CodexAutonomous::run_safe_probe(const String& capability, FlipperResult& result) {
    uint16_t action = 0;
    if(capability == "device_info") action = 1;
    else if(capability == "storage_info") action = 2;
    else if(capability == "loader_list") action = 3;
    else if(capability == "help") action = 4;
    else { result.code = -20; result.text = "unknown safe probe"; return false; }
    return bridge_.execute(next_job_id_++, action, "", 3000, result);
}
}
