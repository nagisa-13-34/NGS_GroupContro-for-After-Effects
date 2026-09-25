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
    this.expressionWrites = 0;
    this.expressionEnabledWrites = 0;
    let expressionValue = '';
    let expressionEnabledValue = false;
    Object.defineProperty(this, 'expression', {
      configurable: true,
      get() {
        return expressionValue;
      },
      set(nextValue) {
        this.expressionWrites += 1;
        expressionValue = nextValue;
      },
    });
    Object.defineProperty(this, 'expressionEnabled', {
      configurable: true,
      get() {
        return expressionEnabledValue;
      },
      set(nextValue) {
        this.expressionEnabledWrites += 1;
        expressionEnabledValue = nextValue;
      },
    });
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
    this.addPropertyCalls = 0;
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
    this.addPropertyCalls += 1;
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
    this.layerAccesses = 0;
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
    this.layerAccesses += 1;
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
    vm.runInNewContext(task.expression, sandbox);
    return true;
  }

  pendingCount() {
    return this.scheduleCalls.filter((task) => !task.canceled && !task.completed).length;
  }
}

function loadPanel({ scheduler = null, sharedGlobal = null, appOverride = null } = {}) {
  const panel = fs.readFileSync(path.join(rootDir, 'panel', 'GroupControl.jsx'), 'utf8')
    .replace(/#include\s+["']([^"']+)["']/g, (includeLine, includeName) => {
      const includePath = path.join(rootDir, 'panel', includeName);
      return fs.existsSync(includePath) ? fs.readFileSync(includePath, 'utf8') : '';
    })
    .replace(/var GroupControlPanel = buildUI\(this\);\s*$/, '');
  const app = appOverride || {
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
  if (sharedGlobal) {
    sandbox.$ = { global: sharedGlobal };
  }
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

function effectAddPropertyCount(comp) {
  return comp.layersList.reduce((count, layer) => count + layer.effects.addPropertyCalls, 0);
}

function addSourceEffect(group, name) {
  const effect = group.effects.addProperty('ADBE Gaussian Blur 2');
  effect.name = name;
  return effect;
}

function makeLargeWatcherFixture(groupCount = 20) {
  const layers = [];
  const groups = [];
  const roots = [];

  for (let index = 0; index < groupCount; index += 1) {
    const group = new FakeLayer(1000 + index, `[G] Group ${index}`, { nullLayer: true });
    const root = new FakeLayer(2000 + index, `Root ${index}`);
    group.effects.property(1).property(1).setValue(1);
    addSourceEffect(group, 'Gaussian Blur');
    groups.push(group);
    roots.push(root);
    layers.push(group, root);
  }

  return {
    comp: new FakeComp(layers),
    groups,
    roots,
  };
}

function makeLargeParameterWatcherFixture(parameterCount = 240) {
  const group = new FakeLayer(100, '[G] Large Parameter Group', { nullLayer: true });
  const root = new FakeLayer(101, 'Large Parameter Root');
  const comp = new FakeComp([group, root]);
  const groupControl = group.effects.property(1);
  const sources = [
    group.effects.addProperty('NGS_LargeEffect_A'),
    group.effects.addProperty('NGS_LargeEffect_B'),
  ];

  groupControl.property(1).setValue(1);
  sources.forEach((source, sourceIndex) => {
    source.name = `Large Effect ${sourceIndex + 1}`;
    source.items = Array.from({ length: parameterCount }, (_, index) => (
      new FakeProperty(
        `${source.matchName}-${index + 1}`,
        `Parameter ${index + 1}`,
        index,
      )
    ));
  });

  const addProperty = root.effects.addProperty.bind(root.effects);
  root.effects.addProperty = (matchName) => {
    const effect = addProperty(matchName);
    const source = sources.find((candidate) => candidate.matchName === matchName);
    if (source) {
      effect.items = source.items.map((property) => (
        new FakeProperty(property.matchName, property.name, property.value)
      ));
    }
    return effect;
  };

  return { comp, group, root, sources };
}

function expressionWriteCount(layer) {
  return layer.effects.items.reduce((total, effect) => (
    total + effect.items.reduce((effectTotal, property) => (
      effectTotal + property.expressionWrites
    ), 0)
  ), 0);
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
  assert.match(scheduler.scheduleCalls[0].expression, /^GroupControlEffectWatcherTick\(\d+\)$/);
  assert.equal(scheduler.scheduleCalls[0].delay, 10);
  assert.equal(scheduler.scheduleCalls[0].repeat, false);
  assert.notEqual(effectNamed(root, '[GFX:100:2] Gaussian Blur'), null);
  assert.equal(effectNamed(externalChild, '[GFX:100:2] Gaussian Blur'), null);
  assert.equal(effectNamed(outside, '[GFX:100:2] Gaussian Blur'), null);

  addSourceEffect(group, 'Tint');
  assert.equal(scheduler.runNext(panel), true);
  assert.equal(scheduler.scheduleCalls.length, 2);
  assert.notEqual(effectNamed(root, '[GFX:100:3] Tint'), null);
  assert.equal(scheduler.pendingCount(), 1);

  ui.onClose();
  assert.deepEqual(scheduler.cancelCalls, [scheduler.scheduleCalls[1].id]);
  assert.equal(scheduler.pendingCount(), 0);
});

