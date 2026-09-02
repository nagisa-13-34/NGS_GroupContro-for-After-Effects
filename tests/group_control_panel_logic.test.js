'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const rootDir = path.resolve(__dirname, '..');

class FakeMarkerValue {
  constructor(comment) {
    this.comment = comment;
  }
}

class FakeProperty {
  constructor(matchName, name, value) {
    this.matchName = matchName;
    this.name = name || '';
    this.value = value;
    this.numKeys = 0;
    this.canSetExpression = true;
    this.expressionEnabled = false;
    this.expression = '';
  }

  setValue(value) {
    this.value = value;
  }
}

class FakeTransform {
  constructor() {
    this.properties = {};
    [
      'ADBE Position',
      'ADBE Scale',
      'ADBE Rotation',
      'ADBE Rotate Z',
      'ADBE Orientation',
      'ADBE Rotate X',
      'ADBE Rotate Y',
    ].forEach((matchName) => {
      this.properties[matchName] = new FakeProperty(matchName, matchName, 0);
    });
  }

  property(matchName) {
    return this.properties[matchName] || null;
  }
}

class FakeMarkerProperty {
  constructor() {
    this.keys = [];
  }

  get numKeys() {
    return this.keys.length;
  }

  keyValue(index) {
    return this.keys[index - 1].value;
  }

  keyTime(index) {
    return this.keys[index - 1].time;
  }

  setValueAtKey(index, value) {
    this.keys[index - 1].value = value;
  }

  setValueAtTime(time, value) {
    const existing = this.keys.find((key) => Math.abs(key.time - time) < 0.0000001);
    if (existing) {
      existing.value = value;
      return;
    }

    this.keys.push({ time, value });
    this.keys.sort((left, right) => left.time - right.time);
  }

  removeKey(index) {
    this.keys.splice(index - 1, 1);
  }
}

class FakeEffects {
  constructor() {
    this.items = [];
  }

  get numProperties() {
    return this.items.length;
  }

  property(identifier) {
    if (typeof identifier === 'number') {
      return this.items[identifier - 1] || null;
    }

    return this.items.find((item) => item.matchName === identifier || item.name === identifier) || null;
  }

  addProperty(matchName) {
    const effect = new FakeEffect(matchName);
    effect.effects = this;
    this.items.push(effect);
    return effect;
  }

  remove(effect) {
    const index = this.items.indexOf(effect);
    if (index >= 0) {
      this.items.splice(index, 1);
    }
  }
}

class FakeEffect {
  constructor(matchName, name) {
    this.matchName = matchName;
    this.name = name || (matchName === 'NGS_GroupControl' ? 'Group Control' : matchName);
    this.items = matchName === 'NGS_GroupControl'
      ? [new FakeProperty('NGS_GroupControl-0001', 'Layer Count', 0)]
      : [];
    this.effects = null;
  }

  get numProperties() {
    return this.items.length;
  }

  property(identifier) {
    if (typeof identifier === 'number') {
      return this.items[identifier - 1] || null;
    }

    return this.items.find((item) => item.matchName === identifier || item.name === identifier) || null;
  }

  remove() {
    if (this.effects) {
      this.effects.remove(this);
    }
  }
}

class FakeLayer {
  constructor(id, name, options = {}) {
    this.id = id;
    this.name = name;
    this.nullLayer = options.nullLayer === true;
    this.parent = options.parent || null;
    this.selected = false;
    this.effects = new FakeEffects();
    this.transform = new FakeTransform();
    this.marker = new FakeMarkerProperty();
    this.comp = null;

    if (this.nullLayer && options.groupControl !== false) {
      const groupControlEffect = new FakeEffect('NGS_GroupControl');
      groupControlEffect.effects = this.effects;
      this.effects.items.push(groupControlEffect);
    }
  }

  get index() {
    return this.comp ? this.comp.layersList.indexOf(this) + 1 : 0;
  }

  property(matchName) {
    if (matchName === 'ADBE Effect Parade') {
      return this.effects;
    }
    if (matchName === 'ADBE Transform Group') {
      return this.transform;
    }
    if (matchName === 'ADBE Marker') {
      return this.marker;
    }
    return null;
  }

  remove() {
    if (this.comp) {
      this.comp.removeLayer(this);
    }
  }
}

class FakeCompItem {}

class FakeComp extends FakeCompItem {
  constructor(layers) {
    super();
    this.layersList = layers;
    this.frameDuration = 1 / 24;
    this.onLayerAccess = null;
    for (const layer of layers) {
      layer.comp = this;
    }
  }

