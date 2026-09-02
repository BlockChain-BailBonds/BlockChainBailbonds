#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "s1r3n_runtime.h"
void app_main(void){s1r3n_runtime_init("c5-guardian"); for(;;){s1r3n_runtime_heartbeat(); vTaskDelay(pdMS_TO_TICKS(750));}}