test('panel activation re-arms the watcher after a lost schedule task', () => {
  const scheduler = new FakeScheduler();
  const root = new FakeLayer(101, 'Root');
  const { comp, group } = makeGroupFixture({ count: 1, extraLayers: [root] });
  addSourceEffect(group, 'Gaussian Blur');
  const panel = loadPanel({ scheduler });
  panel.app.project.activeItem = comp;
  const ui = panel.buildUI({});

  /* Simulate AE dropping the pending task while a modal dialog is open. */
  scheduler.scheduleCalls[0].canceled = true;
  ui.onActivate();

  assert.equal(scheduler.pendingCount(), 1);
  assert.equal(scheduler.scheduleCalls.length, 2);
  assert.notEqual(effectNamed(root, '[GFX:100:2] Gaussian Blur'), null);
  ui.onClose();
});

test('Effect Layer Count changes automatically apply after the value settles', () => {
  const scheduler = new FakeScheduler();
  const root = new FakeLayer(101, 'Root');
  const secondRoot = new FakeLayer(102, 'Second Root');
  const { comp, group } = makeGroupFixture({ count: 1, extraLayers: [root, secondRoot] });
  const app = {
    project: { activeItem: comp },
    scheduleTask: scheduler.scheduleTask.bind(scheduler),
    cancelTask: scheduler.cancelTask.bind(scheduler),
    beginUndoGroup() {},
    endUndoGroup() {},
  };
  const panel = loadPanel({ scheduler, appOverride: app });

  panel.GroupControlEffectWatcherRunOnce();
  assert.equal(root.parent, null);
  assert.equal(secondRoot.parent, null);

  group.effects.property(1).property(1).setValue(2);
  panel.GroupControlEffectWatcherRunOnce();
  assert.equal(root.parent, null);
  assert.equal(secondRoot.parent, null);
  assert.equal(panel.groupControlEffectWatcherState.layerCountWatch.pending.length, 1);

  panel.groupControlEffectWatcherState.layerCountWatch.pending[0].changedAt = Date.now();
  panel.GroupControlEffectWatcherRunOnce();
  assert.equal(root.parent, null);
  assert.equal(secondRoot.parent, null);

  panel.groupControlEffectWatcherState.layerCountWatch.pending[0].changedAt = 0;
  panel.GroupControlEffectWatcherRunOnce();
  assert.equal(root.parent, group);
  assert.equal(secondRoot.parent, group);
  assert.equal(panel.groupControlEffectWatcherState.layerCountWatch.pending.length, 0);
  assert.equal(group.marker.numKeys, 1);
});

test('Layer Count display reserves enough width for multi-digit values', () => {
  const roots = Array.from({ length: 12 }, (_, index) => (
    new FakeLayer(101 + index, `Root ${index + 1}`)
  ));
  const { comp } = makeGroupFixture({ count: 12, extraLayers: roots });
  const panel = loadPanel();
  panel.app.project.activeItem = comp;

  const ui = panel.buildUI({});

  assert.equal(panel.groupControlUI.countText.text, '12');
  assert.ok(panel.groupControlUI.countText.characters >= 4);
  ui.onClose();
});

