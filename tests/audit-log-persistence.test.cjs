const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const supabaseSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase.js'), 'utf8');

function makeHarness(auditLogs, persistedIds) {
    const writes = [];
    const client = {
        from(table) {
            let operation = 'select';
            const builder = {
                update() { operation = 'update'; return this; },
                upsert(rows) { operation = 'upsert'; writes.push({ table, operation, rows }); return this; },
                insert(rows) { operation = 'insert'; writes.push({ table, operation, rows }); return this; },
                select() { operation = 'select'; return this; },
                delete() { operation = 'delete'; return this; },
                eq() { return this; },
                in() { return this; },
                order() { return this; },
                range() { return this; },
                then(resolve, reject) {
                    const data = operation === 'select' ? [] : null;
                    return Promise.resolve({ data, error: null }).then(resolve, reject);
                },
            };
            return builder;
        },
    };
    const sandbox = {
        window: { supabase: { createClient: () => client } },
        document: { body: { classList: { remove() {} } }, getElementById: () => null },
        console: { error() {} },
        toast() {},
        currentUserRole: 'manager',
        activeSession: { user: { id: 'manager-user-id' } },
        activeBuildingId: 'building-id',
        supabaseStateLoaded: true,
        state: {
            buildingName: 'Manzil', managerName: '', managerPhone: '', defaultSubscription: 0,
            startingBalance: 0, currentTheme: 'dark', residents: [], income: [], expenses: [],
            notices: [], auditLogs, lastUpdated: 0,
        },
    };
    const app = vm.runInNewContext(
        `${supabaseSource}\nactiveSession = { user: { id: 'manager-user-id' } }; activeBuildingId = 'building-id'; supabaseStateLoaded = true; persistedAuditLogIds = new Set(${JSON.stringify(persistedIds)});\n({ saveState, isAuditPersisted: id => persistedAuditLogIds.has(id) })`,
        sandbox,
        { filename: 'js/supabase.js' }
    );
    return { app, writes };
}

test('saveState inserts new audit entries without upserting previously persisted immutable rows', async () => {
    const existing = { id: 'existing-log', action: 'سجل سابق', details: '', date: '2026-10-31T10:00:00.000Z' };
    const added = { id: 'new-log', action: 'إضافة شقة', details: 'شقة جديدة', date: '2026-11-02T00:00:00.000Z' };
    const { app, writes } = makeHarness([added, existing], ['existing-log']);

    assert.equal(await app.saveState(), true);
    assert.deepEqual(writes.filter(write => write.table === 'audit_logs').map(write => ({
        operation: write.operation,
        ids: write.rows.map(row => row.id),
    })), [{ operation: 'insert', ids: ['new-log'] }]);
    assert.equal(app.isAuditPersisted('new-log'), true);
});

test('saving without a new audit entry does not write to audit_logs', async () => {
    const existing = { id: 'existing-log', action: 'سجل سابق', details: '', date: '2026-10-31T10:00:00.000Z' };
    const { app, writes } = makeHarness([existing], ['existing-log']);

    assert.equal(await app.saveState(), true);
    assert.equal(writes.some(write => write.table === 'audit_logs'), false);
});

test('loaded audit identifiers are marked persisted before regular saves are enabled', () => {
    const loadAssignment = supabaseSource.indexOf('persistedAuditLogIds = new Set(auditLogs.map(row => row.id))');
    const loadedFlag = supabaseSource.indexOf('supabaseStateLoaded = true;', loadAssignment);
    assert.notEqual(loadAssignment, -1);
    assert.notEqual(loadedFlag, -1);
    assert.ok(loadAssignment < loadedFlag);
});