  get numLayers() {
    return this.layersList.length;
  }

  get selectedLayers() {
    return this.layersList.filter((layer) => layer.selected);
  }

  layer(index) {
    if (this.onLayerAccess) {
      this.onLayerAccess(index);
    }
    return this.layersList[index - 1] || null;
  }

  removeLayer(layer) {
    const index = this.layersList.indexOf(layer);
    if (index >= 0) {
      this.layersList.splice(index, 1);
      layer.comp = null;
    }
  }
}

class FakeUIElement {
  constructor(text) {
    this.text = text || '';
    this.enabled = true;
    this.onClick = null;
  }
}

class FakeUIContainer {
  constructor() {
    this.children = [];
    this.layout = { resize() {} };
  }

  add(type, bounds, text) {
    const child = type === 'group' ? new FakeUIContainer() : new FakeUIElement(text);
    this.children.push(child);
    return child;
  }

  center() {}

  show() {}
}

class FakePanel extends FakeUIContainer {}

class FakeWindow extends FakeUIContainer {}

class FakeScheduler {
  constructor() {
    this.nextId = 1;
    this.scheduleCalls = [];
    this.cancelCalls = [];
  }

  scheduleTask(expression, delay, repeat) {
    const task = {
      id: this.nextId,
      expression,
      delay,
      repeat,
      canceled: false,
      completed: false,
    };
    this.nextId += 1;
    this.scheduleCalls.push(task);
    return task.id;
  }

  cancelTask(taskId) {
    this.cancelCalls.push(taskId);
    const task = this.scheduleCalls.find((candidate) => candidate.id === taskId);
    if (task) {
      task.canceled = true;
    }
  }

  runNext(sandbox) {
    const task = this.scheduleCalls.find((candidate) => (
      !candidate.canceled && !candidate.completed
    ));

    if (!task) {
      return false;
    }

    task.completed = true;
    if (task.expression === 'GroupControlEffectWatcherTick()') {
      sandbox.GroupControlEffectWatcherTick();
    }
    return true;
  }

  pendingCount() {
    return this.scheduleCalls.filter((task) => !task.canceled && !task.completed).length;
  }
}

function loadPanel({ scheduler = null } = {}) {
  const panel = fs.readFileSync(path.join(rootDir, 'panel', 'GroupControl.jsx'), 'utf8')
    .replace(/#include\s+["']([^"']+)["']/g, (includeLine, includeName) => {
      const includePath = path.join(rootDir, 'panel', includeName);
      return fs.existsSync(includePath) ? fs.readFileSync(includePath, 'utf8') : '';
    })
    .replace(/var GroupControlPanel = buildUI\(this\);\s*$/, '');
  const app = {
    project: { activeItem: null },
    scheduleTask: scheduler ? scheduler.scheduleTask.bind(scheduler) : () => 1,
    cancelTask: scheduler ? scheduler.cancelTask.bind(scheduler) : () => {},
  };
  const sandbox = {
    console,
    MarkerValue: FakeMarkerValue,
    CompItem: FakeCompItem,
    Panel: FakePanel,
    Window: FakeWindow,
    app,
  };
  vm.runInNewContext(panel, sandbox, { filename: 'GroupControl.jsx' });
  return sandbox;
}

function makeGroupFixture({ count = 0, extraLayers = [] } = {}) {
  const group = new FakeLayer(100, '[G] Group', { nullLayer: true });
  const layers = [group, ...extraLayers];
  const comp = new FakeComp(layers);
  group.effects.property(1).property(1).setValue(count);
  group.selected = true;
  return { comp, group, layers: comp.layersList };
}

function markerComments(group) {
  return group.marker.keys.map((key) => key.value.comment);
}

function effectNamed(layer, name) {
  return layer.effects.items.find((effect) => effect.name === name) || null;
}

function addSourceEffect(group, name) {
  const effect = group.effects.addProperty('ADBE Gaussian Blur 2');
  effect.name = name;
  return effect;
}