test('Create Group initializes Layer Count from the current selection', () => {
  const selected = [
    new FakeLayer(101, 'Selected 1'),
    new FakeLayer(102, 'Selected 2'),
    new FakeLayer(103, 'Selected 3'),
  ];
  const group = new FakeLayer(200, '[G] Group', { nullLayer: true, groupControl: false });
  const layers = [...selected];
  const comp = {
    layersList: layers,
    layers: {
      addNull() {
        group.comp = comp;
        layers.push(group);
        return group;
      },
    },
    get numLayers() {
      return layers.length;
    },
    get selectedLayers() {
      return layers.filter((layer) => layer.selected);
    },
    layer(index) {
      return layers[index - 1] || null;
    },
  };
  selected.forEach((layer) => {
    layer.comp = comp;
    layer.selected = true;
  });
  group.moveBefore = () => {};
  group.remove = () => {};

  const panel = loadPanel();
  const result = panel.createGroupCore(comp);

  assert.equal(result.ok, true);
  assert.equal(result.group.effects.property(1).property(1).value, 3);
});

test('watcher passes the agreed Effect work budgets into the incremental session', () => {
  const panel = loadPanel();
  let receivedOptions = null;

  panel.GroupControlEffectSync.createIncrementalSession = (options) => {
    receivedOptions = options;
    return {};
  };

  const session = panel.createGroupEffectWatcherSession();

  assert.deepEqual(session, {});
  assert.equal(receivedOptions.maxDiscoveryLayers, 16);
  assert.equal(receivedOptions.maxTargetLayers, 16);
  assert.equal(receivedOptions.timeBudgetMs, 12);
  assert.equal(receivedOptions.maxPropertyOperations, 64);
  assert.equal(receivedOptions.maxEffectAdds, 16);
});

test('watcher empty stats include the Effect work counters', () => {
  const panel = loadPanel();
  const stats = panel.GroupControlEffectWatcherGetStats();

  assert.equal(stats.lastTick.propertyOperations, 0);
  assert.equal(stats.lastTick.effectAddAttempts, 0);
  assert.equal(stats.totals.propertyOperations, 0);
  assert.equal(stats.totals.effectAddAttempts, 0);
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

  for (let index = 0; index < 8; index += 1) {
    assert.equal(scheduler.runNext(panel), true);
  }
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
  for (let index = 0; index < 8; index += 1) {
    assert.equal(scheduler.runNext(panel), true);
  }
  assert.equal(effectNamed(root, '[GFX:100:2] Gaussian Blur'), null);
  panel.GroupControlEffectWatcherStop();
});

test('watcher bounds one large-comp tick by host access and copy creation before catching up', () => {
  const scheduler = new FakeScheduler();
  const fixture = makeLargeWatcherFixture();
  const { comp, groups, roots } = fixture;
  const initialCopyCount = effectAddPropertyCount(comp);

  const panel = loadPanel({ scheduler });
  panel.app.project.activeItem = comp;
  panel.GroupControlEffectWatcherStart();

  assert.equal(panel.GroupControlEffectWatcherGetStats().pending, true);
  assert.equal(scheduler.scheduleCalls[0].delay, 10);

  const observedTicks = [];
  observedTicks.push(panel.GroupControlEffectWatcherGetStats().lastTick);
  assert.ok(observedTicks[0].discoveryLayers <= 16);
  assert.ok(observedTicks[0].targetLayers <= 16);
  assert.ok(comp.layerAccesses <= 64);
  assert.ok(effectAddPropertyCount(comp) - initialCopyCount <= 16);

  for (let index = 0;
    index < 200 && panel.GroupControlEffectWatcherGetStats().pending;
    index += 1) {
    assert.equal(scheduler.runNext(panel), true);
    observedTicks.push(panel.GroupControlEffectWatcherGetStats().lastTick);
  }

  assert.ok(observedTicks.every((stats) => stats.discoveryLayers <= 16));
  assert.ok(observedTicks.every((stats) => stats.targetLayers <= 16));
  assert.ok(comp.layerAccesses > 16);
  assert.ok(effectAddPropertyCount(comp) - initialCopyCount >= groups.length);
  roots.forEach((root, index) => {
    assert.notEqual(effectNamed(root, `[GFX:${groups[index].id}:2] Gaussian Blur`), null);
  });

  assert.equal(panel.GroupControlEffectWatcherGetStats().pending, false);
  assert.equal(scheduler.scheduleCalls[scheduler.scheduleCalls.length - 1].delay, 200);
  panel.GroupControlEffectWatcherStop();
});

