#pragma once
#include <stdbool.h>
#include <stdint.h>
void s1r3n_runtime_init(const char* role);
void s1r3n_runtime_set_stop(bool asserted, const char* reason);
bool s1r3n_runtime_stop_asserted(void);
void s1r3n_runtime_heartbeat(void);
