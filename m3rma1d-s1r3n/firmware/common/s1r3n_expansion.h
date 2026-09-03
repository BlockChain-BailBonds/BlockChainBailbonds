#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#define S1R3N_EXP_TTO_MS 250U
#define S1R3N_EXP_TDT_MS 25U
#define S1R3N_EXP_MAX_DATA 64U
typedef enum { S1R3N_EXP_HEARTBEAT=0x01, S1R3N_EXP_STATUS=0x02, S1R3N_EXP_BAUD=0x03, S1R3N_EXP_CONTROL=0x04, S1R3N_EXP_DATA=0x05 } s1r3n_exp_type_t;
typedef enum { S1R3N_EXP_OK=0x00, S1R3N_EXP_ERR=0x01, S1R3N_EXP_BAUD_UNSUPPORTED=0x02 } s1r3n_exp_status_t;
typedef enum { S1R3N_EXP_RPC_START=0x00, S1R3N_EXP_RPC_STOP=0x01 } s1r3n_exp_control_t;
uint8_t s1r3n_exp_checksum(const uint8_t* bytes,size_t len);
size_t s1r3n_exp_heartbeat(uint8_t out[2]);
size_t s1r3n_exp_status(s1r3n_exp_status_t status,uint8_t out[3]);
size_t s1r3n_exp_baud(uint32_t baud,uint8_t out[6]);
size_t s1r3n_exp_control(s1r3n_exp_control_t cmd,uint8_t out[3]);
size_t s1r3n_exp_data(const uint8_t* data,size_t len,uint8_t out[67]);
bool s1r3n_exp_frame_valid(const uint8_t* frame,size_t len);
