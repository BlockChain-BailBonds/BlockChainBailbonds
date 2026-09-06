#include "mermaid_link_core.hpp"

#include <string.h>

namespace s1r3n::core {
namespace {
constexpr uint8_t MAGIC0 = 'M';
constexpr uint8_t MAGIC1 = '3';
constexpr size_t HEADER_SIZE = 10;
constexpr size_t CRC_SIZE = 4;

uint16_t readU16(const uint8_t* p) {
    return static_cast<uint16_t>(p[0]) | (static_cast<uint16_t>(p[1]) << 8);
}

uint32_t readU32(const uint8_t* p) {
    return static_cast<uint32_t>(p[0]) |
           (static_cast<uint32_t>(p[1]) << 8) |
           (static_cast<uint32_t>(p[2]) << 16) |
           (static_cast<uint32_t>(p[3]) << 24);
}

void writeU16(uint8_t* p, uint16_t value) {
    p[0] = static_cast<uint8_t>(value & 0xffU);
    p[1] = static_cast<uint8_t>((value >> 8) & 0xffU);
}

void writeU32(uint8_t* p, uint32_t value) {
    p[0] = static_cast<uint8_t>(value & 0xffU);
    p[1] = static_cast<uint8_t>((value >> 8) & 0xffU);
    p[2] = static_cast<uint8_t>((value >> 16) & 0xffU);
    p[3] = static_cast<uint8_t>((value >> 24) & 0xffU);
}
} // namespace

MermaidLinkCore::MermaidLinkCore(HardwareSerial& serial, int rx_pin, int tx_pin)
    : serial_(serial), rx_pin_(rx_pin), tx_pin_(tx_pin) {}

void MermaidLinkCore::begin() {
    state_.stop_asserted = true;
    serial_.begin(MERMAID_LINK_BAUD, SERIAL_8N1, rx_pin_, tx_pin_);
    last_peer_ms_ = millis();
}

void MermaidLinkCore::setCodexLinked(bool value) {
    state_.codex_linked = value;
}

void MermaidLinkCore::setCameraReady(bool value) {
    state_.camera_ready = value;
}

void MermaidLinkCore::setApprovalPending(bool value) {
    state_.approval_pending = value;
}

void MermaidLinkCore::setCatalog(const CatalogSummary& catalog) {
    catalog_ = catalog;
}

void MermaidLinkCore::assertStop() {
    state_.stop_asserted = true;
}

bool MermaidLinkCore::stopAsserted() const {
    return state_.stop_asserted;
}

uint32_t MermaidLinkCore::crc32(const uint8_t* data, size_t length) const {
    uint32_t crc = 0xffffffffU;
    for(size_t i = 0; i < length; ++i) {
        crc ^= data[i];
        for(uint8_t bit = 0; bit < 8; ++bit) {
            const uint32_t mask = static_cast<uint32_t>(-static_cast<int32_t>(crc & 1U));
            crc = (crc >> 1) ^ (0xedb88320U & mask);
        }
    }
    return ~crc;
}

bool MermaidLinkCore::sendFrame(MermaidMsgType type, const uint8_t* payload, uint16_t length) {
    if(length > MERMAID_LINK_MAX_PAYLOAD) return false;

    uint8_t frame[HEADER_SIZE + MERMAID_LINK_MAX_PAYLOAD + CRC_SIZE];
    frame[0] = MAGIC0;
    frame[1] = MAGIC1;
    frame[2] = MERMAID_LINK_VERSION;
    frame[3] = static_cast<uint8_t>(type);
    writeU32(&frame[4], next_seq_++);
    writeU16(&frame[8], length);
    if(length && payload) memcpy(&frame[HEADER_SIZE], payload, length);
    const uint32_t crc = crc32(&frame[2], HEADER_SIZE - 2 + length);
    writeU32(&frame[HEADER_SIZE + length], crc);
    serial_.write(frame, HEADER_SIZE + length + CRC_SIZE);
    state_.packets_tx++;
    return true;
}

void MermaidLinkCore::sendStatus() {
    uint8_t payload[17]{};
    uint8_t flags = 0;
    if(state_.codex_linked) flags |= 0x01U;
    if(state_.s3_linked) flags |= 0x02U;
    if(state_.camera_ready) flags |= 0x04U;
    if(state_.stop_asserted) flags |= 0x08U;
    if(state_.approval_pending) flags |= 0x10U;
    payload[0] = flags;
    writeU32(&payload[1], state_.heartbeat_ms);
    writeU32(&payload[5], state_.packets_rx);
    writeU32(&payload[9], state_.packets_tx);
    writeU32(&payload[13], state_.faults);
    sendFrame(MermaidMsgType::Status, payload, sizeof(payload));
}

void MermaidLinkCore::sendCatalog() {
    uint8_t payload[8]{};
    writeU16(&payload[0], catalog_.total);
    writeU16(&payload[2], catalog_.ready);
    writeU16(&payload[4], catalog_.needs_adapter);
    writeU16(&payload[6], catalog_.blocked);
    sendFrame(MermaidMsgType::Catalog, payload, sizeof(payload));
}

void MermaidLinkCore::sendReadyResult(bool ready, const char* reason) {
    uint8_t payload[MERMAID_LINK_MAX_PAYLOAD]{};
    payload[0] = ready ? 1U : 0U;
    size_t n = reason ? strnlen(reason, MERMAID_LINK_MAX_PAYLOAD - 2U) : 0U;
    if(n) memcpy(&payload[1], reason, n);
    sendFrame(MermaidMsgType::ReadyResult, payload, static_cast<uint16_t>(1U + n));
}

void MermaidLinkCore::dispatch(uint8_t type, const uint8_t* payload, uint16_t length) {
    state_.packets_rx++;
    last_peer_ms_ = millis();

    switch(static_cast<MermaidMsgType>(type)) {
    case MermaidMsgType::Hello:
        sendStatus();
        break;
    case MermaidMsgType::StatusRequest:
        sendStatus();
        break;
    case MermaidMsgType::CatalogRequest:
        sendCatalog();
        break;
    case MermaidMsgType::Stop:
        state_.stop_asserted = true;
        sendStatus();
        break;
    case MermaidMsgType::ReadyRequest: {
        const bool ready = state_.codex_linked && !state_.approval_pending;
        if(ready) {
            state_.stop_asserted = false;
            sendReadyResult(true, "ready");
        } else {
            state_.stop_asserted = true;
            state_.faults++;
            sendReadyResult(false, "gates_not_ready");
        }
        sendStatus();
        break;
    }
    case MermaidMsgType::Approval:
        if(length >= 1U) state_.approval_pending = payload[0] == 0U;
        sendStatus();
        break;
    default:
        state_.faults++;
        break;
    }
}

bool MermaidLinkCore::decodeOne() {
    if(rx_len_ < HEADER_SIZE + CRC_SIZE) return false;

    size_t start = 0;
    while(start + 1U < rx_len_ && !(rx_[start] == MAGIC0 && rx_[start + 1U] == MAGIC1)) {
        ++start;
    }
    if(start) {
        memmove(rx_, rx_ + start, rx_len_ - start);
        rx_len_ -= start;
        if(rx_len_ < HEADER_SIZE + CRC_SIZE) return false;
    }

    if(rx_[2] != MERMAID_LINK_VERSION) {
        memmove(rx_, rx_ + 2U, rx_len_ - 2U);
        rx_len_ -= 2U;
        state_.faults++;
        return true;
    }

    const uint16_t length = readU16(&rx_[8]);
    if(length > MERMAID_LINK_MAX_PAYLOAD) {
        memmove(rx_, rx_ + 2U, rx_len_ - 2U);
        rx_len_ -= 2U;
        state_.faults++;
        return true;
    }

    const size_t frame_size = HEADER_SIZE + length + CRC_SIZE;
    if(rx_len_ < frame_size) return false;

    const uint32_t expected = readU32(&rx_[HEADER_SIZE + length]);
    const uint32_t actual = crc32(&rx_[2], HEADER_SIZE - 2 + length);
    if(expected == actual) {
        dispatch(rx_[3], &rx_[HEADER_SIZE], length);
    } else {
        state_.faults++;
    }

    memmove(rx_, rx_ + frame_size, rx_len_ - frame_size);
    rx_len_ -= frame_size;
    return true;
}

void MermaidLinkCore::poll() {
    while(serial_.available() && rx_len_ < sizeof(rx_)) {
        rx_[rx_len_++] = static_cast<uint8_t>(serial_.read());
    }
    while(decodeOne()) {
    }

    state_.heartbeat_ms = millis() - last_peer_ms_;
    if(state_.heartbeat_ms > 3000U) {
        state_.stop_asserted = true;
        state_.codex_linked = false;
    }

    if(rx_len_ == sizeof(rx_)) {
        rx_len_ = 0;
        state_.faults++;
    }
}

} // namespace s1r3n::core
