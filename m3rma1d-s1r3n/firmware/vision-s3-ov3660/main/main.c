#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "s1r3n_runtime.h"
static const char* TAG="VISION";
void app_main(void){s1r3n_runtime_init("vision-s3-ov3660"); ESP_LOGW(TAG,"camera profile must match verified GOOUUU V1.5 OV3660 mapping before capture tests"); for(;;){s1r3n_runtime_heartbeat(); vTaskDelay(pdMS_TO_TICKS(1000));}}
