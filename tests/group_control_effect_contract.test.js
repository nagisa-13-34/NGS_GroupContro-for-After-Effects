'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(repositoryRoot, 'plugin', 'GroupControl', 'GroupControl.cpp');
const headerPath = path.join(repositoryRoot, 'plugin', 'GroupControl', 'GroupControl.h');
const buildConfigPath = path.join(repositoryRoot, 'plugin', 'GroupControl', 'GroupControlBuildConfig.h');
const paramsPath = path.join(repositoryRoot, 'plugin', 'GroupControl', 'GroupControlParams.h');
const piplPath = path.join(repositoryRoot, 'plugin', 'GroupControl', 'GroupControlPiPL.r');
const windowsProjectPath = path.join(repositoryRoot, 'plugin', 'win', 'GroupControl.vcxproj');
const windowsSolutionPath = path.join(repositoryRoot, 'plugin', 'win', 'GroupControl.sln');
const macProjectPath = path.join(repositoryRoot, 'plugin', 'mac', 'GroupControl.xcodeproj', 'project.pbxproj');

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

test('Group Control exposes the requested effect and one Layer Count slider', () => {
  const header = read('plugin/GroupControl/GroupControl.h');
  const buildConfig = read('plugin/GroupControl/GroupControlBuildConfig.h');
  const params = read('plugin/GroupControl/GroupControlParams.h');
  const source = read('plugin/GroupControl/GroupControl.cpp');
  const pipl = read('plugin/GroupControl/GroupControlPiPL.r');

  assert.match(header, /GROUP_CONTROL_EFFECT_DISPLAY_NAME\s+"Group Control"/);
  assert.match(header, /GROUP_CONTROL_EFFECT_MATCH_NAME\s+"NGS_GroupControl"/);
  assert.match(params, /GROUP_CONTROL_LAYER_COUNT_MATCH_NAME\s+"NGS_GroupControl-LayerCount"/);
  assert.match(buildConfig, /GROUP_CONTROL_EFFECT_VERSION\s+524289/);
  assert.match(buildConfig, /GROUP_CONTROL_EFFECT_OUT_FLAGS\s+0x02000000/);
  assert.match(buildConfig, /GROUP_CONTROL_EFFECT_OUT_FLAGS_2\s+0x08000000/);
  assert.match(params, /GROUP_CONTROL_LAYER_COUNT_MIN\s+0/);
  assert.match(params, /GROUP_CONTROL_LAYER_COUNT_MAX\s+9999/);
  assert.match(params, /GROUP_CONTROL_LAYER_COUNT_DEFAULT\s+0/);
  assert.match(params, /GROUP_CONTROL_LAYER_COUNT_DISK_ID\s*=\s*1/);
  assert.match(params, /GROUP_CONTROL_LAYER_COUNT_HOST_MATCH_NAME\s+"NGS_GroupControl-0001"/);
  assert.equal((source.match(/\bPF_ADD_SLIDER\s*\(/g) || []).length, 1);
  assert.match(source, /out_data->num_params\s*=\s*GROUP_CONTROL_NUM_PARAMS/);
  assert.match(source, /out_data->my_version\s*=\s*GROUP_CONTROL_EFFECT_VERSION/);
  assert.match(source, /out_data->out_flags\s*=\s*GROUP_CONTROL_EFFECT_OUT_FLAGS/);
  assert.match(source, /out_data->out_flags2\s*=\s*GROUP_CONTROL_EFFECT_OUT_FLAGS_2/);
  assert.match(header, /PF_LayerDef\s*\*output\s*,\s*void\s*\*extra\s*\)\s*;/s);
  assert.match(source, /PF_LayerDef\s*\*output\s*,\s*void\s*\*extra\s*\)/s);
  assert.match(source, /PF_COPY\s*\(\s*&params\[GROUP_CONTROL_INPUT\]->u\.ld\s*,\s*output\s*,\s*NULL\s*,\s*NULL\s*\)/);
  assert.match(pipl, /Name\s*\{\s*"Group Control"\s*\}/s);
  assert.match(pipl, /AE_Effect_Version\s*\{\s*GROUP_CONTROL_EFFECT_VERSION\s*\}/s);
  assert.match(pipl, /AE_Effect_Global_OutFlags\s*\{\s*GROUP_CONTROL_EFFECT_OUT_FLAGS\s*\}/s);
  assert.match(pipl, /AE_Effect_Global_OutFlags_2\s*\{\s*GROUP_CONTROL_EFFECT_OUT_FLAGS_2\s*\}/s);
  assert.match(pipl, /AE_Effect_Match_Name\s*\{\s*"NGS_GroupControl"\s*\}/s);
});

test('Group Control source does not own panel, parent, marker, or layer traversal behavior', () => {
  const source = read('plugin/GroupControl/GroupControl.cpp');

  assert.doesNotMatch(source, /AEGP_(Get|Set|Create|Delete|Add|Remove)/);
  assert.doesNotMatch(source, /\b(Marker|Parent|LayerSuite|CompSuite|StreamSuite)\b/);
  assert.doesNotMatch(source, /PF_(CHECKOUT|CHECKIN|ITERATE|FILL|BLEND|RESAMPLE)/);
});

test('Windows and macOS projects require an explicit SDK_ROOT and build the plugin bundle types', () => {
  assert.ok(fs.existsSync(windowsSolutionPath));
  assert.ok(fs.existsSync(windowsProjectPath));
  assert.ok(fs.existsSync(macProjectPath));

  const windowsProject = read('plugin/win/GroupControl.vcxproj');
  const macProject = read('plugin/mac/GroupControl.xcodeproj/project.pbxproj');

  assert.match(windowsProject, /SDK_ROOT/);
  assert.match(windowsProject, /TargetExt>\.aex<\/TargetExt>/);
  assert.match(windowsProject, /GroupControl\.cpp/);
  assert.match(windowsProject, /<AdditionalInputs>.*GroupControlBuildConfig\.h/s);
  assert.match(windowsProject, /<RuntimeLibrary>MultiThreadedDebug<\/RuntimeLibrary>/);
  assert.match(windowsProject, /<RuntimeLibrary>MultiThreaded<\/RuntimeLibrary>/);
  assert.doesNotMatch(windowsProject, /<RuntimeLibrary>MultiThreaded(?:Debug)?DLL<\/RuntimeLibrary>/);
  assert.match(macProject, /SDK_ROOT/);
  assert.match(macProject, /WRAPPER_EXTENSION\s*=\s*plugin/);
  assert.match(macProject, /GroupControl\.cpp/);
  assert.match(macProject, /ARCHS\s*=\s*"arm64 x86_64"/);
  assert.match(macProject, /ONLY_ACTIVE_ARCH\s*=\s*NO/);
  assert.match(macProject, /REZ_PREPROCESSOR_DEFINITIONS\s*=\s*__MACH__/);
  const macPlist = read('plugin/mac/GroupControl.plugin-Info.plist');
  assert.match(macPlist, /CFBundleExecutable/);
  assert.match(macPlist, /<string>GroupControl<\/string>/);
  assert.match(macPlist, /CFBundlePackageType[\s\S]*<string>eFKT<\/string>/);
  assert.match(macPlist, /CFBundleSignature[\s\S]*<string>FXTC<\/string>/);
});
