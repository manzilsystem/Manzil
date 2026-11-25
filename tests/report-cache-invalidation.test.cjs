const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const reportsSource = fs.readFileSync(path.join(root, 'js', 'reports.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8');
const supabaseSource = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');

function sliceBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, `could not find ${startMarker}`);
    return source.slice(start, end);
}

function extractFunction(source, name) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, `function ${name} not found`);
    let depth = 0;
    for (let i = source.indexOf('{', start); i < source.length; i += 1) {
        if (source[i] === '{') depth += 1;
        if (source[i] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`unterminated function ${name}`);
}

function loadCache(globals = {}) {
    const code = sliceBetween(reportsSource, 'const REPORT_MODEL_CACHE_LOCAL', 'const REPORT_PURPOSE_FILTER_IDS');
    const sandbox = { ...globals };
    return vm.runInNewContext(`${code}\n({ getCachedReportModel, clearReportModelCache })`, sandbox);
}

test('cached report model is reused for the same building and role', () => {
    const cache = loadCache({ activeBuildingId: 'b1', currentUserRole: 'manager' });
    let builds = 0;
    const build = () => ({ n: ++builds });
    assert.equal(cache.getCachedReportModel('period:a:b', build).n, 1);
    assert.equal(cache.getCachedReportModel('period:a:b', build).n, 1);
    assert.equal(builds, 1);
});

test('cached report model is not shared between buildings or roles with the same filters', () => {
    const sandbox = { activeBuildingId: 'b1', currentUserRole: 'manager', currentResidentId: null };
    const code = sliceBetween(reportsSource, 'const REPORT_MODEL_CACHE_LOCAL', 'const REPORT_PURPOSE_FILTER_IDS');
    const api = vm.runInNewContext(`${code}\n({ getCachedReportModel, setScope(b, r) { activeBuildingId = b; currentUserRole = r; } })`, sandbox);
    const first = api.getCachedReportModel('period:a:b', () => ({ building: 'b1' }));
    api.setScope('b2', 'manager');
    const second = api.getCachedReportModel('period:a:b', () => ({ building: 'b2' }));
    api.setScope('b2', 'owner');
    const third = api.getCachedReportModel('period:a:b', () => ({ building: 'b2-owner' }));
    assert.equal(first.building, 'b1');
    assert.equal(second.building, 'b2');
    assert.equal(third.building, 'b2-owner');
});

function loadSaveWithRollback(saveResult) {
    const code = [
        'let saveRollbackPendingCount = 0;',
        'let saveRollbackBaseline = null;',
        'let saveExecutionQueue = Promise.resolve();',
        extractFunction(stateSource, 'cloneStateSnapshot'),
        extractFunction(stateSource, 'enqueueStateSave'),
        extractFunction(stateSource, 'saveWithRollback')
    ].join('\n');
    const calls = { clears: 0, clearsAtRender: [] };
    const sandbox = {
        state: { value: 'attempted' },
        saveState: async () => saveResult,
        clearReportModelCache: () => { calls.clears += 1; },
        renderAll: () => { calls.clearsAtRender.push(calls.clears); },
        console: { error() {} }
    };
    const api = vm.runInNewContext(`${code}\n({ saveWithRollback, getState: () => state })`, sandbox);
    return { api, calls };
}

test('a successful save clears the report cache', async () => {
    const { api, calls } = loadSaveWithRollback(true);
    assert.equal(await api.saveWithRollback({ value: 'previous' }), true);
    assert.equal(calls.clears, 1);
});

test('a failed save rolls state back and also clears the report cache', async () => {
    const { api, calls } = loadSaveWithRollback(false);
    assert.equal(await api.saveWithRollback({ value: 'previous' }), false);
    assert.equal(api.getState().value, 'previous');
    assert.equal(calls.clears, 1);
    assert.deepEqual(calls.clearsAtRender, [1]);
});

test('sign-out and loading a building both clear the report cache', () => {
    const signOut = extractFunction(supabaseSource, 'clearAuthenticatedState');
    assert.match(signOut, /clearReportModelCache\(\)/);
    const load = extractFunction(supabaseSource, 'loadState');
    const clears = load.match(/clearReportModelCache\(\)/g) || [];
    assert.ok(clears.length >= 2, 'loadState must clear the cache when the building changes and when state is replaced');
});
