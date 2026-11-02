const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const supabaseSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase.js'), 'utf8');

function makeHarness(auditLogs, persistedIds, rpcHandler = async () => ({ data: { ok: true, version: 2 }, error: null })) {
    const calls = [];
    const client = {
        rpc(name, args) {
            calls.push({ name, args });
            return rpcHandler(name, args, calls.length);
        },
        from() { throw new Error('Snapshot persistence must use the atomic RPC'); },
    };
    const sandbox = {
        window: { supabase: { createClient: () => client } },
        document: { body: { classList: { remove() {} } }, getElementById: () => null },
        console: { error() {} },
        toast() {},
        generateId: () => 'stable-request-id',
        currentUserRole: 'manager',
        activeSession: { user: { id: 'manager-user-id' } },
        activeBuildingId: 'building-id',
        activeBuildingVersion: 1,
        supabaseStateLoaded: true,
        state: {
            buildingName: 'Manzil', managerName: '', managerPhone: '', defaultSubscription: 0,
            startingBalance: 0, currentTheme: 'dark', residents: [], income: [], expenses: [],
            notices: [], auditLogs, lastUpdated: 0,
        },
    };
    const app = vm.runInNewContext(
        `${supabaseSource}\nactiveSession = { user: { id: 'manager-user-id' } }; activeBuildingId = 'building-id'; supabaseStateLoaded = true; activeBuildingVersion = 1; persistedAuditLogIds = new Set(${JSON.stringify(persistedIds)});\n({ saveState, isAuditPersisted: id => persistedAuditLogIds.has(id), getVersion: () => activeBuildingVersion })`,
        sandbox,
        { filename: 'js/supabase.js' }
    );
    return { app, calls };
}

test('saveState sends only new immutable audit entries through one atomic RPC', async () => {
    const existing = { id: 'existing-log', action: 'سجل سابق', details: '', date: '2026-10-31T10:00:00.000Z' };
    const added = { id: 'new-log', action: 'إضافة شقة', details: 'شقة جديدة', date: '2026-11-02T00:00:00.000Z' };
    const { app, calls } = makeHarness([added, existing], ['existing-log']);

    assert.equal(await app.saveState(), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'persist_building_snapshot');
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args.p_payload.audit_logs)).map(row => row.id), ['new-log']);
    assert.equal(app.isAuditPersisted('new-log'), true);
    assert.equal(app.getVersion(), 2);
});

test('saving without a new audit entry sends an empty append-only audit batch', async () => {
    const existing = { id: 'existing-log', action: 'سجل سابق', details: '', date: '2026-10-31T10:00:00.000Z' };
    const { app, calls } = makeHarness([existing], ['existing-log']);

    assert.equal(await app.saveState(), true);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args.p_payload.audit_logs)), []);
});

test('atomic persistence retries the exact same idempotency key and payload after a transport failure', async () => {
    const { app, calls } = makeHarness([], [], async (_name, _args, attempt) => {
        if (attempt === 1) throw new Error('network timeout after uncertain commit');
        return { data: { ok: true, duplicate: true, version: 2 }, error: null };
    });

    assert.equal(await app.saveState(), true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].args.p_request_id, calls[1].args.p_request_id);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args.p_payload)), JSON.parse(JSON.stringify(calls[1].args.p_payload)));
});

test('optimistic version conflict stops without retrying or claiming a save', async () => {
    const { app, calls } = makeHarness([], [], async () => ({ data: { ok: false, conflict: true, current_version: 3 }, error: null }));

    assert.equal(await app.saveState(), false);
    assert.equal(calls.length, 1);
    assert.equal(app.getVersion(), 1);
});

test('loaded audit identifiers are marked persisted before regular saves are enabled', () => {
    const loadAssignment = supabaseSource.indexOf('persistedAuditLogIds = new Set(auditLogs.map(row => row.id))');
    const loadedFlag = supabaseSource.indexOf('supabaseStateLoaded = true;', loadAssignment);
    assert.notEqual(loadAssignment, -1);
    assert.notEqual(loadedFlag, -1);
    assert.ok(loadAssignment < loadedFlag);
});
