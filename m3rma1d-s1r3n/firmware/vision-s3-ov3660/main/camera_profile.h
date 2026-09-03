#pragma once
/*
 * GOOUUU ESP32-S3-CAM V1.5 + OV3660 profile gate.
 * The exact internal camera GPIO map is not yet verified from an authoritative
 * schematic/example for this board revision, so camera capture remains disabled.
 * Set S1R3N_GOOUUU_V15_CAMERA_PROFILE_VERIFIED to 1 only after the exact mapping
 * is verified and recorded in the hardware test evidence.
 */
#define S1R3N_GOOUUU_V15_CAMERA_PROFILE_VERIFIED 0
#if S1R3N_GOOUUU_V15_CAMERA_PROFILE_VERIFIED
#error "Populate the verified GOOUUU V1.5 OV3660 pin map before enabling this guard."
#endif
