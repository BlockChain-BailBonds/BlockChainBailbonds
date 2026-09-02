#include <furi.h>
#include <gui/gui.h>
#include <input/input.h>

static bool stop_asserted = true;

static void draw(Canvas* canvas, void* ctx) {
    UNUSED(ctx);
    canvas_clear(canvas);
    canvas_set_font(canvas, FontPrimary);
    canvas_draw_str(canvas, 3, 12, "M3rMa1d S1r3n");
    canvas_set_font(canvas, FontSecondary);
    canvas_draw_str(canvas, 3, 27, "Codex + ADL control");
    canvas_draw_str(canvas, 3, 40, stop_asserted ? "STATE: STOPPED" : "STATE: READY");
    canvas_draw_str(canvas, 3, 53, "OK: toggle  BACK: exit");
}

static void input_cb(InputEvent* event, void* ctx) {
    FuriMessageQueue* q = ctx;
    furi_message_queue_put(q, event, FuriWaitForever);
}

int32_t m3rma1d_s1r3n_app(void* p) {
    UNUSED(p);
    FuriMessageQueue* q = furi_message_queue_alloc(8, sizeof(InputEvent));
    ViewPort* vp = view_port_alloc();
    view_port_draw_callback_set(vp, draw, NULL);
    view_port_input_callback_set(vp, input_cb, q);
    Gui* gui = furi_record_open(RECORD_GUI);
    gui_add_view_port(gui, vp, GuiLayerFullscreen);

    bool running = true;
    InputEvent event;
    while(running) {
        if(furi_message_queue_get(q, &event, 100) == FuriStatusOk && event.type == InputTypePress) {
            if(event.key == InputKeyBack) {
                running = false;
            } else if(event.key == InputKeyOk) {
                stop_asserted = !stop_asserted;
                FURI_LOG_I("M3RMA1D", "Operator state changed: %s", stop_asserted ? "STOPPED" : "READY");
            }
        }
        view_port_update(vp);
    }

    stop_asserted = true;
    view_port_enabled_set(vp, false);
    gui_remove_view_port(gui, vp);
    view_port_free(vp);
    furi_message_queue_free(q);
    furi_record_close(RECORD_GUI);
    return 0;
}
