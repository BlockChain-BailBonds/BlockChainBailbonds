#include "camera_handler.h"
#include "config.h"

namespace m3rma1d {
namespace { bool ready = false; }

bool camera_begin() {
    camera_config_t c{};
    c.ledc_channel = LEDC_CHANNEL_0;
    c.ledc_timer = LEDC_TIMER_0;
    c.pin_d0 = CAM_D0; c.pin_d1 = CAM_D1; c.pin_d2 = CAM_D2; c.pin_d3 = CAM_D3;
    c.pin_d4 = CAM_D4; c.pin_d5 = CAM_D5; c.pin_d6 = CAM_D6; c.pin_d7 = CAM_D7;
    c.pin_xclk = CAM_XCLK; c.pin_pclk = CAM_PCLK; c.pin_vsync = CAM_VSYNC; c.pin_href = CAM_HREF;
    c.pin_sccb_sda = CAM_SIOD; c.pin_sccb_scl = CAM_SIOC;
    c.pin_pwdn = CAM_PWDN; c.pin_reset = CAM_RESET;
    c.xclk_freq_hz = 20000000;
    c.pixel_format = PIXFORMAT_JPEG;
    c.frame_size = psramFound() ? FRAMESIZE_VGA : FRAMESIZE_QVGA;
    c.jpeg_quality = psramFound() ? 12 : 16;
    c.fb_count = psramFound() ? 2 : 1;
    c.fb_location = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;
    c.grab_mode = CAMERA_GRAB_LATEST;
    ready = esp_camera_init(&c) == ESP_OK;
    return ready;
}

bool camera_ready() { return ready; }
camera_fb_t* camera_capture() { return ready ? esp_camera_fb_get() : nullptr; }
void camera_release(camera_fb_t* frame) { if(frame) esp_camera_fb_return(frame); }
}
