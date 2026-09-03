'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const effectSyncPath = path.join(repositoryRoot, 'panel', 'GroupControlEffectSync.jsxinc');

function loadEffectSync() {
  const source = fs.existsSync(effectSyncPath) ? fs.readFileSync(effectSyncPath, 'utf8') : '';
  const moduleObject = { exports: {} };
  const sandbox = {
    console,
    module: moduleObject,
    exports: moduleObject.exports,
  };

  vm.runInNewContext(
    `${source}\nthis.__groupControlEffectSync = typeof GroupControlEffectSync !== 'undefined' ? GroupControlEffectSync : null;`,
    sandbox,
    { filename: effectSyncPath },
  );

  const candidates = [sandbox.__groupControlEffectSync, moduleObject.exports];
  const effectSync = candidates.find((candidate) => (
    candidate && typeof candidate.makeReservedEffectName === 'function'
  ));

  assert.ok(
    effectSync,
    'GroupControlEffectSync implementation is required before effect synchronization can pass',
  );
  return effectSync;
}

class FakeProperty {
  constructor(matchName, name, value, children = [], options = {}) {
    this.matchName = matchName;
    this.name = name || '';
    this.value = value;
    this.items = children;
    this.canSetExpression = options.canSetExpression !== false;
    this._expressionEnabled = false;
    this.expressionEnabledWrites = 0;
    this._expression = '';
    this.expressionWrites = 0;
    this.setValueCalls = 0;
  }

  get expressionEnabled() {
    return this._expressionEnabled;
  }

  set expressionEnabled(value) {
    this.expressionEnabledWrites += 1;
    this._expressionEnabled = value;
  }

  get expression() {
    return this._expression;
  }

  set expression(value) {
    this.expressionWrites += 1;
    this._expression = value;
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

  setValue(value) {
    this.value = value;
    this.setValueCalls += 1;
  }

  clone() {
    return new FakeProperty(
      this.matchName,
      this.name,
      Array.isArray(this.value) ? this.value.slice() : this.value,
      this.items.map((item) => item.clone()),
      { canSetExpression: this.canSetExpression },
    );
  }
}

class FakeEffect {
  constructor(matchName, name, properties = []) {
    this.matchName = matchName;
    this._name = name || matchName;
    this.nameWrites = 0;
    this.items = properties;
    this.effects = null;
  }

  get name() {
    return this._name;
  }

  set name(value) {
    this.nameWrites += 1;
    this._name = value;
  }

  get numProperties() {
    return this.items.length;
  }

  get index() {
    return this.effects ? this.effects.items.indexOf(this) + 1 : 0;
  }

  property(identifier) {
    if (typeof identifier === 'number') {
      return this.items[identifier - 1] || null;
    }

    return this.items.find((item) => item.matchName === identifier || item.name === identifier) || null;
  }

