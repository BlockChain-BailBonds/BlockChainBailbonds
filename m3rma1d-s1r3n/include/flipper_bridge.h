#pragma once

#include <Arduino.h>

namespace m3rma1d {

constexpr uint8_t MERMAID_LINK_VERSION = 2;
constexpr uint16_t MERMAID_LINK_MAX_PAYLOAD = 96;

enum class FlipperAction : uint16_t {
    SystemDeviceInfo = 1,
    SystemPowerInfo = 11,
    StorageInfo = 20,
    StorageList = 21,
    StorageStat = 22,
    AppStart = 30,
    AppExit = 31,
    AppLoadFile = 32,
    GuiInput = 40,
    GpioRead = 50,
    PropertyGet = 60,
    RfTransmitOwnedProfile = 70,
    CredentialReference = 80,
    AuthValidateOnce = 90,
    TransportPing = 100,
};

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
    bool execute(uint32_t job_id, FlipperAction action, const String& argument, uint32_t timeout_ms, FlipperResult& result);
    bool execute(uint32_t job_id, uint16_t action_id, const String& argument, uint32_t timeout_ms, FlipperResult& result) {
        return execute(job_id, static_cast<FlipperAction>(action_id), argument, timeout_ms, result);
    }

private:
    bool send_frame(uint8_t type, const uint8_t* payload, uint16_t length);
    bool decode_one(FlipperResult* awaited, uint32_t awaited_job_id);
    void read_serial();

    HardwareSerial& serial_;
    uint32_t last_rx_ms_ = 0;
    uint32_t next_seq_ = 1;
    uint32_t last_rx_seq_ = 0;
    bool seen_rx_ = false;
    bool have_rx_seq_ = false;
    bool stop_asserted_ = true;
    uint8_t rx_[256] = {};
    size_t rx_len_ = 0;
};
}
