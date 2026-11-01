const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const supabaseSource = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
const crudSource = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');

function makeSaveHarness(resident) {
    const persistedRows = new Map();
    const loggedErrors = [];
    const client = {
        from(table) {
            let operation = 'read';
            const builder = {
                update() { operation = 'update'; return this; },
                upsert(rows) { operation = 'upsert'; persistedRows.set(table, rows); return this; },
                select() { operation = 'select'; return this; },
                delete() { operation = 'delete'; return this; },
                eq() { return this; },
                in() { return this; },
                then(resolve, reject) {
                    const data = operation === 'select' ? persistedRows.get(table) || [] : null;
                    return Promise.resolve({ data, error: null }).then(resolve, reject);
                },
            };
            return builder;
        },
    };
    const sandbox = {
        window: { supabase: { createClient: () => client } },
        console: { error: (...args) => loggedErrors.push(args) },
        toast() {},
        currentUserRole: 'manager',
        activeSession: { user: { id: 'manager-user-id' } },
        activeBuildingId: 'building-id',
        supabaseStateLoaded: true,
        state: {
            buildingName: 'Manzil', managerName: '', managerPhone: '', defaultSubscription: 0,
            startingBalance: 0, currentTheme: 'dark', residents: [resident], income: [],
            expenses: [], notices: [], auditLogs: [], lastUpdated: 0,
        },
    };
    const app = vm.runInNewContext(
        `${supabaseSource}\nactiveSession = { user: { id: 'manager-user-id' } };\n` +
        `activeBuildingId = 'building-id';\nsupabaseStateLoaded = true;\n` +
        `({ saveState, toSupabaseTimestamp, getGuardState: () => ({ currentUserRole, activeSession, activeBuildingId, supabaseStateLoaded }) })`,
        sandbox,
        { filename: 'js/supabase.js' }
    );
    return { app, persistedRows, loggedErrors };
}

test('saveState converts a legacy millisecond createdAt into the timestamptz ISO format', async () => {
    const createdAt = Date.UTC(2026, 10, 1, 12, 30, 0);
    const { app, persistedRows, loggedErrors } = makeSaveHarness({
        id: 'resident-id', userId: null, name: 'Test resident', apartmentNumber: '101',
        phone: '', monthlyAmount: 100, notes: '', createdAt,
    });

    assert.equal(await app.saveState(), true, JSON.stringify({
        guard: app.getGuardState(),
        errors: loggedErrors.map(args => args.map(value => String(value))),
    }));
    const rows = JSON.parse(JSON.stringify(persistedRows.get('residents')));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].created_at, new Date(createdAt).toISOString());
    assert.equal(typeof rows[0].created_at, 'string');
});

test('new apartments use an ISO creation timestamp and invalid saved dates are rejected', () => {
    assert.match(crudSource, /createdAt:\s*new Date\(\)\.toISOString\(\)/);
    assert.throws(() => makeSaveHarness({}).app.toSupabaseTimestamp('not-a-date'), /Invalid timestamp/);
});
