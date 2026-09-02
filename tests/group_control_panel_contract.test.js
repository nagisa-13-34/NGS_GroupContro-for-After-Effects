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
  assert.match(source, /app\.scheduleTask\s*\(/);
  assert.match(source, /200/);
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
