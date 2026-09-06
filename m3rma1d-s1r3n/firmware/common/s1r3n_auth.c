#include "s1r3n_auth.h"
#include <string.h>
#include "mbedtls/md.h"

static bool compute_tag(const s1r3n_envelope_t* env, const uint8_t* key, size_t key_len, uint8_t out[S1R3N_TAG_BYTES]) {
    if(!env || !key || key_len < 16 || env->body_len > S1R3N_MAX_BODY) {
        return false;
    }

    uint8_t buf[8 + 4 + S1R3N_NONCE_BYTES + 2 + S1R3N_MAX_BODY];
    size_t p = 0;
    memcpy(buf + p, &env->issued_ms, 8); p += 8;
    memcpy(buf + p, &env->lease_ms, 4); p += 4;
    memcpy(buf + p, env->nonce, S1R3N_NONCE_BYTES); p += S1R3N_NONCE_BYTES;
    memcpy(buf + p, &env->body_len, 2); p += 2;
    memcpy(buf + p, env->body, env->body_len); p += env->body_len;

    const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if(!info) {
        return false;
    }
    return mbedtls_md_hmac(info, key, key_len, buf, p, out) == 0;
}

static bool nonce_seen(s1r3n_replay_cache_t* cache, const uint8_t nonce[S1R3N_NONCE_BYTES], uint64_t now_ms) {
    if(!cache) {
        return true;
    }

    for(size_t i = 0; i < 32; ++i) {
        if(cache->entries[i].seen_ms && memcmp(cache->entries[i].nonce, nonce, S1R3N_NONCE_BYTES) == 0) {
            return true;
        }
    }

    memcpy(cache->entries[cache->cursor].nonce, nonce, S1R3N_NONCE_BYTES);
    cache->entries[cache->cursor].seen_ms = now_ms;
    cache->cursor = (cache->cursor + 1U) % 32U;
    return false;
}

bool s1r3n_auth_sign(s1r3n_envelope_t* env, const uint8_t* key, size_t key_len) {
    uint8_t tag[S1R3N_TAG_BYTES];
    if(!compute_tag(env, key, key_len, tag)) {
        return false;
    }
    memcpy(env->tag, tag, S1R3N_TAG_BYTES);
    return true;
}

bool s1r3n_auth_verify(const s1r3n_envelope_t* env, const uint8_t* key, size_t key_len, uint64_t now_ms, s1r3n_replay_cache_t* cache) {
    if(!env || env->body_len > S1R3N_MAX_BODY || env->lease_ms == 0) {
        return false;
    }
    if(now_ms < env->issued_ms || now_ms - env->issued_ms > env->lease_ms) {
        return false;
    }

    uint8_t tag[S1R3N_TAG_BYTES];
    if(!compute_tag(env, key, key_len, tag)) {
        return false;
    }

    unsigned diff = 0;
    for(size_t i = 0; i < S1R3N_TAG_BYTES; ++i) {
        diff |= (unsigned)(tag[i] ^ env->tag[i]);
    }
    if(diff != 0) {
        return false;
    }

    return !nonce_seen(cache, env->nonce, now_ms);
}
