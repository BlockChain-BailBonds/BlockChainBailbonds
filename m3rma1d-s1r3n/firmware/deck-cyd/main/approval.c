#include "approval.h"
void s1r3n_approval_clear(s1r3n_approval_t* a){if(a){a->job_id=0;a->expires_ms=0;a->approved=false;a->active=false;}}
void s1r3n_approval_grant(s1r3n_approval_t* a,uint32_t job_id,uint64_t now_ms,uint32_t ttl_ms){if(!a)return;a->job_id=job_id;a->expires_ms=now_ms+ttl_ms;a->approved=true;a->active=true;}
bool s1r3n_approval_valid(const s1r3n_approval_t* a,uint32_t job_id,uint64_t now_ms){return a&&a->active&&a->approved&&a->job_id==job_id&&now_ms<=a->expires_ms;}
