const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const supabaseSource = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
const crudSource = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');

function makeSaveHarness(resident) {
    const calls = [];
    const loggedErrors = [];
    const client = {
        rpc(name, args) {
            calls.push({ name, args });
            return Promise.resolve({ data: { ok: true, version: 2 }, error: null });
        },
        from() { throw new Error('Expected atomic persistence RPC'); },
    };
    const sandbox = {
        window: { supabase: { createClient: () => client } },
        console: { error: (...args) => loggedErrors.push(args) },
        toast() {},
        generateId: () => 'request-id',
        currentUserRole: 'manager',
        activeSession: { user: { id: 'manager-user-id' } },
        activeBuildingId: 'building-id',
        activeBuildingVersion: 1,
        supabaseStateLoaded: true,
        state: {
            buildingName: 'Manzil', managerName: '', managerPhone: '', defaultSubscription: 0,
            startingBalance: 0, currentTheme: 'dark', residents: [resident], income: [],
            expenses: [], notices: [], auditLogs: [], lastUpdated: 0,
        },
    };
    const app = vm.runInNewContext(
        `${supabaseSource}\\nactiveSession = { user: { id: 'manager-user-id' } }; activeBuildingId = 'building-id'; supabaseStateLoaded = true; activeBuildingVersion = 1;\\n({ saveState, toSupabaseTimestamp, getGuardState: () => ({ currentUserRole, activeSession, activeBuildingId, supabaseStateLoaded }) })`,
        sandbox,
        { filename: 'js/supabase.js' }
    );
    return { app, calls, loggedErrors };
}

test('atomic save converts a legacy millisecond createdAt into a timestamptz ISO value', async () => {
    const createdAt = Date.UTC(2026, 10, 1, 12, 30, 0);
    const { app, calls, loggedErrors } = makeSaveHarness({
        id: 'resident-id', userId: null, name: 'Test resident', apartmentNumber: '101',
        phone: '', monthlyAmount: 100, notes: '', createdAt,
    });

    assert.equal(await app.saveState(), true, JSON.stringify({
        guard: app.getGuardState(),
        errors: loggedErrors.map(args => args.map(value => String(value))),
    }));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'persist_building_snapshot');
    const rows = JSON.parse(JSON.stringify(calls[0].args.p_payload.residents));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].created_at, new Date(createdAt).toISOString());
    assert.equal(typeof rows[0].created_at, 'string');
});

test('new apartments use an ISO creation timestamp and invalid saved dates are rejected', () => {
    assert.match(crudSource, /createdAt:\\s*new Date\\(\\)\\.toISOString\\(\\)/);
    assert.throws(() => makeSaveHarness({}).app.toSupabaseTimestamp('not-a-date'), /Invalid timestamp/);
});

test('apartments with collection history cannot be deleted from the UI', () => {
    assert.match(crudSource, /state\\.income\\.some\\(payment => payment\\.residentId === id\\)/);
    assert.match(crudSource, /لا يمكن حذف شقة لها تحصيلات مسجلة/);
});
