#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WebServer.h>
#include "flipper_bridge.h"

namespace m3rma1d {

class ControlPlane {
public:
    ControlPlane(WebServer& server, FlipperBridge& bridge) : server_(server), bridge_(bridge) {}
    bool begin();
    void register_routes();
    bool configured() const;

private:
    struct ReplayEntry {
        String nonce;
        uint32_t seen_ms = 0;
    };

    struct UploadState {
        bool active = false;
        String upload_id;
        String artifact_id;
        String kind;
        String expected_sha256;
        String temp_path;
        uint32_t expected_size = 0;
        uint32_t next_offset = 0;
    };

    static constexpr size_t REPLAY_SLOTS = 64;

    WebServer& server_;
    FlipperBridge& bridge_;
    Preferences prefs_;
    bool prefs_ready_ = false;
    bool clock_anchored_ = false;
    uint64_t anchor_epoch_ms_ = 0;
    uint32_t anchor_millis_ = 0;
    uint64_t persisted_high_water_ms_ = 0;
    ReplayEntry replay_[REPLAY_SLOTS];
    size_t replay_cursor_ = 0;
    UploadState upload_;

    void handle_request(const char* expected_type);
    bool verify_request(JsonDocument& request, const String& raw_body, const char* expected_type, String& error);
    void send_plain_error(int status, const char* message);
    void send_signed_result(const JsonDocument& request, JsonDocument& payload, int status = 200);

    void build_status(JsonDocument& payload);
    void build_inventory(JsonDocument& payload);
    void handle_approval(const JsonDocument& request, JsonDocument& payload);
    void handle_stop(const JsonDocument& request, JsonDocument& payload, bool clear);
    void handle_artifact_begin(const JsonDocument& request, JsonDocument& payload);
    void handle_artifact_chunk(const JsonDocument& request, JsonDocument& payload);
    void handle_artifact_commit(const JsonDocument& request, JsonDocument& payload);
    void handle_job(const JsonDocument& request, JsonDocument& payload);

    bool seen_nonce(const String& nonce) const;
    void remember_nonce(const String& nonce);
    uint64_t signed_now_ms() const;
};

} // namespace m3rma1d
