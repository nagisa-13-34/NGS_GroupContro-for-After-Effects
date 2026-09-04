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
    this.metrics = options.metrics || null;
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
    if (this.metrics && this.items.length === 0) {
      this.metrics.terminalVisits += 1;
    }
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
      { canSetExpression: this.canSetExpression, metrics: this.metrics },
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
  constructor(templates, options = {}) {
    this.items = [];
    this.templates = templates;
    this.metrics = options.metrics || null;
    this.invalidateEffectRefs = options.invalidateEffectRefs === true;
  }

  get numProperties() {
    return this.items.length;
  }

  property(identifier) {
    if (this.metrics) {
      this.metrics.effectPropertyAccesses += 1;
    }
    if (typeof identifier === 'number') {
      return this.items[identifier - 1] || null;
    }

    return this.items.find((item) => item.matchName === identifier || item.name === identifier) || null;
  }

  addProperty(matchName) {
    if (this.metrics) {
      this.metrics.addPropertyCalls += 1;
    }
    const template = this.templates[matchName];
    if (!template) {
      throw new Error(`No fake Effect template for ${matchName}`);
    }

    if (this.invalidateEffectRefs) {
      this.items = this.items.map((existing) => {
        const replacement = existing.clone();
        replacement.effects = this;
        return replacement;
      });
    }

    const effect = template.clone();
    effect.effects = this;
    this.items.push(effect);
    return effect;
  }

  remove(effect) {
    if (this.metrics) {
      this.metrics.removePropertyCalls += 1;
    }
    const index = this.items.indexOf(effect);
    if (index >= 0) {
      this.items.splice(index, 1);
      if (this.invalidateEffectRefs) {
        this.items = this.items.map((existing) => {
          const replacement = existing.clone();
          replacement.effects = this;
          return replacement;
        });
      }
    }
  }
}

class FakeLayer {
  constructor(id, name, templates, options = {}) {
    this.id = id;
    this.name = name;
    this.parent = options.parent || null;
    this.comp = null;
    this.effects = new FakeEffects(templates, options);
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

  get index() {
    return this.comp ? this.comp.layersList.indexOf(this) + 1 : 0;
  }
}

class FakeComp {
  constructor(layers, metrics = null) {
    this.layersList = layers;
    this.metrics = metrics;
    for (const layer of layers) {
      layer.comp = this;
    }
  }

  get numLayers() {
    return this.layersList.length;
  }

