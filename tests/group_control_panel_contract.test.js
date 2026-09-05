'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const panelPath = path.resolve(__dirname, '..', 'panel', 'GroupControl.jsx');

function readPanel() {
  return fs.readFileSync(panelPath, 'utf8');
}

test('Group Control panel exposes the ScriptUI and adapter contract', () => {
  const source = readPanel();

  assert.match(source, /#include\s+["']GroupControlCore\.jsxinc["']/);
  assert.match(source, /#include\s+["']GroupControlEffectSync\.jsxinc["']/);
  assert.match(source, /function\s+buildUI\s*\(/);
  assert.match(source, /function\s+getActiveComp\s*\(/);
  assert.match(source, /function\s+isGroupLayer\s*\(/);
  assert.match(source, /function\s+getSelectedGroup\s*\(/);
  assert.match(source, /function\s+getLayerCount\s*\(/);
  assert.match(source, /function\s+setLayerCount\s*\(/);
  assert.match(source, /function\s+getTargetLayers\s*\(/);
  assert.match(source, /function\s+getRootLayers\s*\(/);
  assert.match(source, /function\s+applyGroupCore\s*\(/);
  assert.match(source, /function\s+removePreviousGroupParents\s*\(/);
  assert.match(source, /function\s+applyGroup\s*\(/);
  assert.match(source, /function\s+ungroupCore\s*\(/);
  assert.match(source, /function\s+ungroup\s*\(/);
  assert.match(source, /function\s+syncAllGroupEffects\s*\(/);
  assert.match(source, /function\s+startGroupEffectWatcher\s*\(/);
  assert.match(source, /function\s+stopGroupEffectWatcher\s*\(/);
  assert.match(source, /function\s+GroupControlEffectWatcherStart\s*\(/);
  assert.match(source, /function\s+GroupControlEffectWatcherStop\s*\(/);
  assert.match(source, /function\s+GroupControlEffectWatcherTick\s*\(/);
  assert.match(source, /function\s+GroupControlEffectWatcherRunOnce\s*\(/);
  assert.match(source, /function\s+GroupControlEffectWatcherGetStats\s*\(/);

  assert.match(source, /instanceof\s+Panel/);
  assert.match(source, /new\s+Window\s*\(\s*["']palette["']/);
  assert.match(source, /Create Group/);
  assert.match(source, /Selected Group/);
  assert.match(source, /Layers/);
  assert.match(source, /Ungroup/);
  assert.match(source, /NGS_GroupControl/);
  assert.match(source, /NGS_GroupControl-0001/);
  assert.match(source, /NGS_GroupControl-LayerCount/);
  assert.match(source, /ADBE Transform Group/);
  assert.match(source, /GroupControlCore\.clampLayerCount/);
  assert.match(source, /GroupControlEffectSync\.(?:syncGroupEffects|removeOwnedEffects)\s*\(/);
  assert.match(source, /GroupControlEffectSync\.createIncrementalSession\s*\(/);
  assert.match(source, /getTargetRange\s*:\s*getGroupEffectWatcherTargetRange/);
  assert.match(source, /maxDiscoveryLayers\s*:\s*16/);
  assert.match(source, /maxTargetLayers\s*:\s*2/);
  assert.match(source, /timeBudgetMs\s*:\s*12/);
  assert.match(source, /maxPropertyOperations\s*:\s*8/);
  assert.match(source, /maxEffectAdds\s*:\s*1/);
  assert.match(source, /session\.step\s*\(\s*comp\s*,\s*\{\s*projectId\s*:\s*project\s*\}\s*\)/);
  assert.match(source, /GROUP_CONTROL_EFFECT_SYNC_INTERVAL_MS\s*=\s*200/);
  assert.match(source, /GROUP_CONTROL_EFFECT_SYNC_PENDING_INTERVAL_MS\s*=\s*10/);
  assert.match(source, /app\.scheduleTask\s*\(\s*["']GroupControlEffectWatcherTick\(\s*["']\s*\+\s*groupControlEffectWatcherState\.generation\s*\+\s*["']\s*\)["']\s*,\s*delay\s*,\s*false\s*\)/);
  assert.match(source, /app\.cancelTask\s*\(/);
  assert.match(source, /function\s+buildUI[\s\S]*GroupControlEffectWatcherStart\s*\(\)/);
  assert.match(source, /panel\.onClose\s*=\s*function[\s\S]*GroupControlEffectWatcherStop\s*\(/);

  const watcherStart = source.indexOf('function runGroupEffectWatcherOnce');
  const watcherEnd = source.indexOf('function getLayerId');
  assert.ok(watcherStart >= 0 && watcherEnd > watcherStart);
  assert.doesNotMatch(source.slice(watcherStart, watcherEnd), /syncAllGroupEffects\s*\(/);
});

test('Group Control panel keeps fixed safety messages and one undo group per action', () => {
  const source = readPanel();

  assert.match(source, /コンポジションを開いてください。/);
  assert.match(source, /Group Nullを選択してください。/);
  assert.match(source, /Group Nullを1つだけ選択してください。/);
  assert.match(source, /Group Markerが複数あるため処理を中断しました。/);
  assert.match(source, /Group Markerの構文が不正です。/);
  assert.match(source, /Group MarkerのIDが不正です。/);
  assert.match(source, /Group MarkerのgroupIdが一致しません。/);
  assert.match(source, /Group MarkerのLayer IDが重複しています。/);
  assert.match(source, /Group MarkerにGroup Null自身のIDがあります。/);
  assert.match(source, /Group NullのTransformにキーがあるためApplyを中断しました。/);
  assert.match(source, /Apply完了: 候補数=/);
  assert.match(source, /Group Markerを新規作成しました。/);
  assert.match(source, /app\.beginUndoGroup\s*\(/);
  assert.match(source, /app\.endUndoGroup\s*\(/);
  assert.match(source, /finally\s*\{/);
  assert.doesNotMatch(source, /\b(?:alert|setInterval|watchFolder)\s*\(/);
});
