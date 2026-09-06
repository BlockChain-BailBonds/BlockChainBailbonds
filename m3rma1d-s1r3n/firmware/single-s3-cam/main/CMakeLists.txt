idf_component_register(
  SRCS "main.c" "flipper_expansion.c" "../../common/s1r3n_runtime.c"
  INCLUDE_DIRS "." "../../common"
  REQUIRES nvs_flash esp_timer esp_wifi esp_event esp_netif esp_http_server driver esp32-camera
)
