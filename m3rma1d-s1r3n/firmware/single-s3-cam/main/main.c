#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_camera.h"
#include "esp_event.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "nvs_flash.h"
#include "s1r3n_runtime.h"
#include "board_profile.h"
#include "flipper_expansion.h"

static const char* TAG="M3RMA1D-SINGLE";
static bool camera_ok=false;
static bool flipper_ok=false;
static s1r3n_expansion_t expansion;

static esp_err_t health_get(httpd_req_t* req){
    char body[192];
    int n=snprintf(body,sizeof(body),"{\"name\":\"M3rMa1d S1r3n\",\"role\":\"single-s3-cam\",\"stop\":%s,\"camera\":%s,\"flipper\":%s}",s1r3n_runtime_stop_asserted()?"true":"false",camera_ok?"true":"false",flipper_ok?"true":"false");
    httpd_resp_set_type(req,"application/json");
    return httpd_resp_send(req,body,n);
}

static esp_err_t snapshot_get(httpd_req_t* req){
    if(!camera_ok){httpd_resp_send_err(req,HTTPD_503_SERVICE_UNAVAILABLE,"camera unavailable");return ESP_FAIL;}
    camera_fb_t* fb=esp_camera_fb_get();
    if(!fb){httpd_resp_send_err(req,HTTPD_500_INTERNAL_SERVER_ERROR,"capture failed");return ESP_FAIL;}
    httpd_resp_set_type(req,"image/jpeg");
    esp_err_t err=httpd_resp_send(req,(const char*)fb->buf,fb->len);
    esp_camera_fb_return(fb);
    return err;
}

static esp_err_t stop_post(httpd_req_t* req){s1r3n_runtime_set_stop(true,"remote stop");if(expansion.rpc_active){s1r3n_exp_stop_rpc(&expansion);}httpd_resp_sendstr(req,"STOPPED\n");return ESP_OK;}

static esp_err_t ready_post(httpd_req_t* req){
    if(!camera_ok||!flipper_ok){httpd_resp_send_err(req,HTTPD_409_CONFLICT,"camera/flipper not ready");return ESP_FAIL;}
    s1r3n_runtime_set_stop(false,"user-test ready");
    httpd_resp_sendstr(req,"READY\n");
    return ESP_OK;
}

static void start_http(void){
    httpd_config_t cfg=HTTPD_DEFAULT_CONFIG();
    httpd_handle_t server=NULL;
    if(httpd_start(&server,&cfg)!=ESP_OK){return;}
    httpd_uri_t health={.uri="/health",.method=HTTP_GET,.handler=health_get};
    httpd_uri_t snapshot={.uri="/snapshot.jpg",.method=HTTP_GET,.handler=snapshot_get};
    httpd_uri_t stop={.uri="/stop",.method=HTTP_POST,.handler=stop_post};
    httpd_uri_t ready={.uri="/ready",.method=HTTP_POST,.handler=ready_post};
    httpd_register_uri_handler(server,&health);
    httpd_register_uri_handler(server,&snapshot);
    httpd_register_uri_handler(server,&stop);
    httpd_register_uri_handler(server,&ready);
}

static void start_ap(void){
    esp_netif_init();
    esp_event_loop_create_default();
    esp_netif_create_default_wifi_ap();
    wifi_init_config_t wcfg=WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&wcfg);
    wifi_config_t ap={0};
    snprintf((char*)ap.ap.ssid,sizeof(ap.ap.ssid),"M3rMa1d-S1r3n");
    snprintf((char*)ap.ap.password,sizeof(ap.ap.password),"M3rMa1d918");
    ap.ap.ssid_len=0;
    ap.ap.channel=6;
    ap.ap.max_connection=2;
    ap.ap.authmode=WIFI_AUTH_WPA2_PSK;
    esp_wifi_set_mode(WIFI_MODE_AP);
    esp_wifi_set_config(WIFI_IF_AP,&ap);
    esp_wifi_start();
}

static void init_camera(void){
    camera_config_t c={0};
    c.ledc_channel=LEDC_CHANNEL_0;c.ledc_timer=LEDC_TIMER_0;
    c.pin_d0=CAM_PIN_D0;c.pin_d1=CAM_PIN_D1;c.pin_d2=CAM_PIN_D2;c.pin_d3=CAM_PIN_D3;c.pin_d4=CAM_PIN_D4;c.pin_d5=CAM_PIN_D5;c.pin_d6=CAM_PIN_D6;c.pin_d7=CAM_PIN_D7;
    c.pin_xclk=CAM_PIN_XCLK;c.pin_pclk=CAM_PIN_PCLK;c.pin_vsync=CAM_PIN_VSYNC;c.pin_href=CAM_PIN_HREF;c.pin_sccb_sda=CAM_PIN_SIOD;c.pin_sccb_scl=CAM_PIN_SIOC;c.pin_pwdn=CAM_PIN_PWDN;c.pin_reset=CAM_PIN_RESET;
    c.xclk_freq_hz=20000000;c.pixel_format=PIXFORMAT_JPEG;c.frame_size=FRAMESIZE_VGA;c.jpeg_quality=12;c.fb_count=2;c.fb_location=CAMERA_FB_IN_PSRAM;c.grab_mode=CAMERA_GRAB_LATEST;
    esp_err_t err=esp_camera_init(&c);
    camera_ok=(err==ESP_OK);
    ESP_LOGI(TAG,"camera=%s err=%s",camera_ok?"ready":"failed",esp_err_to_name(err));
}

void app_main(void){
    s1r3n_runtime_init("single-s3-cam");
    init_camera();
    flipper_ok=s1r3n_exp_init(&expansion,UART_NUM_1,FLIPPER_UART_TX,FLIPPER_UART_RX);
    if(flipper_ok){flipper_ok=s1r3n_exp_negotiate(&expansion,230400);}
    if(flipper_ok){flipper_ok=s1r3n_exp_start_rpc(&expansion);}
    if(!flipper_ok){s1r3n_runtime_set_stop(true,"flipper expansion unavailable");}
    start_ap();
    start_http();
    ESP_LOGI(TAG,"AP=M3rMa1d-S1r3n URL=http://192.168.4.1/health UART1 TX=%d RX=%d",FLIPPER_UART_TX,FLIPPER_UART_RX);
    for(;;){s1r3n_runtime_heartbeat();vTaskDelay(pdMS_TO_TICKS(1000));}
}
