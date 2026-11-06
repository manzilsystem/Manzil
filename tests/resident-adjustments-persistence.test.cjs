const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'UTC';
const root = path.join(__dirname, '..');
const stateSource = fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8');
const supabaseSource = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261106022840_snapshot_resident_adjustments.sql'),
    'utf8'
);

function loadState() {
    return vm.runInNewContext(
        `${stateSource}\n({ state, getMonthOutstanding, getAdjustmentAmountForMonth })`,
        { Date },
        { filename: 'resident-adjustments-state.js' }
    );
}

function resident(id = 'r1') {
    return {
        id, name: id, apartmentNumber: id, createdAt: '2024-01-01T00:00:00.000Z',
        monthlyAmount: 100,
        subscriptionRates: [{ effectiveMonth: '2024-01-01', monthlyAmount: 100 }]
    };
}

test('monthly outstanding uses the agreed settlement amount for that resident and month', () => {
    const app = loadState();
    app.state.residents = [resident()];
    app.state.income = [{ id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 30 }];
    app.state.adjustments = [
        { id: 'a1', residentId: 'r1', effectiveMonth: '2024-01-01', kind: 'waiver', amount: 20 },
        { id: 'a2', residentId: 'r1', effectiveMonth: '2024-01-01', kind: 'discount', amount: 10.5 },
        { id: 'a3', residentId: 'r1', effectiveMonth: '2024-02-01', kind: 'settlement', amount: 40 },
        { id: 'a4', residentId: 'r2', effectiveMonth: '2024-01-01', kind: 'waiver', amount: 15 }
    ];

    assert.equal(app.getAdjustmentAmountForMonth('r1', 'يناير 2024'), 30.5);
    assert.equal(app.getMonthOutstanding(app.state.residents[0], 'يناير 2024'), 39.5);
    assert.equal(app.getMonthOutstanding(app.state.residents[0], 'فبراير 2024'), 40);
});

test('settlements never push the monthly outstanding below zero', () => {
    const app = loadState();
    app.state.residents = [resident()];
    app.state.adjustments = [
        { id: 'a1', residentId: 'r1', effectiveMonth: '2024-01-01', kind: 'waiver', amount: 250 }
    ];

    assert.equal(app.getMonthOutstanding(app.state.residents[0], 'يناير 2024'), 0);
    assert.equal(app.getAdjustmentAmountForMonth('r1', 'شهر غير معروف'), 0);
    assert.equal(app.getAdjustmentAmountForMonth('r1', 'يناير 2024'), 250);
});

test('the snapshot payload carries settlements and the loader maps them', () => {
    assert.match(supabaseSource, /function mapResidentAdjustment\(row\)/);
    assert.match(supabaseSource, /residentAdjustmentsQuery/);
    assert.match(supabaseSource, /from\('resident_adjustments'\)/);
    assert.match(supabaseSource, /select\('id,resident_id,effective_month,kind,amount,reason,created_at'\)/);
    assert.match(supabaseSource, /adjustments: \(residentAdjustmentsResult\.data \|\| \[\]\)\.map\(mapResidentAdjustment\)/);
    assert.match(supabaseSource, /resident_adjustments: \(Array\.isArray\(state\.adjustments\) \? state\.adjustments : \[\]\)\.map/);
    assert.match(supabaseSource, /effective_month: adjustment\.effectiveMonth/);
    assert.match(supabaseSource, /kind: adjustment\.kind/);
});

test('the snapshot RPC validates, persists and deletes settlements atomically', () => {
    assert.match(migration, /p_payload \? 'resident_adjustments'/);
    assert.match(migration, /jsonb_typeof\(p_payload->'resident_adjustments'\) IS DISTINCT FROM 'array'/);
    assert.match(migration, /invalid_adjustment_kind/);
    assert.match(migration, /invalid_adjustment_amount_or_month/);
    assert.match(migration, /invalid_adjustment_reason/);
    assert.match(migration, /adjustment_resident_not_in_snapshot/);
    assert.match(migration, /INSERT INTO public\.resident_adjustments AS current_adjustment/);
    assert.match(migration, /DELETE FROM public\.resident_adjustments a/);
    assert.match(migration, /adjustment_exceeds_month_due/);
    assert.match(migration, /cannot_delete_resident_with_income_history[\s\S]*resident_adjustments/);
    assert.match(migration, /ROUND\(x\.amount, 2\)/);
});
