#include "mermaid_link.h"

#include <furi_hal.h>
#include <expansion/expansion.h>
#include <stdlib.h>
#include <string.h>

#define TAG "M3Link"
#define MAGIC0 ((uint8_t)'M')
#define MAGIC1 ((uint8_t)'3')
#define HEADER_SIZE 10U
#define CRC_SIZE 4U
#define RX_STREAM_SIZE 512U
#define RX_ACCUM_SIZE 256U

typedef struct {
    uint8_t type;
    uint32_t seq;
    uint16_t length;
    uint8_t payload[MERMAID_LINK_MAX_PAYLOAD];
} MermaidFrame;

struct MermaidLink {
    FuriHalSerialHandle* serial;
    FuriStreamBuffer* rx_stream;
    uint8_t rx_accum[RX_ACCUM_SIZE];
    size_t rx_len;
    uint32_t next_seq;
    bool expansion_owned;
    MermaidStatusCallback status_cb;
    MermaidCatalogCallback catalog_cb;
    MermaidResultCallback result_cb;
    void* callback_context;
};

static uint16_t read_u16(const uint8_t* p) {
    return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}

static uint32_t read_u32(const uint8_t* p) {
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) |
           ((uint32_t)p[3] << 24);
}

static void write_u16(uint8_t* p, uint16_t value) {
    p[0] = (uint8_t)(value & 0xffU);
    p[1] = (uint8_t)((value >> 8) & 0xffU);
}

static void write_u32(uint8_t* p, uint32_t value) {
    p[0] = (uint8_t)(value & 0xffU);
    p[1] = (uint8_t)((value >> 8) & 0xffU);
    p[2] = (uint8_t)((value >> 16) & 0xffU);
    p[3] = (uint8_t)((value >> 24) & 0xffU);
}

static uint32_t crc32(const uint8_t* data, size_t length) {
    uint32_t crc = 0xffffffffU;
    for(size_t i = 0; i < length; i++) {
        crc ^= data[i];
        for(uint8_t bit = 0; bit < 8; bit++) {
            const uint32_t mask = (uint32_t)-(int32_t)(crc & 1U);
            crc = (crc >> 1) ^ (0xedb88320U & mask);
        }
    }
    return ~crc;
}

static void serial_rx_callback(
    FuriHalSerialHandle* handle,
    FuriHalSerialRxEvent event,
    void* context) {
    MermaidLink* link = context;
    if(!link || !(event & FuriHalSerialRxEventData)) return;
    const uint8_t byte = furi_hal_serial_async_rx(handle);
    furi_stream_buffer_send(link->rx_stream, &byte, 1, 0);
}

static bool send_frame(MermaidLink* link, MermaidMsgType type, const uint8_t* payload, uint16_t length) {
    if(!link || !link->serial || length > MERMAID_LINK_MAX_PAYLOAD) return false;

    uint8_t frame[HEADER_SIZE + MERMAID_LINK_MAX_PAYLOAD + CRC_SIZE];
    frame[0] = MAGIC0;
    frame[1] = MAGIC1;
    frame[2] = MERMAID_LINK_VERSION;
    frame[3] = (uint8_t)type;
    write_u32(&frame[4], link->next_seq++);
    write_u16(&frame[8], length);
    if(length && payload) memcpy(&frame[HEADER_SIZE], payload, length);
    const uint32_t crc = crc32(&frame[2], (HEADER_SIZE - 2U) + length);
    write_u32(&frame[HEADER_SIZE + length], crc);
    furi_hal_serial_tx(link->serial, frame, HEADER_SIZE + length + CRC_SIZE);
    return true;
}

static void dispatch_frame(MermaidLink* link, const MermaidFrame* frame) {
    if(frame->type == MermaidMsgStatus && frame->length == 17U) {
        const uint8_t flags = frame->payload[0];
        MermaidRemoteStatus status = {
            .codex_linked = (flags & 0x01U) != 0,
            .s3_linked = (flags & 0x02U) != 0,
            .camera_ready = (flags & 0x04U) != 0,
            .stop_asserted = (flags & 0x08U) != 0,
            .approval_pending = (flags & 0x10U) != 0,
            .heartbeat_ms = read_u32(&frame->payload[1]),
            .packets_rx = read_u32(&frame->payload[5]),
            .packets_tx = read_u32(&frame->payload[9]),
            .faults = read_u32(&frame->payload[13]),
        };
        if(link->status_cb) link->status_cb(&status, link->callback_context);
    } else if(frame->type == MermaidMsgCatalog && frame->length == 8U) {
        MermaidCatalogSummary catalog = {
            .total = read_u16(&frame->payload[0]),
            .ready = read_u16(&frame->payload[2]),
            .needs_adapter = read_u16(&frame->payload[4]),
            .blocked = read_u16(&frame->payload[6]),
        };
        if(link->catalog_cb) link->catalog_cb(&catalog, link->callback_context);
    } else if(frame->type == MermaidMsgActionResult && frame->length >= 6U) {
        const uint32_t job_id = read_u32(&frame->payload[0]);
        const int16_t code = (int16_t)read_u16(&frame->payload[4]);
        char text[MERMAID_LINK_MAX_PAYLOAD - 5U];
        const size_t text_len = frame->length - 6U;
        const size_t copy_len = text_len < (sizeof(text) - 1U) ? text_len : (sizeof(text) - 1U);
        if(copy_len) memcpy(text, &frame->payload[6], copy_len);
        text[copy_len] = '\0';
        if(link->result_cb) link->result_cb(job_id, code, text, link->callback_context);
    }
}

