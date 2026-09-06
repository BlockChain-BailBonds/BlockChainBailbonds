#pragma once

#include <Arduino.h>
#include <stdint.h>

namespace s1r3n::core {

constexpr uint8_t MERMAID_LINK_VERSION = 2;
constexpr uint32_t MERMAID_LINK_BAUD = 230400;
constexpr size_t MERMAID_LINK_MAX_PAYLOAD = 96;

enum class MermaidMsgType : uint8_t {
    Hello = 1,
    StatusRequest = 2,
    Status = 3,
    CatalogRequest = 4,
    Catalog = 5,
    ActionRequest = 6,
    ActionResult = 7,
    Stop = 8,
    Approval = 9,
    ReadyRequest = 10,
    ReadyResult = 11,
};

struct RemoteState {
    bool codex_linked = false;
    bool s3_linked = true;
    bool camera_ready = false;
    bool stop_asserted = true;
    bool approval_pending = false;
    uint32_t heartbeat_ms = 0;
    uint32_t packets_rx = 0;
    uint32_t packets_tx = 0;
    uint32_t faults = 0;
};

struct CatalogSummary {
    uint16_t total = 0;
    uint16_t ready = 0;
    uint16_t needs_adapter = 0;
    uint16_t blocked = 0;
};

class MermaidLinkCore {
public:
    MermaidLinkCore(HardwareSerial& serial, int rx_pin, int tx_pin);
    void begin();
    void poll();

    void setCodexLinked(bool value);
    void setCameraReady(bool value);
    void setApprovalPending(bool value);
    void setExecutionAuthorized(bool value);
    void setCatalog(const CatalogSummary& catalog);
    void assertStop();
    bool stopAsserted() const;

private:
    HardwareSerial& serial_;
    int rx_pin_;
    int tx_pin_;
    uint8_t rx_[256]{};
    size_t rx_len_ = 0;
    uint32_t next_seq_ = 1;
    uint32_t last_peer_ms_ = 0;
    bool execution_authorized_ = false;
    RemoteState state_{};
    CatalogSummary catalog_{};

    uint32_t crc32(const uint8_t* data, size_t length) const;
    bool sendFrame(MermaidMsgType type, const uint8_t* payload, uint16_t length);
    bool decodeOne();
    void dispatch(uint8_t type, const uint8_t* payload, uint16_t length);
    void sendStatus();
    void sendCatalog();
    void sendReadyResult(bool ready, const char* reason);
};

} // namespace s1r3n::core