test('watcher applies one simple Effect to twenty target layers in a few ticks', () => {
  const scheduler = new FakeScheduler();
  const roots = Array.from({ length: 20 }, (_, index) => (
    new FakeLayer(101 + index, `Character ${index + 1}`)
  ));
  const { comp, group } = makeGroupFixture({ count: 20, extraLayers: roots });
  addSourceEffect(group, 'Gaussian Blur');
  const panel = loadPanel({ scheduler });
  panel.app.project.activeItem = comp;

  panel.GroupControlEffectWatcherStart();
  let ticks = 1;
  while (panel.GroupControlEffectWatcherGetStats().pending && ticks < 100) {
    assert.equal(scheduler.runNext(panel), true);
    ticks += 1;
  }

  assert.equal(panel.GroupControlEffectWatcherGetStats().pending, false);
  assert.ok(roots.every((root) => effectNamed(root, '[GFX:100:2] Gaussian Blur')));
  assert.ok(ticks <= 8, `expected at most 8 ticks, received ${ticks}`);
  panel.GroupControlEffectWatcherStop();
});

test('watcher caps real Expression setters and Effect additions per tick for a large Effect', () => {
  const scheduler = new FakeScheduler();
  const { comp, root } = makeLargeParameterWatcherFixture();
  const panel = loadPanel({ scheduler });
  panel.app.project.activeItem = comp;

  const observedTicks = [];
  let previousExpressionWrites = expressionWriteCount(root);
  let previousEffectAdds = effectAddPropertyCount(comp);
  const observeTick = () => {
    const expressionWrites = expressionWriteCount(root);
    const effectAdds = effectAddPropertyCount(comp);
    observedTicks.push({
      expressionWrites: expressionWrites - previousExpressionWrites,
      effectAdds: effectAdds - previousEffectAdds,
    });
    previousExpressionWrites = expressionWrites;
    previousEffectAdds = effectAdds;
  };

  panel.GroupControlEffectWatcherStart();
  observeTick();
  // A parameter can need separate visits for discovery, expression, and enable.
  // Require convergence within a finite bound while checking every tick's work.
  for (let index = 0; index < 1000 && panel.GroupControlEffectWatcherGetStats().pending; index += 1) {
    assert.equal(scheduler.runNext(panel), true);
    observeTick();
  }

  assert.equal(panel.GroupControlEffectWatcherGetStats().pending, false);
  assert.ok(observedTicks.some((tick) => tick.expressionWrites > 0));
  assert.ok(observedTicks.every((tick) => tick.expressionWrites <= 64));
  assert.ok(observedTicks.every((tick) => tick.effectAdds <= 16));
  assert.equal(
    root.effects.items.filter((effect) => effect.name.indexOf('[GFX:100:') === 0).length,
    2,
  );
  const copies = root.effects.items.filter((effect) => effect.name.indexOf('[GFX:100:') === 0);
  assert.equal(copies.reduce((count, effect) => count + effect.items.length, 0), 480);
  assert.ok(copies.every((effect) => effect.items.every((property) => (
    property.expression.length > 0 && property.expressionEnabled
  ))));
  panel.GroupControlEffectWatcherStop();
});

test('RunOnce performs one bounded tick without reserving a schedule task', () => {
  const scheduler = new FakeScheduler();
  const { comp } = makeLargeWatcherFixture();
  const panel = loadPanel({ scheduler });
  panel.app.project.activeItem = comp;
  const initialCopyCount = effectAddPropertyCount(comp);

  panel.GroupControlEffectWatcherRunOnce();

  assert.equal(scheduler.scheduleCalls.length, 0);
  assert.ok(comp.layerAccesses > 0);
  assert.ok(effectAddPropertyCount(comp) > initialCopyCount);
  const stats = panel.GroupControlEffectWatcherGetStats().lastTick;
  assert.ok(stats.discoveryLayers <= 16);
  assert.ok(stats.targetLayers <= 16);
});

