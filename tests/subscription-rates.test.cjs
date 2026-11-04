const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'Africa/Cairo';
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');
const fixedNow = new Date('2024-05-15T12:00:00.000Z');
class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow.getTime(); }
}
function load() {
    return vm.runInNewContext(
        `${source}\n({ state, getSubscriptionAmountForMonth, getMonthOutstanding, calculateCumulativeDebt })`,
        { Date: FixedDate },
        { filename: 'js/state.js' }
    );
}

test('subscription rate history applies the latest rate effective in each month', () => {
    const app = load();
    const resident = {
        id: 'r1',
        createdAt: '2024-01-10T00:00:00.000Z',
        monthlyAmount: 150,
        subscriptionRates: [
            { effectiveMonth: '2024-01-01', monthlyAmount: 100 },
            { effectiveMonth: '2024-03-01', monthlyAmount: 125 },
            { effectiveMonth: '2024-05-01', monthlyAmount: 150 }
        ]
    };
    assert.equal(app.getSubscriptionAmountForMonth(resident, 'يناير 2024'), 100);
    assert.equal(app.getSubscriptionAmountForMonth(resident, 'فبراير 2024'), 100);
    assert.equal(app.getSubscriptionAmountForMonth(resident, 'مارس 2024'), 125);
    assert.equal(app.getSubscriptionAmountForMonth(resident, 'أبريل 2024'), 125);
    assert.equal(app.getSubscriptionAmountForMonth(resident, 'مايو 2024'), 150);
});

test('partial payments are deducted from the rate effective in that month', () => {
    const app = load();
    const resident = {
        id: 'r1',
        monthlyAmount: 150,
        subscriptionRates: [
            { effectiveMonth: '2024-01-01', monthlyAmount: 100 },
            { effectiveMonth: '2024-03-01', monthlyAmount: 150 }
        ]
    };
    app.state.income = [
        { residentId: 'r1', month: 'فبراير 2024', amount: 40 },
        { residentId: 'r1', month: 'مارس 2024', amount: 150 }
    ];
    assert.equal(app.getMonthOutstanding(resident, 'فبراير 2024'), 60);
    assert.equal(app.getMonthOutstanding(resident, 'مارس 2024'), 0);
});

test('invalid month labels do not select a historical rate', () => {
    const app = load();
    const resident = {
        id: 'r1',
        monthlyAmount: 150,
        subscriptionRates: [{ effectiveMonth: '2024-03-01', monthlyAmount: 125 }]
    };
    assert.equal(app.getSubscriptionAmountForMonth(resident, 'invalid'), 150);
});


const crudSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');
const backupSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'backup.js'), 'utf8');
function loadCrudHelpers() {
    return vm.runInNewContext(
        `${crudSource}\n${backupSource}\n({ isValidEffectiveMonth, isValidBackup, getSubscriptionAmountForMonthKey, getLocalMonthKey, getCurrentSubscriptionAmount })`,
        {},
        { filename: 'js/crud.js' }
    );
}

test('subscription effective month follows Cairo local time at month boundaries', () => {
    const app = loadCrudHelpers();
    const beforeMidnight = new Date('2026-10-31T21:59:59.000Z');
    const afterMidnight = new Date('2026-10-31T22:00:00.000Z');

    assert.equal(app.getLocalMonthKey(beforeMidnight), '2026-10');
    assert.equal(app.getLocalMonthKey(afterMidnight), '2026-11');
    assert.equal(app.getLocalMonthKey('invalid-date'), '');
});

test('current subscription amount uses the local effective month', () => {
    const app = loadCrudHelpers();
    const resident = {
        monthlyAmount: 150,
        subscriptionRates: [
            { effectiveMonth: '2026-10-01', monthlyAmount: 100 },
            { effectiveMonth: '2026-11-01', monthlyAmount: 125 }
        ]
    };

    assert.equal(app.getCurrentSubscriptionAmount(resident, new Date('2026-10-31T22:30:00.000Z')), 125);
});

test('effective subscription month accepts YYYY-MM and rejects invalid months', () => {
    const app = loadCrudHelpers();
    assert.equal(app.isValidEffectiveMonth('2026-11'), true);
    assert.equal(app.isValidEffectiveMonth('2024-02'), true);
    for (const value of ['2026-00', '2026-13', '2026-1', '26-11', '2026-11-01', '', null]) {
        assert.equal(app.isValidEffectiveMonth(value), false, String(value));
    }
});

