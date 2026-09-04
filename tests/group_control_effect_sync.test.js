'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const effectSyncPath = path.join(repositoryRoot, 'panel', 'GroupControlEffectSync.jsxinc');

function loadEffectSync(extraSandbox = {}) {
  const source = fs.existsSync(effectSyncPath) ? fs.readFileSync(effectSyncPath, 'utf8') : '';
  const moduleObject = { exports: {} };
  const sandbox = {
    ...extraSandbox,
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
    this.propertyValueType = options.propertyValueType;
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
    if (this.metrics && typeof this.metrics.onPropertyWrite === 'function') {
      this.metrics.onPropertyWrite();
    }
    if (this.metrics) {
      this.metrics.propertyWrites += 1;
    }
    this._expressionEnabled = value;
  }

  get expression() {
    return this._expression;
  }

  set expression(value) {
    this.expressionWrites += 1;
    if (this.metrics && typeof this.metrics.onPropertyWrite === 'function') {
      this.metrics.onPropertyWrite();
    }
    if (this.metrics) {
      this.metrics.propertyWrites += 1;
    }
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
    if (this.metrics && typeof this.metrics.onPropertyWrite === 'function') {
      this.metrics.onPropertyWrite();
    }
    if (this.metrics) {
      this.metrics.propertyWrites += 1;
    }
  }

  clone() {
    const copy = new FakeProperty(
      this.matchName,
      this.name,
      Array.isArray(this.value) ? this.value.slice() : this.value,
      this.items.map((item) => item.clone()),
      {
        canSetExpression: this.canSetExpression,
        propertyValueType: this.propertyValueType,
        metrics: this.metrics,
      },
    );
    copy._expressionEnabled = this._expressionEnabled;
    copy.expressionEnabledWrites = this.expressionEnabledWrites;
    copy._expression = this._expression;
    copy.expressionWrites = this.expressionWrites;
    copy.setValueCalls = this.setValueCalls;
    return copy;
  }
}

class HostValueFailureProperty extends FakeProperty {
  constructor(matchName, name, propertyValueType, options = {}) {
    super(matchName, name, undefined, [], {
      ...options,
      propertyValueType,
    });
    this.valueReads = 0;
    Object.defineProperty(this, 'value', {
      configurable: true,
      get: () => {
        this.valueReads += 1;
        throw new Error(`value getter must not run for ${propertyValueType}`);
      },
      set: () => {
        throw new Error(`value setter must not run for ${propertyValueType}`);
      },
    });
  }

  clone() {
    return new HostValueFailureProperty(
      this.matchName,
      this.name,
      this.propertyValueType,
      {
        canSetExpression: this.canSetExpression,
        metrics: this.metrics,
      },
    );
  }
}

class CapabilityFailureProperty extends FakeProperty {
  constructor(matchName, name, value, options = {}) {
    super(matchName, name, value, [], options);
    this.capabilityReads = 0;
    Object.defineProperty(this, 'canSetExpression', {
      configurable: true,
      get: () => {
        this.capabilityReads += 1;
        throw new Error('canSetExpression getter unavailable');
      },
      set: () => {
        throw new Error('canSetExpression setter unavailable');
      },
    });
  }

  clone() {
    return new CapabilityFailureProperty(
      this.matchName,
      this.name,
      this.value,
      { propertyValueType: this.propertyValueType, metrics: this.metrics },
    );
  }
}

class MissingCapabilityProperty extends FakeProperty {
  constructor(matchName, name, value, options = {}) {
    super(matchName, name, value, [], options);
    delete this.canSetExpression;
  }

