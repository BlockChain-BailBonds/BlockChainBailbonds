#include "flipper_bridge.h"
#include "config.h"

#include <cstring>

namespace m3rma1d {
namespace {
constexpr uint8_t MAGIC0 = 'M';
constexpr uint8_t MAGIC1 = '3';
constexpr uint8_t MSG_HELLO = 1;
constexpr uint8_t MSG_ACTION_REQUEST = 6;
constexpr uint8_t MSG_ACTION_RESULT = 7;
constexpr uint8_t MSG_STOP = 8;
constexpr size_t HEADER_SIZE = 10;
constexpr size_t CRC_SIZE = 4;

uint16_t read_u16(const uint8_t* p) {
    return static_cast<uint16_t>(p[0]) | (static_cast<uint16_t>(p[1]) << 8);
}
uint32_t read_u32(const uint8_t* p) {
    return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) |
           (static_cast<uint32_t>(p[2]) << 16) | (static_cast<uint32_t>(p[3]) << 24);
}
void write_u16(uint8_t* p, uint16_t value) {
    p[0] = static_cast<uint8_t>(value & 0xffU);
    p[1] = static_cast<uint8_t>((value >> 8) & 0xffU);
}
void write_u32(uint8_t* p, uint32_t value) {
    p[0] = static_cast<uint8_t>(value & 0xffU);
    p[1] = static_cast<uint8_t>((value >> 8) & 0xffU);
    p[2] = static_cast<uint8_t>((value >> 16) & 0xffU);
    p[3] = static_cast<uint8_t>((value >> 24) & 0xffU);
}
uint32_t crc32(const uint8_t* data, size_t length) {
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
}

void FlipperBridge::begin() {
    serial_.begin(FLIPPER_BAUD, SERIAL_8N1, FLIPPER_RX_GPIO, FLIPPER_TX_GPIO);
    stop_asserted_ = true;
    rx_len_ = 0;
    last_rx_ms_ = 0;
    const uint8_t hello[2] = {'S', '3'};
    send_frame(MSG_HELLO, hello, sizeof(hello));
}

void FlipperBridge::read_serial() {
    while(serial_.available() && rx_len_ < sizeof(rx_)) {
        rx_[rx_len_++] = static_cast<uint8_t>(serial_.read());
        last_rx_ms_ = millis();
    }
    if(rx_len_ == sizeof(rx_)) rx_len_ = 0;
}

void FlipperBridge::poll() {
    read_serial();
    while(decode_one(nullptr, 0)) {}
    if(!linked()) stop_asserted_ = true;
}

bool FlipperBridge::linked() const {
    return last_rx_ms_ != 0 && (millis() - last_rx_ms_) <= FLIPPER_STALE_MS;
}

bool FlipperBridge::send_frame(uint8_t type, const uint8_t* payload, uint16_t length) {
    if(length > MERMAID_LINK_MAX_PAYLOAD) return false;
    uint8_t frame[HEADER_SIZE + MERMAID_LINK_MAX_PAYLOAD + CRC_SIZE];
    frame[0] = MAGIC0;
    frame[1] = MAGIC1;
    frame[2] = MERMAID_LINK_VERSION;
    frame[3] = type;
    write_u32(&frame[4], next_seq_++);
    write_u16(&frame[8], length);
    if(length && payload) memcpy(&frame[HEADER_SIZE], payload, length);
    write_u32(&frame[HEADER_SIZE + length], crc32(&frame[2], HEADER_SIZE - 2 + length));
    return serial_.write(frame, HEADER_SIZE + length + CRC_SIZE) == HEADER_SIZE + length + CRC_SIZE;
}

bool FlipperBridge::decode_one(FlipperResult* awaited, uint32_t awaited_job_id) {
    if(rx_len_ < HEADER_SIZE + CRC_SIZE) return false;
    size_t start = 0;
    while(start + 1 < rx_len_ && !(rx_[start] == MAGIC0 && rx_[start + 1] == MAGIC1)) ++start;
    if(start) {
        memmove(rx_, rx_ + start, rx_len_ - start);
        rx_len_ -= start;
        return true;
    }
    if(rx_[2] != MERMAID_LINK_VERSION) {
        memmove(rx_, rx_ + 2, rx_len_ - 2);
        rx_len_ -= 2;
        return true;
    }
    const uint16_t length = read_u16(&rx_[8]);
    if(length > MERMAID_LINK_MAX_PAYLOAD) {
        memmove(rx_, rx_ + 2, rx_len_ - 2);
        rx_len_ -= 2;
        return true;
    }
    const size_t frame_size = HEADER_SIZE + length + CRC_SIZE;
    if(rx_len_ < frame_size) return false;
    const uint32_t expected = read_u32(&rx_[HEADER_SIZE + length]);
    const uint32_t actual = crc32(&rx_[2], HEADER_SIZE - 2 + length);
    if(expected == actual) {
        const uint8_t type = rx_[3];
        const uint8_t* payload = &rx_[HEADER_SIZE];
        if(type == MSG_HELLO) last_rx_ms_ = millis();
        if(type == MSG_STOP) stop_asserted_ = true;
        if(type == MSG_ACTION_RESULT && awaited && length >= 6) {
            const uint32_t job_id = read_u32(payload);
            if(job_id == awaited_job_id) {
                awaited->job_id = job_id;
                awaited->code = static_cast<int16_t>(read_u16(payload + 4));
                const size_t text_len = min<size_t>(length - 6, MERMAID_LINK_MAX_PAYLOAD - 6);
                awaited->text = "";
                for(size_t i = 0; i < text_len; ++i) awaited->text += static_cast<char>(payload[6 + i]);
            }
        }
    }
    memmove(rx_, rx_ + frame_size, rx_len_ - frame_size);
    rx_len_ -= frame_size;
    return true;
}

void FlipperBridge::assert_stop(uint32_t job_id) {
    stop_asserted_ = true;
    uint8_t payload[4];
    write_u32(payload, job_id);
    send_frame(MSG_STOP, payload, sizeof(payload));
}

void FlipperBridge::clear_stop() {
    if(linked()) stop_asserted_ = false;
}

bool FlipperBridge::execute(
    uint32_t job_id,
    FlipperAction action,
    const String& argument,
    uint32_t timeout_ms,
    FlipperResult& result) {
    result = {};
    result.job_id = job_id;
    if(stop_asserted_) { result.code = -10; result.text = "STOP asserted"; return false; }
    if(!linked()) { result.code = -11; result.text = "Flipper offline"; return false; }
    if(argument.length() > MERMAID_LINK_MAX_PAYLOAD - 8) {
        result.code = -12; result.text = "argument too large"; return false;
    }

    uint8_t payload[MERMAID_LINK_MAX_PAYLOAD];
    write_u32(payload, job_id);
    write_u16(payload + 4, static_cast<uint16_t>(action));
    write_u16(payload + 6, static_cast<uint16_t>(argument.length()));
    if(argument.length()) memcpy(payload + 8, argument.c_str(), argument.length());
    if(!send_frame(MSG_ACTION_REQUEST, payload, static_cast<uint16_t>(8 + argument.length()))) {
        result.code = -13; result.text = "transport write failed"; return false;
    }

    const uint32_t start = millis();
    const uint32_t limit = min<uint32_t>(timeout_ms, 15000);
    while(millis() - start < limit) {
        read_serial();
        while(decode_one(&result, job_id)) {
            if(result.code != -1) return result.code == 0;
        }
        if(stop_asserted_) { result.code = -10; result.text = "STOP asserted"; return false; }
        delay(1);
    }
    result.code = -14;
    result.text = "Flipper response timeout";
    return false;
}
}
