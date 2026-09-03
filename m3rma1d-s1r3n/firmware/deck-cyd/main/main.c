#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "s1r3n_runtime.h"
#include "flipper_expansion.h"
#define FLIP_UART UART_NUM_2
#define FLIP_TX 27
#define FLIP_RX 22
static const char* TAG="DECK";
static bool operator_approved=false;
static void set_operator_approval(bool approved){operator_approved=approved;ESP_LOGW(TAG,"operator approval=%s",approved?"true":"false");}
void app_main(void){
    s1r3n_runtime_init("deck-cyd");
    s1r3n_expansion_t exp;
    if(!s1r3n_exp_init(&exp,FLIP_UART,FLIP_TX,FLIP_RX)){ESP_LOGE(TAG,"Expansion UART init failed");for(;;)vTaskDelay(pdMS_TO_TICKS(1000));}
    ESP_LOGI(TAG,"Expansion UART ready at 9600 baud on TX=27 RX=22");
    set_operator_approval(false);
    for(;;){
        if(s1r3n_runtime_stop_asserted()||!operator_approved){if(exp.rpc_active)s1r3n_exp_stop_rpc(&exp);} 
        s1r3n_runtime_heartbeat();
        vTaskDelay(pdMS_TO_TICKS(250));
    }
}
