const test = require('node:test');
const assert = require('node:assert/strict');
const { findMarkers } = require('../scripts/check-conflict-markers.cjs');

const open = '<'.repeat(7);
const close = '>'.repeat(7);
const mid = '='.repeat(7);

test('conflict markers are detected, plain rules are not', () => {
    assert.deepEqual(findMarkers(`a\n${open} HEAD\nx\n${mid}\ny\n${close} abc\n`), [2, 6]);
    assert.deepEqual(findMarkers(`title\n${mid}\ntext\n`), []);
    assert.deepEqual(findMarkers('a << b >> c\n'), []);
});
