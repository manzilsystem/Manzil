'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { mock } = require('node:test');

const {
    compare,
    readRemoteVersions,
    report,
    versionOf,
} = require('../scripts/check-migration-drift.cjs');

test('remote version input ignores blank lines and surrounding whitespace', () => {
    assert.deepEqual(readRemoteVersions(' 20260101000000 \r\n\n20260102000000\n'), [
        '20260101000000',
        '20260102000000',
    ]);
});

test('versionOf only accepts a numeric migration prefix', () => {
    assert.equal(versionOf('20260101000000_add_column.sql'), '20260101000000');
    assert.equal(versionOf('README.sql'), null);
});

test('matching remote and local versions are clean', () => {
    const result = compare('20260101000000\n20260102000000\n', [
        '20260101000000_first.sql',
        '20260102000000_second.sql',
    ]);

    assert.deepEqual(result.missingLocally, []);
    assert.deepEqual(result.pendingRemotely, []);
    assert.deepEqual(result.invalid, []);
    assert.deepEqual(result.invalidLocal, []);
    assert.deepEqual(result.duplicates, []);
});

test('a remote version without a local file is the failure that blocks deployment', () => {
    const result = compare('20260101000000\n20260102000000\n', ['20260101000000_first.sql']);
    assert.deepEqual(result.missingLocally, ['20260102000000']);
});

test('a local-only migration is reported as pending, not as a failure', () => {
    const result = compare('20260101000000\n', [
        '20260101000000_first.sql',
        '20260102000000_forward.sql',
    ]);
    assert.deepEqual(result.pendingRemotely, ['20260102000000']);
    assert.deepEqual(result.missingLocally, []);
});

test('invalid and duplicated migration versions are rejected', () => {
    const result = compare('not-a-version\n', [
        '20260101000000_first.sql',
        '20260101000000_duplicate.sql',
        'README.sql',
    ]);

    assert.deepEqual(result.invalid, ['not-a-version']);
    assert.deepEqual(result.duplicates, ['20260101000000']);
    assert.deepEqual(result.invalidLocal, ['README.sql']);
});

test('report fails only when the hosted history cannot be reproduced locally', () => {
    const logs = [];
    const errors = [];
    const log = mock.method(console, 'log', (...parts) => logs.push(parts.join(' ')));
    const error = mock.method(console, 'error', (...parts) => errors.push(parts.join(' ')));

    try {
        assert.equal(report(compare('20260101000000\n', ['20260101000000_first.sql'])), 0);
        assert.equal(report(compare('20260101000000\n', [
            '20260101000000_first.sql',
            '20260102000000_pending.sql',
        ])), 0);
        assert.ok(logs.join('\n').includes('pending migration: 20260102000000'));
        assert.equal(errors.length, 0);

        assert.equal(report(compare('20260101000000\n20260103000000\n', ['20260101000000_first.sql'])), 1);
        assert.ok(errors.join('\n').includes('20260103000000'));
    } finally {
        log.mock.restore();
        error.mock.restore();
    }
});
