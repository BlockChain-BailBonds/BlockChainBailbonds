#include "s1r3n_runtime.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "nvs_flash.h"
static const char* TAG="M3RMA1D"; static const char* g_role="unknown"; static bool g_stop=true;
void s1r3n_runtime_init(const char* role){g_role=role; g_stop=true; esp_err_t e=nvs_flash_init(); if(e==ESP_ERR_NVS_NO_FREE_PAGES||e==ESP_ERR_NVS_NEW_VERSION_FOUND){nvs_flash_erase(); nvs_flash_init();} ESP_LOGI(TAG,"{\"system\":\"M3rMa1d S1r3n\",\"role\":\"%s\",\"state\":\"STOPPED\"}",g_role);}
void s1r3n_runtime_set_stop(bool asserted,const char* reason){g_stop=asserted; ESP_LOGW(TAG,"{\"role\":\"%s\",\"stop\":%s,\"reason\":\"%s\"}",g_role,asserted?"true":"false",reason?reason:"");}
bool s1r3n_runtime_stop_asserted(void){return g_stop;}
void s1r3n_runtime_heartbeat(void){ESP_LOGI(TAG,"{\"role\":\"%s\",\"uptime_ms\":%lld,\"stop\":%s}",g_role,(long long)(esp_timer_get_time()/1000),g_stop?"true":"false");}