static bool decode_one(MermaidLink* link) {
    if(link->rx_len < HEADER_SIZE + CRC_SIZE) return false;

    size_t start = 0;
    while(start + 1U < link->rx_len &&
          !(link->rx_accum[start] == MAGIC0 && link->rx_accum[start + 1U] == MAGIC1)) {
        start++;
    }
    if(start) {
        memmove(link->rx_accum, link->rx_accum + start, link->rx_len - start);
        link->rx_len -= start;
        if(link->rx_len < HEADER_SIZE + CRC_SIZE) return false;
    }

    if(link->rx_accum[2] != MERMAID_LINK_VERSION) {
        memmove(link->rx_accum, link->rx_accum + 2U, link->rx_len - 2U);
        link->rx_len -= 2U;
        return true;
    }

    const uint16_t length = read_u16(&link->rx_accum[8]);
    if(length > MERMAID_LINK_MAX_PAYLOAD) {
        memmove(link->rx_accum, link->rx_accum + 2U, link->rx_len - 2U);
        link->rx_len -= 2U;
        return true;
    }

    const size_t frame_size = HEADER_SIZE + length + CRC_SIZE;
    if(link->rx_len < frame_size) return false;

    const uint32_t expected = read_u32(&link->rx_accum[HEADER_SIZE + length]);
    const uint32_t actual = crc32(&link->rx_accum[2], (HEADER_SIZE - 2U) + length);
    if(expected == actual) {
        MermaidFrame frame = {
            .type = link->rx_accum[3],
            .seq = read_u32(&link->rx_accum[4]),
            .length = length,
        };
        if(length) memcpy(frame.payload, &link->rx_accum[HEADER_SIZE], length);
        dispatch_frame(link, &frame);
    } else {
        FURI_LOG_W(TAG, "CRC mismatch");
    }

    memmove(link->rx_accum, link->rx_accum + frame_size, link->rx_len - frame_size);
    link->rx_len -= frame_size;
    return true;
}

MermaidLink* mermaid_link_alloc(void) {
    MermaidLink* link = malloc(sizeof(MermaidLink));
    if(!link) return NULL;
    memset(link, 0, sizeof(MermaidLink));
    link->next_seq = 1U;
    link->rx_stream = furi_stream_buffer_alloc(RX_STREAM_SIZE, 1);
    if(!link->rx_stream) {
        free(link);
        return NULL;
    }

    Expansion* expansion = furi_record_open(RECORD_EXPANSION);
    expansion_disable(expansion);
    furi_record_close(RECORD_EXPANSION);
    link->expansion_owned = true;

    link->serial = furi_hal_serial_control_acquire(FuriHalSerialIdUsart);
    if(!link->serial) {
        Expansion* restore = furi_record_open(RECORD_EXPANSION);
        expansion_enable(restore);
        furi_record_close(RECORD_EXPANSION);
        link->expansion_owned = false;
        FURI_LOG_E(TAG, "USART unavailable");
        return link;
    }

    furi_hal_serial_init(link->serial, MERMAID_LINK_BAUD);
    furi_hal_serial_configure_framing(
        link->serial,
        FuriHalSerialDataBits8,
        FuriHalSerialParityNone,
        FuriHalSerialStopBits1);
    furi_hal_serial_async_rx_start(link->serial, serial_rx_callback, link, false);

    const uint8_t hello[2] = {'F', '0'};
    send_frame(link, MermaidMsgHello, hello, sizeof(hello));
    return link;
}

void mermaid_link_free(MermaidLink* link) {
    if(!link) return;
    if(link->serial) {
        furi_hal_serial_async_rx_stop(link->serial);
        furi_hal_serial_deinit(link->serial);
        furi_hal_serial_control_release(link->serial);
        link->serial = NULL;
    }
    if(link->expansion_owned) {
        Expansion* expansion = furi_record_open(RECORD_EXPANSION);
        expansion_enable(expansion);
        furi_record_close(RECORD_EXPANSION);
    }
    if(link->rx_stream) furi_stream_buffer_free(link->rx_stream);
    free(link);
}

bool mermaid_link_is_open(const MermaidLink* link) {
    return link && link->serial;
}

void mermaid_link_set_callbacks(
    MermaidLink* link,
    MermaidStatusCallback status_cb,
    MermaidCatalogCallback catalog_cb,
    MermaidResultCallback result_cb,
    void* context) {
    if(!link) return;
    link->status_cb = status_cb;
    link->catalog_cb = catalog_cb;
    link->result_cb = result_cb;
    link->callback_context = context;
}

void mermaid_link_poll(MermaidLink* link) {
    if(!link || !link->rx_stream) return;
    while(link->rx_len < sizeof(link->rx_accum)) {
        const size_t room = sizeof(link->rx_accum) - link->rx_len;
        const size_t got = furi_stream_buffer_receive(link->rx_stream, link->rx_accum + link->rx_len, room, 0);
        if(!got) break;
        link->rx_len += got;
    }
    while(decode_one(link)) {
    }
    if(link->rx_len == sizeof(link->rx_accum)) {
        link->rx_len = 0;
        FURI_LOG_W(TAG, "RX accumulator reset");
    }
}

bool mermaid_link_request_status(MermaidLink* link) {
    return send_frame(link, MermaidMsgStatusRequest, NULL, 0);
}

bool mermaid_link_request_catalog(MermaidLink* link) {
    return send_frame(link, MermaidMsgCatalogRequest, NULL, 0);
}

bool mermaid_link_send_stop(MermaidLink* link, uint32_t job_id) {
    uint8_t payload[4];
    write_u32(payload, job_id);
    return send_frame(link, MermaidMsgStop, payload, sizeof(payload));
}
