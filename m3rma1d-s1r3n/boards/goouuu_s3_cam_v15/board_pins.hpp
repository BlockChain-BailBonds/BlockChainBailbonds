#pragma once
// M3rMa1d S1r3n board support: GOOUUU ESP32-S3-CAM V1.5 N16R8.
// Header labels verified from the user's physical board photographs.
namespace s1r3n::goouuu_v15 {
constexpr int UART0_TX=43; // header TX0
constexpr int UART0_RX=44; // header RX0
// Exposed GPIOs visible on the board. Camera-internal mapping is intentionally separate.
constexpr int LEFT_HEADER[]  = {4,5,6,7,15,16,17,18,8,3,46,9,10,11,12,13,14};
constexpr int RIGHT_HEADER[] = {1,2,42,41,40,39,38,37,36,35,0,45,48,47,21,20,19};
// Production roles are explicit even though Core and Vision use identical PCBs.
enum class Role { Core, Vision };
}
