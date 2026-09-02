#pragma once

#ifndef NGS_GROUP_CONTROL_H
#define NGS_GROUP_CONTROL_H

#define PF_TABLE_BITS 12
#define PF_TABLE_SZ_16 4096
#define PF_DEEP_COLOR_AWARE 1

#include "AEConfig.h"

#ifdef AE_OS_WIN
	#include <Windows.h>
#endif

#include "entry.h"
#include "AE_Effect.h"
#include "AE_EffectCB.h"
#include "AE_Macros.h"
#include "Param_Utils.h"

#include "GroupControlBuildConfig.h"
#include "GroupControlParams.h"

#define GROUP_CONTROL_EFFECT_DISPLAY_NAME "Group Control"
#define GROUP_CONTROL_EFFECT_MATCH_NAME "NGS_GroupControl"
#define GROUP_CONTROL_LAYER_COUNT_DISPLAY_NAME "Layer Count"
#define GROUP_CONTROL_LAYER_COUNT_MATCH_NAME "NGS_GroupControl-LayerCount"
#define GROUP_CONTROL_CATEGORY "NGS"

#define GROUP_CONTROL_MAJOR_VERSION 1
#define GROUP_CONTROL_MINOR_VERSION 0
#define GROUP_CONTROL_BUG_VERSION 0
#define GROUP_CONTROL_STAGE_VERSION PF_Stage_DEVELOP
#define GROUP_CONTROL_BUILD_VERSION 1

static_assert(
	GROUP_CONTROL_EFFECT_VERSION == PF_VERSION(
		GROUP_CONTROL_MAJOR_VERSION,
		GROUP_CONTROL_MINOR_VERSION,
		GROUP_CONTROL_BUG_VERSION,
		GROUP_CONTROL_STAGE_VERSION,
		GROUP_CONTROL_BUILD_VERSION),
	"C++ and PiPL effect versions must stay aligned.");
static_assert(
	GROUP_CONTROL_EFFECT_OUT_FLAGS == PF_OutFlag_DEEP_COLOR_AWARE,
	"C++ and PiPL global flags must stay aligned.");
static_assert(
	GROUP_CONTROL_EFFECT_OUT_FLAGS_2 == PF_OutFlag2_SUPPORTS_THREADED_RENDERING,
	"C++ and PiPL global flags 2 must stay aligned.");

enum {
	GROUP_CONTROL_INPUT = 0,
	GROUP_CONTROL_LAYER_COUNT,
	GROUP_CONTROL_NUM_PARAMS
};

extern "C" {
	DllExport
	PF_Err
	EffectMain(
		PF_Cmd cmd,
		PF_InData *in_data,
		PF_OutData *out_data,
		PF_ParamDef *params[],
		PF_LayerDef *output,
		void *extra);
}

#endif // NGS_GROUP_CONTROL_H
