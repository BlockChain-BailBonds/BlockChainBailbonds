#pragma once

#include <furi.h>
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

#define MERMAID_LINK_VERSION 2U
#define MERMAID_LINK_BAUD 230400U
#define MERMAID_LINK_MAX_PAYLOAD 96U

typedef enum {
    MermaidMsgHello = 1,
    MermaidMsgStatusRequest = 2,
    MermaidMsgStatus = 3,
    MermaidMsgCatalogRequest = 4,
    MermaidMsgCatalog = 5,
    MermaidMsgActionRequest = 6,
    MermaidMsgActionResult = 7,
    MermaidMsgStop = 8,
    MermaidMsgApproval = 9,
    MermaidMsgReadyRequest = 10,
} MermaidMsgType;

typedef enum {
    MermaidActionTransportPing = 1,
    MermaidActionSystemDeviceInfo = 10,
    MermaidActionSystemPowerInfo = 11,
    MermaidActionStorageInfo = 20,
    MermaidActionStorageList = 21,
    MermaidActionStorageStat = 22,
    MermaidActionAppStart = 30,
    MermaidActionAppExit = 31,
    MermaidActionAppLoadFile = 32,
    MermaidActionGuiInput = 40,
    MermaidActionGpioRead = 50,
    MermaidActionPropertyGet = 60,
    MermaidActionRfTransmitOwnedProfile = 70,
    MermaidActionCredentialReference = 80,
    MermaidActionAuthValidateOnce = 90,
} MermaidActionId;

typedef struct {
    bool codex_linked;
    bool s3_linked;
    bool camera_ready;
    bool stop_asserted;
    bool approval_pending;
    uint32_t heartbeat_ms;
    uint32_t packets_rx;
    uint32_t packets_tx;
    uint32_t faults;
} MermaidRemoteStatus;

typedef struct {
    uint16_t total;
    uint16_t ready;
    uint16_t needs_adapter;
    uint16_t blocked;
} MermaidCatalogSummary;

typedef struct MermaidLink MermaidLink;

typedef void (*MermaidStatusCallback)(const MermaidRemoteStatus* status, void* context);
typedef void (*MermaidCatalogCallback)(const MermaidCatalogSummary* catalog, void* context);
typedef void (*MermaidResultCallback)(uint32_t job_id, int16_t code, const char* text, void* context);
typedef void (*MermaidActionCallback)(uint32_t job_id, uint16_t action_id, const char* argument, void* context);
typedef void (*MermaidStopCallback)(uint32_t job_id, void* context);

MermaidLink* mermaid_link_alloc(void);
void mermaid_link_free(MermaidLink* link);
bool mermaid_link_is_open(const MermaidLink* link);
void mermaid_link_set_callbacks(
    MermaidLink* link,
    MermaidStatusCallback status_cb,
    MermaidCatalogCallback catalog_cb,
    MermaidResultCallback result_cb,
    MermaidActionCallback action_cb,
    MermaidStopCallback stop_cb,
    void* context);
void mermaid_link_poll(MermaidLink* link);
bool mermaid_link_request_status(MermaidLink* link);
bool mermaid_link_request_catalog(MermaidLink* link);
bool mermaid_link_request_ready(MermaidLink* link);
bool mermaid_link_send_stop(MermaidLink* link, uint32_t job_id);
bool mermaid_link_send_action_result(MermaidLink* link, uint32_t job_id, int16_t code, const char* text);

#ifdef __cplusplus
}
#endif