test('Apply attaches only roots, preserves internal parents, and counts external candidates', () => {
  const panel = loadPanel();
  const external = new FakeLayer(200, 'External');
  const root = new FakeLayer(101, 'Root');
  const child = new FakeLayer(102, 'Child', { parent: root });
  const externalRoot = new FakeLayer(103, 'External Root', { parent: external });
  const freeRoot = new FakeLayer(104, 'Free Root');
  const { comp, group } = makeGroupFixture({
    count: 4,
    extraLayers: [root, child, externalRoot, freeRoot, external],
  });

  const result = panel.applyGroupCore(group, comp);

  assert.equal(result.ok, true);
  assert.equal(result.candidateCount, 4);
  assert.equal(result.attachedCount, 2);
  assert.equal(result.releasedCount, 0);
  assert.equal(result.externalParentSkipped, 1);
  assert.equal(result.expressionSkipped, 0);
  assert.equal(result.cycleSkipped, 0);
  assert.equal(root.parent, group);
  assert.equal(child.parent, root);
  assert.equal(externalRoot.parent, external);
  assert.equal(freeRoot.parent, group);
  assert.deepEqual(markerComments(group).map((comment) => comment.split('\n').slice(2)), [
    ['record=101,0', 'record=104,0'],
  ]);
});

test('Apply releases only prior Group Control parents and protects a manually changed parent', () => {
  const panel = loadPanel();
  const root = new FakeLayer(101, 'Root');
  const { comp, group } = makeGroupFixture({ count: 1, extraLayers: [root] });

  const first = panel.applyGroupCore(group, comp);
  assert.equal(first.ok, true);
  assert.equal(root.parent, group);

  root.parent = null;
  const second = panel.applyGroupCore(group, comp);

  assert.equal(second.ok, true);
  assert.equal(second.attachedCount, 0);
  assert.equal(second.externalParentSkipped, 1);
  assert.equal(root.parent, null);
  assert.match(second.status, /接続=0件/);
  assert.match(markerComments(group)[0], /NGS_GROUP_CONTROL_V1\ngroupId=100$/);
});

test('Apply skips an expression Root and refuses an animated Group Null before mutation', () => {
  const panel = loadPanel();
  const expressionRoot = new FakeLayer(101, 'Expression Root');
  expressionRoot.transform.property('ADBE Position').expressionEnabled = true;
  expressionRoot.transform.property('ADBE Position').expression = 'value';
  const freeRoot = new FakeLayer(102, 'Free Root');
  const { comp, group } = makeGroupFixture({ count: 2, extraLayers: [expressionRoot, freeRoot] });

  const expressionResult = panel.applyGroupCore(group, comp);
  assert.equal(expressionResult.expressionSkipped, 1);
  assert.equal(expressionRoot.parent, null);
  assert.equal(freeRoot.parent, group);

  group.transform.property('ADBE Position').numKeys = 1;
  const keyResult = panel.applyGroupCore(group, comp);
  assert.equal(keyResult.ok, false);
  assert.equal(keyResult.status, 'Group NullのTransformにキーがあるためApplyを中断しました。');
  assert.equal(expressionRoot.parent, null);
  assert.equal(freeRoot.parent, group);
});

test('Invalid Group Marker stops Apply before any Parent change', () => {
  const panel = loadPanel();
  const root = new FakeLayer(101, 'Root');
  const { comp, group } = makeGroupFixture({ count: 1, extraLayers: [root] });
  group.marker.setValueAtTime(0, new FakeMarkerValue('NGS_GROUP_CONTROL_V1\ngroupId=100\nrecord=101,0\nextra=bad'));

  const result = panel.applyGroupCore(group, comp);

  assert.equal(result.ok, false);
  assert.equal(result.status, 'Group Markerの構文が不正です。');
  assert.equal(root.parent, null);
});

test('Ungroup restores only recorded parents, preserves a manual parent change, and removes the Group Null', () => {
  const panel = loadPanel();
  const originalParent = new FakeLayer(201, 'Original Parent');
  const root = new FakeLayer(101, 'Root');
  const manual = new FakeLayer(102, 'Manual');
  const { comp, group } = makeGroupFixture({ count: 1, extraLayers: [root, manual, originalParent] });
  group.marker.setValueAtTime(0, new FakeMarkerValue(
    'NGS_GROUP_CONTROL_V1\ngroupId=100\nrecord=101,201',
  ));
  root.parent = group;

  manual.parent = originalParent;
  const result = panel.ungroupCore(group, comp);

  assert.equal(result.ok, true);
  assert.equal(root.parent, originalParent);
  assert.equal(manual.parent, originalParent);
  assert.equal(comp.layersList.includes(group), false);
});

