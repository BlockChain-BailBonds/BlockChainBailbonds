#include "web_ui.h"
#include "camera_handler.h"
#include "config.h"
#include <LittleFS.h>
#include <WiFi.h>

namespace m3rma1d {
WebUi::WebUi(CodexAutonomous& codex, FlipperBridge& bridge)
    : server_(HTTP_PORT), codex_(codex), bridge_(bridge) {}

bool WebUi::begin() {
    if(!LittleFS.begin(true)) return false;
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    routes();
    server_.begin();
    return true;
}

void WebUi::routes() {
    server_.on("/", HTTP_GET, [this]() {
        File f = LittleFS.open("/index.html", "r");
        if(!f) return server_.send(500, "text/plain", "UI filesystem missing; run pio run -t uploadfs");
        server_.streamFile(f, "text/html");
        f.close();
    });
    server_.on("/style.css", HTTP_GET, [this]() {
        File f = LittleFS.open("/style.css", "r");
        if(!f) return server_.send(404, "text/plain", "missing");
        server_.streamFile(f, "text/css"); f.close();
    });
    server_.on("/app.js", HTTP_GET, [this]() {
        File f = LittleFS.open("/app.js", "r");
        if(!f) return server_.send(404, "text/plain", "missing");
        server_.streamFile(f, "application/javascript"); f.close();
    });
    server_.on("/api/status", HTTP_GET, [this]() {
        server_.send(200, "application/json", codex_.status_json());
    });
    server_.on("/api/camera.jpg", HTTP_GET, [this]() {
        camera_fb_t* fb = camera_capture();
        if(!fb) return server_.send(503, "application/json", "{\"error\":\"camera unavailable\"}");
        server_.setContentLength(fb->len);
        server_.send(200, "image/jpeg", "");
        WiFiClient client = server_.client();
        client.write(fb->buf, fb->len);
        camera_release(fb);
    });
    server_.on("/api/stop", HTTP_POST, [this]() {
        bridge_.assert_stop();
        server_.send(200, "application/json", "{\"asserted\":true}");
    });
    server_.on("/api/resume", HTTP_POST, [this]() {
        bridge_.clear_stop();
        server_.send(200, "application/json", bridge_.stop_asserted() ? "{\"asserted\":true}" : "{\"asserted\":false}");
    });
    server_.on("/api/probe", HTTP_POST, [this]() {
        const String capability = server_.arg("capability");
        FlipperResult r;
        codex_.run_safe_probe(capability, r);
        String body = "{\"job_id\":" + String(r.job_id) + ",\"code\":" + String(r.code) + ",\"text\":\"";
        String escaped = r.text; escaped.replace("\\", "\\\\"); escaped.replace("\"", "\\\""); escaped.replace("\n", "\\n");
        body += escaped + "\"}";
        server_.send(r.code == 0 ? 200 : 422, "application/json", body);
    });
}

void WebUi::poll() { server_.handleClient(); }
}
