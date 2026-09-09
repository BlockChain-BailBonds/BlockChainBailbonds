#pragma once

#include <Arduino.h>
#include <vector>

namespace m3rma1d {

// The production bridge uses the Flipper firmware-resident Expansion service
// and the official delimited PB_Main RPC protocol. Expansion starts at 9600
// baud, negotiates the requested run baud, then carries RPC in <=64-byte data
// frames with per-frame acknowledgements.
constexpr uint8_t FLIPPER_EXPANSION_DATA_MAX = 64;
constexpr uint32_t FLIPPER_EXPANSION_DISCOVERY_BAUD = 9600;

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
    // Reserved policy-gated vocabulary. These are deliberately denied by the
    // device bridge unless a future reviewed adapter implements them.
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
    bool rpc_ready() const;
    bool stop_asserted() const { return stop_asserted_; }
    void assert_stop(uint32_t job_id = 0);
    void clear_stop();

    bool execute(
        uint32_t job_id,
        FlipperAction action,
        const String& argument,
        uint32_t timeout_ms,
        FlipperResult& result);
    bool execute(
        uint32_t job_id,
        uint16_t action_id,
        const String& argument,
        uint32_t timeout_ms,
        FlipperResult& result) {
        return execute(
            job_id,
            static_cast<FlipperAction>(action_id),
            argument,
            timeout_ms,
            result);
    }

private:
    enum class LinkState : uint8_t {
        Disconnected,
        ExpansionConnected,
        RpcActive,
    };

    struct RpcMessage {
        uint32_t command_id = 0;
        uint32_t command_status = 0;
        bool has_next = false;
        uint32_t content_field = 0;
        std::vector<uint8_t> content;
    };

    bool connect_expansion(uint32_t timeout_ms);
    bool ensure_rpc(uint32_t timeout_ms);
    bool start_rpc(uint32_t timeout_ms);
    bool stop_rpc(uint32_t timeout_ms);
    bool heartbeat(uint32_t timeout_ms);
    void mark_disconnected();
    void drain_serial();

    bool send_expansion_frame(uint8_t type, const uint8_t* content, size_t content_len);
    bool receive_expansion_frame(
        uint8_t& type,
        std::vector<uint8_t>& content,
        uint32_t timeout_ms);
    bool wait_status(uint32_t timeout_ms);
    bool send_status_ack(uint8_t error = 0);

    bool send_rpc_message(const std::vector<uint8_t>& message, uint32_t timeout_ms);
    bool receive_rpc_message(std::vector<uint8_t>& message, uint32_t timeout_ms);
    bool parse_rpc_message(const std::vector<uint8_t>& bytes, RpcMessage& message) const;
    bool build_rpc_request(
        uint32_t command_id,
        FlipperAction action,
        const String& argument,
        std::vector<uint8_t>& message,
        String& error) const;
    String decode_rpc_content(FlipperAction action, const RpcMessage& message) const;

    HardwareSerial& serial_;
    LinkState state_ = LinkState::Disconnected;
    bool stop_asserted_ = true;
    uint32_t last_rx_ms_ = 0;
    uint32_t last_ping_ms_ = 0;
    uint32_t last_connect_attempt_ms_ = 0;
    std::vector<uint8_t> rpc_rx_pending_;
};

} // namespace m3rma1d
