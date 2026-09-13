#include <furi.h>
#include <gui/gui.h>
#include <input/input.h>
#include <stdio.h>
#include <string.h>

#include "mermaid_link.h"

#define TAG "M3RMA1D"

typedef enum {
    PageHome = 0,
    PageCodex,
    PageVision,
    PageOps,
    PageSafety,
    PageTelemetry,
    PageSettings,
    PageAbout,
    PageCount,
} MermaidPage;

typedef struct {
    FuriMessageQueue* queue;
    ViewPort* viewport;
    Gui* gui;
    MermaidLink* link;
    MermaidPage page;
    bool stop_asserted;
    bool codex_linked;
    bool s3_linked;
    bool camera_ready;
    bool approval_pending;
    bool theme_animation;
    bool catalog_valid;
    uint16_t catalog_total;
    uint16_t catalog_ready;
    uint16_t catalog_needs_adapter;
    uint16_t catalog_blocked;
    uint32_t packets_rx;
    uint32_t packets_tx;
    uint32_t faults;
    uint32_t heartbeat_ms;
    uint32_t last_job_id;
    int16_t last_job_code;
    char last_event[32];
} MermaidApp;

static void set_event(MermaidApp* app, const char* event) {
    snprintf(app->last_event, sizeof(app->last_event), "%s", event);
}

static void status_callback(const MermaidRemoteStatus* status, void* context) {
    MermaidApp* app = context;
    app->codex_linked = status->codex_linked;
    app->s3_linked = status->s3_linked;
    app->camera_ready = status->camera_ready;
    app->stop_asserted = status->stop_asserted;
    app->approval_pending = status->approval_pending;
    app->heartbeat_ms = status->heartbeat_ms;
    app->packets_rx = status->packets_rx;
    app->packets_tx = status->packets_tx;
    app->faults = status->faults;
    set_event(app, "status.updated");
}

static void catalog_callback(const MermaidCatalogSummary* catalog, void* context) {
    MermaidApp* app = context;
    app->catalog_total = catalog->total;
    app->catalog_ready = catalog->ready;
    app->catalog_needs_adapter = catalog->needs_adapter;
    app->catalog_blocked = catalog->blocked;
    app->catalog_valid = true;
    set_event(app, "catalog.updated");
}

static void result_callback(uint32_t job_id, int16_t code, const char* text, void* context) {
    MermaidApp* app = context;
    app->last_job_id = job_id;
    app->last_job_code = code;
    if(text && text[0]) {
        snprintf(app->last_event, sizeof(app->last_event), "job:%lu %.18s", (unsigned long)job_id, text);
    } else {
        snprintf(app->last_event, sizeof(app->last_event), "job:%lu code:%d", (unsigned long)job_id, code);
    }
}

static void stop_callback(uint32_t job_id, void* context) {
    MermaidApp* app = context;
    app->stop_asserted = true;
    app->last_job_id = job_id;
    set_event(app, "stop.remote");
}

static const char* page_name(MermaidPage page) {
    switch(page) {
    case PageHome: return "COMMAND DECK";
    case PageCodex: return "CODEX LINK";
    case PageVision: return "VISION";
    case PageOps: return "FLIPPER OPS";
    case PageSafety: return "SIREN SAFETY";
    case PageTelemetry: return "TELEMETRY";
    case PageSettings: return "SIREN SETTINGS";
    case PageAbout: return "ABOUT THE SIREN";
    default: return "M3RMA1D";
    }
}

static const char* yesno(bool value) {
    return value ? "YES" : "NO";
}

static const char* link_state(bool value) {
    return value ? "LINKED" : "ADRIFT";
}

static void draw_wave(Canvas* canvas) {
    for(uint8_t x = 0; x < 128; x += 8) {
        canvas_draw_line(canvas, x, 15, x + 3, 12);
        canvas_draw_line(canvas, x + 3, 12, x + 7, 15);
    }
}

static void draw_footer(Canvas* canvas, const char* text) {
    canvas_set_font(canvas, FontSecondary);
    canvas_draw_str(canvas, 2, 63, text);
}

static void draw_home(Canvas* canvas, MermaidApp* app) {
    char line[32];
    canvas_draw_str(canvas, 3, 27, app->stop_asserted ? "STATE  STOP ASSERTED" : "STATE  SIREN READY");
    snprintf(line, sizeof(line), "CODEX %-7s S3 %-7s", link_state(app->codex_linked), link_state(app->s3_linked));
    canvas_draw_str(canvas, 3, 38, line);
    snprintf(line, sizeof(line), "CAM %-3s  HB %lums", app->camera_ready ? "OK" : "---", (unsigned long)app->heartbeat_ms);
    canvas_draw_str(canvas, 3, 49, line);
    draw_footer(canvas, "< > pages   OK safety");
}

