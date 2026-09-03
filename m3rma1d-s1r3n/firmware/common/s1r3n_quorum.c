#include "s1r3n_quorum.h"
#include <string.h>
void s1r3n_quorum_init(s1r3n_quorum_t* q){if(q)memset(q,0,sizeof(*q));}
void s1r3n_quorum_update(s1r3n_quorum_t* q,s1r3n_c5_role_t role,bool healthy,bool stop,uint64_t now_ms,uint32_t lease_ms){if(!q||role>=S1R3N_C5_COUNT)return;q->vote[role].healthy=healthy;q->vote[role].stop=stop;q->vote[role].seen_ms=now_ms;q->vote[role].lease_ms=lease_ms;}
bool s1r3n_quorum_ready(const s1r3n_quorum_t* q,uint64_t now_ms){if(!q)return false;for(int i=0;i<S1R3N_C5_COUNT;i++){const s1r3n_vote_t* v=&q->vote[i];if(!v->healthy||v->stop||!v->seen_ms||!v->lease_ms||now_ms<v->seen_ms||now_ms-v->seen_ms>v->lease_ms)return false;}return true;}
