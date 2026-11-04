const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const supabase = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
const start = supabase.indexOf('function mapResident(row) {');
const end = supabase.indexOf('\nfunction mapIncome(row)', start);
if (start < 0 || end < 0) throw new Error('resident mapping helpers not found');
const mappingSource = supabase.slice(start, end);

function loadMappingHelpers() {
    const RealDate = Date;
    class FixedDate extends RealDate {
        constructor(...args) {
            super(...(args.length ? args : ['2026-11-04T12:00:00.000Z']));
        }
    }
    return vm.runInNewContext(
        mappingSource + '\n({ mapResident, attachResidentSubscriptionHistory })',
        { Date: FixedDate },
        { filename: 'js/supabase.js' }
    );
}

test('resident mapping initializes subscription history without dropping current apartment data', () => {
    const app = loadMappingHelpers();
    const resident = app.mapResident({
        id: 'r1', user_id: null, name: 'Resident', apartment_number: '12',
        floor: '3', phone: '01000000000', monthly_amount: '175.50',
        notes: '', created_at: '2024-01-01T00:00:00.000Z'
    });
    assert.equal(resident.monthlyAmount, 175.5);
    assert.deepEqual(JSON.parse(JSON.stringify(resident.subscriptionRates)), []);
    assert.deepEqual(JSON.parse(JSON.stringify(resident.subscriptionRateHistory)), []);
});

test('effective subscription rates and manager audit history are restored per apartment', () => {
    const app = loadMappingHelpers();
    const residents = [
        app.mapResident({ id: 'r1', name: 'A', apartment_number: '1', monthly_amount: 150 }),
        app.mapResident({ id: 'r2', name: 'B', apartment_number: '2', monthly_amount: 90 })
    ];
    const mapped = app.attachResidentSubscriptionHistory(residents, [
        { resident_id: 'r1', effective_month: '2026-12-01', monthly_amount: '140' },
        { resident_id: 'r1', effective_month: '2026-03-01', monthly_amount: '125' },
        { resident_id: 'r1', effective_month: '2026-01-01', monthly_amount: '100' },
        { resident_id: 'r2', effective_month: '2026-01-01', monthly_amount: '90' }
    ], [
        {
            id: 'change-2', resident_id: 'r1', effective_month: '2026-03-01',
            previous_monthly_amount: '100', new_monthly_amount: '125',
            change_type: 'change', changed_at: '2026-03-02T10:00:00.000Z', changed_by: 'manager-1'
        },
        {
            id: 'change-1', resident_id: 'r1', effective_month: '2026-01-01',
            previous_monthly_amount: null, new_monthly_amount: '100',
            change_type: 'baseline', changed_at: '2026-01-01T10:00:00.000Z', changed_by: null
        }
    ]);

    assert.equal(mapped[0].monthlyAmount, 125);
    assert.equal(mapped[1].monthlyAmount, 90);
    assert.deepEqual(JSON.parse(JSON.stringify(mapped[0].subscriptionRates)), [
        { effectiveMonth: '2026-01-01', monthlyAmount: 100 },
        { effectiveMonth: '2026-03-01', monthlyAmount: 125 },
        { effectiveMonth: '2026-12-01', monthlyAmount: 140 }
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(mapped[1].subscriptionRates)), [
        { effectiveMonth: '2026-01-01', monthlyAmount: 90 }
    ]);
    assert.equal(mapped[0].subscriptionRateHistory[0].id, 'change-2');
    assert.equal(mapped[0].subscriptionRateHistory[0].previousMonthlyAmount, 100);
    assert.equal(mapped[0].subscriptionRateHistory[1].changeType, 'baseline');
    assert.deepEqual(JSON.parse(JSON.stringify(mapped[1].subscriptionRateHistory)), []);
});

test('Supabase loading fetches rates for the active building and restricts audit history to managers', () => {
    assert.match(supabase, /from\('resident_subscription_rates'\)[\s\S]*?select\('resident_id,effective_month,monthly_amount'\)[\s\S]*?eq\('building_id', activeBuildingId\)/);
    assert.match(supabase, /isManager\s*\?\s*supabaseClient\.from\('resident_subscription_rate_changes'\)/);
    assert.match(supabase, /subscriptionRatesResult\.error/);
    assert.match(supabase, /subscriptionRateHistoryResult\.error/);
    assert.match(supabase, /attachResidentSubscriptionHistory\(residents\.map\(mapResident\), subscriptionRatesResult\.data/);
});
