#include "control_plane.h"
#include "camera_handler.h"
#include "config.h"

#include <LittleFS.h>
#include <algorithm>
#include <cstring>
#include <memory>
#include <vector>
#include <esp_system.h>
#include <mbedtls/base64.h>
#include <mbedtls/md.h>
#include <mbedtls/sha256.h>

namespace m3rma1d {
namespace {

constexpr size_t PERSISTED_NONCES = 16;
constexpr char HEX_DIGITS[] = "0123456789abcdef";

bool is_lower_hex(const String& value, size_t length) {
    if(value.length() != length) return false;
    for(size_t i = 0; i < value.length(); ++i) {
        const char c = value[i];
        if(!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
    }
    return true;
}

bool valid_id(const String& value) {
    if(value.isEmpty() || value.length() > 64) return false;
    for(size_t i = 0; i < value.length(); ++i) {
        const char c = value[i];
        if(!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
             (c >= '0' && c <= '9') || c == '.' || c == '_' || c == ':' || c == '-')) return false;
    }
    return true;
}

void stable_json_variant(JsonVariantConst value, String& out) {
    if(value.is<JsonObjectConst>()) {
        JsonObjectConst object = value.as<JsonObjectConst>();
        std::vector<String> keys;
        keys.reserve(object.size());
        for(JsonPairConst pair : object) keys.emplace_back(pair.key().c_str());
        std::sort(keys.begin(), keys.end(), [](const String& a, const String& b) { return a.compareTo(b) < 0; });
        out += '{';
        for(size_t i = 0; i < keys.size(); ++i) {
            if(i) out += ',';
            out += '"';
            out += keys[i];
            out += "\":";
            stable_json_variant(object[keys[i].c_str()], out);
        }
        out += '}';
        return;
    }
    if(value.is<JsonArrayConst>()) {
        out += '[';
        bool first = true;
        for(JsonVariantConst item : value.as<JsonArrayConst>()) {
            if(!first) out += ',';
            first = false;
            stable_json_variant(item, out);
        }
        out += ']';
        return;
    }
    serializeJson(value, out);
}

String stable_json(JsonVariantConst value) {
    String out;
    out.reserve(1024);
    stable_json_variant(value, out);
    return out;
}

String bytes_to_hex(const uint8_t* bytes, size_t length) {
    String out;
    out.reserve(length * 2);
    for(size_t i = 0; i < length; ++i) {
        out += HEX_DIGITS[(bytes[i] >> 4) & 0x0f];
        out += HEX_DIGITS[bytes[i] & 0x0f];
    }
    return out;
}

String sha256_hex(const uint8_t* data, size_t length) {
    uint8_t digest[32];
    mbedtls_sha256_context ctx;
    mbedtls_sha256_init(&ctx);
    mbedtls_sha256_starts_ret(&ctx, 0);
    mbedtls_sha256_update_ret(&ctx, data, length);
    mbedtls_sha256_finish_ret(&ctx, digest);
    mbedtls_sha256_free(&ctx);
    return bytes_to_hex(digest, sizeof(digest));
}

String sha256_file(const String& path) {
    File file = LittleFS.open(path, "r");
    if(!file) return String();
    mbedtls_sha256_context ctx;
    mbedtls_sha256_init(&ctx);
    mbedtls_sha256_starts_ret(&ctx, 0);
    uint8_t buffer[1024];
    while(file.available()) {
        const size_t got = file.read(buffer, sizeof(buffer));
        if(!got) break;
        mbedtls_sha256_update_ret(&ctx, buffer, got);
    }
    file.close();
    uint8_t digest[32];
    mbedtls_sha256_finish_ret(&ctx, digest);
    mbedtls_sha256_free(&ctx);
    return bytes_to_hex(digest, sizeof(digest));
}

String hmac_hex(const String& body) {
    const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if(!info) return String();
    uint8_t digest[32];
    const int rc = mbedtls_md_hmac(
        info,
        reinterpret_cast<const unsigned char*>(CONTROL_KEY),
        strlen(CONTROL_KEY),
        reinterpret_cast<const unsigned char*>(body.c_str()),
        body.length(),
        digest);
    return rc == 0 ? bytes_to_hex(digest, sizeof(digest)) : String();
}

bool constant_time_equal(const String& left, const String& right) {
    if(left.length() != right.length()) return false;
    uint8_t diff = 0;
    for(size_t i = 0; i < left.length(); ++i) diff |= static_cast<uint8_t>(left[i] ^ right[i]);
    return diff == 0;
}

bool valid_date(int year, int month, int day) {
    if(year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1) return false;
    static const uint8_t days[] = {31,28,31,30,31,30,31,31,30,31,30,31};
    int max_day = days[month - 1];
    const bool leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    if(month == 2 && leap) max_day = 29;
    return day <= max_day;
}

int64_t days_from_civil(int year, unsigned month, unsigned day) {
    year -= month <= 2;
    const int era = (year >= 0 ? year : year - 399) / 400;
    const unsigned yoe = static_cast<unsigned>(year - era * 400);
    const unsigned doy = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
    const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    return static_cast<int64_t>(era) * 146097 + static_cast<int64_t>(doe) - 719468;
}

bool parse_iso8601_ms(const String& value, uint64_t& epoch_ms) {
    if(value.length() != 24 || value[4] != '-' || value[7] != '-' || value[10] != 'T' ||
       value[13] != ':' || value[16] != ':' || value[19] != '.' || value[23] != 'Z') return false;
    const int positions[] = {0,1,2,3,5,6,8,9,11,12,14,15,17,18,20,21,22};
    for(int p : positions) if(value[p] < '0' || value[p] > '9') return false;
    const int year = value.substring(0, 4).toInt();
    const int month = value.substring(5, 7).toInt();
    const int day = value.substring(8, 10).toInt();
    const int hour = value.substring(11, 13).toInt();
    const int minute = value.substring(14, 16).toInt();
    const int second = value.substring(17, 19).toInt();
    const int millis = value.substring(20, 23).toInt();
    if(!valid_date(year, month, day) || hour > 23 || minute > 59 || second > 59) return false;
    const int64_t days = days_from_civil(year, static_cast<unsigned>(month), static_cast<unsigned>(day));
    if(days < 0) return false;
    epoch_ms = (static_cast<uint64_t>(days) * 86400ULL +
                static_cast<uint64_t>(hour) * 3600ULL +
                static_cast<uint64_t>(minute) * 60ULL +
                static_cast<uint64_t>(second)) * 1000ULL + static_cast<uint64_t>(millis);
    return true;
}

String random_upload_id() {
    char out[33];
    snprintf(out, sizeof(out), "%08lx%08lx%08lx%08lx",
        static_cast<unsigned long>(esp_random()),
        static_cast<unsigned long>(esp_random()),
        static_cast<unsigned long>(esp_random()),
        static_cast<unsigned long>(esp_random()));
    return String(out);
}

uint32_t fnv1a32(const String& value) {
    uint32_t hash = 0x811c9dc5U;
    for(size_t i = 0; i < value.length(); ++i) {
        hash ^= static_cast<uint8_t>(value[i]);
        hash *= 0x01000193U;
    }
    return hash == 0 ? 1U : hash;
}

void set_error(JsonDocument& payload, int status, const char* message) {
    payload["error"] = message;
    payload["http_status"] = status;
}

int take_status(JsonDocument& payload) {
    const int status = payload["http_status"].is<int>() ? payload["http_status"].as<int>() : 200;
    payload.as<JsonObject>().remove("http_status");
    return status;
}

} // namespace

bool ControlPlane::configured() const {
    return strlen(CONTROL_KEY) >= CONTROL_KEY_MIN_LENGTH;
}

bool ControlPlane::begin() {
    prefs_ready_ = prefs_.begin("s1r3n_ctl", false);
    if(prefs_ready_) {
        persisted_high_water_ms_ = prefs_.getULong64("high_ms", 0);
        for(size_t i = 0; i < PERSISTED_NONCES; ++i) {
            char key[8];
            snprintf(key, sizeof(key), "nonce%u", static_cast<unsigned>(i));
            replay_[i].nonce = prefs_.getString(key, "");
            replay_[i].seen_ms = millis();
        }
        replay_cursor_ = PERSISTED_NONCES;
    }
    LittleFS.mkdir("/staging");
    LittleFS.mkdir("/artifacts");
    if(!configured()) {
        Serial.println("S1R3N control plane disabled: provision M3RMA1D_CONTROL_KEY (>=32 chars)");
        return false;
    }
    Serial.println("S1R3N signed control plane ready; STOP remains fail-closed");
    return true;
}

void ControlPlane::register_routes() {
    server_.on("/v1/status", HTTP_POST, [this]() { handle_request("status.request"); });
    server_.on("/v1/inventory", HTTP_POST, [this]() { handle_request("inventory.request"); });
    server_.on("/v1/jobs", HTTP_POST, [this]() { handle_request("job.execute"); });
    server_.on("/v1/approvals", HTTP_POST, [this]() { handle_request("approval.request"); });
    server_.on("/v1/stop", HTTP_POST, [this]() { handle_request("stop.assert"); });
    server_.on("/v1/resume", HTTP_POST, [this]() { handle_request("stop.clear"); });
    server_.on("/v1/artifacts/begin", HTTP_POST, [this]() { handle_request("artifact.begin"); });
    server_.on("/v1/artifacts/chunk", HTTP_POST, [this]() { handle_request("artifact.chunk"); });
    server_.on("/v1/artifacts/commit", HTTP_POST, [this]() { handle_request("artifact.commit"); });
}

void ControlPlane::send_plain_error(int status, const char* message) {
    JsonDocument body;
    body["error"] = message;
    String encoded;
    serializeJson(body, encoded);
    server_.sendHeader("Cache-Control", "no-store");
    server_.send(status, "application/json", encoded);
}

bool ControlPlane::seen_nonce(const String& nonce) const {
    const uint32_t now = millis();
    for(const ReplayEntry& entry : replay_) {
        if(entry.nonce == nonce && (now - entry.seen_ms) <= CONTROL_REPLAY_TTL_MS) return true;
    }
    return false;
}

void ControlPlane::remember_nonce(const String& nonce) {
    const size_t memory_slot = replay_cursor_ % REPLAY_SLOTS;
    replay_[memory_slot].nonce = nonce;
    replay_[memory_slot].seen_ms = millis();
    if(prefs_ready_) {
        const size_t persistent_slot = replay_cursor_ % PERSISTED_NONCES;
        char key[8];
        snprintf(key, sizeof(key), "nonce%u", static_cast<unsigned>(persistent_slot));
        prefs_.putString(key, nonce);
    }
    replay_cursor_ = (replay_cursor_ + 1) % REPLAY_SLOTS;
}

uint64_t ControlPlane::signed_now_ms() const {
    if(!clock_anchored_) return 0;
    return anchor_epoch_ms_ + static_cast<uint32_t>(millis() - anchor_millis_);
}

bool ControlPlane::verify_request(JsonDocument& request, const String& raw_body, const char* expected_type, String& error) {
    if(raw_body.length() == 0 || raw_body.length() > CONTROL_MAX_REQUEST_BYTES) {
        error = "request size invalid";
        return false;
    }
    if(server_.header("x-s1r3n-protocol") != "1") {
        error = "protocol header mismatch";
        return false;
    }
    if(request["version"].as<int>() != 1 || request["type"].as<String>() != expected_type) {
        error = "version or type mismatch";
        return false;
    }

    const String nonce = request["nonce"].as<String>();
    const String signature = request["signature"].as<String>();
    const String timestamp = request["timestamp"].as<String>();
    JsonObjectConst root = request.as<JsonObjectConst>();
    JsonObjectConst route = request["route"].as<JsonObjectConst>();
    if(root.size() != 7 || route.size() != 3 || !route["fallback_physical_route"].is<bool>()) {
        error = "envelope shape invalid";
        return false;
    }
    if(!is_lower_hex(nonce, 32) || !is_lower_hex(signature, 64)) {
        error = "nonce or signature malformed";
        return false;
    }
    if(route["logical_target"].as<String>() != "flipper" ||
       route["physical_owner"].as<String>() != "s3-cam" ||
       route["fallback_physical_route"].as<bool>() != false) {
        error = "route mismatch";
        return false;
    }
    if(!request["payload"].is<JsonObjectConst>()) {
        error = "payload must be an object";
        return false;
    }

    request.as<JsonObject>().remove("signature");
    const String canonical = stable_json(request.as<JsonVariantConst>());
    request["signature"] = signature;
    const String expected_signature = hmac_hex(canonical);
    if(expected_signature.isEmpty() || !constant_time_equal(signature, expected_signature)) {
        error = "signature invalid";
        return false;
    }

    uint64_t request_ms = 0;
    if(!parse_iso8601_ms(timestamp, request_ms)) {
        error = "timestamp invalid";
        return false;
    }
    if(!clock_anchored_) {
        if(persisted_high_water_ms_ && request_ms + CONTROL_CLOCK_SKEW_MS < persisted_high_water_ms_) {
            error = "timestamp precedes persisted replay watermark";
            return false;
        }
        anchor_epoch_ms_ = request_ms;
        anchor_millis_ = millis();
        clock_anchored_ = true;
    } else {
        const uint64_t now_ms = signed_now_ms();
        const uint64_t delta = now_ms > request_ms ? now_ms - request_ms : request_ms - now_ms;
        if(delta > CONTROL_CLOCK_SKEW_MS) {
            error = "timestamp outside clock-skew window";
            return false;
        }
    }
    if(seen_nonce(nonce)) {
        error = "replayed nonce";
        return false;
    }

    remember_nonce(nonce);
    if(request_ms > persisted_high_water_ms_) {
        persisted_high_water_ms_ = request_ms;
        if(prefs_ready_) prefs_.putULong64("high_ms", persisted_high_water_ms_);
    }
    return true;
}

void ControlPlane::send_signed_result(const JsonDocument& request, JsonDocument& payload, int status) {
    JsonDocument response;
    response["version"] = 1;
    response["type"] = request["type"].as<String>() + ".result";
    response["timestamp"] = request["timestamp"].as<String>();
    response["request_nonce"] = request["nonce"].as<String>();
    JsonObject route = response["route"].to<JsonObject>();
    route["logical_target"] = "flipper";
    route["physical_owner"] = "s3-cam";
    route["fallback_physical_route"] = false;
    response["payload"].set(payload.as<JsonVariantConst>());
    response["signature"] = hmac_hex(stable_json(response.as<JsonVariantConst>()));
    String encoded;
    serializeJson(response, encoded);
    server_.sendHeader("Cache-Control", "no-store");
    server_.send(status, "application/json", encoded);
}

void ControlPlane::build_status(JsonDocument& payload) {
    payload["product"] = PRODUCT;
    payload["build"] = BUILD;
    payload["physical_owner"] = "s3-cam";
    payload["fallback_physical_route"] = false;
    payload["flipper_online"] = bridge_.linked();
    payload["camera_ready"] = camera_ready();
    payload["stop_asserted"] = bridge_.stop_asserted();
    payload["shell_enabled"] = false;
    payload["raw_cli_enabled"] = false;
    payload["signed_control_plane"] = configured();
    payload["typed_rpc_ready"] = false;
}

void ControlPlane::build_inventory(JsonDocument& payload) {
    if(!bridge_.linked()) {
        set_error(payload, 503, "Flipper offline");
        return;
    }
    // Do not manufacture an app inventory from the legacy CLI. The production
    // inventory gate stays closed until the typed protobuf RPC bridge exists.
    set_error(payload, 503, "typed Flipper RPC inventory not implemented");
    payload["flipper"]["online"] = true;
    payload["flipper"]["physical_owner"] = "s3-cam";
    payload["flipper"]["typed_rpc_ready"] = false;
}

void ControlPlane::handle_approval(const JsonDocument& request, JsonDocument& payload) {
    const String job_id = request["payload"]["job_id"].as<String>();
    payload["job_id"] = job_id;
    payload["accepted"] = true;
    payload["approved"] = false;
    payload["decision_surface"] = "host_point_click";
    payload["physical_owner"] = "s3-cam";
}

void ControlPlane::handle_stop(const JsonDocument&, JsonDocument& payload, bool clear) {
    if(clear) {
        bridge_.clear_stop();
        if(bridge_.stop_asserted()) {
            set_error(payload, 409, "Flipper offline; STOP remains asserted");
            payload["asserted"] = true;
            return;
        }
    } else {
        bridge_.assert_stop();
    }
    payload["asserted"] = bridge_.stop_asserted();
    payload["physical_owner"] = "s3-cam";
}

void ControlPlane::handle_artifact_begin(const JsonDocument& request, JsonDocument& payload) {
    JsonObjectConst p = request["payload"].as<JsonObjectConst>();
    const String id = p["id"].as<String>();
    const String kind = p["kind"].as<String>();
    const String sha = p["sha256"].as<String>();
    const uint32_t size = p["size"].as<uint32_t>();
    if(!valid_id(id) || kind.isEmpty() || kind.length() > 32 || !is_lower_hex(sha, 64) ||
       size == 0 || size > CONTROL_MAX_ARTIFACT_BYTES) {
        set_error(payload, 422, "artifact declaration invalid");
        return;
    }
    if(upload_.active) {
        set_error(payload, 409, "another artifact upload is active");
        return;
    }
    upload_.active = true;
    upload_.upload_id = random_upload_id();
    upload_.artifact_id = id;
    upload_.kind = kind;
    upload_.expected_sha256 = sha;
    upload_.expected_size = size;
    upload_.next_offset = 0;
    upload_.temp_path = String("/staging/") + upload_.upload_id + ".part";
    LittleFS.remove(upload_.temp_path);
    File file = LittleFS.open(upload_.temp_path, "w");
    if(!file) {
        upload_ = UploadState{};
        set_error(payload, 507, "artifact staging file unavailable");
        return;
    }
    file.close();
    payload["upload_id"] = upload_.upload_id;
    payload["chunk_size"] = CONTROL_ARTIFACT_CHUNK_BYTES;
}

void ControlPlane::handle_artifact_chunk(const JsonDocument& request, JsonDocument& payload) {
    if(!upload_.active) {
        set_error(payload, 409, "no active artifact upload");
        return;
    }
    JsonObjectConst p = request["payload"].as<JsonObjectConst>();
    const String upload_id = p["upload_id"].as<String>();
    const String id = p["id"].as<String>();
    const uint32_t offset = p["offset"].as<uint32_t>();
    const String encoded = p["data_base64"].as<String>();
    const String chunk_sha = p["chunk_sha256"].as<String>();
    if(upload_id != upload_.upload_id || id != upload_.artifact_id || offset != upload_.next_offset ||
       !is_lower_hex(chunk_sha, 64) || encoded.isEmpty() || encoded.length() > 6000) {
        set_error(payload, 422, "artifact chunk metadata invalid");
        return;
    }

    const size_t max_decoded = (encoded.length() * 3U) / 4U + 3U;
    if(max_decoded > CONTROL_ARTIFACT_CHUNK_BYTES + 3U) {
        set_error(payload, 413, "artifact chunk too large");
        return;
    }
    std::unique_ptr<uint8_t[]> decoded(new (std::nothrow) uint8_t[max_decoded]);
    if(!decoded) {
        set_error(payload, 503, "artifact chunk memory unavailable");
        return;
    }
    size_t decoded_len = 0;
    const int rc = mbedtls_base64_decode(decoded.get(), max_decoded, &decoded_len,
        reinterpret_cast<const unsigned char*>(encoded.c_str()), encoded.length());
    if(rc != 0 || decoded_len == 0 || decoded_len > CONTROL_ARTIFACT_CHUNK_BYTES ||
       upload_.next_offset + decoded_len > upload_.expected_size) {
        set_error(payload, 422, "artifact base64 payload invalid");
        return;
    }
    if(!constant_time_equal(sha256_hex(decoded.get(), decoded_len), chunk_sha)) {
        set_error(payload, 422, "artifact chunk SHA-256 mismatch");
        return;
    }

    File file = LittleFS.open(upload_.temp_path, "a");
    if(!file || file.write(decoded.get(), decoded_len) != decoded_len) {
        if(file) file.close();
        set_error(payload, 507, "artifact chunk write failed");
        return;
    }
    file.close();
    upload_.next_offset += decoded_len;
    payload["upload_id"] = upload_.upload_id;
    payload["next_offset"] = upload_.next_offset;
}

void ControlPlane::handle_artifact_commit(const JsonDocument& request, JsonDocument& payload) {
    if(!upload_.active) {
        set_error(payload, 409, "no active artifact upload");
        return;
    }
    JsonObjectConst p = request["payload"].as<JsonObjectConst>();
    const String upload_id = p["upload_id"].as<String>();
    const String id = p["id"].as<String>();
    const String sha = p["sha256"].as<String>();
    const uint32_t size = p["size"].as<uint32_t>();
    if(upload_id != upload_.upload_id || id != upload_.artifact_id || sha != upload_.expected_sha256 ||
       size != upload_.expected_size || upload_.next_offset != upload_.expected_size) {
        set_error(payload, 422, "artifact commit metadata invalid");
        return;
    }
    const String actual_sha = sha256_file(upload_.temp_path);
    if(actual_sha.isEmpty() || !constant_time_equal(actual_sha, upload_.expected_sha256)) {
        LittleFS.remove(upload_.temp_path);
        upload_ = UploadState{};
        set_error(payload, 422, "artifact full SHA-256 mismatch");
        return;
    }
    const String final_path = String("/artifacts/") + actual_sha + ".bin";
    if(LittleFS.exists(final_path)) {
        LittleFS.remove(upload_.temp_path);
    } else if(!LittleFS.rename(upload_.temp_path, final_path)) {
        set_error(payload, 507, "artifact commit rename failed");
        return;
    }
    payload["id"] = id;
    payload["sha256"] = actual_sha;
    payload["size"] = size;
    payload["staged"] = true;
    upload_ = UploadState{};
}

void ControlPlane::handle_job(const JsonDocument& request, JsonDocument& payload) {
    JsonObjectConst job = request["payload"].as<JsonObjectConst>();
    const String job_id = job["job_id"].as<String>();
    payload["job_id"] = job_id;
    if(job_id.isEmpty() || job_id.length() > 128) {
        payload["code"] = -30;
        payload["text"] = "job id invalid";
        return;
    }
    if(bridge_.stop_asserted()) {
        payload["code"] = -10;
        payload["text"] = "STOP asserted";
        return;
    }
    if(!bridge_.linked()) {
        payload["code"] = -11;
        payload["text"] = "Flipper offline";
        return;
    }
    if(job["target"].as<String>() != "flipper-link") {
        payload["code"] = -31;
        payload["text"] = "job target rejected";
        return;
    }
    JsonObjectConst job_route = job["route"].as<JsonObjectConst>();
    if(job_route["logical_target"].as<String>() != "flipper" ||
       job_route["physical_owner"].as<String>() != "s3-cam" ||
       job_route["fallback_physical_route"].as<bool>() != false) {
        payload["code"] = -32;
        payload["text"] = "job route rejected";
        return;
    }

    JsonObjectConst program = job["flipper_program"].as<JsonObjectConst>();
    const String declared_sha = program["sha256"].as<String>();
    if(program["version"].as<int>() != 1 || !is_lower_hex(declared_sha, 64)) {
        payload["code"] = -33;
        payload["text"] = "Flipper program invalid";
        return;
    }
    JsonDocument unsigned_program;
    unsigned_program.set(program);
    unsigned_program.as<JsonObject>().remove("sha256");
    const String canonical_program = stable_json(unsigned_program.as<JsonVariantConst>());
    const String actual_sha = sha256_hex(
        reinterpret_cast<const uint8_t*>(canonical_program.c_str()), canonical_program.length());
    if(!constant_time_equal(actual_sha, declared_sha)) {
        payload["code"] = -34;
        payload["text"] = "Flipper program SHA-256 mismatch";
        return;
    }

    JsonArrayConst operations = program["operations"].as<JsonArrayConst>();
    if(operations.size() != 1 || operations[0]["op"].as<String>() != "system_device_info") {
        payload["code"] = -12;
        payload["text"] = "typed Flipper protobuf RPC bridge required for this operation";
        payload["rpc_ready"] = false;
        return;
    }

    FlipperResult result;
    const uint32_t timeout_ms = min<uint32_t>(program["timeout_ms"].as<uint32_t>(), 5000U);
    const bool ok = bridge_.execute(fnv1a32(job_id), 1, "", timeout_ms ? timeout_ms : 3000U, result);
    payload["code"] = result.code;
    payload["text"] = result.text;
    payload["transport"] = "bounded-readonly-probe";
    if(ok) {
        payload["data"]["raw"] = result.text;
        payload["observed_success"] = true;
        payload["before_state"]["flipper_online"] = true;
        payload["before_state"]["stop_asserted"] = false;
        payload["after_state"]["flipper_online"] = bridge_.linked();
        payload["after_state"]["stop_asserted"] = bridge_.stop_asserted();
        payload["evidence_sha256"] = sha256_hex(
            reinterpret_cast<const uint8_t*>(result.text.c_str()), result.text.length());
    }
}

void ControlPlane::handle_request(const char* expected_type) {
    if(!configured()) {
        send_plain_error(503, "S3 control key not provisioned");
        return;
    }
    const String raw = server_.arg("plain");
    if(raw.length() == 0 || raw.length() > CONTROL_MAX_REQUEST_BYTES) {
        send_plain_error(413, "request body unavailable or too large");
        return;
    }
    JsonDocument request;
    const DeserializationError parse_error = deserializeJson(
        request, raw, DeserializationOption::NestingLimit(16));
    if(parse_error) {
        send_plain_error(400, "invalid JSON envelope");
        return;
    }
    String verification_error;
    if(!verify_request(request, raw, expected_type, verification_error)) {
        send_plain_error(401, verification_error.c_str());
        return;
    }

    JsonDocument payload;
    const String type(expected_type);
    if(type == "status.request") build_status(payload);
    else if(type == "inventory.request") build_inventory(payload);
    else if(type == "job.execute") handle_job(request, payload);
    else if(type == "approval.request") handle_approval(request, payload);
    else if(type == "stop.assert") handle_stop(request, payload, false);
    else if(type == "stop.clear") handle_stop(request, payload, true);
    else if(type == "artifact.begin") handle_artifact_begin(request, payload);
    else if(type == "artifact.chunk") handle_artifact_chunk(request, payload);
    else if(type == "artifact.commit") handle_artifact_commit(request, payload);
    else set_error(payload, 404, "unsupported control-plane message");
    send_signed_result(request, payload, take_status(payload));
}

} // namespace m3rma1d
