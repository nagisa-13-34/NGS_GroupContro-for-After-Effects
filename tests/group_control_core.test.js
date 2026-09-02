'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const corePath = path.join(repositoryRoot, 'panel', 'GroupControlCore.jsxinc');

function loadCore() {
  const source = fs.readFileSync(corePath, 'utf8');
  const moduleObject = { exports: {} };
  const sandbox = {
    module: moduleObject,
    exports: moduleObject.exports,
    console,
  };

  vm.runInNewContext(source, sandbox, { filename: corePath });
  return moduleObject.exports;
}

function assertMarkerError(core, markerComment, expectedCode) {
  assert.throws(
    () => core.decodeGroupState(markerComment),
    (error) => error && error.code === expectedCode,
  );
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('clampLayerCount normalizes invalid, fractional, negative, and over-limit values', () => {
  const core = loadCore();

  assert.equal(core.clampLayerCount(0, 8), 0);
  assert.equal(core.clampLayerCount('4.9', 8), 4);
  assert.equal(core.clampLayerCount(-2, 8), 0);
  assert.equal(core.clampLayerCount('9999', 8), 8);
  assert.equal(core.clampLayerCount('not-a-number', 8), 0);
  assert.equal(core.clampLayerCount(Infinity, 8), 0);
  assert.equal(core.clampLayerCount(4, -1), 0);
});

test('getTargetIndexRange returns the 1-based range below a Group Null', () => {
  const core = loadCore();

  assert.deepEqual(toPlain(core.getTargetIndexRange(1, 3, 5)), {
    startIndex: 2,
    endIndex: 4,
    count: 3,
  });
  assert.deepEqual(toPlain(core.getTargetIndexRange(4, 3, 5)), {
    startIndex: 5,
    endIndex: 5,
    count: 1,
  });
  assert.deepEqual(toPlain(core.getTargetIndexRange(4, 0, 5)), {
    startIndex: 5,
    endIndex: 4,
    count: 0,
  });
  assert.deepEqual(toPlain(core.getTargetIndexRange(5, 3, 5)), {
    startIndex: 6,
    endIndex: 5,
    count: 0,
  });
});

test('getRootLayerIds preserves target order and treats external parents as roots', () => {
  const core = loadCore();

  assert.deepEqual(toPlain(core.getRootLayerIds([
    { layerId: 10, parentId: 0 },
    { layerId: 11, parentId: 10 },
    { layerId: 12, parentId: 99 },
    { layerId: 13, parentId: 11 },
  ])), [10, 12]);
});

test('wouldCreateParentCycle detects self, ancestor, and pre-existing cycle paths', () => {
  const core = loadCore();
  const parentMap = {
    10: 0,
    11: 10,
    12: 11,
    20: 21,
    21: 20,
  };

  assert.equal(core.wouldCreateParentCycle(10, 10, parentMap), true);
  assert.equal(core.wouldCreateParentCycle(10, 12, parentMap), true);
  assert.equal(core.wouldCreateParentCycle(12, 10, parentMap), false);
  assert.equal(core.wouldCreateParentCycle(12, 0, parentMap), false);
  assert.equal(core.wouldCreateParentCycle(30, 20, parentMap), true);
});

test('encodeGroupState and decodeGroupState round-trip the fixed marker format', () => {
  const core = loadCore();
  const state = {
    version: 1,
    groupId: 123,
    records: [
      { layerId: 456, originalParentId: 0 },
      { layerId: 457, originalParentId: 99 },
    ],
  };
  const marker = [
    'NGS_GROUP_CONTROL_V1',
    'groupId=123',
    'record=456,0',
    'record=457,99',
  ].join('\n');

  assert.equal(core.encodeGroupState(state), marker);
  assert.deepEqual(toPlain(core.decodeGroupState(marker)), state);
  assert.equal(
    core.encodeGroupState({ version: 1, groupId: 123, records: [] }),
    'NGS_GROUP_CONTROL_V1\ngroupId=123',
  );
});

test('decodeGroupState classifies malformed, invalid, duplicate, and self-referential markers', () => {
  const core = loadCore();

  assertMarkerError(core, 'NGS_GROUP_CONTROL\ngroupId=123', 'MARKER_SYNTAX');
  assertMarkerError(core, 'NGS_GROUP_CONTROL_V1\ngroup=123', 'MARKER_SYNTAX');
  assertMarkerError(core, 'NGS_GROUP_CONTROL_V1\ngroupId=0', 'MARKER_ID');
  assertMarkerError(core, 'NGS_GROUP_CONTROL_V1\ngroupId=123\nrecord=0,0', 'MARKER_ID');
  assertMarkerError(core, 'NGS_GROUP_CONTROL_V1\ngroupId=123\nrecord=456,0\n', 'MARKER_SYNTAX');
  assertMarkerError(core, 'NGS_GROUP_CONTROL_V1\ngroupId=123\nrecord=456,0\nrecord=456,9', 'MARKER_DUPLICATE_LAYER_ID');
  assertMarkerError(core, 'NGS_GROUP_CONTROL_V1\ngroupId=123\nrecord=123,0', 'MARKER_SELF_ID');
  assertMarkerError(core, 'NGS_GROUP_CONTROL_V1\ngroupId=123\nrecord=456,123', 'MARKER_SELF_ID');
});

test('GroupControlCore stays compatible with ExtendScript ES3 syntax', () => {
  const source = fs.readFileSync(corePath, 'utf8');

  assert.doesNotMatch(source, /\b(?:const|let|class)\b/);
  assert.doesNotMatch(source, /=>/);
  assert.doesNotMatch(source, /\b(?:Map|Set|Promise)\b/);
  assert.doesNotMatch(source, /JSON\./);
});
