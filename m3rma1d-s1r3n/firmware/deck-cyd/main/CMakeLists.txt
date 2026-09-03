idf_component_register(SRCS "main.c" "flipper_expansion.c" "../../common/s1r3n_runtime.c" "../../common/s1r3n_auth.c" INCLUDE_DIRS "." "../../common" REQUIRES nvs_flash esp_timer driver mbedtls)
