#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_timer.h"
#include "esp_log.h"
#include "s1r3n_runtime.h"
#include "s1r3n_quorum.h"
static const char* TAG="CORE";
void app_main(void){
    s1r3n_runtime_init("core-s3");
    s1r3n_quorum_t quorum; s1r3n_quorum_init(&quorum);
    for(;;){
        uint64_t now=(uint64_t)(esp_timer_get_time()/1000);
        bool ready=s1r3n_quorum_ready(&quorum,now);
        if(!ready){s1r3n_runtime_set_stop(true,"C5 quorum not established");}
        ESP_LOGI(TAG,"quorum=%s",ready?"READY":"BLOCKED");
        s1r3n_runtime_heartbeat();
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
