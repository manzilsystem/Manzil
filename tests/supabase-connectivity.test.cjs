'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'scripts', 'check-supabase.cjs');
const script = fs.readFileSync(scriptPath, 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const { CHECKS, evaluate, readPublicConfig, runChecks } = require(scriptPath);

test('check:supabase is available and the script parses', () => {
    assert.equal(pkg.scripts['check:supabase'], 'node scripts/check-supabase.cjs');
    execFileSync(process.execPath, ['--check', scriptPath], { cwd: root });
});

test('connectivity check reads the public config without printing the key', () => {
    const config = readPublicConfig(root);
    assert.match(config.url, /^https:\/\/[a-z]+\.supabase\.co$/);
    assert.equal(config.key.length > 20, true);
    assert.doesNotMatch(script, /console\.(?:log|error)\([^)]*\b(?:config\.)?key\s*\)/);
    assert.match(config.key, /^sb_publishable_/);
});

test('expected statuses distinguish healthy, optional and unsafe responses', () => {
    const byId = Object.fromEntries(CHECKS.map((check) => [check.id, check]));

    assert.equal(evaluate(byId.auth, 200).state, 'OK');
    assert.equal(evaluate(byId.auth, 500).state, 'FAIL');
    assert.equal(evaluate(byId.rest, 401).state, 'OK');
    assert.equal(evaluate(byId.rls, 401).state, 'OK');
    assert.equal(evaluate(byId.rls, 403).state, 'OK');
    assert.equal(evaluate(byId.rls, 200).state, 'FAIL');
    assert.match(evaluate(byId.rls, 200).detail, /RLS/);
    assert.equal(evaluate(byId.health, 200).state, 'OK');
    assert.equal(evaluate(byId.health, 404).state, 'WARN');
    assert.equal(evaluate(byId.health, 401).state, 'WARN');
});

test('runChecks keeps probing after a failure and never sends the key to optional checks', async () => {
    const calls = [];
    const fakeFetch = async (url, options) => {
        calls.push({ url, options });
        const status = url.endsWith('/auth/v1/health') ? 500 : 401;
        return {
            status,
            text: async () => '',
        };
    };

    const results = await runChecks(
        { url: 'https://example.supabase.co', key: 'sb_publishable_test' },
        fakeFetch
    );

    assert.equal(results.length, CHECKS.length);
    assert.deepEqual(
        results.map(({ result }) => result.state),
        ['FAIL', 'OK', 'OK', 'WARN']
    );
    assert.equal(calls.length, CHECKS.length);
    assert.deepEqual(calls[0].options.headers, { apikey: 'sb_publishable_test' });
    assert.deepEqual(calls[3].options.headers, {});
});
