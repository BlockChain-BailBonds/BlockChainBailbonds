#pragma once
#include <stdbool.h>
#include <stdint.h>
typedef struct { uint32_t job_id; uint64_t expires_ms; bool approved; bool active; } s1r3n_approval_t;
void s1r3n_approval_clear(s1r3n_approval_t* a);
void s1r3n_approval_grant(s1r3n_approval_t* a,uint32_t job_id,uint64_t now_ms,uint32_t ttl_ms);
bool s1r3n_approval_valid(const s1r3n_approval_t* a,uint32_t job_id,uint64_t now_ms);