test('effective rate helper returns the latest rate effective in the selected month', () => {
    const app = loadCrudHelpers();
    const resident = { monthlyAmount: 150, subscriptionRates: [
        { effectiveMonth: '2026-01-01', monthlyAmount: 100 },
        { effectiveMonth: '2026-03-01', monthlyAmount: 125 },
        { effectiveMonth: '2026-05-01', monthlyAmount: 150 }
    ] };
    assert.equal(app.getSubscriptionAmountForMonthKey(resident, '2026-02'), 100);
    assert.equal(app.getSubscriptionAmountForMonthKey(resident, '2026-04'), 125);
    assert.equal(app.getSubscriptionAmountForMonthKey(resident, '2026-06'), 150);
});

test('JSON backup validation accepts all supported application themes', () => {
    const app = loadCrudHelpers();
    for (const currentTheme of ['dark', 'light', 'emerald', 'ocean', 'sand', 'turquoise']) {
        assert.equal(app.isValidBackup({
            residents: [],
            income: [],
            expenses: [],
            notices: [],
            currentTheme
        }), true, currentTheme);
    }
});


test('JSON backup round-trip preserves valid historical subscription rates', () => {
    const app = loadCrudHelpers();
    const backup = {
        residents: [{
            id: 'resident-1', name: 'Test', apartmentNumber: 'A1', monthlyAmount: 150,
            subscriptionRates: [
                { effectiveMonth: '2026-01-01', monthlyAmount: 100 },
                { effectiveMonth: '2026-03-01', monthlyAmount: 150 }
            ]
        }],
        income: [{ id: 'income-1', residentId: 'resident-1', month: 'يناير 2026', amount: 50 }],
        expenses: [{ id: 'expense-1', title: 'Test expense', month: 'يناير 2026', amount: 10 }],
        notices: [{ id: 'notice-1', text: 'Test notice' }],
        currentTheme: 'ocean'
    };
    const restored = JSON.parse(JSON.stringify(backup));
    assert.equal(app.isValidBackup(restored), true);
    assert.deepEqual(
        JSON.parse(JSON.stringify(restored.residents[0].subscriptionRates)),
        backup.residents[0].subscriptionRates
    );
});

test('JSON backup rejects malformed or duplicate subscription rate history', () => {
    const app = loadCrudHelpers();
    const base = {
        residents: [{ id: 'resident-1', name: 'Test', apartmentNumber: 'A1', monthlyAmount: 100 }],
        income: [], expenses: [], notices: []
    };
    const invalidRates = [
        [{ effectiveMonth: '2026-13-01', monthlyAmount: 100 }],
        [{ effectiveMonth: '2026-02-15', monthlyAmount: 100 }],
        [{ effectiveMonth: '2026-02-01', monthlyAmount: -1 }],
        [{ effectiveMonth: '2026-02-01', monthlyAmount: 100 }, { effectiveMonth: '2026-02-01', monthlyAmount: 120 }],
        'not-an-array'
    ];
    for (const subscriptionRates of invalidRates) {
        const backup = structuredClone(base);
        backup.residents[0].subscriptionRates = subscriptionRates;
        assert.equal(app.isValidBackup(backup), false, JSON.stringify(subscriptionRates));
    }
});

test('JSON backup rejects duplicate resident IDs, apartment numbers, and transaction IDs', () => {
    const app = loadCrudHelpers();
    const duplicateResidents = {
        residents: [
            { id: 'r1', name: 'A', apartmentNumber: 'A1', monthlyAmount: 100 },
            { id: 'r1', name: 'B', apartmentNumber: 'B1', monthlyAmount: 100 }
        ], income: [], expenses: [], notices: []
    };
    assert.equal(app.isValidBackup(duplicateResidents), false);

    const duplicateApartments = {
        residents: [
            { id: 'r1', name: 'A', apartmentNumber: ' A1 ', monthlyAmount: 100 },
            { id: 'r2', name: 'B', apartmentNumber: 'a1', monthlyAmount: 100 }
        ], income: [], expenses: [], notices: []
    };
    assert.equal(app.isValidBackup(duplicateApartments), false);

    const duplicateIncome = {
        residents: [{ id: 'r1', name: 'A', apartmentNumber: 'A1', monthlyAmount: 100 }],
        income: [
            { id: 'i1', residentId: 'r1', month: 'يناير 2026', amount: 50 },
            { id: 'i1', residentId: 'r1', month: 'يناير 2026', amount: 50 }
        ], expenses: [], notices: []
    };
    assert.equal(app.isValidBackup(duplicateIncome), false);
});
