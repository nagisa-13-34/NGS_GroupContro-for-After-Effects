#include "GroupControl.h"

static PF_Err
About(
	PF_InData *in_data,
	PF_OutData *out_data,
	PF_ParamDef *params[],
	PF_LayerDef *output)
{
	PF_SPRINTF(
		out_data->return_msg,
		"%s, v%d.%d\r%s",
		GROUP_CONTROL_EFFECT_DISPLAY_NAME,
		GROUP_CONTROL_MAJOR_VERSION,
		GROUP_CONTROL_MINOR_VERSION,
		"Pass-through control for the Group Control panel.");

	return PF_Err_NONE;
}

static PF_Err
GlobalSetup(
	PF_InData *in_data,
	PF_OutData *out_data,
	PF_ParamDef *params[],
	PF_LayerDef *output)
{
	out_data->my_version = PF_VERSION(
		GROUP_CONTROL_MAJOR_VERSION,
		GROUP_CONTROL_MINOR_VERSION,
		GROUP_CONTROL_BUG_VERSION,
		GROUP_CONTROL_STAGE_VERSION,
		GROUP_CONTROL_BUILD_VERSION);

	out_data->out_flags = PF_OutFlag_DEEP_COLOR_AWARE;
	out_data->out_flags2 = PF_OutFlag2_SUPPORTS_THREADED_RENDERING;

	return PF_Err_NONE;
}

static PF_Err
ParamsSetup(
	PF_InData *in_data,
	PF_OutData *out_data,
	PF_ParamDef *params[],
	PF_LayerDef *output)
{
	PF_ParamDef def;
	AEFX_CLR_STRUCT(def);

	PF_ADD_SLIDER(
		GROUP_CONTROL_LAYER_COUNT_DISPLAY_NAME,
		GROUP_CONTROL_LAYER_COUNT_MIN,
		GROUP_CONTROL_LAYER_COUNT_MAX,
		GROUP_CONTROL_LAYER_COUNT_MIN,
		GROUP_CONTROL_LAYER_COUNT_MAX,
		GROUP_CONTROL_LAYER_COUNT_DEFAULT,
		GROUP_CONTROL_LAYER_COUNT_DISK_ID);

	out_data->num_params = GROUP_CONTROL_NUM_PARAMS;
	return PF_Err_NONE;
}

static PF_Err
Render(
	PF_InData *in_data,
	PF_OutData *out_data,
	PF_ParamDef *params[],
	PF_LayerDef *output)
{
	return PF_COPY(
		&params[GROUP_CONTROL_INPUT]->u.ld,
		output,
		NULL,
		NULL);
}

extern "C" DllExport
PF_Err PluginDataEntryFunction2(
	PF_PluginDataPtr inPtr,
	PF_PluginDataCB2 inPluginDataCallBackPtr,
	SPBasicSuite *inSPBasicSuitePtr,
	const char *inHostName,
	const char *inHostVersion)
{
	PF_Err result = PF_Err_INVALID_CALLBACK;

	result = PF_REGISTER_EFFECT_EXT2(
		inPtr,
		inPluginDataCallBackPtr,
		GROUP_CONTROL_EFFECT_DISPLAY_NAME,
		GROUP_CONTROL_EFFECT_MATCH_NAME,
		GROUP_CONTROL_CATEGORY,
		AE_RESERVED_INFO,
		"EffectMain",
		"https://developer.adobe.com/after-effects/");

	return result;
}

PF_Err
EffectMain(
	PF_Cmd cmd,
	PF_InData *in_data,
	PF_OutData *out_data,
	PF_ParamDef *params[],
	PF_LayerDef *output)
{
	PF_Err err = PF_Err_NONE;

	try {
		switch (cmd) {
			case PF_Cmd_ABOUT:
				err = About(in_data, out_data, params, output);
				break;
			case PF_Cmd_GLOBAL_SETUP:
				err = GlobalSetup(in_data, out_data, params, output);
				break;
			case PF_Cmd_PARAMS_SETUP:
				err = ParamsSetup(in_data, out_data, params, output);
				break;
			case PF_Cmd_RENDER:
				err = Render(in_data, out_data, params, output);
				break;
			default:
				break;
		}
	} catch (PF_Err &thrown_err) {
		err = thrown_err;
	}

	return err;
}

