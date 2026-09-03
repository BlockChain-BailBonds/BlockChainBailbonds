#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "s1r3n_runtime.h"
#include "camera_profile.h"
static const char* TAG="VISION";
void app_main(void){
    s1r3n_runtime_init("vision-s3-ov3660");
#if S1R3N_GOOUUU_V15_CAMERA_PROFILE_VERIFIED
    ESP_LOGI(TAG,"verified GOOUUU V1.5 camera profile enabled");
#else
    s1r3n_runtime_set_stop(true,"camera profile unverified");
    ESP_LOGW(TAG,"OV3660 capture BLOCKED: exact GOOUUU V1.5 camera GPIO map is not yet verified");
#endif
    for(;;){s1r3n_runtime_heartbeat();vTaskDelay(pdMS_TO_TICKS(1000));}
}
