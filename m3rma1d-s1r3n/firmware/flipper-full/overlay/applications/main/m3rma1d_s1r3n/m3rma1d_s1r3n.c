#include <furi.h>
#include <gui/gui.h>
#include <input/input.h>

#define TAG "M3RMA1D"

typedef enum {
    MermaidPageHome = 0,
    MermaidPageCompanion,
    MermaidPageCamera,
    MermaidPageSiren,
    MermaidPageAbout,
    MermaidPageCount,
} MermaidPage;

typedef struct {
    MermaidPage page;
    bool stop_asserted;
    bool operator_armed;
    uint32_t ticks;
} MermaidState;

static void draw_wave(Canvas* canvas, int y, uint32_t phase) {
    for(int x = -8; x < 128; x += 8) {
        int offset = ((x / 8 + (int)phase) & 1) ? 2 : 0;
        canvas_draw_line(canvas, x, y + offset, x + 4, y + 2 - offset);
        canvas_draw_line(canvas, x + 4, y + 2 - offset, x + 8, y + offset);
    }
}

static void draw_tail(Canvas* canvas, int x, int y) {
    canvas_draw_line(canvas, x, y, x + 7, y + 5);
    canvas_draw_line(canvas, x + 7, y + 5, x + 14, y);
    canvas_draw_line(canvas, x + 7, y + 5, x + 7, y + 13);
    canvas_draw_line(canvas, x + 7, y + 13, x + 2, y + 18);
    canvas_draw_line(canvas, x + 7, y + 13, x + 12, y + 18);
}

static void draw_header(Canvas* canvas, MermaidState* state, const char* subtitle) {
    canvas_clear(canvas);
    draw_wave(canvas, 1, state->ticks >> 2);
    canvas_set_font(canvas, FontPrimary);
    canvas_draw_str(canvas, 3, 13, "M3rMa1d S1r3n");
    canvas_set_font(canvas, FontSecondary);
    canvas_draw_str(canvas, 3, 23, subtitle);
    canvas_draw_line(canvas, 0, 27, 127, 27);
}

static void draw_footer(Canvas* canvas, MermaidState* state) {
    char nav[24];
    snprintf(nav, sizeof(nav), "< %u/%u >", (unsigned)state->page + 1, (unsigned)MermaidPageCount);
    canvas_set_font(canvas, FontSecondary);
    canvas_draw_str(canvas, 3, 63, nav);
    canvas_draw_str(canvas, 69, 63, "BACK exit");
}

static void draw_home(Canvas* canvas, MermaidState* state) {
    draw_header(canvas, state, "SIREN COMMAND DECK");
    draw_tail(canvas, 104, 30);

    canvas_set_font(canvas, FontPrimary);
    canvas_draw_str(canvas, 4, 41, state->stop_asserted ? "STATE: STOP" : "STATE: READY");
    canvas_set_font(canvas, FontSecondary);
    canvas_draw_str(canvas, 4, 51, state->operator_armed ? "Operator: ARMED" : "Operator: SAFE");
    canvas_draw_str(canvas, 4, 59, "OK toggle  </> pages");
}

static void draw_companion(Canvas* canvas, MermaidState* state) {
    draw_header(canvas, state, "ESP32-S3 COMPANION");
    canvas_set_font(canvas, FontSecondary);
    canvas_draw_str(canvas, 4, 38, "Link: external Expansion");
    canvas_draw_str(canvas, 4, 47, "RX pin 13  TX pin 14");
    canvas_draw_str(canvas, 4, 56, "Shared GND only");
    draw_footer(canvas, state);
}

static void draw_camera(Canvas* canvas, MermaidState* state) {
    draw_header(canvas, state, "OV3660 VISION");
    canvas_set_font(canvas, FontSecondary);
    canvas_draw_str(canvas, 4, 38, "Camera lives on S3 CAM");
    canvas_draw_str(canvas, 4, 47, "Snapshot: companion HTTP");
    canvas_draw_str(canvas, 4, 56, "Flipper shows link state");
    draw_footer(canvas, state);
}

