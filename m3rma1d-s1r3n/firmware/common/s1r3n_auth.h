#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#define S1R3N_TAG_BYTES 32
#define S1R3N_NONCE_BYTES 16
#define S1R3N_MAX_BODY 512
typedef struct { uint64_t issued_ms; uint32_t lease_ms; uint8_t nonce[S1R3N_NONCE_BYTES]; uint16_t body_len; uint8_t body[S1R3N_MAX_BODY]; uint8_t tag[S1R3N_TAG_BYTES]; } s1r3n_envelope_t;
typedef struct { uint8_t nonce[S1R3N_NONCE_BYTES]; uint64_t seen_ms; } s1r3n_nonce_entry_t;
typedef struct { s1r3n_nonce_entry_t entries[32]; size_t cursor; } s1r3n_replay_cache_t;
bool s1r3n_auth_sign(s1r3n_envelope_t* env,const uint8_t* key,size_t key_len);
bool s1r3n_auth_verify(const s1r3n_envelope_t* env,const uint8_t* key,size_t key_len,uint64_t now_ms,s1r3n_replay_cache_t* cache);
