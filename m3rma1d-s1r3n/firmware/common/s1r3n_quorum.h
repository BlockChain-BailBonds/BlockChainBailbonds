#pragma once
#include <stdbool.h>
#include <stdint.h>
typedef enum { S1R3N_C5_GUARDIAN=0, S1R3N_C5_WATCHER=1, S1R3N_C5_ARBITER=2, S1R3N_C5_COUNT=3 } s1r3n_c5_role_t;
typedef struct { bool healthy; bool stop; uint64_t seen_ms; uint32_t lease_ms; } s1r3n_vote_t;
typedef struct { s1r3n_vote_t vote[S1R3N_C5_COUNT]; } s1r3n_quorum_t;
void s1r3n_quorum_init(s1r3n_quorum_t* q);
void s1r3n_quorum_update(s1r3n_quorum_t* q,s1r3n_c5_role_t role,bool healthy,bool stop,uint64_t now_ms,uint32_t lease_ms);
bool s1r3n_quorum_ready(const s1r3n_quorum_t* q,uint64_t now_ms);
