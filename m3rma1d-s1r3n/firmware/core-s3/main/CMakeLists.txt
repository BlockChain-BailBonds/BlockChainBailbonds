idf_component_register(SRCS "main.c" "../../common/s1r3n_runtime.c" "../../common/s1r3n_auth.c" "../../common/s1r3n_quorum.c" INCLUDE_DIRS "." "../../common" REQUIRES nvs_flash esp_timer mbedtls)