test('Ungroup refuses to delete a Group Null with an unrecorded direct child', () => {
  const panel = loadPanel();
  const directChild = new FakeLayer(101, 'Direct Child');
  const { comp, group } = makeGroupFixture({ count: 0, extraLayers: [directChild] });
  directChild.parent = group;

  const result = panel.ungroupCore(group, comp);

  assert.equal(result.ok, false);
  assert.equal(result.status, 'Group Nullの直接子LayerがGroup MarkerにないためUngroupを中断しました。');
  assert.equal(comp.layersList.includes(group), true);
  assert.equal(directChild.parent, group);
});

test('Nested Ungroup removes the nested record from the outer Group Marker', () => {
  const panel = loadPanel();
  const outer = new FakeLayer(100, '[G] Outer', { nullLayer: true });
  const nested = new FakeLayer(101, '[G] Nested', { nullLayer: true, parent: outer });
  const child = new FakeLayer(102, 'Child');
  const comp = new FakeComp([outer, nested, child]);
  outer.effects.property(1).property(1).setValue(1);
  nested.effects.property(1).property(1).setValue(1);
  outer.marker.setValueAtTime(0, new FakeMarkerValue(
    'NGS_GROUP_CONTROL_V1\ngroupId=100\nrecord=101,0',
  ));
  nested.marker.setValueAtTime(0, new FakeMarkerValue(
    'NGS_GROUP_CONTROL_V1\ngroupId=101\nrecord=102,0',
  ));

  const result = panel.ungroupCore(nested, comp);

  assert.equal(result.ok, true);
  assert.equal(comp.layersList.includes(nested), false);
  assert.equal(child.parent, null);
  assert.deepEqual(markerComments(outer), ['NGS_GROUP_CONTROL_V1\ngroupId=100']);
});

test('Ungroup removes Group Control-owned Effect copies but preserves a Child-local Effect', () => {
  const panel = loadPanel();
  const root = new FakeLayer(101, 'Root');
  const unrelated = new FakeLayer(102, 'Unrelated');
  const localEffect = new FakeEffect('ADBE Gaussian Blur 2', 'Gaussian Blur');
  const ownedEffect = new FakeEffect('ADBE Gaussian Blur 2', '[GFX:100:2] Gaussian Blur');
  const unrelatedOwnedEffect = new FakeEffect('ADBE Gaussian Blur 2', '[GFX:100:3] Gaussian Blur');
  const unrelatedOtherGroupEffect = new FakeEffect('ADBE Gaussian Blur 2', '[GFX:999:2] Gaussian Blur');
  root.effects.items.push(localEffect, ownedEffect);
  unrelated.effects.items.push(unrelatedOwnedEffect, unrelatedOtherGroupEffect);
  const { comp, group } = makeGroupFixture({ count: 1, extraLayers: [root, unrelated] });
  group.marker.setValueAtTime(0, new FakeMarkerValue(
    'NGS_GROUP_CONTROL_V1\ngroupId=100\nrecord=101,0',
  ));
  root.parent = group;

  const result = panel.ungroupCore(group, comp);

  assert.equal(result.ok, true);
  assert.equal(effectNamed(root, 'Gaussian Blur'), localEffect);
  assert.equal(effectNamed(root, '[GFX:100:2] Gaussian Blur'), null);
  assert.equal(effectNamed(unrelated, '[GFX:100:3] Gaussian Blur'), null);
  assert.equal(effectNamed(unrelated, '[GFX:999:2] Gaussian Blur'), unrelatedOtherGroupEffect);
});

test('Ungroup cleans owned Effects on the markerless empty-group early path', () => {
  const panel = loadPanel();
  const root = new FakeLayer(101, 'Root');
  const localEffect = new FakeEffect('ADBE Gaussian Blur 2', 'Gaussian Blur');
  const ownedEffect = new FakeEffect('ADBE Gaussian Blur 2', '[GFX:100:2] Gaussian Blur');
  root.effects.items.push(localEffect, ownedEffect);
  const { comp, group } = makeGroupFixture({ count: 0, extraLayers: [root] });

  const result = panel.ungroupCore(group, comp);

  assert.equal(result.ok, true);
  assert.equal(effectNamed(root, 'Gaussian Blur'), localEffect);
  assert.equal(effectNamed(root, '[GFX:100:2] Gaussian Blur'), null);
  assert.equal(comp.layersList.includes(group), false);
});

