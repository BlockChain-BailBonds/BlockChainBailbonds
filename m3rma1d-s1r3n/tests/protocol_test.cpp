#include <cassert>
#include "protocol.hpp"
using namespace s1r3n;
int main(){assert(capabilityAllowed(Capability::DeviceInfo));assert(capabilityAllowed(Capability::IrTransmit));assert(needsApproval(Capability::IrTransmit));assert(!needsApproval(Capability::DeviceInfo));const char*s="123456789";assert(crc32((const uint8_t*)s,9)==0xCBF43926u);JobRequest j{};j.job_id=42;j.capability=Capability::DeviceInfo;j.timeout_ms=500;assert(sizeof(j)<128);return 0;}
