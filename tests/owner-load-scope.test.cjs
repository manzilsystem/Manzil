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

    for (const table of ['expenses', 'audit_logs']) {
        assert.ok(
            loadState.includes(`isManager ? supabaseQuery('${table}', ${table === 'expenses' ? 'expenseColumns' : 'auditColumns'}) : Promise.resolve([])`),
            `${table} must only be queried for managers`
        );
    }

    assert.ok(loadState.includes(
        "currentUserRole === 'manager' ? supabaseQuery('resident_internal_notes', 'resident_id,notes') : Promise.resolve([])"
    ));

    for (const [table, columns] of [['residents', 'residentColumns'], ['income', 'incomeColumns'], ['notices', 'noticeColumns']]) {
        assert.ok(loadState.includes(`supabaseQuery('${table}', ${columns})`));
    }
});