static void draw_codex(Canvas* canvas, MermaidApp* app) {
    canvas_draw_str(canvas, 3, 27, app->codex_linked ? "Session: LINKED" : "Session: ADRIFT");
    canvas_draw_str(canvas, 3, 38, mermaid_link_is_open(app->link) ? "MermaidLink: UART OK" : "MermaidLink: CLOSED");
    canvas_draw_str(canvas, 3, 49, app->approval_pending ? "Approval: PENDING" : "Approval: clear");
    draw_footer(canvas, "OK refresh  < > pages");
}

static void draw_vision(Canvas* canvas, MermaidApp* app) {
    canvas_draw_str(canvas, 3, 27, app->camera_ready ? "OV3660: READY" : "OV3660: UNKNOWN");
    canvas_draw_str(canvas, 3, 38, app->s3_linked ? "Vision S3: LINKED" : "Vision S3: ADRIFT");
    canvas_draw_str(canvas, 3, 49, "Vision feeds Codex/ADL");
    draw_footer(canvas, "OK refresh status");
}

static void draw_ops(Canvas* canvas, MermaidApp* app) {
    char line[32];
    if(!app->catalog_valid) {
        canvas_draw_str(canvas, 3, 27, "Catalog: not loaded");
        canvas_draw_str(canvas, 3, 38, "Manifest-driven ADL v2");
        canvas_draw_str(canvas, 3, 49, "OK requests live catalog");
    } else {
        snprintf(line, sizeof(line), "Apps %u  Ready %u", app->catalog_total, app->catalog_ready);
        canvas_draw_str(canvas, 3, 27, line);
        snprintf(line, sizeof(line), "Need adapter %u", app->catalog_needs_adapter);
        canvas_draw_str(canvas, 3, 38, line);
        snprintf(line, sizeof(line), "Blocked %u", app->catalog_blocked);
        canvas_draw_str(canvas, 3, 49, line);
    }
    draw_footer(canvas, "OK refresh catalog");
}

static void draw_safety(Canvas* canvas, MermaidApp* app) {
    char line[32];
    canvas_draw_str(canvas, 3, 27, app->stop_asserted ? "STOP ASSERTED" : "SIREN READY");
    snprintf(line, sizeof(line), "Codex:%s S3:%s", yesno(app->codex_linked), yesno(app->s3_linked));
    canvas_draw_str(canvas, 3, 38, line);
    canvas_draw_str(canvas, 3, 49, "READY is remote-gated");
    draw_footer(canvas, "OK request READY/STOP");
}

static void draw_telemetry(Canvas* canvas, MermaidApp* app) {
    char line[32];
    snprintf(line, sizeof(line), "RX %lu  TX %lu", (unsigned long)app->packets_rx, (unsigned long)app->packets_tx);
    canvas_draw_str(canvas, 3, 27, line);
    snprintf(line, sizeof(line), "Faults %lu  HB %lums", (unsigned long)app->faults, (unsigned long)app->heartbeat_ms);
    canvas_draw_str(canvas, 3, 38, line);
    snprintf(line, sizeof(line), "Last: %.20s", app->last_event);
    canvas_draw_str(canvas, 3, 49, line);
    draw_footer(canvas, "< > pages");
}

static void draw_settings(Canvas* canvas, MermaidApp* app) {
    canvas_draw_str(canvas, 3, 27, app->theme_animation ? "Theme animation: ON" : "Theme animation: OFF");
    canvas_draw_str(canvas, 3, 38, "UART: 230400 8N1");
    canvas_draw_str(canvas, 3, 49, "Exit always requests STOP");
    draw_footer(canvas, "OK toggle animation");
}

static void draw_about(Canvas* canvas, MermaidApp* app) {
    UNUSED(app);
    canvas_draw_str(canvas, 3, 27, "M3RMA1D_S1R3N");
    canvas_draw_str(canvas, 3, 38, "ADL 2.0 + MermaidLink 2");
    canvas_draw_str(canvas, 3, 49, "918 Technologies");
    draw_footer(canvas, "Flipper Zero command deck");
}

