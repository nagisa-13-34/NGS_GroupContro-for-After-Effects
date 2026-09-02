#include "AEConfig.h"
#include "AE_EffectVers.h"
#include "GroupControlBuildConfig.h"

#ifndef AE_OS_WIN
	#include "AE_General.r"
#endif

resource 'PiPL' (16000) {
	{
		Kind { AEEffect },
		Name { "Group Control" },
		Category { "NGS" },
#ifdef AE_OS_WIN
	#if defined(AE_PROC_INTELx64)
		CodeWin64X86 { "EffectMain" },
	#elif defined(AE_PROC_ARM64)
		CodeWinARM64 { "EffectMain" },
	#endif
#elif defined(AE_OS_MAC)
		CodeMacIntel64 { "EffectMain" },
		CodeMacARM64 { "EffectMain" },
#endif
		AE_PiPL_Version { 2, 0 },
		AE_Effect_Spec_Version { PF_PLUG_IN_VERSION, PF_PLUG_IN_SUBVERS },
		AE_Effect_Version { GROUP_CONTROL_EFFECT_VERSION },
		AE_Effect_Info_Flags { 0 },
		AE_Effect_Global_OutFlags { GROUP_CONTROL_EFFECT_OUT_FLAGS },
		AE_Effect_Global_OutFlags_2 { GROUP_CONTROL_EFFECT_OUT_FLAGS_2 },
		AE_Effect_Match_Name { "NGS_GroupControl" },
		AE_Reserved_Info { 0 },
		AE_Effect_Support_URL { "https://developer.adobe.com/after-effects/" }
	}
};
