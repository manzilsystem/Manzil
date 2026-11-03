const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase.js'), 'utf8');
const start = source.indexOf('async function loadState()');
const end = source.indexOf('\nasync function saveState()', start);
const loadState = source.slice(start, end);

test('owner sessions skip manager-only data queries', () => {
    assert.notEqual(start, -1, 'loadState must exist');
    assert.notEqual(end, -1, 'loadState must end before saveState');

    for (const table of ['expenses', 'audit_logs', 'resident_internal_notes']) {
        assert.match(
            loadState,
            new RegExp(`isManager \\? supabaseQuery\\('${table}'`),
            `${table} must only be queried for managers`
        );
    }

    for (const table of ['residents', 'income', 'notices']) {
        assert.match(loadState, new RegExp(`supabaseQuery\\('${table}'`));
    }
});