static void draw(Canvas* canvas, void* ctx) {
    MermaidApp* app = ctx;
    canvas_clear(canvas);
    canvas_set_font(canvas, FontPrimary);
    canvas_draw_str(canvas, 3, 10, "M3rMa1d S1r3n");
    draw_wave(canvas);
    canvas_set_font(canvas, FontSecondary);
    canvas_draw_str(canvas, 3, 22, page_name(app->page));

    switch(app->page) {
    case PageHome: draw_home(canvas, app); break;
    case PageCodex: draw_codex(canvas, app); break;
    case PageVision: draw_vision(canvas, app); break;
    case PageOps: draw_ops(canvas, app); break;
    case PageSafety: draw_safety(canvas, app); break;
    case PageTelemetry: draw_telemetry(canvas, app); break;
    case PageSettings: draw_settings(canvas, app); break;
    case PageAbout: draw_about(canvas, app); break;
    default: break;
    }
}

static void input_cb(InputEvent* event, void* ctx) {
    FuriMessageQueue* queue = ctx;
    furi_message_queue_put(queue, event, FuriWaitForever);
}

static void request_status(MermaidApp* app) {
    if(mermaid_link_request_status(app->link)) {
        set_event(app, "status.request");
    } else {
        app->faults++;
        set_event(app, "link.closed");
    }
}

static void activate_page_action(MermaidApp* app) {
    switch(app->page) {
    case PageHome:
    case PageSafety:
        if(app->stop_asserted) {
            if(app->codex_linked && app->s3_linked && mermaid_link_request_ready(app->link)) {
                set_event(app, "ready.requested");
            } else {
                app->faults++;
                set_event(app, "ready.denied");
            }
        } else {
            app->stop_asserted = true;
            if(mermaid_link_send_stop(app->link, 0)) {
                set_event(app, "stop.requested");
            } else {
                app->faults++;
                set_event(app, "stop.link_failed");
            }
        }
        break;
    case PageCodex:
    case PageVision:
        request_status(app);
        break;
    case PageOps:
        if(mermaid_link_request_catalog(app->link)) {
            set_event(app, "catalog.request");
        } else {
            app->faults++;
            set_event(app, "catalog.failed");
        }
        break;
    case PageSettings:
        app->theme_animation = !app->theme_animation;
        set_event(app, "theme.toggle");
        break;
    default:
        break;
    }
}

int32_t m3rma1d_s1r3n_app(void* p) {
    UNUSED(p);

    MermaidApp* app = malloc(sizeof(MermaidApp));
    furi_check(app);
    memset(app, 0, sizeof(MermaidApp));
    app->page = PageHome;
    app->stop_asserted = true;
    app->theme_animation = true;
    set_event(app, "boot.fail_closed");

    app->link = mermaid_link_alloc();
    furi_check(app->link);
    mermaid_link_set_callbacks(app->link, status_callback, catalog_callback, result_callback, app);
    mermaid_link_set_action_callbacks(app->link, NULL, stop_callback);
    if(mermaid_link_is_open(app->link)) {
        mermaid_link_request_status(app->link);
    } else {
        app->faults++;
        set_event(app, "uart.unavailable");
    }

    app->queue = furi_message_queue_alloc(8, sizeof(InputEvent));
    app->viewport = view_port_alloc();
    view_port_draw_callback_set(app->viewport, draw, app);
    view_port_input_callback_set(app->viewport, input_cb, app->queue);
    app->gui = furi_record_open(RECORD_GUI);
    gui_add_view_port(app->gui, app->viewport, GuiLayerFullscreen);

    bool running = true;
    InputEvent event;
    while(running) {
        mermaid_link_poll(app->link);
        if(furi_message_queue_get(app->queue, &event, 50) == FuriStatusOk && event.type == InputTypePress) {
            if(event.key == InputKeyBack) {
                if(app->page == PageHome) {
                    running = false;
                } else {
                    app->page = PageHome;
                }
            } else if(event.key == InputKeyLeft) {
                app->page = (app->page == 0) ? (PageCount - 1) : (MermaidPage)(app->page - 1);
            } else if(event.key == InputKeyRight) {
                app->page = (MermaidPage)((app->page + 1) % PageCount);
            } else if(event.key == InputKeyOk) {
                activate_page_action(app);
            }
        }
        view_port_update(app->viewport);
    }

    app->stop_asserted = true;
    mermaid_link_send_stop(app->link, 0);
    FURI_LOG_I(TAG, "Exit: STOP requested");
    view_port_enabled_set(app->viewport, false);
    gui_remove_view_port(app->gui, app->viewport);
    view_port_free(app->viewport);
    furi_message_queue_free(app->queue);
    furi_record_close(RECORD_GUI);
    mermaid_link_free(app->link);
    free(app);
    return 0;
}
