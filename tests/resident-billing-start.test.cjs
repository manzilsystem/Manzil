const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'UTC';
const root = path.join(__dirname, '..');
const stateSource = fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8');
const crudSource = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');
const supabaseSource = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
const backupSource = fs.readFileSync(path.join(root, 'js', 'backup.js'), 'utf8');
const template = fs.readFileSync(path.join(root, 'src', 'partials', 'modals.html'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261106050000_resident_billing_start.sql'), 'utf8');
const fixedNow = new Date('2024-05-15T12:00:00.000Z');

class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow.getTime(); }
}

function loadState() {
    return vm.runInNewContext(
        `${stateSource}\n({ state, normalizeBillingStartMonth, getResidentBillingStartKey, calculateCumulativeDebt })`,
        { Date: FixedDate },
        { filename: 'resident-billing-start.js' }
    );
}

function resident(overrides = {}) {
    return {
        id: 'r1',
        name: 'ساكن',
        apartmentNumber: '101',
        monthlyAmount: 100,
        createdAt: '2024-01-01T00:00:00.000Z',
        subscriptionRates: [{ effectiveMonth: '2024-01-01', monthlyAmount: 100 }],
        ...overrides
    };
}

test('billing start normalizes month keys and falls back to the creation month', () => {
    const app = loadState();

    assert.equal(app.normalizeBillingStartMonth('2026-10'), '2026-10-01');
    assert.equal(app.normalizeBillingStartMonth('2026-10-01'), '2026-10-01');
    assert.equal(app.normalizeBillingStartMonth('2026-13'), null);
    assert.equal(app.normalizeBillingStartMonth(''), null);
    assert.equal(app.getResidentBillingStartKey(resident()), '2024-01-01');
    assert.equal(app.getResidentBillingStartKey(resident({ billingStartMonth: '2023-08-01' })), '2023-08-01');
    assert.equal(app.getResidentBillingStartKey(resident({ billingStartMonth: 'invalid' })), '2024-01-01');
});

test('cumulative debt starts from the stored billing month instead of the creation month', () => {
    const app = loadState();
    app.state.residents = [resident({ billingStartMonth: '2024-02-01' })];

    const debt = app.calculateCumulativeDebt('r1');

    assert.equal(debt.count, 4);
    assert.equal(debt.totalDebt, 400);
    assert.deepEqual(JSON.parse(JSON.stringify(debt.unpaidMonths)), ['فبراير 2024', 'مارس 2024', 'أبريل 2024', 'مايو 2024']);
});

test('resident form exposes and persists the optional billing start', () => {
    assert.match(template, /<input type="month" id="residentBillingStart"/);
    assert.match(crudSource, /billingStartValue = String\([\s\S]*?residentBillingStart[\s\S]*?\)\?\.value/);
    assert.match(crudSource, /billingStartMonth = billingStartValue \? `\$\{billingStartValue\}-01` : null/);
    assert.match(crudSource, /logAction\('تعديل بداية المحاسبة'/);
    assert.match(crudSource, /rateMonthKey = billingStartMonth && billingStartMonth < createdMonthKey \? billingStartMonth : createdMonthKey/);
});

test('resident payloads map and send the billing start conditionally', () => {
    assert.match(supabaseSource, /billingStartMonth: row\.billing_start_month \|\| null/);
    assert.match(supabaseSource, /billing_start_month: r\.billingStartMonth \|\| null/);
    assert.match(supabaseSource, /created_at,billing_start_month'/);
});

test('the migration adds a month-aligned column and preserves the field for older clients', () => {
    assert.match(migration, /ADD COLUMN IF NOT EXISTS billing_start_month date/);
    assert.match(migration, /residents_billing_start_month_check/);
    assert.match(migration, /EXTRACT\(DAY FROM resident\.billing_start_month\) <> 1/);
    assert.match(migration, /payload_resident \? 'billing_start_month'/);
    assert.match(migration, /ELSE current_resident\.billing_start_month/);
});

test('backup import normalizes the billing start and validation rejects malformed months', () => {
    assert.match(backupSource, /billingStartMonth: normalizeBillingStartMonth\(r\.billingStartMonth\)/);
    const isValidBackup = vm.runInNewContext(`${backupSource}\nisValidBackup`, {}, { filename: 'backup-validation.js' });
    const base = { residents: [{ id: 'resident-1', name: 'ساكن', apartmentNumber: '1', monthlyAmount: 100 }], income: [], expenses: [], notices: [] };

    assert.equal(isValidBackup({ ...base, residents: [{ ...base.residents[0], billingStartMonth: '2026-10' }] }), true);
    assert.equal(isValidBackup({ ...base, residents: [{ ...base.residents[0], billingStartMonth: '2026-10-01' }] }), true);
    assert.equal(isValidBackup({ ...base, residents: [{ ...base.residents[0], billingStartMonth: null }] }), true);
    assert.equal(isValidBackup({ ...base, residents: [{ ...base.residents[0], billingStartMonth: '2026-10-15' }] }), false);
    assert.equal(isValidBackup({ ...base, residents: [{ ...base.residents[0], billingStartMonth: 'October' }] }), false);
});
