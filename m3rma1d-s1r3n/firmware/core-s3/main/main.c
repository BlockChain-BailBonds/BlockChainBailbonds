#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "s1r3n_runtime.h"
void app_main(void){s1r3n_runtime_init("core-s3"); for(;;){s1r3n_runtime_heartbeat(); vTaskDelay(pdMS_TO_TICKS(1000));}}
