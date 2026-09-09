#include "flipper_bridge.h"
#include "config.h"

#include <ArduinoJson.h>
#include <algorithm>

namespace m3rma1d {
namespace {

constexpr uint8_t EXP_HEARTBEAT = 1;
constexpr uint8_t EXP_STATUS = 2;
constexpr uint8_t EXP_BAUD_RATE = 3;
constexpr uint8_t EXP_CONTROL = 4;
constexpr uint8_t EXP_DATA = 5;
constexpr uint8_t EXP_START_RPC = 0;
constexpr uint8_t EXP_STOP_RPC = 1;
constexpr uint32_t EXPANSION_RETRY_MS = 500;
constexpr uint32_t EXPANSION_HEARTBEAT_MS = 1000;
constexpr uint32_t EXPANSION_BAUD_SETTLE_MS = 25;
constexpr size_t RPC_MAX_MESSAGE = 4096;

void append_varint(std::vector<uint8_t>& out, uint64_t value) {
    while(value >= 0x80U) {
        out.push_back(static_cast<uint8_t>(value) | 0x80U);
        value >>= 7U;
    }
    out.push_back(static_cast<uint8_t>(value));
}

void append_key(std::vector<uint8_t>& out, uint32_t field, uint8_t wire_type) {
    append_varint(out, (static_cast<uint64_t>(field) << 3U) | wire_type);
}

void append_varint_field(std::vector<uint8_t>& out, uint32_t field, uint64_t value) {
    append_key(out, field, 0);
    append_varint(out, value);
}

void append_bytes_field(
    std::vector<uint8_t>& out,
    uint32_t field,
    const uint8_t* data,
    size_t length) {
    append_key(out, field, 2);
    append_varint(out, length);
    if(length && data) out.insert(out.end(), data, data + length);
}

void append_string_field(std::vector<uint8_t>& out, uint32_t field, const String& value) {
    append_bytes_field(
        out,
        field,
        reinterpret_cast<const uint8_t*>(value.c_str()),
        value.length());
}

void append_message_field(
    std::vector<uint8_t>& out,
    uint32_t field,
    const std::vector<uint8_t>& message) {
    append_bytes_field(out, field, message.data(), message.size());
}

bool read_varint(const uint8_t* data, size_t length, size_t& offset, uint64_t& value) {
    value = 0;
    uint8_t shift = 0;
    while(offset < length && shift < 64) {
        const uint8_t byte = data[offset++];
        value |= static_cast<uint64_t>(byte & 0x7fU) << shift;
        if((byte & 0x80U) == 0) return true;
        shift += 7;
    }
    return false;
}

bool read_length_delimited(
    const uint8_t* data,
    size_t length,
    size_t& offset,
    const uint8_t*& ptr,
    size_t& value_length) {
    uint64_t encoded_length = 0;
    if(!read_varint(data, length, offset, encoded_length)) return false;
    if(encoded_length > length - offset) return false;
    ptr = data + offset;
    value_length = static_cast<size_t>(encoded_length);
    offset += value_length;
    return true;
}

bool skip_field(const uint8_t* data, size_t length, size_t& offset, uint8_t wire_type) {
    uint64_t ignored = 0;
    const uint8_t* ptr = nullptr;
    size_t value_length = 0;
    switch(wire_type) {
    case 0:
        return read_varint(data, length, offset, ignored);
    case 1:
        if(length - offset < 8) return false;
        offset += 8;
        return true;
    case 2:
        return read_length_delimited(data, length, offset, ptr, value_length);
    case 5:
        if(length - offset < 4) return false;
        offset += 4;
        return true;
    default:
        return false;
    }
}

bool find_varint_field(
    const std::vector<uint8_t>& message,
    uint32_t wanted_field,
    uint64_t& value) {
    size_t offset = 0;
    while(offset < message.size()) {
        uint64_t key = 0;
        if(!read_varint(message.data(), message.size(), offset, key)) return false;
        const uint32_t field = static_cast<uint32_t>(key >> 3U);
        const uint8_t wire = static_cast<uint8_t>(key & 0x07U);
        if(field == wanted_field && wire == 0) {
            return read_varint(message.data(), message.size(), offset, value);
        }
        if(!skip_field(message.data(), message.size(), offset, wire)) return false;
    }
    return false;
}

bool find_string_field(
    const std::vector<uint8_t>& message,
    uint32_t wanted_field,
    String& value) {
    size_t offset = 0;
    while(offset < message.size()) {
        uint64_t key = 0;
        if(!read_varint(message.data(), message.size(), offset, key)) return false;
        const uint32_t field = static_cast<uint32_t>(key >> 3U);
        const uint8_t wire = static_cast<uint8_t>(key & 0x07U);
        if(field == wanted_field && wire == 2) {
            const uint8_t* ptr = nullptr;
            size_t value_length = 0;
            if(!read_length_delimited(
                   message.data(), message.size(), offset, ptr, value_length)) return false;
            value = "";
            value.reserve(value_length);
            for(size_t i = 0; i < value_length; ++i) value += static_cast<char>(ptr[i]);
            return true;
        }
        if(!skip_field(message.data(), message.size(), offset, wire)) return false;
    }
    return false;
}

std::vector<std::vector<uint8_t>> find_messages(
    const std::vector<uint8_t>& message,
    uint32_t wanted_field) {
    std::vector<std::vector<uint8_t>> values;
    size_t offset = 0;
    while(offset < message.size()) {
        uint64_t key = 0;
        if(!read_varint(message.data(), message.size(), offset, key)) break;
        const uint32_t field = static_cast<uint32_t>(key >> 3U);
        const uint8_t wire = static_cast<uint8_t>(key & 0x07U);
        if(field == wanted_field && wire == 2) {
            const uint8_t* ptr = nullptr;
            size_t value_length = 0;
            if(!read_length_delimited(
                   message.data(), message.size(), offset, ptr, value_length)) break;
            values.emplace_back(ptr, ptr + value_length);
        } else if(!skip_field(message.data(), message.size(), offset, wire)) {
            break;
        }
    }
    return values;
}

String file_summary(const std::vector<uint8_t>& file) {
    uint64_t type = 0;
    uint64_t size = 0;
    String name;
    find_varint_field(file, 1, type);
    find_string_field(file, 2, name);
    find_varint_field(file, 3, size);
    String out = type == 1 ? "DIR " : "FILE ";
    out += name.length() ? name : "(unnamed)";
    out += " size=";
    out += String(static_cast<unsigned long long>(size));
    return out;
}

bool read_exact(HardwareSerial& serial, uint8_t* out, size_t length, uint32_t timeout_ms) {
    const uint32_t started = millis();
    size_t offset = 0;
    while(offset < length && millis() - started < timeout_ms) {
        while(serial.available() && offset < length) {
            out[offset++] = static_cast<uint8_t>(serial.read());
        }
        if(offset < length) delay(1);
    }
    return offset == length;
}

uint8_t xor_checksum(const uint8_t* data, size_t length) {
    uint8_t checksum = 0;
    for(size_t i = 0; i < length; ++i) checksum ^= data[i];
    return checksum;
}

bool parse_gui_key(const String& key, uint32_t& value) {
    if(key == "up") value = 0;
    else if(key == "down") value = 1;
    else if(key == "right") value = 2;
    else if(key == "left") value = 3;
    else if(key == "ok") value = 4;
    else if(key == "back") value = 5;
    else return false;
    return true;
}

bool parse_gui_type(const String& type, uint32_t& value) {
    if(type == "press") value = 0;
    else if(type == "release") value = 1;
    else if(type == "short") value = 2;
    else if(type == "long") value = 3;
    else if(type == "repeat") value = 4;
    else return false;
    return true;
}

bool parse_gpio_pin(const String& pin, uint32_t& value) {
    static const char* const pins[] = {"PC0", "PC1", "PC3", "PB2", "PB3", "PA4", "PA6", "PA7"};
    for(uint32_t i = 0; i < 8; ++i) {
        if(pin == pins[i]) {
            value = i;
            return true;
        }
    }
    return false;
}

} // namespace

void FlipperBridge::drain_serial() {
    while(serial_.available()) serial_.read();
}

void FlipperBridge::mark_disconnected() {
    state_ = LinkState::Disconnected;
    last_rx_ms_ = 0;
    rpc_rx_pending_.clear();
    serial_.updateBaudRate(FLIPPER_EXPANSION_DISCOVERY_BAUD);
}

void FlipperBridge::begin() {
    serial_.begin(
        FLIPPER_EXPANSION_DISCOVERY_BAUD,
        SERIAL_8N1,
        FLIPPER_RX_GPIO,
        FLIPPER_TX_GPIO);
    state_ = LinkState::Disconnected;
    stop_asserted_ = true;
    last_rx_ms_ = 0;
    last_ping_ms_ = 0;
    last_connect_attempt_ms_ = 0;
    rpc_rx_pending_.clear();
    drain_serial();
}

bool FlipperBridge::linked() const {
    return state_ != LinkState::Disconnected && last_rx_ms_ != 0 &&
           (millis() - last_rx_ms_) <= FLIPPER_STALE_MS;
}

bool FlipperBridge::rpc_ready() const {
    return state_ == LinkState::RpcActive && linked();
}

bool FlipperBridge::send_expansion_frame(
    uint8_t type,
    const uint8_t* content,
    size_t content_len) {
    if(type == EXP_DATA && content_len > FLIPPER_EXPANSION_DATA_MAX) return false;
    if(type != EXP_DATA) {
        const size_t expected = type == EXP_HEARTBEAT ? 0 :
                                type == EXP_STATUS ? 1 :
                                type == EXP_BAUD_RATE ? 4 :
                                type == EXP_CONTROL ? 1 : SIZE_MAX;
        if(expected == SIZE_MAX || content_len != expected) return false;
    }

    std::vector<uint8_t> frame;
    frame.reserve(content_len + 3);
    frame.push_back(type);
    if(type == EXP_DATA) frame.push_back(static_cast<uint8_t>(content_len));
    if(content_len && content) frame.insert(frame.end(), content, content + content_len);
    frame.push_back(xor_checksum(frame.data(), frame.size()));
    return serial_.write(frame.data(), frame.size()) == frame.size();
}

bool FlipperBridge::receive_expansion_frame(
    uint8_t& type,
    std::vector<uint8_t>& content,
    uint32_t timeout_ms) {
    content.clear();
    uint8_t first = 0;
    if(!read_exact(serial_, &first, 1, timeout_ms)) return false;
    type = first;

    size_t content_len = 0;
    uint8_t data_len = 0;
    if(type == EXP_HEARTBEAT) content_len = 0;
    else if(type == EXP_STATUS) content_len = 1;
    else if(type == EXP_BAUD_RATE) content_len = 4;
    else if(type == EXP_CONTROL) content_len = 1;
    else if(type == EXP_DATA) {
        if(!read_exact(serial_, &data_len, 1, timeout_ms)) return false;
        if(data_len > FLIPPER_EXPANSION_DATA_MAX) return false;
        content_len = data_len;
    } else {
        return false;
    }

    content.resize(content_len);
    if(content_len && !read_exact(serial_, content.data(), content_len, timeout_ms)) return false;
    uint8_t received_checksum = 0;
    if(!read_exact(serial_, &received_checksum, 1, timeout_ms)) return false;

    std::vector<uint8_t> check;
    check.reserve(content_len + 2);
    check.push_back(type);
    if(type == EXP_DATA) check.push_back(data_len);
    if(content_len) check.insert(check.end(), content.begin(), content.end());
    if(xor_checksum(check.data(), check.size()) != received_checksum) return false;

    last_rx_ms_ = millis();
    return true;
}

bool FlipperBridge::wait_status(uint32_t timeout_ms) {
    uint8_t type = 0;
    std::vector<uint8_t> content;
    if(!receive_expansion_frame(type, content, timeout_ms)) return false;
    return type == EXP_STATUS && content.size() == 1 && content[0] == 0;
}

bool FlipperBridge::send_status_ack(uint8_t error) {
    return send_expansion_frame(EXP_STATUS, &error, 1);
}

bool FlipperBridge::heartbeat(uint32_t timeout_ms) {
    if(!send_expansion_frame(EXP_HEARTBEAT, nullptr, 0)) return false;
    uint8_t type = 0;
    std::vector<uint8_t> content;
    return receive_expansion_frame(type, content, timeout_ms) && type == EXP_HEARTBEAT;
}

bool FlipperBridge::connect_expansion(uint32_t timeout_ms) {
    if(state_ != LinkState::Disconnected) return true;
    serial_.updateBaudRate(FLIPPER_EXPANSION_DISCOVERY_BAUD);
    drain_serial();

    // The stock Flipper Expansion service detects a module-presence pulse and
    // answers with a heartbeat at the default 9600 baud.
    const uint8_t presence = 0xaa;
    if(serial_.write(&presence, 1) != 1) return false;
    serial_.flush();

    uint8_t type = 0;
    std::vector<uint8_t> content;
    if(!receive_expansion_frame(type, content, timeout_ms) || type != EXP_HEARTBEAT) {
        mark_disconnected();
        return false;
    }

    uint8_t baud[4] = {
        static_cast<uint8_t>(FLIPPER_BAUD & 0xffU),
        static_cast<uint8_t>((FLIPPER_BAUD >> 8U) & 0xffU),
        static_cast<uint8_t>((FLIPPER_BAUD >> 16U) & 0xffU),
        static_cast<uint8_t>((FLIPPER_BAUD >> 24U) & 0xffU),
    };
    if(!send_expansion_frame(EXP_BAUD_RATE, baud, sizeof(baud)) || !wait_status(timeout_ms)) {
        mark_disconnected();
        return false;
    }

    serial_.flush();
    serial_.updateBaudRate(FLIPPER_BAUD);
    delay(EXPANSION_BAUD_SETTLE_MS);
    state_ = LinkState::ExpansionConnected;
    last_rx_ms_ = millis();
    return true;
}

bool FlipperBridge::start_rpc(uint32_t timeout_ms) {
    if(state_ == LinkState::RpcActive) return true;
    if(state_ != LinkState::ExpansionConnected) return false;
    const uint8_t command = EXP_START_RPC;
    if(!send_expansion_frame(EXP_CONTROL, &command, 1) || !wait_status(timeout_ms)) {
        mark_disconnected();
        return false;
    }
    state_ = LinkState::RpcActive;
    rpc_rx_pending_.clear();
    return true;
}

bool FlipperBridge::stop_rpc(uint32_t timeout_ms) {
    if(state_ != LinkState::RpcActive) return true;
    const uint8_t command = EXP_STOP_RPC;
    if(!send_expansion_frame(EXP_CONTROL, &command, 1) || !wait_status(timeout_ms)) {
        mark_disconnected();
        return false;
    }
    state_ = LinkState::ExpansionConnected;
    rpc_rx_pending_.clear();
    return true;
}

bool FlipperBridge::ensure_rpc(uint32_t timeout_ms) {
    if(rpc_ready()) return true;
    if(state_ == LinkState::Disconnected && !connect_expansion(timeout_ms)) return false;
    if(state_ == LinkState::ExpansionConnected && !start_rpc(timeout_ms)) return false;
    return rpc_ready();
}

void FlipperBridge::poll() {
    const uint32_t now = millis();
    if(state_ == LinkState::Disconnected) {
        if(now - last_connect_attempt_ms_ >= EXPANSION_RETRY_MS) {
            last_connect_attempt_ms_ = now;
            connect_expansion(180);
        }
        return;
    }

    if(!linked()) {
        mark_disconnected();
        stop_asserted_ = true;
        return;
    }

    if(now - last_ping_ms_ >= EXPANSION_HEARTBEAT_MS) {
        last_ping_ms_ = now;
        if(!heartbeat(180)) {
            mark_disconnected();
            stop_asserted_ = true;
        }
    }
}

void FlipperBridge::assert_stop(uint32_t) {
    // STOP is enforced by the physical owner (S3-CAM) before any RPC request
    // is emitted. It is intentionally local and fail-closed.
    stop_asserted_ = true;
}

void FlipperBridge::clear_stop() {
    if(ensure_rpc(500)) stop_asserted_ = false;
}

bool FlipperBridge::send_rpc_message(
    const std::vector<uint8_t>& message,
    uint32_t timeout_ms) {
    std::vector<uint8_t> delimited;
    append_varint(delimited, message.size());
    delimited.insert(delimited.end(), message.begin(), message.end());

    size_t offset = 0;
    while(offset < delimited.size()) {
        const size_t chunk = std::min<size_t>(
            FLIPPER_EXPANSION_DATA_MAX,
            delimited.size() - offset);
        if(!send_expansion_frame(EXP_DATA, delimited.data() + offset, chunk) ||
           !wait_status(timeout_ms)) {
            mark_disconnected();
            return false;
        }
        offset += chunk;
    }
    return true;
}

bool FlipperBridge::receive_rpc_message(
    std::vector<uint8_t>& message,
    uint32_t timeout_ms) {
    message.clear();
    const uint32_t started = millis();

    while(millis() - started < timeout_ms) {
        if(!rpc_rx_pending_.empty()) {
            size_t prefix_offset = 0;
            uint64_t body_length = 0;
            if(read_varint(
                   rpc_rx_pending_.data(),
                   rpc_rx_pending_.size(),
                   prefix_offset,
                   body_length)) {
                if(body_length > RPC_MAX_MESSAGE) {
                    mark_disconnected();
                    return false;
                }
                if(rpc_rx_pending_.size() >= prefix_offset + body_length) {
                    message.assign(
                        rpc_rx_pending_.begin() + prefix_offset,
                        rpc_rx_pending_.begin() + prefix_offset + body_length);
                    rpc_rx_pending_.erase(
                        rpc_rx_pending_.begin(),
                        rpc_rx_pending_.begin() + prefix_offset + body_length);
                    return true;
                }
            }
        }

        uint8_t type = 0;
        std::vector<uint8_t> content;
        const uint32_t remaining = timeout_ms - std::min<uint32_t>(timeout_ms, millis() - started);
        if(!receive_expansion_frame(type, content, remaining)) return false;

        if(type == EXP_DATA) {
            if(!send_status_ack()) return false;
            if(rpc_rx_pending_.size() + content.size() > RPC_MAX_MESSAGE + 16U) {
                mark_disconnected();
                return false;
            }
            rpc_rx_pending_.insert(rpc_rx_pending_.end(), content.begin(), content.end());
        } else if(type == EXP_HEARTBEAT) {
            if(!send_expansion_frame(EXP_HEARTBEAT, nullptr, 0)) return false;
        } else {
            return false;
        }
    }
    return false;
}

bool FlipperBridge::parse_rpc_message(
    const std::vector<uint8_t>& bytes,
    RpcMessage& message) const {
    message = {};
    size_t offset = 0;
    while(offset < bytes.size()) {
        uint64_t key = 0;
        if(!read_varint(bytes.data(), bytes.size(), offset, key)) return false;
        const uint32_t field = static_cast<uint32_t>(key >> 3U);
        const uint8_t wire = static_cast<uint8_t>(key & 0x07U);
        if((field == 1 || field == 2 || field == 3) && wire == 0) {
            uint64_t value = 0;
            if(!read_varint(bytes.data(), bytes.size(), offset, value)) return false;
            if(field == 1) message.command_id = static_cast<uint32_t>(value);
            else if(field == 2) message.command_status = static_cast<uint32_t>(value);
            else message.has_next = value != 0;
        } else if(wire == 2 && field >= 4) {
            const uint8_t* ptr = nullptr;
            size_t length = 0;
            if(!read_length_delimited(bytes.data(), bytes.size(), offset, ptr, length)) return false;
            message.content_field = field;
            message.content.assign(ptr, ptr + length);
        } else if(!skip_field(bytes.data(), bytes.size(), offset, wire)) {
            return false;
        }
    }
    return true;
}

bool FlipperBridge::build_rpc_request(
    uint32_t command_id,
    FlipperAction action,
    const String& argument,
    std::vector<uint8_t>& message,
    String& error) const {
    message.clear();
    error = "";
    std::vector<uint8_t> sub;
    uint32_t content_field = 0;

    switch(action) {
    case FlipperAction::SystemDeviceInfo:
        content_field = 32;
        break;
    case FlipperAction::SystemPowerInfo:
        content_field = 44;
        break;
    case FlipperAction::StorageInfo:
        content_field = 28;
        append_string_field(sub, 1, argument);
        break;
    case FlipperAction::StorageList:
        content_field = 7;
        append_string_field(sub, 1, argument);
        break;
    case FlipperAction::StorageStat:
        content_field = 24;
        append_string_field(sub, 1, argument);
        break;
    case FlipperAction::AppStart: {
        JsonDocument doc;
        if(deserializeJson(doc, argument)) {
            error = "app_start argument JSON invalid";
            return false;
        }
        const String name = doc["app_name"].as<String>();
        const String args = doc["args"].as<String>();
        if(name.isEmpty()) {
            error = "app_start app_name missing";
            return false;
        }
        content_field = 16;
        append_string_field(sub, 1, name);
        append_string_field(sub, 2, args);
        break;
    }
    case FlipperAction::AppExit:
        content_field = 47;
        break;
    case FlipperAction::AppLoadFile:
        content_field = 48;
        append_string_field(sub, 1, argument);
        break;
    case FlipperAction::GuiInput: {
        JsonDocument doc;
        if(deserializeJson(doc, argument)) {
            error = "gui_input argument JSON invalid";
            return false;
        }
        uint32_t key = 0;
        uint32_t type = 0;
        if(!parse_gui_key(doc["key"].as<String>(), key) ||
           !parse_gui_type(doc["press"].as<String>(), type)) {
            error = "gui_input key/type invalid";
            return false;
        }
        content_field = 23;
        append_varint_field(sub, 1, key);
        append_varint_field(sub, 2, type);
        break;
    }
    case FlipperAction::GpioRead: {
        uint32_t pin = 0;
        if(!parse_gpio_pin(argument, pin)) {
            error = "gpio_read pin invalid";
            return false;
        }
        content_field = 55;
        append_varint_field(sub, 1, pin);
        break;
    }
    case FlipperAction::PropertyGet:
        content_field = 61;
        append_string_field(sub, 1, argument);
        break;
    case FlipperAction::TransportPing: {
        content_field = 5;
        static const uint8_t ping[] = {'M', '3'};
        append_bytes_field(sub, 1, ping, sizeof(ping));
        break;
    }
    case FlipperAction::RfTransmitOwnedProfile:
    case FlipperAction::CredentialReference:
    case FlipperAction::AuthValidateOnce:
        error = "operation denied by device policy";
        return false;
    default:
        error = "unsupported Flipper action";
        return false;
    }

    append_varint_field(message, 1, command_id);
    append_message_field(message, content_field, sub);
    return message.size() <= RPC_MAX_MESSAGE;
}

String FlipperBridge::decode_rpc_content(
    FlipperAction action,
    const RpcMessage& message) const {
    if(message.content_field == 4) return "OK";

    if(action == FlipperAction::SystemDeviceInfo ||
       action == FlipperAction::SystemPowerInfo ||
       action == FlipperAction::PropertyGet) {
        String key;
        String value;
        find_string_field(message.content, 1, key);
        find_string_field(message.content, 2, value);
        if(key.length() || value.length()) return key + "=" + value;
    }

    if(action == FlipperAction::StorageInfo) {
        uint64_t total = 0;
        uint64_t free_space = 0;
        find_varint_field(message.content, 1, total);
        find_varint_field(message.content, 2, free_space);
        return String("total_space=") + String(static_cast<unsigned long long>(total)) +
               ";free_space=" + String(static_cast<unsigned long long>(free_space));
    }

    if(action == FlipperAction::StorageStat) {
        const auto files = find_messages(message.content, 1);
        if(!files.empty()) return file_summary(files.front());
    }

    if(action == FlipperAction::StorageList) {
        const auto files = find_messages(message.content, 1);
        String out;
        for(size_t i = 0; i < files.size(); ++i) {
            if(i) out += "\n";
            out += file_summary(files[i]);
        }
        return out;
    }

    if(action == FlipperAction::GpioRead) {
        uint64_t value = 0;
        if(find_varint_field(message.content, 2, value)) {
            return String("value=") + String(static_cast<unsigned long>(value));
        }
    }

    if(action == FlipperAction::TransportPing) return "pong";
    return message.content.empty() ? "OK" : String("RPC response field ") + message.content_field;
}

bool FlipperBridge::execute(
    uint32_t job_id,
    FlipperAction action,
    const String& argument,
    uint32_t timeout_ms,
    FlipperResult& result) {
    result = {};
    result.job_id = job_id;

    if(stop_asserted_) {
        result.code = -10;
        result.text = "STOP asserted";
        return false;
    }

    const uint32_t bounded_timeout = std::min<uint32_t>(timeout_ms ? timeout_ms : 3000U, 15000U);
    if(!ensure_rpc(std::min<uint32_t>(bounded_timeout, 1500U))) {
        result.code = -11;
        result.text = "Flipper Expansion RPC offline";
        return false;
    }

    std::vector<uint8_t> request;
    String build_error;
    if(!build_rpc_request(job_id, action, argument, request, build_error)) {
        result.code = -12;
        result.text = build_error;
        return false;
    }

    if(!send_rpc_message(request, bounded_timeout)) {
        result.code = -13;
        result.text = "Flipper RPC transport write failed";
        return false;
    }

    const uint32_t started = millis();
    String combined;
    while(millis() - started < bounded_timeout) {
        if(stop_asserted_) {
            result.code = -10;
            result.text = "STOP asserted";
            return false;
        }

        std::vector<uint8_t> response_bytes;
        const uint32_t remaining = bounded_timeout -
            std::min<uint32_t>(bounded_timeout, millis() - started);
        if(!receive_rpc_message(response_bytes, remaining)) {
            result.code = -14;
            result.text = "Flipper RPC response timeout";
            return false;
        }

        RpcMessage response;
        if(!parse_rpc_message(response_bytes, response)) {
            result.code = -15;
            result.text = "Flipper RPC response decode failed";
            return false;
        }

        // App state notifications and other asynchronous messages may be
        // emitted with command_id 0. They must not satisfy a correlated job.
        if(response.command_id != job_id) continue;

        if(response.command_status != 0) {
            result.code = static_cast<int16_t>(-100 - static_cast<int32_t>(response.command_status));
            result.text = String("Flipper RPC status=") + response.command_status;
            return false;
        }

        const String decoded = decode_rpc_content(action, response);
        if(decoded.length()) {
            if(combined.length()) combined += "\n";
            combined += decoded;
        }

        if(!response.has_next) {
            result.code = 0;
            result.text = combined.length() ? combined : "OK";
            last_rx_ms_ = millis();
            return true;
        }
    }

    result.code = -14;
    result.text = "Flipper RPC response timeout";
    return false;
}

} // namespace m3rma1d
