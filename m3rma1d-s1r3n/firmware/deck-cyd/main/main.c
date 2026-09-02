#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/uart.h"
#include "esp_log.h"
#include "s1r3n_runtime.h"
#define FLIP_UART UART_NUM_2
#define FLIP_TX 27
#define FLIP_RX 22
static const char* TAG="DECK";
void app_main(void){s1r3n_runtime_init("deck-cyd"); const uart_config_t cfg={.baud_rate=230400,.data_bits=UART_DATA_8_BITS,.parity=UART_PARITY_DISABLE,.stop_bits=UART_STOP_BITS_1,.flow_ctrl=UART_HW_FLOWCTRL_DISABLE,.source_clk=UART_SCLK_DEFAULT}; uart_driver_install(FLIP_UART,2048,2048,0,NULL,0); uart_param_config(FLIP_UART,&cfg); uart_set_pin(FLIP_UART,FLIP_TX,FLIP_RX,UART_PIN_NO_CHANGE,UART_PIN_NO_CHANGE); ESP_LOGI(TAG,"Flipper Expansion physical UART initialized TX=27 RX=22; execution remains STOPPED until authenticated lease and operator approval"); for(;;){s1r3n_runtime_heartbeat(); vTaskDelay(pdMS_TO_TICKS(1000));}}
