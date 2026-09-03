#include "s1r3n_auth.h"
#include <string.h>
#include "mbedtls/md.h"
static bool compute_tag(const s1r3n_envelope_t* env,const uint8_t* key,size_t key_len,uint8_t out[S1R3N_TAG_BYTES]){
    if(!env||!key||key_len<16||env->body_len>S1R3N_MAX_BODY)return false;
    uint8_t buf[8+4+S1R3N_NONCE_BYTES+2+S1R3N_MAX_BODY]; size_t p=0;
    memcpy(buf+p,&env->issued_ms,8);p+=8; memcpy(buf+p,&env->lease_ms,4);p+=4; memcpy(buf+p,env->nonce,S1R3N_NONCE_BYTES);p+=S1R3N_NONCE_BYTES; memcpy(buf+p,&env->body_len,2);p+=2; memcpy(buf+p,env->body,env->body_len);p+=env->body_len;
    const mbedtls_md_info_t* info=mbedtls_md_info_from_type(MBEDTLS_MD_SHA256); if(!info)return false;
    return mbedtls_md_hmac(info,key,key_len,buf,p,out)==0;
}
static bool nonce_seen(s1r3n_replay_cache_t* c,const uint8_t n[S1R3N_NONCE_BYTES],uint64_t now){
    if(!c)return true; for(size_t i=0;i<32;i++){if(c->entries[i].seen_ms&&memcmp(c->entries[i].nonce,n,S1R3N_NONCE_BYTES)==0)return true;}
    memcpy(c->entries[c->cursor].nonce,n,S1R3N_NONCE_BYTES); c->entries[c->cursor].seen_ms=now; c->cursor=(c->cursor+1)%32; return false;
}
bool s1r3n_auth_sign(s1r3n_envelope_t* env,const uint8_t* key,size_t key_len){uint8_t t[32];if(!compute_tag(env,key,key_len,t))return false;memcpy(env->tag,t,32);return true;}
bool s1r3n_auth_verify(const s1r3n_envelope_t* env,const uint8_t* key,size_t key_len,uint64_t now_ms,s1r3n_replay_cache_t* cache){
    if(!env||env->body_len>S1R3N_MAX_BODY||env->lease_ms==0)return false; if(now_ms<env->issued_ms||now_ms-env->issued_ms>env->lease_ms)return false;
    uint8_t t[32]; if(!compute_tag(env,key,key_len,t))return false; unsigned diff=0;for(size_t i=0;i<32;i++)diff|=(unsigned)(t[i]^env->tag[i]);if(diff)return false; return !nonce_seen(cache,env->nonce,now_ms);
}
