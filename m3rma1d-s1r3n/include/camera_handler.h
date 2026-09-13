#pragma once

#include <esp_camera.h>

namespace m3rma1d {
bool camera_begin();
bool camera_ready();
camera_fb_t* camera_capture();
void camera_release(camera_fb_t* frame);
}
