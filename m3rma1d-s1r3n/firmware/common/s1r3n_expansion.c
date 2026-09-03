#include "s1r3n_expansion.h"
#include <string.h>
uint8_t s1r3n_exp_checksum(const uint8_t* bytes,size_t len){uint8_t x=0;for(size_t i=0;i<len;i++)x^=bytes[i];return x;}
size_t s1r3n_exp_heartbeat(uint8_t out[2]){out[0]=S1R3N_EXP_HEARTBEAT;out[1]=s1r3n_exp_checksum(out,1);return 2;}
size_t s1r3n_exp_status(s1r3n_exp_status_t status,uint8_t out[3]){out[0]=S1R3N_EXP_STATUS;out[1]=(uint8_t)status;out[2]=s1r3n_exp_checksum(out,2);return 3;}
size_t s1r3n_exp_baud(uint32_t baud,uint8_t out[6]){out[0]=S1R3N_EXP_BAUD;memcpy(&out[1],&baud,4);out[5]=s1r3n_exp_checksum(out,5);return 6;}
size_t s1r3n_exp_control(s1r3n_exp_control_t cmd,uint8_t out[3]){out[0]=S1R3N_EXP_CONTROL;out[1]=(uint8_t)cmd;out[2]=s1r3n_exp_checksum(out,2);return 3;}
size_t s1r3n_exp_data(const uint8_t* data,size_t len,uint8_t out[67]){if(!data||len>S1R3N_EXP_MAX_DATA)return 0;out[0]=S1R3N_EXP_DATA;out[1]=(uint8_t)len;memcpy(&out[2],data,len);out[2+len]=s1r3n_exp_checksum(out,2+len);return 3+len;}
bool s1r3n_exp_frame_valid(const uint8_t* frame,size_t len){if(!frame||len<2)return false;return s1r3n_exp_checksum(frame,len-1)==frame[len-1];}
