#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>
namespace s1r3n {
constexpr uint32_t MAGIC=0x4D335331;
constexpr uint8_t VERSION=1;
enum class Node:uint8_t { Broadcast=0, Core=1, Vision=2, Deck=3, Sentinel=4, Flipper=5, Gateway=6 };
enum class Msg:uint8_t { Heartbeat=1, Status=2, VisionEvent=3, JobRequest=4, JobResult=5, ApprovalRequest=6, ApprovalResponse=7, Stop=8, Fault=9, Telemetry=10 };
enum class Capability:uint8_t { Help=1, DeviceInfo=2, StorageInfo=3, LoaderList=4, IrTransmit=5, GpioRead=6 };
#pragma pack(push,1)
struct Header { uint32_t magic; uint8_t version; Node src; Node dst; Msg type; uint32_t seq; uint16_t length; uint16_t flags; uint32_t crc32; };
struct Heartbeat { uint32_t uptime_ms; uint32_t free_heap; uint8_t healthy; };
struct JobRequest { uint32_t job_id; Capability capability; uint8_t requires_approval; uint16_t timeout_ms; char argument[64]; };
struct JobResult { uint32_t job_id; int16_t code; char text[96]; };
struct Approval { uint32_t job_id; uint8_t approved; };
struct Fault { uint16_t code; char text[64]; };
#pragma pack(pop)
uint32_t crc32(const uint8_t* data,size_t len);
inline bool capabilityAllowed(Capability c){ switch(c){case Capability::Help:case Capability::DeviceInfo:case Capability::StorageInfo:case Capability::LoaderList:case Capability::IrTransmit:case Capability::GpioRead:return true;default:return false;} }
inline bool needsApproval(Capability c){ return c==Capability::IrTransmit; }
}
