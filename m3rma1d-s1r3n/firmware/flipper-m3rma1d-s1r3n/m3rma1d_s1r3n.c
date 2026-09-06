#include <furi.h>
#include <gui/gui.h>
#include <input/input.h>
#include <stdio.h>
#include <string.h>

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
    MermaidPage page;
    bool stop_asserted;
    bool codex_linked;
    bool s3_linked;
    bool camera_ready;
    bool approval_pending;
    bool theme_animation;
    uint32_t packets_rx;
    uint32_t packets_tx;
    uint32_t faults;
    uint32_t heartbeat_ms;
    char last_event[32];
} MermaidApp;

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
    canvas_draw_str(canvas, 3, 38, "ADL: v2 manifest mode");
    canvas_draw_str(canvas, 3, 49, app->approval_pending ? "Approval: PENDING" : "Approval: clear");
    draw_footer(canvas, "OK refresh  < > pages");
}

static void draw_vision(Canvas* canvas, MermaidApp* app) {
    canvas_draw_str(canvas, 3, 27, app->camera_ready ? "OV3660: READY" : "OV3660: UNKNOWN");
    canvas_draw_str(canvas, 3, 38, app->s3_linked ? "Vision S3: LINKED" : "Vision S3: ADRIFT");
    canvas_draw_str(canvas, 3, 49, "Events feed Codex/ADL");
    draw_footer(canvas, "OK request snapshot");
}

static void draw_ops(Canvas* canvas, MermaidApp* app) {
    UNUSED(app);
    canvas_draw_str(canvas, 3, 27, "Catalog: manifest-driven");
    canvas_draw_str(canvas, 3, 38, "Apps/functions via ADL");
    canvas_draw_str(canvas, 3, 49, "Missing deps -> resolver");
    draw_footer(canvas, "OK catalog  < > pages");
}

static void draw_safety(Canvas* canvas, MermaidApp* app) {
    char line[32];
    canvas_draw_str(canvas, 3, 27, app->stop_asserted ? "STOP ASSERTED" : "SIREN READY");
    snprintf(line, sizeof(line), "Codex:%s S3:%s", yesno(app->codex_linked), yesno(app->s3_linked));
    canvas_draw_str(canvas, 3, 38, line);
    canvas_draw_str(canvas, 3, 49, "READY requires healthy gates");
    draw_footer(canvas, "OK toggle safety state");
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
    canvas_draw_str(canvas, 3, 38, "Boot state: fail-closed");
    canvas_draw_str(canvas, 3, 49, "Back: leave in STOP");
    draw_footer(canvas, "OK toggle animation");
}

static void draw_about(Canvas* canvas, MermaidApp* app) {
    UNUSED(app);
    canvas_draw_str(canvas, 3, 27, "M3RMA1D_S1R3N");
    canvas_draw_str(canvas, 3, 38, "ADL 2.0 / Codex ready");
    canvas_draw_str(canvas, 3, 49, "918 Technologies");
    draw_footer(canvas, "Built for Flipper Zero");
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

static void set_event(MermaidApp* app, const char* event) {
    snprintf(app->last_event, sizeof(app->last_event), "%s", event);
}

static void activate_page_action(MermaidApp* app) {
    switch(app->page) {
    case PageHome:
    case PageSafety:
        if(app->stop_asserted) {
            if(app->codex_linked && app->s3_linked) {
                app->stop_asserted = false;
                set_event(app, "ready.operator");
            } else {
                app->faults++;
                set_event(app, "ready.denied");
            }
        } else {
            app->stop_asserted = true;
            set_event(app, "stop.operator");
        }
        break;
    case PageCodex:
        set_event(app, "codex.refresh");
        break;
    case PageVision:
        if(app->camera_ready && app->s3_linked) {
            app->packets_tx++;
            set_event(app, "vision.snapshot");
        } else {
            app->faults++;
            set_event(app, "vision.denied");
        }
        break;
    case PageOps:
        set_event(app, "catalog.request");
        app->packets_tx++;
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
    app->heartbeat_ms = 0;
    set_event(app, "boot.fail_closed");

    app->queue = furi_message_queue_alloc(8, sizeof(InputEvent));
    app->viewport = view_port_alloc();
    view_port_draw_callback_set(app->viewport, draw, app);
    view_port_input_callback_set(app->viewport, input_cb, app->queue);
    app->gui = furi_record_open(RECORD_GUI);
    gui_add_view_port(app->gui, app->viewport, GuiLayerFullscreen);

    bool running = true;
    InputEvent event;
    while(running) {
        if(furi_message_queue_get(app->queue, &event, 100) == FuriStatusOk && event.type == InputTypePress) {
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
    FURI_LOG_I(TAG, "Exit: STOP asserted");
    view_port_enabled_set(app->viewport, false);
    gui_remove_view_port(app->gui, app->viewport);
    view_port_free(app->viewport);
    furi_message_queue_free(app->queue);
    furi_record_close(RECORD_GUI);
    free(app);
    return 0;
}