  clone() {
    return new MissingCapabilityProperty(
      this.matchName,
      this.name,
      this.value,
      { propertyValueType: this.propertyValueType, metrics: this.metrics },
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

function makeUnsupportedValueFixture() {
  const sourceTemplates = makeEffectTemplates();
  const targetTemplates = makeEffectTemplates();
  const sourceProperties = [
    new HostValueFailureProperty('NGS_NoValue-0001', 'No Value', 'NO_VALUE'),
    new HostValueFailureProperty('NGS_CustomValue-0001', 'Custom Value', 'CUSTOM_VALUE'),
  ];
  const targetProperties = [
    new FakeProperty('NGS_NoValue-0001', 'No Value', null, [], {
      canSetExpression: false,
      propertyValueType: 'NO_VALUE',
    }),
    new FakeProperty('NGS_CustomValue-0001', 'Custom Value', null, [], {
      canSetExpression: false,
      propertyValueType: 'CUSTOM_VALUE',
    }),
  ];

  sourceTemplates.Unsupported = new FakeEffect('Unsupported', 'Unsupported', sourceProperties);
  targetTemplates.Unsupported = new FakeEffect('Unsupported', 'Unsupported', targetProperties);

  const group = new FakeLayer(100, '[G] Unsupported', sourceTemplates);
  const root = new FakeLayer(101, 'Unsupported Root', targetTemplates);
  group.effects.addProperty('NGS_GroupControl');
  const source = group.effects.addProperty('Unsupported');
  const comp = new FakeComp([group, root]);
  return { comp, group, root, source };
}

function makeCapabilityFailureFixture() {
  const sourceTemplates = makeEffectTemplates();
  const targetTemplates = makeEffectTemplates();
  sourceTemplates.CapabilityFailure = new FakeEffect(
    'CapabilityFailure',
    'Capability Failure',
    [new FakeProperty('CapabilityFailure-0001', 'Value', 42)],
  );
  targetTemplates.CapabilityFailure = new FakeEffect(
    'CapabilityFailure',
    'Capability Failure',
    [new CapabilityFailureProperty('CapabilityFailure-0001', 'Value', 0)],
  );

  const group = new FakeLayer(200, '[G] Capability Failure', sourceTemplates);
  const root = new FakeLayer(201, 'Capability Root', targetTemplates);
  group.effects.addProperty('NGS_GroupControl');
  group.effects.addProperty('CapabilityFailure');
  const comp = new FakeComp([group, root]);
  return { comp, group, root };
}

function makeMissingCapabilityFixture() {
  const sourceTemplates = makeEffectTemplates();
  const targetTemplates = makeEffectTemplates();
  sourceTemplates.MissingCapability = new FakeEffect(
    'MissingCapability',
    'Missing Capability',
    [new FakeProperty('MissingCapability-0001', 'Value', 42)],
  );
  targetTemplates.MissingCapability = new FakeEffect(
    'MissingCapability',
    'Missing Capability',
    [new MissingCapabilityProperty('MissingCapability-0001', 'Value', 0)],
  );

  const group = new FakeLayer(210, '[G] Missing Capability', sourceTemplates);
  const root = new FakeLayer(211, 'Missing Capability Root', targetTemplates);
  group.effects.addProperty('NGS_GroupControl');
  group.effects.addProperty('MissingCapability');
  const comp = new FakeComp([group, root]);
  return { comp, group, root };
}

function makeMetrics() {
  return {
    layerAccesses: 0,
    effectPropertyAccesses: 0,
    addPropertyCalls: 0,
    removePropertyCalls: 0,
    terminalVisits: 0,
    propertyWrites: 0,
    onPropertyWrite: null,
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

function makeLargeIncrementalFixture({
  metrics,
  effectCount = 3,
  propertiesPerEffect = 40,
  invalidateEffectRefs = false,
} = {}) {
  const templates = makeEffectTemplates(metrics);
  const sourceEffects = [];
  for (let effectIndex = 0; effectIndex < effectCount; effectIndex += 1) {
    const matchName = `NGS_Large_${effectIndex + 1}`;
    const properties = Array.from({ length: propertiesPerEffect }, (_, propertyIndex) => (
      new FakeProperty(
        `${matchName}-${String(propertyIndex + 1).padStart(4, '0')}`,
        `Parameter ${propertyIndex + 1}`,
        propertyIndex + 1,
        [],
        { metrics },
      )
    ));
    templates[matchName] = new FakeEffect(matchName, `Large ${effectIndex + 1}`, properties);
    sourceEffects.push(matchName);
  }

  const group = new FakeLayer(300, '[G] Large', templates, {
    metrics,
    invalidateEffectRefs,
  });
  const root = new FakeLayer(301, 'Large Root', templates, {
    metrics,
    invalidateEffectRefs,
  });
  group.targetCount = 1;
  group.effects.addProperty('NGS_GroupControl');
  for (const matchName of sourceEffects) {
    group.effects.addProperty(matchName);
  }
  const comp = new FakeComp([group, root], metrics);
  return { comp, group, root, sourceEffects, templates };
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

test('sync does not read NO_VALUE or CUSTOM_VALUE source values during static initialization', () => {
  const effectSync = loadEffectSync();
  const { group, root, source } = makeUnsupportedValueFixture();

  effectSync.syncGroupEffects(group, [root]);

  const copy = ownedEffects(root, group.id)[0];
  assert.equal(source.property(1).valueReads, 0);
  assert.equal(source.property(2).valueReads, 0);
  assert.equal(copy.property(1).setValueCalls, 0);
  assert.equal(copy.property(2).setValueCalls, 0);
});

test('sync recognizes numeric NO_VALUE enum values before reading source values', () => {
  const effectSync = loadEffectSync({ PropertyValueType: { NO_VALUE: 41, CUSTOM_VALUE: 43 } });
  const sourceTemplates = makeEffectTemplates();
  const targetTemplates = makeEffectTemplates();
  const sourceProperty = new HostValueFailureProperty('EnumNoValue-0001', 'No Value', 41);
  const targetProperty = new FakeProperty('EnumNoValue-0001', 'No Value', null, [], {
    canSetExpression: false,
    propertyValueType: 41,
  });
  sourceTemplates.EnumUnsupported = new FakeEffect('EnumUnsupported', 'Enum Unsupported', [sourceProperty]);
  targetTemplates.EnumUnsupported = new FakeEffect('EnumUnsupported', 'Enum Unsupported', [targetProperty]);
  const group = new FakeLayer(400, '[G] Enum', sourceTemplates);
  const root = new FakeLayer(401, 'Enum Root', targetTemplates);
  group.effects.addProperty('NGS_GroupControl');
  const source = group.effects.addProperty('EnumUnsupported');
  const comp = new FakeComp([group, root]);

  effectSync.syncGroupEffects(group, [root]);

  assert.equal(source.property(1).valueReads, 0);
  assert.equal(ownedEffects(root, group.id)[0].property(1).setValueCalls, 0);
  assert.equal(comp.numLayers, 2);
});

test('sync skips a property when canSetExpression capability cannot be read', () => {
  const effectSync = loadEffectSync();
  const { group, root } = makeCapabilityFailureFixture();

  effectSync.syncGroupEffects(group, [root]);

  const property = ownedEffects(root, group.id)[0].property(1);
  assert.equal(property.capabilityReads, 1);
  assert.equal(property.expressionWrites, 0);
  assert.equal(property.expressionEnabledWrites, 0);
  assert.equal(property.setValueCalls, 0);
});

test('sync skips a property when canSetExpression capability is unavailable', () => {
  const effectSync = loadEffectSync();
  const { group, root } = makeMissingCapabilityFixture();

  effectSync.syncGroupEffects(group, [root]);

  const property = ownedEffects(root, group.id)[0].property(1);
  assert.equal(property.expressionWrites, 0);
  assert.equal(property.expressionEnabledWrites, 0);
  assert.equal(property.setValueCalls, 0);
});

test('incremental sync skips generic value types without reading their source values', () => {
  const effectSync = loadEffectSync();
  const { comp, group, root, source } = makeUnsupportedValueFixture();
  group.targetCount = 1;
  const session = makeIncrementalSession(effectSync, [group], {
    maxTargetLayers: 1,
    maxPropertyOperations: 8,
    maxEffectAdds: 1,
    now: () => 0,
  });

  const converged = driveSession(
    session,
    comp,
    'unsupported-project',
    () => session.getStats().pending === false,
    120,
  );

  assert.equal(converged, true);
  assert.equal(source.property(1).valueReads, 0);
  assert.equal(source.property(2).valueReads, 0);
  const copy = ownedEffects(root, group.id)[0];
  assert.equal(copy.property(1).setValueCalls, 0);
  assert.equal(copy.property(2).setValueCalls, 0);
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
    const writesBefore = metrics.propertyWrites;
    session.step(comp, { projectId: 'project-a' });
    const tick = session.getStats().lastTick;
    const layerAccessDelta = metrics.layerAccesses - layerAccessesBefore;
    const addPropertyDelta = metrics.addPropertyCalls - addsBefore;
    const propertyWriteDelta = metrics.propertyWrites - writesBefore;

    assert.ok(layerAccessDelta <= 20, `Layer access budget exceeded: ${layerAccessDelta}`);
    assert.ok(addPropertyDelta <= 2, `addProperty budget exceeded: ${addPropertyDelta}`);
    assert.ok(propertyWriteDelta <= 8, `Property write budget exceeded: ${propertyWriteDelta}`);
    assert.ok(tick.discoveryLayers <= 16);
    assert.ok(tick.targetLayers <= 2);
    assert.ok(tick.propertyOperations <= 8);
    assert.ok(tick.effectAddAttempts <= 1);

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

test('incremental session bounds property work and Effect additions for one large target', () => {
  const effectSync = loadEffectSync();
  const metrics = makeMetrics();
  const { comp, group, root, sourceEffects } = makeLargeIncrementalFixture({
    metrics,
    effectCount: 3,
    propertiesPerEffect: 40,
  });
  metrics.addPropertyCalls = 0;
  metrics.propertyWrites = 0;
  const session = makeIncrementalSession(effectSync, [group], {
    maxTargetLayers: 1,
    maxPropertyOperations: 8,
    maxEffectAdds: 1,
    now: () => 0,
  });

  let converged = false;
  for (let stepIndex = 0; stepIndex < 400; stepIndex += 1) {
    const addsBefore = metrics.addPropertyCalls;
    const writesBefore = metrics.propertyWrites;
    const tick = session.step(comp, { projectId: 'large-project' });
    const addDelta = metrics.addPropertyCalls - addsBefore;
    const writeDelta = metrics.propertyWrites - writesBefore;

    assert.ok(addDelta <= 1, `Effect additions exceeded step budget: ${addDelta}`);
    assert.ok(writeDelta <= 8, `Property writes exceeded step budget: ${writeDelta}`);
    assert.ok(tick.effectAddAttempts <= 1);
    assert.ok(tick.propertyOperations <= 8);

    if (
      ownedEffects(root, group.id).length === sourceEffects.length
      && ownedEffects(root, group.id).every((effect) => effect.property(1).expressionEnabled)
      && session.getStats().pending === false
    ) {
      converged = true;
      break;
    }
  }

  assert.equal(converged, true);
});

test('incremental session yields after a single host write exceeds its time budget', () => {
  const effectSync = loadEffectSync();
  const metrics = makeMetrics();
  let currentTime = 0;
  metrics.onPropertyWrite = () => {
    currentTime += 20;
  };
  const { comp, group, root } = makeBasicSessionFixture({ metrics, targetCount: 1 });
  metrics.addPropertyCalls = 0;
  metrics.propertyWrites = 0;
  const session = makeIncrementalSession(effectSync, [group], {
    maxTargetLayers: 1,
    maxPropertyOperations: 8,
    maxEffectAdds: 1,
    timeBudgetMs: 12,
    now: () => currentTime,
  });

  let converged = false;
  for (let stepIndex = 0; stepIndex < 80; stepIndex += 1) {
    const writesBefore = metrics.propertyWrites;
    session.step(comp, { projectId: 'slow-project' });
    const writeDelta = metrics.propertyWrites - writesBefore;
    assert.ok(writeDelta <= 1, `A slow host write was followed by another write: ${writeDelta}`);

    const copy = ownedEffects(root, group.id)[0];
    if (copy && copy.property(1).expressionEnabled && session.getStats().pending === false) {
      converged = true;
      break;
    }
  }

  assert.equal(converged, true);
});

test('incremental session cleans up an in-flight Effect when its target range disappears', () => {
  const effectSync = loadEffectSync();
  const metrics = makeMetrics();
  let currentTime = 0;
  const fixture = makeBasicSessionFixture({ metrics, targetCount: 1 });
  const originalAddProperty = fixture.root.effects.addProperty.bind(fixture.root.effects);
  fixture.root.effects.addProperty = (matchName) => {
    const effect = originalAddProperty(matchName);
    currentTime += 13;
    return effect;
  };
  const session = makeIncrementalSession(effectSync, [fixture.group], {
    timeBudgetMs: 12,
    now: () => currentTime,
  });

  session.step(fixture.comp, { projectId: 'orphan-project' });
  fixture.group.targetCount = 0;

  for (let index = 0; index < 30; index += 1) {
    session.step(fixture.comp, { projectId: 'orphan-project' });
  }

  assert.equal(ownedEffects(fixture.root, fixture.group.id).length, 0);
  assert.equal(fixture.root.effects.items.length, 0);
  assert.equal(session.getStats().pending, false);
});

test('incremental property work advances with a one-operation budget', () => {
  const effectSync = loadEffectSync();
  const fixture = makeBasicSessionFixture();
  const session = makeIncrementalSession(effectSync, [fixture.group], {
    maxPropertyOperations: 1,
  });

  for (let index = 0; index < 30; index += 1) {
    session.step(fixture.comp, { projectId: 'one-property-operation' });
  }

  const copy = ownedEffects(fixture.root, fixture.group.id)[0];
  assert.ok(copy);
  assert.equal(
    copy.property(1).expression,
    'thisComp.layer("[G] 100").effect("Gaussian Blur")(1)',
  );
  assert.equal(copy.property(1).expressionEnabled, true);
  assert.equal(session.getStats().pending, false);
});

test('incremental cleanup preserves the current owned Effect while removing obsolete copies', () => {
  const effectSync = loadEffectSync();
  const fixture = makeBasicSessionFixture();
  const obsolete = fixture.root.effects.addProperty('ADBE Gaussian Blur 2');
  obsolete.name = effectSync.makeReservedEffectName(100, 99, 'obsolete');
  const current = fixture.root.effects.addProperty('ADBE Gaussian Blur 2');
  current.name = effectSync.makeReservedEffectName(100, 2, 'Gaussian Blur');
  const session = makeIncrementalSession(effectSync, [fixture.group]);

  for (let index = 0; index < 15; index += 1) {
    session.step(fixture.comp, { projectId: 'cleanup-cursor' });
  }

  assert.equal(fixture.root.effects.items.includes(obsolete), false);
  assert.equal(fixture.root.effects.items.includes(current), true);
  assert.equal(ownedEffects(fixture.root, fixture.group.id).length, 1);
  assert.equal(session.getStats().totals.removedCount, 1);
  assert.equal(session.getStats().pending, false);
});

test('incremental add and ownership naming remain a single operation when addProperty is slow', () => {
  const effectSync = loadEffectSync();
  let currentTime = 0;
  const fixture = makeBasicSessionFixture();
  const originalAddProperty = fixture.root.effects.addProperty.bind(fixture.root.effects);
  fixture.root.effects.addProperty = (matchName) => {
    const effect = originalAddProperty(matchName);
    currentTime += 13;
    return effect;
  };
  const session = makeIncrementalSession(effectSync, [fixture.group], {
    timeBudgetMs: 12,
    now: () => currentTime,
  });

  for (let index = 0; index < 10; index += 1) {
    session.step(fixture.comp, { projectId: 'slow-add' });
  }

  assert.equal(fixture.root.effects.items.length, 1);
  assert.equal(
    fixture.root.effects.items[0].name,
    effectSync.makeReservedEffectName(100, 2, 'Gaussian Blur'),
  );
  assert.equal(ownedEffects(fixture.root, fixture.group.id).length, 1);
  assert.equal(session.getStats().pending, false);
});

test('incremental audit removes a copy after its target moves outside the Group', () => {
  const effectSync = loadEffectSync();
  const fixture = makeLargeIncrementalFixture({
    effectCount: 1,
    propertiesPerEffect: 240,
  });
  const session = makeIncrementalSession(effectSync, [fixture.group]);
  let added = false;

  for (let index = 0; index < 80; index += 1) {
    session.step(fixture.comp, { projectId: 'parent-change' });
    if (ownedEffects(fixture.root, fixture.group.id).length === 1) {
      added = true;
      break;
    }
  }

  assert.equal(added, true);
  fixture.root.parent = { id: 999, index: 999 };

  for (let index = 0; index < 100; index += 1) {
    session.step(fixture.comp, { projectId: 'parent-change' });
  }

  assert.equal(fixture.root.effects.items.length, 0);
  assert.equal(ownedEffects(fixture.root, fixture.group.id).length, 0);
  assert.equal(session.getStats().totals.createdCount, 1);
  assert.equal(session.getStats().totals.removedCount, 1);
  assert.equal(session.getStats().pending, false);
});

test('incremental property work reacquires target Effects after an in-flight collection mutation', () => {
  const effectSync = loadEffectSync();
  const metrics = makeMetrics();
  const { comp, group, root, sourceEffects } = makeLargeIncrementalFixture({
    metrics,
    effectCount: 1,
    propertiesPerEffect: 24,
    invalidateEffectRefs: true,
  });
  metrics.addPropertyCalls = 0;
  metrics.propertyWrites = 0;
  const session = makeIncrementalSession(effectSync, [group], {
    maxTargetLayers: 1,
    maxPropertyOperations: 8,
    maxEffectAdds: 1,
    now: () => 0,
  });

  let observedInFlightWork = false;
  for (let stepIndex = 0; stepIndex < 80; stepIndex += 1) {
    session.step(comp, { projectId: 'mutation-project' });
    if (ownedEffects(root, group.id).length === sourceEffects.length && session.getStats().pending) {
      observedInFlightWork = true;
      break;
    }
  }
  assert.equal(observedInFlightWork, true);

  const localEffect = root.effects.addProperty('ADBE Gaussian Blur 2');
  const converged = driveSession(
    session,
    comp,
    'mutation-project',
    () => session.getStats().pending === false,
    160,
  );

  assert.equal(converged, true);
  assert.equal(ownedEffects(root, group.id).length, 1);
  assert.equal(root.effects.items.includes(localEffect), true);
  assert.equal(ownedEffects(root, group.id)[0].property(1).expressionEnabled, true);
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