test('buildUI starts one-shot watcher sync, reschedules after a Tick, and stops on close', () => {
  const scheduler = new FakeScheduler();
  const outside = new FakeLayer(200, 'Outside');
  const root = new FakeLayer(101, 'Root');
  const externalChild = new FakeLayer(102, 'External Child', { parent: outside });
  const { comp, group } = makeGroupFixture({
    count: 2,
    extraLayers: [root, externalChild, outside],
  });
  addSourceEffect(group, 'Gaussian Blur');

  const panel = loadPanel({ scheduler });
  panel.app.project.activeItem = comp;
  const ui = panel.buildUI({});

  assert.equal(scheduler.scheduleCalls.length, 1);
  assert.equal(scheduler.scheduleCalls[0].expression, 'GroupControlEffectWatcherTick()');
  assert.equal(scheduler.scheduleCalls[0].delay, 200);
  assert.equal(scheduler.scheduleCalls[0].repeat, false);
  assert.notEqual(effectNamed(root, '[GFX:100:2] Gaussian Blur'), null);
  assert.equal(effectNamed(externalChild, '[GFX:100:2] Gaussian Blur'), null);

  addSourceEffect(group, 'Tint');
  assert.equal(scheduler.runNext(panel), true);
  assert.equal(scheduler.scheduleCalls.length, 2);
  assert.notEqual(effectNamed(root, '[GFX:100:3] Tint'), null);
  assert.equal(scheduler.pendingCount(), 1);

  ui.onClose();
  assert.deepEqual(scheduler.cancelCalls, [scheduler.scheduleCalls[1].id]);
  assert.equal(scheduler.pendingCount(), 0);
});

test('active-comp watcher synchronizes every Group Null in the active composition', () => {
  const scheduler = new FakeScheduler();
  const firstGroup = new FakeLayer(100, '[G] First', { nullLayer: true });
  const firstRoot = new FakeLayer(101, 'First Root');
  const secondGroup = new FakeLayer(200, '[G] Second', { nullLayer: true });
  const secondRoot = new FakeLayer(201, 'Second Root');
  const comp = new FakeComp([firstGroup, firstRoot, secondGroup, secondRoot]);
  firstGroup.effects.property(1).property(1).setValue(1);
  secondGroup.effects.property(1).property(1).setValue(1);
  addSourceEffect(firstGroup, 'Gaussian Blur');
  addSourceEffect(secondGroup, 'Tint');

  const panel = loadPanel({ scheduler });
  panel.app.project.activeItem = comp;
  panel.buildUI({});

  assert.notEqual(effectNamed(firstRoot, '[GFX:100:2] Gaussian Blur'), null);
  assert.notEqual(effectNamed(secondRoot, '[GFX:200:2] Tint'), null);
});

test('watcher start is idempotent and a reentrant Tick does not create a duplicate task', () => {
  const scheduler = new FakeScheduler();
  const root = new FakeLayer(101, 'Root');
  const { comp } = makeGroupFixture({ count: 0, extraLayers: [root] });
  const panel = loadPanel({ scheduler });

  panel.startGroupEffectWatcher();
  panel.startGroupEffectWatcher();
  assert.equal(scheduler.scheduleCalls.length, 1);
  assert.equal(scheduler.pendingCount(), 1);

  let reentered = false;
  comp.onLayerAccess = () => {
    if (!reentered) {
      reentered = true;
      panel.GroupControlEffectWatcherTick();
    }
  };
  panel.app.project.activeItem = comp;
  assert.equal(scheduler.runNext(panel), true);
  assert.equal(scheduler.scheduleCalls.length, 2);
  assert.equal(scheduler.pendingCount(), 1);

  panel.stopGroupEffectWatcher();
  assert.deepEqual(scheduler.cancelCalls, [scheduler.scheduleCalls[1].id]);
  assert.equal(scheduler.pendingCount(), 0);
});

test('watcher removes reserved copies whose Group Null was manually deleted', () => {
  const scheduler = new FakeScheduler();
  const root = new FakeLayer(101, 'Root');
  const { comp, group } = makeGroupFixture({ count: 1, extraLayers: [root] });
  addSourceEffect(group, 'Gaussian Blur');

  const panel = loadPanel({ scheduler });
  panel.app.project.activeItem = comp;
  panel.GroupControlEffectWatcherStart();
  assert.notEqual(effectNamed(root, '[GFX:100:2] Gaussian Blur'), null);

  comp.removeLayer(group);
  assert.equal(scheduler.runNext(panel), true);
  assert.equal(effectNamed(root, '[GFX:100:2] Gaussian Blur'), null);
  panel.GroupControlEffectWatcherStop();
});
