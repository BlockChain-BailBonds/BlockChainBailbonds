#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "driver/uart.h"
#define S1R3N_EXP_TIMEOUT_MS 250
#define S1R3N_EXP_DATA_MAX 64
typedef enum { EXP_HEARTBEAT=0x01, EXP_STATUS=0x02, EXP_BAUD=0x03, EXP_CONTROL=0x04, EXP_DATA=0x05 } s1r3n_exp_type_t;
typedef enum { EXP_OK=0x00, EXP_ERR=0x01, EXP_BAD_BAUD=0x02 } s1r3n_exp_status_t;
typedef enum { EXP_START_RPC=0x00, EXP_STOP_RPC=0x01 } s1r3n_exp_control_t;
typedef struct { uart_port_t uart; int tx; int rx; bool rpc_active; uint32_t baud; } s1r3n_expansion_t;
uint8_t s1r3n_exp_checksum(const uint8_t* data,size_t len);
bool s1r3n_exp_init(s1r3n_expansion_t* e,uart_port_t uart,int tx,int rx);
bool s1r3n_exp_negotiate(s1r3n_expansion_t* e,uint32_t baud);
bool s1r3n_exp_start_rpc(s1r3n_expansion_t* e);
bool s1r3n_exp_stop_rpc(s1r3n_expansion_t* e);
bool s1r3n_exp_write_rpc(s1r3n_expansion_t* e,const uint8_t* data,size_t len);
