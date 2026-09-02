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

function loadPanel() {
  const panel = fs.readFileSync(path.join(rootDir, 'panel', 'GroupControl.jsx'), 'utf8')
    .replace(/#include\s+["']([^"']+)["']/g, (includeLine, includeName) => {
      const includePath = path.join(rootDir, 'panel', includeName);
      return fs.existsSync(includePath) ? fs.readFileSync(includePath, 'utf8') : '';
    })
    .replace(/var GroupControlPanel = buildUI\(this\);\s*$/, '');
  const sandbox = {
    console,
    MarkerValue: FakeMarkerValue,
    CompItem: FakeCompItem,
    Panel: function Panel() {},
    Window: function Window() {},
    app: {
      project: { activeItem: null },
      scheduleTask() {
        return 1;
      },
      cancelTask() {},
    },
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
  const localEffect = new FakeEffect('ADBE Gaussian Blur 2', 'Gaussian Blur');
  const ownedEffect = new FakeEffect('ADBE Gaussian Blur 2', '[GFX:100:2] Gaussian Blur');
  root.effects.items.push(localEffect, ownedEffect);
  const { comp, group } = makeGroupFixture({ count: 1, extraLayers: [root] });
  group.marker.setValueAtTime(0, new FakeMarkerValue(
    'NGS_GROUP_CONTROL_V1\ngroupId=100\nrecord=101,0',
  ));
  root.parent = group;

  const result = panel.ungroupCore(group, comp);

  assert.equal(result.ok, true);
  assert.equal(effectNamed(root, 'Gaussian Blur'), localEffect);
  assert.equal(effectNamed(root, '[GFX:100:2] Gaussian Blur'), null);
});