  clone() {
    return new FakeEffect(this.matchName, this.name, this.items.map((item) => item.clone()));
  }
}

class FakeEffects {
  constructor(templates) {
    this.items = [];
    this.templates = templates;
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
    const template = this.templates[matchName];
    if (!template) {
      throw new Error(`No fake Effect template for ${matchName}`);
    }

    const effect = template.clone();
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

class FakeLayer {
  constructor(id, name, templates, options = {}) {
    this.id = id;
    this.name = name;
    this.parent = options.parent || null;
    this.effects = new FakeEffects(templates);
    this.transform = new FakeProperty('ADBE Transform Group', 'Transform', null, [
      new FakeProperty('ADBE Position', 'Position', [10, 20]),
      new FakeProperty('ADBE Scale', 'Scale', [100, 100]),
      new FakeProperty('ADBE Rotation', 'Rotation', 12),
    ]);
  }

  property(matchName) {
    if (matchName === 'ADBE Effect Parade') {
      return this.effects;
    }
    if (matchName === 'ADBE Transform Group') {
      return this.transform;
    }
    return null;
  }
}

function makeEffectTemplates() {
  return {
    NGS_GroupControl: new FakeEffect(
      'NGS_GroupControl',
      'Group Control',
      [new FakeProperty('NGS_GroupControl-0001', 'Layer Count', 2)],
    ),
    'ADBE Gaussian Blur 2': new FakeEffect(
      'ADBE Gaussian Blur 2',
      'Gaussian Blur',
      [new FakeProperty('ADBE Blurriness', 'Blurriness', 25)],
    ),
    'ADBE Tint': new FakeEffect(
      'ADBE Tint',
      'Tint',
      [new FakeProperty(
        'ADBE Tint-0001',
        'Tint Controls',
        null,
        [new FakeProperty('ADBE Tint-Amount', 'Amount', 50)],
      )],
    ),
  };
}

function makeFixture() {
  const templates = makeEffectTemplates();
  const outside = new FakeLayer(900, 'Outside', templates);
  const group = new FakeLayer(100, '[G] Group', templates);
  const root = new FakeLayer(101, 'Root', templates);
  const child = new FakeLayer(102, 'Child', templates, { parent: root });
  const external = new FakeLayer(103, 'External Parent Child', templates, { parent: outside });

  group.effects.addProperty('NGS_GroupControl');
  const blur = group.effects.addProperty('ADBE Gaussian Blur 2');
  blur.property('ADBE Blurriness').value = 35;

  return {
    group,
    root,
    child,
    external,
    outside,
    blur,
  };
}

function ownedEffects(layer, groupId) {
  const prefix = `[GFX:${groupId}:`;
  return layer.effects.items.filter((effect) => effect.name.indexOf(prefix) === 0);
}

function snapshotTransform(layer) {
  return layer.transform.items.map((property) => ({
    matchName: property.matchName,
    value: Array.isArray(property.value) ? property.value.slice() : property.value,
    expressionEnabled: property.expressionEnabled,
    expression: property.expression,
  }));
}

test('reserved Effect names round-trip and leave unreserved child Effects distinguishable', () => {
  const effectSync = loadEffectSync();

  const reservedName = effectSync.makeReservedEffectName(100, 2, 'Gaussian Blur');

  assert.equal(reservedName, '[GFX:100:2] Gaussian Blur');
  assert.deepEqual(effectSync.parseReservedEffectName(reservedName), {
    groupId: 100,
    effectIndex: 2,
    sourceName: 'Gaussian Blur',
  });
  assert.equal(effectSync.parseReservedEffectName('Gaussian Blur'), null);
  assert.equal(effectSync.parseReservedEffectName('[GFX:100:x] Gaussian Blur'), null);
});

test('Effect expressions address nested terminal parameters and escape layer or Effect names', () => {
  const effectSync = loadEffectSync();

  assert.equal(
    effectSync.buildEffectExpressionPath('Group "One"', 'Blur "Two"', ['Controls', 'Amount']),
    'thisComp.layer("Group \\"One\\"").effect("Blur \\"Two\\"")("Controls")("Amount")',
  );
});

test('source Effect enumeration excludes only NGS_GroupControl and preserves the 1-based Effect index', () => {
  const effectSync = loadEffectSync();
  const { group } = makeFixture();

  assert.deepEqual(
    effectSync.getSourceEffects(group).map((sourceEffect) => ({
      index: sourceEffect.index,
      matchName: sourceEffect.matchName,
      name: sourceEffect.name,
    })),
    [{ index: 2, matchName: 'ADBE Gaussian Blur 2', name: 'Gaussian Blur' }],
  );
});

test('structural sync adds ordinary copies to eligible roots and internal children, links values by Expression, and protects local Effects', () => {
  const effectSync = loadEffectSync();
  const { group, root, child, external, blur } = makeFixture();
  const localEffect = root.effects.addProperty('ADBE Gaussian Blur 2');
  const transformBefore = [
    snapshotTransform(root),
    snapshotTransform(child),
    snapshotTransform(external),
  ];

  effectSync.syncGroupEffects(group, [root, child, external]);

  assert.equal(ownedEffects(root, 100).length, 1);
  assert.equal(ownedEffects(child, 100).length, 1);
  assert.equal(ownedEffects(external, 100).length, 0);
  assert.equal(root.effects.items.includes(localEffect), true);

  const rootCopy = ownedEffects(root, 100)[0];
  assert.equal(rootCopy.matchName, 'ADBE Gaussian Blur 2');
  assert.equal(rootCopy.property(1).expressionEnabled, true);
  assert.equal(
    rootCopy.property(1).expression,
    'thisComp.layer("[G] Group").effect("Gaussian Blur")("Blurriness")',
  );

  rootCopy.property(1).setValueCalls = 0;
  blur.property(1).value = 80;
  effectSync.syncGroupEffects(group, [root, child, external]);
  assert.equal(rootCopy.property(1).setValueCalls, 0);
  assert.deepEqual(snapshotTransform(root), transformBefore[0]);
  assert.deepEqual(snapshotTransform(child), transformBefore[1]);
  assert.deepEqual(snapshotTransform(external), transformBefore[2]);
  assert.equal(ownedEffects(root, 100).length, 1);
  assert.equal(ownedEffects(child, 100).length, 1);
});

test('structural diff handles Effect addition, rename, and deletion without deleting child-local Effects', () => {
  const effectSync = loadEffectSync();
  const { group, root, child, blur } = makeFixture();
  const localEffect = root.effects.addProperty('ADBE Gaussian Blur 2');

  effectSync.syncGroupEffects(group, [root, child]);
  const tint = group.effects.addProperty('ADBE Tint');
  effectSync.syncGroupEffects(group, [root, child]);

  assert.equal(ownedEffects(root, 100).length, 2);
  assert.equal(ownedEffects(child, 100).length, 2);

  tint.name = 'Tint Updated';
  effectSync.syncGroupEffects(group, [root, child]);
  assert.equal(
    root.effects.property('[GFX:100:3] Tint Updated').property('Tint Controls').property('Amount').expression,
    'thisComp.layer("[G] Group").effect("Tint Updated")("Tint Controls")("Amount")',
  );

  group.effects.remove(blur);
  effectSync.syncGroupEffects(group, [root, child]);

  assert.equal(ownedEffects(root, 100).length, 1);
  assert.equal(ownedEffects(child, 100).length, 1);
  assert.equal(root.effects.items.includes(localEffect), true);
  assert.equal(root.effects.property('[GFX:100:2] Gaussian Blur'), null);
});

test('repeating an unchanged sync does not write mirrored Effect state again', () => {
  const effectSync = loadEffectSync();
  const { group, root, child } = makeFixture();

  effectSync.syncGroupEffects(group, [root, child]);
  const rootCopy = ownedEffects(root, 100)[0];
  const terminal = rootCopy.property(1);
  const writesAfterFirstSync = {
    name: rootCopy.nameWrites,
    expression: terminal.expressionWrites,
    expressionEnabled: terminal.expressionEnabledWrites,
  };

  effectSync.syncGroupEffects(group, [root, child]);

  assert.deepEqual({
    name: rootCopy.nameWrites,
    expression: terminal.expressionWrites,
    expressionEnabled: terminal.expressionEnabledWrites,
  }, writesAfterFirstSync);
});

test('Ungroup cleanup removes only Group Control-owned copies and preserves every unreserved child Effect', () => {
  const effectSync = loadEffectSync();
  const { root, child } = makeFixture();
  const localRootEffect = root.effects.addProperty('ADBE Gaussian Blur 2');
  const ownedRootEffect = root.effects.addProperty('ADBE Gaussian Blur 2');
  ownedRootEffect.name = '[GFX:100:2] Gaussian Blur';
  const ownedChildEffect = child.effects.addProperty('ADBE Gaussian Blur 2');
  ownedChildEffect.name = '[GFX:100:2] Gaussian Blur';

  effectSync.removeOwnedEffects([root, child], 100);

  assert.equal(root.effects.items.includes(localRootEffect), true);
  assert.equal(ownedEffects(root, 100).length, 0);
  assert.equal(ownedEffects(child, 100).length, 0);
});
