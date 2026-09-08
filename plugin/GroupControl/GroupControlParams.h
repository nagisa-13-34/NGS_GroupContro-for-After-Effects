#pragma once

#define GROUP_CONTROL_LAYER_COUNT_MIN 0
#define GROUP_CONTROL_LAYER_COUNT_MAX 9999
#define GROUP_CONTROL_LAYER_COUNT_DEFAULT 0

// PF_ADD_SLIDER exposes the numeric disk ID as the host matchName suffix.
// Keep the requested logical name as an API alias for panel compatibility.
#define GROUP_CONTROL_LAYER_COUNT_MATCH_NAME "NGS_GroupControl-LayerCount"
#define GROUP_CONTROL_LAYER_COUNT_HOST_MATCH_NAME "NGS_GroupControl-0001"

enum {
	GROUP_CONTROL_LAYER_COUNT_DISK_ID = 1
};