test('watcher resets the incremental session for no comp, project switches, and stop', () => {
  const scheduler = new FakeScheduler();
  const app = {
    project: null,
    scheduleTask: scheduler.scheduleTask.bind(scheduler),
    cancelTask: scheduler.cancelTask.bind(scheduler),
  };
  const panel = loadPanel({ scheduler, appOverride: app });
  const compA = makeLargeWatcherFixture(2).comp;
  const compB = makeLargeWatcherFixture(2).comp;
  const projectA = { activeItem: compA };
  const projectB = { activeItem: compB };
  const originalFactory = panel.GroupControlEffectSync.createIncrementalSession;
  const projectIds = [];
  let resetCalls = 0;

  panel.GroupControlEffectSync.createIncrementalSession = (options) => {
    const session = originalFactory(options);
    const originalStep = session.step;
    const originalReset = session.reset;
    session.step = (comp, budget) => {
      projectIds.push(budget.projectId);
      return originalStep.call(session, comp, budget);
    };
    session.reset = () => {
      resetCalls += 1;
      return originalReset.call(session);
    };
    return session;
  };

  app.project = projectA;
  panel.GroupControlEffectWatcherStart();
  const resetAfterStart = resetCalls;
  const reservationBeforeStop = scheduler.scheduleCalls[scheduler.scheduleCalls.length - 1].expression;
  assert.equal(projectIds[0], projectA);

  projectA.activeItem = null;
  assert.equal(scheduler.runNext(panel), true);
  assert.ok(resetCalls > resetAfterStart);
  const resetAfterNoComp = resetCalls;

  app.project = projectB;
  assert.equal(scheduler.runNext(panel), true);
  assert.ok(resetCalls > resetAfterNoComp);
  assert.equal(projectIds[projectIds.length - 1], projectB);

  panel.GroupControlEffectWatcherStop();
  assert.ok(resetCalls > resetAfterNoComp);
  assert.equal(scheduler.pendingCount(), 0);
  const stepsAfterStop = projectIds.length;
  vm.runInNewContext(reservationBeforeStop, panel);
  assert.equal(projectIds.length, stepsAfterStop);
});

test('reloading cancels the old reservation, ignores stale ticks, and protects the new watcher from old close', () => {
  const scheduler = new FakeScheduler();
  const sharedGlobal = {};
  const app = {
    project: null,
    scheduleTask: scheduler.scheduleTask.bind(scheduler),
    cancelTask: scheduler.cancelTask.bind(scheduler),
  };
  const { comp } = makeLargeWatcherFixture(2);
  app.project = { activeItem: comp };

  const oldPanel = loadPanel({ scheduler, sharedGlobal, appOverride: app });
  const oldUI = oldPanel.buildUI({});
  const oldTaskId = scheduler.scheduleCalls[0].id;
  const oldReservation = scheduler.scheduleCalls[0].expression;

  const newPanel = loadPanel({ scheduler, sharedGlobal, appOverride: app });
  const newUI = newPanel.buildUI({});
  const newTaskId = scheduler.scheduleCalls[scheduler.scheduleCalls.length - 1].id;

  assert.ok(scheduler.cancelCalls.includes(oldTaskId));
  assert.notEqual(newTaskId, oldTaskId);
  assert.equal(scheduler.pendingCount(), 1);

  const pendingBeforeStaleReservation = scheduler.pendingCount();
  const ticksBeforeStaleReservation = newPanel.GroupControlEffectWatcherGetStats().totals.ticks;
  vm.runInNewContext(oldReservation, newPanel);
  assert.equal(scheduler.pendingCount(), pendingBeforeStaleReservation);
  assert.equal(newPanel.GroupControlEffectWatcherGetStats().totals.ticks, ticksBeforeStaleReservation);

  const ticksBeforeOldTick = newPanel.GroupControlEffectWatcherGetStats().totals.ticks;
  oldPanel.GroupControlEffectWatcherTick();
  assert.equal(scheduler.pendingCount(), 1);
  assert.equal(newPanel.GroupControlEffectWatcherGetStats().totals.ticks, ticksBeforeOldTick);

  oldUI.onClose();
  assert.equal(scheduler.pendingCount(), 1);
  assert.equal(scheduler.cancelCalls.includes(newTaskId), false);

  newUI.onClose();
  assert.equal(scheduler.pendingCount(), 0);
  assert.ok(scheduler.cancelCalls.includes(newTaskId));
});