static void draw_siren(Canvas* canvas, MermaidState* state) {
    draw_header(canvas, state, "SIREN SAFETY");
    canvas_draw_frame(canvas, 4, 32, 120, 21);
    canvas_set_font(canvas, FontPrimary);
    canvas_draw_str(canvas, 12, 46, state->stop_asserted ? "STOP ASSERTED" : "READY REQUESTED");
    canvas_set_font(canvas, FontSecondary);
    canvas_draw_str(canvas, 4, 60, "OK changes local request");
}

static void draw_about(Canvas* canvas, MermaidState* state) {
    draw_header(canvas, state, "918 TECHNOLOGIES");
    canvas_set_font(canvas, FontSecondary);
    canvas_draw_str(canvas, 4, 38, "Firmware: Mermaid Siren");
    canvas_draw_str(canvas, 4, 47, "Machine: M3RMA1D_S1R3N");
    canvas_draw_str(canvas, 4, 56, "UI/UX build: themed-v2");
    draw_footer(canvas, state);
}

static void draw(Canvas* canvas, void* ctx) {
    MermaidState* state = ctx;
    switch(state->page) {
    case MermaidPageHome:
        draw_home(canvas, state);
        break;
    case MermaidPageCompanion:
        draw_companion(canvas, state);
        break;
    case MermaidPageCamera:
        draw_camera(canvas, state);
        break;
    case MermaidPageSiren:
        draw_siren(canvas, state);
        break;
    case MermaidPageAbout:
        draw_about(canvas, state);
        break;
    default:
        state->page = MermaidPageHome;
        draw_home(canvas, state);
        break;
    }
}

static void input_cb(InputEvent* event, void* ctx) {
    FuriMessageQueue* q = ctx;
    furi_message_queue_put(q, event, FuriWaitForever);
}

int32_t m3rma1d_s1r3n_app(void* p) {
    UNUSED(p);

    MermaidState state = {
        .page = MermaidPageHome,
        .stop_asserted = true,
        .operator_armed = false,
        .ticks = 0,
    };

    FuriMessageQueue* q = furi_message_queue_alloc(8, sizeof(InputEvent));
    ViewPort* vp = view_port_alloc();
    view_port_draw_callback_set(vp, draw, &state);
    view_port_input_callback_set(vp, input_cb, q);

    Gui* gui = furi_record_open(RECORD_GUI);
    gui_add_view_port(gui, vp, GuiLayerFullscreen);

    FURI_LOG_I(TAG, "M3rMa1d S1r3n themed command deck started");

    bool running = true;
    InputEvent event;
    while(running) {
        if(furi_message_queue_get(q, &event, 100) == FuriStatusOk && event.type == InputTypePress) {
            if(event.key == InputKeyBack) {
                running = false;
            } else if(event.key == InputKeyRight) {
                state.page = (MermaidPage)((state.page + 1) % MermaidPageCount);
            } else if(event.key == InputKeyLeft) {
                state.page = (MermaidPage)((state.page + MermaidPageCount - 1) % MermaidPageCount);
            } else if(event.key == InputKeyOk) {
                if(state.page == MermaidPageHome || state.page == MermaidPageSiren) {
                    state.stop_asserted = !state.stop_asserted;
                    state.operator_armed = !state.stop_asserted;
                    FURI_LOG_I(TAG, "Local operator request: %s", state.stop_asserted ? "STOP" : "READY");
                }
            }
        }
        state.ticks++;
        view_port_update(vp);
    }

    state.stop_asserted = true;
    state.operator_armed = false;
    FURI_LOG_I(TAG, "Command deck closed; local state returned to STOP");

    view_port_enabled_set(vp, false);
    gui_remove_view_port(gui, vp);
    view_port_free(vp);
    furi_message_queue_free(q);
    furi_record_close(RECORD_GUI);
    return 0;
}
