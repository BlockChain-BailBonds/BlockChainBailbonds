#include "mermaid_link_s3.hpp"

#include <string.h>

namespace s1r3n::s3 {
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

MermaidLinkS3::MermaidLinkS3(HardwareSerial& serial, int rx_pin, int tx_pin)
    : serial_(serial), rx_pin_(rx_pin), tx_pin_(tx_pin) {}

void MermaidLinkS3::begin() {
    state_.stop_asserted = true;
    serial_.begin(MERMAID_LINK_BAUD, SERIAL_8N1, rx_pin_, tx_pin_);
    last_peer_ms_ = millis();
}

void MermaidLinkS3::setCodexLinked(bool value) {
    state_.codex_linked = value;
    if(!value) state_.stop_asserted = true;
}

void MermaidLinkS3::setCameraReady(bool value) {
    state_.camera_ready = value;
}

void MermaidLinkS3::setApprovalPending(bool value) {
    state_.approval_pending = value;
    if(value) state_.stop_asserted = true;
}

void MermaidLinkS3::setExecutionAuthorized(bool value) {
    execution_authorized_ = value;
    if(!value) state_.stop_asserted = true;
}

void MermaidLinkS3::setCatalog(const CatalogSummary& catalog) {
    catalog_ = catalog;
}

void MermaidLinkS3::assertStop(uint32_t job_id) {
    state_.stop_asserted = true;
    execution_authorized_ = false;
    uint8_t payload[4]{};
    writeU32(payload, job_id);
    sendFrame(MermaidMsgType::Stop, payload, sizeof(payload));
}

bool MermaidLinkS3::stopAsserted() const {
    return state_.stop_asserted;
}

bool MermaidLinkS3::peerFresh(uint32_t max_age_ms) const {
    return (millis() - last_peer_ms_) <= max_age_ms;
}

uint32_t MermaidLinkS3::crc32(const uint8_t* data, size_t length) const {
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

bool MermaidLinkS3::sendFrame(MermaidMsgType type, const uint8_t* payload, uint16_t length) {
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

bool MermaidLinkS3::sendActionRequest(
    uint32_t job_id,
    uint16_t capability_id,
    const uint8_t* args,
    uint8_t arg_length) {
    if(!execution_authorized_ || state_.stop_asserted || !state_.codex_linked || state_.approval_pending) return false;
    if(arg_length > MERMAID_ACTION_MAX_ARGS) return false;
    uint8_t payload[MERMAID_LINK_MAX_PAYLOAD]{};
    writeU32(&payload[0], job_id);
    writeU16(&payload[4], capability_id);
    payload[6] = arg_length;
    if(arg_length && args) memcpy(&payload[7], args, arg_length);
    action_result_.available = false;
    return sendFrame(MermaidMsgType::ActionRequest, payload, static_cast<uint16_t>(7U + arg_length));
}

bool MermaidLinkS3::takeActionResult(ActionResult& result) {
    if(!action_result_.available) return false;
    result = action_result_;
    action_result_.available = false;
    return true;
}

void MermaidLinkS3::sendStatus() {
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

void MermaidLinkS3::sendCatalog() {
    uint8_t payload[8]{};
    writeU16(&payload[0], catalog_.total);
    writeU16(&payload[2], catalog_.ready);
    writeU16(&payload[4], catalog_.needs_adapter);
    writeU16(&payload[6], catalog_.blocked);
    sendFrame(MermaidMsgType::Catalog, payload, sizeof(payload));
}

void MermaidLinkS3::sendReadyResult(bool ready, const char* reason) {
    uint8_t payload[MERMAID_LINK_MAX_PAYLOAD]{};
    payload[0] = ready ? 1U : 0U;
    const size_t n = reason ? strnlen(reason, MERMAID_LINK_MAX_PAYLOAD - 2U) : 0U;
    if(n) memcpy(&payload[1], reason, n);
    sendFrame(MermaidMsgType::ReadyResult, payload, static_cast<uint16_t>(1U + n));
}

void MermaidLinkS3::dispatch(uint8_t type, const uint8_t* payload, uint16_t length) {
    state_.packets_rx++;
    last_peer_ms_ = millis();

    switch(static_cast<MermaidMsgType>(type)) {
    case MermaidMsgType::Hello:
    case MermaidMsgType::StatusRequest:
        sendStatus();
        break;
    case MermaidMsgType::CatalogRequest:
        sendCatalog();
        break;
    case MermaidMsgType::Stop:
        state_.stop_asserted = true;
        execution_authorized_ = false;
        sendStatus();
        break;
    case MermaidMsgType::ReadyRequest: {
        const bool ready = execution_authorized_ && state_.codex_linked && !state_.approval_pending;
        state_.stop_asserted = !ready;
        sendReadyResult(ready, ready ? "ready" : "gates_not_ready");
        if(!ready) state_.faults++;
        sendStatus();
        break;
    }
    case MermaidMsgType::Approval:
        if(length >= 1U) state_.approval_pending = payload[0] == 0U;
        sendStatus();
        break;
    case MermaidMsgType::ActionResult:
        if(length >= 6U) {
            action_result_.job_id = readU32(&payload[0]);
            action_result_.code = static_cast<int16_t>(readU16(&payload[4]));
            const size_t text_len = length - 6U;
            const size_t copy_len = text_len < sizeof(action_result_.text) - 1U ? text_len : sizeof(action_result_.text) - 1U;
            if(copy_len) memcpy(action_result_.text, &payload[6], copy_len);
            action_result_.text[copy_len] = '\0';
            action_result_.available = true;
        } else {
            state_.faults++;
        }
        break;
    default:
        state_.faults++;
        break;
    }
}

bool MermaidLinkS3::decodeOne() {
    if(rx_len_ < HEADER_SIZE + CRC_SIZE) return false;
    size_t start = 0;
    while(start + 1U < rx_len_ && !(rx_[start] == MAGIC0 && rx_[start + 1U] == MAGIC1)) ++start;
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
    if(expected == actual) dispatch(rx_[3], &rx_[HEADER_SIZE], length);
    else state_.faults++;
    memmove(rx_, rx_ + frame_size, rx_len_ - frame_size);
    rx_len_ -= frame_size;
    return true;
}

void MermaidLinkS3::poll() {
    while(serial_.available() && rx_len_ < sizeof(rx_)) rx_[rx_len_++] = static_cast<uint8_t>(serial_.read());
    while(decodeOne()) {}
    state_.heartbeat_ms = millis() - last_peer_ms_;
    if(state_.heartbeat_ms > 3000U) {
        state_.stop_asserted = true;
        execution_authorized_ = false;
    }
    if(rx_len_ == sizeof(rx_)) {
        rx_len_ = 0;
        state_.faults++;
    }
}

} // namespace s1r3n::s3