  layer(index) {
    if (this.metrics) {
      this.metrics.layerAccesses += 1;
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

function makeEffectTemplates(metrics = null) {
  return {
    NGS_GroupControl: new FakeEffect(
      'NGS_GroupControl',
      'Group Control',
      [new FakeProperty('NGS_GroupControl-0001', 'Layer Count', 2, [], { metrics })],
    ),
    'ADBE Gaussian Blur 2': new FakeEffect(
      'ADBE Gaussian Blur 2',
      'Gaussian Blur',
      [new FakeProperty('ADBE Blurriness', 'Blurriness', 25, [], { metrics })],
    ),
    'ADBE Tint': new FakeEffect(
      'ADBE Tint',
      'Tint',
      [new FakeProperty(
        'ADBE Tint-0001',
        'Tint Controls',
        null,
        [new FakeProperty('ADBE Tint-Amount', 'Amount', 50, [], { metrics })],
        { metrics },
      )],
    ),
  };
}

function makeFixture({ metrics = null } = {}) {
  const templates = makeEffectTemplates(metrics);
  const outside = new FakeLayer(900, 'Outside', templates, { metrics });
  const group = new FakeLayer(100, '[G] Group', templates, { metrics });
  const root = new FakeLayer(101, 'Root', templates, { metrics });
  const child = new FakeLayer(102, 'Child', templates, { parent: root, metrics });
  const external = new FakeLayer(103, 'External Parent Child', templates, {
    parent: outside,
    metrics,
  });

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

function makeMetrics() {
  return {
    layerAccesses: 0,
    effectPropertyAccesses: 0,
    addPropertyCalls: 0,
    removePropertyCalls: 0,
    terminalVisits: 0,
  };
}

function makeIncrementalSession(effectSync, groups, overrides = {}) {
  const options = {
    isGroupLayer: (layer) => groups.includes(layer),
    getTargetRange: (group, comp) => ({
      startIndex: group.index + 1,
      endIndex: Math.min(group.index + (group.targetCount || 0), comp.numLayers),
    }),
    maxDiscoveryLayers: 16,
    maxTargetLayers: 2,
    timeBudgetMs: 12,
    now: () => 0,
    ...overrides,
  };

  return effectSync.createIncrementalSession(options);
}

function driveSession(session, comp, projectId, predicate, maxSteps = 160) {
  for (let index = 0; index < maxSteps; index += 1) {
    session.step(comp, { projectId });
    if (predicate()) {
      return true;
    }
  }

  return false;
}

function makeBasicSessionFixture({
  metrics,
  groupId = 100,
  rootId = 101,
  targetCount = 1,
  sourceMatchName = 'ADBE Gaussian Blur 2',
  sourceName = 'Gaussian Blur',
} = {}) {
  const templates = makeEffectTemplates(metrics);
  const group = new FakeLayer(groupId, `[G] ${groupId}`, templates, { metrics });
  const root = new FakeLayer(rootId, `Root ${rootId}`, templates, { metrics });
  group.targetCount = targetCount;
  group.effects.addProperty('NGS_GroupControl');
  const source = group.effects.addProperty(sourceMatchName);
  source.name = sourceName;
  const comp = new FakeComp([group, root], metrics);
  return { comp, group, root, source, templates };
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

function evaluateGeneratedExpression(expression, comp, resolver) {
  const prefix = /^thisComp\.layer\("((?:\\.|[^"])*)"\)\.effect\("((?:\\.|[^"])*)"\)/;
  const prefixMatch = prefix.exec(expression);
  assert.ok(prefixMatch, `Unsupported generated expression: ${expression}`);

  const layerName = JSON.parse(`"${prefixMatch[1]}"`);
  const effectName = JSON.parse(`"${prefixMatch[2]}"`);
  let property = resolver.layer(comp, layerName);
  property = resolver.effect(property, effectName);

  let suffix = expression.slice(prefixMatch[0].length);
  const segments = [];
  const segmentPattern = /^\((\d+|"(?:\\.|[^"])*")\)/;
  while (suffix.length > 0) {
    const segmentMatch = segmentPattern.exec(suffix);
    assert.ok(segmentMatch, `Unsupported generated property path: ${suffix}`);
    segments.push(segmentMatch[1][0] === '"'
      ? JSON.parse(segmentMatch[1])
      : Number(segmentMatch[1]));
    suffix = suffix.slice(segmentMatch[0].length);
  }

  for (const identifier of segments) {
    property = resolver.property(property, identifier);
  }

  return property.value;
}

function makeDeepGlowExpressionResolverFixture() {
  const templates = makeEffectTemplates();
  const properties = Array.from({ length: 84 }, (_, index) => (
    new FakeProperty(
      `PEDG2-${String(index + 1).padStart(4, '0')}`,
      `Parameter ${index + 1}`,
      index + 1,
    )
  ));
  properties[82].name = 'Color Inner';
  properties[83].name = 'Color';
  properties[83].matchName = 'PEDG2-0042';
  templates.PEDG2 = new FakeEffect('PEDG2', 'Deep Glow 2', properties);

  const group = new FakeLayer(57, '[G] Group', templates);
  const root = new FakeLayer(58, 'Root', templates);
  group.effects.addProperty('NGS_GroupControl');
  const source = group.effects.addProperty('PEDG2');
  const duplicate = source.property(83);
  const colorInner = source.property(84);
  duplicate.name = 'Color Inner';
  duplicate.expressionName = 'Color';
  duplicate.value = [0, 0, 0, 1];
  colorInner.name = 'Color Inner';
  colorInner.expressionName = 'Color';
  colorInner.value = [1, 0, 0, 1];
  const comp = new FakeComp([group, root]);
  const resolver = {
    layer(currentComp, name) {
      const layer = currentComp.layersList.find((candidate) => candidate.name === name);
      if (!layer) {
        throw new Error(`Expression layer not found: ${name}`);
      }
      return layer;
    },
    effect(layer, name) {
      const effect = layer.effects.items.find((candidate) => candidate.name === name);
      if (!effect) {
        throw new Error(`Expression Effect not found: ${name}`);
      }
      return effect;
    },
    property(container, identifier) {
      if (typeof identifier === 'number') {
        return container.items[identifier - 1] || (() => {
          throw new Error(`Expression Property index not found: ${identifier}`);
        })();
      }

      const propertyByExpressionName = container.items.find((candidate) => (
        candidate.expressionName === identifier
      ));
      if (!propertyByExpressionName) {
        throw new Error(`Expression Property name not found: ${identifier}`);
      }
      return propertyByExpressionName;
    },
  };

  return { comp, group, root, source, resolver };
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

test('Effect expressions preserve string paths and render numeric property indexes', () => {
  const effectSync = loadEffectSync();

  assert.equal(
    effectSync.buildEffectExpressionPath('Group "One"', 'Blur "Two"', ['Controls', 'Amount']),
    'thisComp.layer("Group \\"One\\"").effect("Blur \\"Two\\"")("Controls")("Amount")',
  );
  assert.equal(
    effectSync.buildEffectExpressionPath('Group', 'Blur', ['Controls', 84, 'Amount', 2]),
    'thisComp.layer("Group").effect("Blur")("Controls")(84)("Amount")(2)',
  );
});

test('sync resolves renamed duplicate display names through the generated numeric source path', () => {
  const effectSync = loadEffectSync();
  const { comp, group, root, source, resolver } = makeDeepGlowExpressionResolverFixture();
  const oldExpression = effectSync.buildEffectExpressionPath(
    group.name,
    source.name,
    ['Color Inner'],
  );

  assert.throws(
    () => evaluateGeneratedExpression(oldExpression, comp, resolver),
    /Expression Property name not found: Color Inner/,
  );

  effectSync.syncGroupEffects(group, [root]);
  const copy = ownedEffects(root, group.id)[0];
  const terminal = copy.property(84);
  const generatedValue = evaluateGeneratedExpression(terminal.expression, comp, resolver);

  assert.deepEqual(generatedValue, [1, 0, 0, 1]);
  assert.equal(
    terminal.expression,
    'thisComp.layer("[G] Group").effect("Deep Glow 2")(84)',
  );

  source.property(84).name = 'Renamed Color Inner';
  terminal.expression = oldExpression;
  const additionsBeforeResync = root.effects.items.length;
  effectSync.syncGroupEffects(group, [root]);

  assert.equal(ownedEffects(root, group.id)[0], copy);
  assert.equal(root.effects.items.length, additionsBeforeResync);
  assert.deepEqual(evaluateGeneratedExpression(terminal.expression, comp, resolver), [1, 0, 0, 1]);
  assert.equal(
    terminal.expression,
    'thisComp.layer("[G] Group").effect("Deep Glow 2")(84)',
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

test('structural sync adds ordinary copies only to the current target roots and internal children', () => {
  const effectSync = loadEffectSync();
  const { group, root, child, external, outside, blur } = makeFixture();
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
  assert.equal(ownedEffects(outside, 100).length, 0);
  assert.equal(root.effects.items.includes(localEffect), true);

  const rootCopy = ownedEffects(root, 100)[0];
  assert.equal(rootCopy.matchName, 'ADBE Gaussian Blur 2');
  assert.equal(rootCopy.property(1).expressionEnabled, true);
  assert.equal(
    rootCopy.property(1).expression,
    'thisComp.layer("[G] Group").effect("Gaussian Blur")(1)',
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
    'thisComp.layer("[G] Group").effect("Tint Updated")(1)(1)',
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

  const firstSync = effectSync.syncGroupEffects(group, [root, child]);
  assert.equal(firstSync.createdCount, 2);
  const rootCopy = ownedEffects(root, 100)[0];
  const terminal = rootCopy.property(1);
  const writesAfterFirstSync = {
    name: rootCopy.nameWrites,
    expression: terminal.expressionWrites,
    expressionEnabled: terminal.expressionEnabledWrites,
  };

  const secondSync = effectSync.syncGroupEffects(group, [root, child]);

  assert.equal(secondSync.createdCount, 0);
  assert.equal(secondSync.removedCount, 0);
  assert.equal(root.effects.items.includes(rootCopy), true);

  assert.deepEqual({
    name: rootCopy.nameWrites,
    expression: terminal.expressionWrites,
    expressionEnabled: terminal.expressionEnabledWrites,
  }, writesAfterFirstSync);
});

test('sync removes duplicate owned copies while reusing one current copy', () => {
  const effectSync = loadEffectSync();
  const { group, root } = makeFixture();

  effectSync.syncGroupEffects(group, [root]);
  const firstCopy = ownedEffects(root, 100)[0];
  const duplicate = root.effects.addProperty('ADBE Gaussian Blur 2');
  duplicate.name = '[GFX:100:2] Gaussian Blur';

  const result = effectSync.syncGroupEffects(group, [root]);

  assert.equal(result.createdCount, 0);
  assert.equal(result.removedCount, 1);
  assert.equal(ownedEffects(root, 100).length, 1);
  assert.equal(root.effects.items.includes(firstCopy), true);
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

test('incremental session enforces global work caps and does not rescan stable terminal trees', () => {
  const effectSync = loadEffectSync();
  const metrics = makeMetrics();
  const { group, root, child } = makeFixture({ metrics });
  const comp = new FakeComp([group, root, child], metrics);
  group.targetCount = 2;

  const session = effectSync.createIncrementalSession({
    isGroupLayer: (layer) => layer === group,
    getTargetRange: (currentGroup, currentComp) => ({
      startIndex: currentGroup.index + 1,
      endIndex: Math.min(currentGroup.index + currentGroup.targetCount, currentComp.numLayers),
    }),
    maxDiscoveryLayers: 16,
    maxTargetLayers: 2,
    timeBudgetMs: 12,
    now: () => 0,
  });

  const stats = [];
  for (let index = 0; index < 8; index += 1) {
    session.step(comp, { projectId: 'project-a' });
    stats.push(session.getStats().lastTick);
  }

  assert.ok(stats.every((tick) => tick.discoveryLayers <= 16));
  assert.ok(stats.every((tick) => tick.targetLayers <= 2));
  assert.equal(ownedEffects(root, 100).length, 1);
  assert.equal(ownedEffects(child, 100).length, 1);

  const terminalVisitsAfterFirstSync = metrics.terminalVisits;
  for (let index = 0; index < 4; index += 1) {
    session.step(comp, { projectId: 'project-a' });
    const tick = session.getStats().lastTick;
    assert.ok(tick.discoveryLayers <= 16);
    assert.ok(tick.targetLayers <= 2);
  }

  assert.equal(metrics.terminalVisits, terminalVisitsAfterFirstSync);
  assert.ok(metrics.layerAccesses > 0);
});

test('incremental audit repairs a disabled Expression without recreating a stable copy', () => {
  const effectSync = loadEffectSync();
  const metrics = makeMetrics();
  const { comp, group, root } = makeBasicSessionFixture({ metrics, targetCount: 1 });
  let currentTime = 0;
  const session = makeIncrementalSession(effectSync, [group], {
    auditIntervalMs: 100,
    discoveryIntervalMs: 100000,
    now: () => currentTime,
  });

  const synchronized = driveSession(
    session,
    comp,
    'project-a',
    () => ownedEffects(root, group.id).length === 1,
  );
  assert.equal(synchronized, true);

  const caughtUp = driveSession(
    session,
    comp,
    'project-a',
    () => session.getStats().pending === false,
  );
  assert.equal(caughtUp, true);

  const copy = ownedEffects(root, group.id)[0];
  const terminal = copy.property(1);
  const addsBeforeAudit = metrics.addPropertyCalls;
  const removesBeforeAudit = metrics.removePropertyCalls;
  terminal.expressionEnabled = false;
  currentTime = 101;

  const repaired = driveSession(
    session,
    comp,
    'project-a',
    () => terminal.expressionEnabled === true,
    8,
  );

  assert.equal(repaired, true);
  assert.equal(metrics.addPropertyCalls, addsBeforeAudit);
  assert.equal(metrics.removePropertyCalls, removesBeforeAudit);
  assert.equal(ownedEffects(root, group.id).length, 1);
  assert.equal(session.getStats().pending, false);
});

test('incremental session converges when a Group has no target range', () => {
  const effectSync = loadEffectSync();
  const { comp, group } = makeBasicSessionFixture({ targetCount: 0 });
  const session = makeIncrementalSession(effectSync, [group]);

  for (let index = 0; index < 8; index += 1) {
    session.step(comp, { projectId: 'project-a' });
  }

  assert.equal(session.getStats().pending, false);
});

test('incremental rediscovery retains a live Group moved before its scan cursor', () => {
  const effectSync = loadEffectSync();
  const templates = makeEffectTemplates();
  const group = new FakeLayer(100, '[G] Moving Group', templates);
  const root = new FakeLayer(101, 'Moving Root', templates);
  const fillers = Array.from({ length: 19 }, (_, index) => (
    new FakeLayer(500 + index, `Filler ${index}`, templates)
  ));
  const comp = new FakeComp([...fillers, group, root]);
  group.targetCount = 1;
  group.effects.addProperty('NGS_GroupControl');
  group.effects.addProperty('ADBE Gaussian Blur 2');

  let currentTime = 0;
  const session = makeIncrementalSession(effectSync, [group], {
    maxDiscoveryLayers: 4,
    discoveryIntervalMs: 10,
    now: () => currentTime,
  });
  const synchronized = driveSession(
    session,
    comp,
    'project-a',
    () => ownedEffects(root, group.id).length === 1,
  );
  assert.equal(synchronized, true);

  // Finish the initial discovery so the next bounded scan is a new
  // generation with the Group still at its old, late index.
  session.step(comp, { projectId: 'project-a' });
  currentTime = 20;

  for (let index = 0; index < 4; index += 1) {
    session.step(comp, { projectId: 'project-a' });
  }
  comp.layersList.splice(comp.layersList.indexOf(group), 1);
  comp.layersList.splice(0, 0, group);
  comp.layersList.splice(comp.layersList.indexOf(root), 1);
  comp.layersList.splice(1, 0, root);

  for (let index = 0; index < 70; index += 1) {
    session.step(comp, { projectId: 'project-a' });
  }

  assert.equal(ownedEffects(root, group.id).length, 1);
});

test('incremental session caps real Layer access and addProperty work across many groups', () => {
  const effectSync = loadEffectSync();
  const metrics = makeMetrics();
  const templates = makeEffectTemplates(metrics);
  const firstGroup = new FakeLayer(100, '[G] First', templates, { metrics });
  const firstTargets = Array.from({ length: 24 }, (_, index) => (
    new FakeLayer(101 + index, `First ${index}`, templates, { metrics })
  ));
  const secondGroup = new FakeLayer(200, '[G] Second', templates, { metrics });
  const secondTargets = Array.from({ length: 24 }, (_, index) => (
    new FakeLayer(201 + index, `Second ${index}`, templates, { metrics })
  ));
  const filler = Array.from({ length: 100 }, (_, index) => (
    new FakeLayer(500 + index, `Filler ${index}`, templates, { metrics })
  ));
  const layers = [firstGroup, ...firstTargets, ...filler, secondGroup, ...secondTargets];
  const comp = new FakeComp(layers, metrics);

  firstGroup.targetCount = firstTargets.length;
  secondGroup.targetCount = secondTargets.length;
  firstGroup.effects.addProperty('NGS_GroupControl');
  firstGroup.effects.addProperty('ADBE Gaussian Blur 2');
  secondGroup.effects.addProperty('NGS_GroupControl');
  secondGroup.effects.addProperty('ADBE Tint');

  const session = effectSync.createIncrementalSession({
    isGroupLayer: (layer) => layer === firstGroup || layer === secondGroup,
    getTargetRange: (group, currentComp) => ({
      startIndex: group.index + 1,
      endIndex: Math.min(group.index + group.targetCount, currentComp.numLayers),
    }),
    maxDiscoveryLayers: 16,
    maxTargetLayers: 2,
    timeBudgetMs: 12,
    now: () => 0,
  });

  let firstSyncComplete = false;
  for (let tickIndex = 0; tickIndex < 220; tickIndex += 1) {
    const layerAccessesBefore = metrics.layerAccesses;
    const addsBefore = metrics.addPropertyCalls;
    session.step(comp, { projectId: 'project-a' });
    const tick = session.getStats().lastTick;
    const layerAccessDelta = metrics.layerAccesses - layerAccessesBefore;
    const addPropertyDelta = metrics.addPropertyCalls - addsBefore;

    assert.ok(layerAccessDelta <= 20, `Layer access budget exceeded: ${layerAccessDelta}`);
    assert.ok(addPropertyDelta <= 2, `addProperty budget exceeded: ${addPropertyDelta}`);
    assert.ok(tick.discoveryLayers <= 16);
    assert.ok(tick.targetLayers <= 2);

    if (
      firstTargets.every((layer) => ownedEffects(layer, 100).length === 1)
      && secondTargets.every((layer) => ownedEffects(layer, 200).length === 1)
    ) {
      firstSyncComplete = true;
      break;
    }
  }

  assert.equal(firstSyncComplete, true);
  assert.equal(
    firstTargets.filter((layer) => ownedEffects(layer, 100).length === 1).length,
    firstTargets.length,
  );
  assert.equal(
    secondTargets.filter((layer) => ownedEffects(layer, 200).length === 1).length,
    secondTargets.length,
  );
  assert.ok(metrics.layerAccesses < layers.length * 4);
});

test('sync reacquires indexed Effect entries after addProperty invalidates prior references', () => {
  const effectSync = loadEffectSync();
  const templates = makeEffectTemplates();
  const group = new FakeLayer(100, '[G] Group', templates, { invalidateEffectRefs: true });
  const root = new FakeLayer(101, 'Root', templates, { invalidateEffectRefs: true });
  const comp = new FakeComp([group, root]);

  group.effects.addProperty('NGS_GroupControl');
  group.effects.addProperty('ADBE Gaussian Blur 2');
  group.effects.addProperty('ADBE Tint');
  effectSync.syncGroupEffects(group, [root]);

  assert.equal(ownedEffects(root, 100).length, 2);
  assert.notEqual(root.effects.property('[GFX:100:2] Gaussian Blur'), null);
  assert.notEqual(root.effects.property('[GFX:100:3] Tint'), null);
  assert.equal(root.effects.items.some((effect) => effect.name === 'Gaussian Blur'), false);
});
