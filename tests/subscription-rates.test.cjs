const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'UTC';
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
function loadCrudHelpers() {
    return vm.runInNewContext(
        `${crudSource}\n({ isValidEffectiveMonth, isValidBackup })`,
        {},
        { filename: 'js/crud.js' }
    );
}

test('effective subscription month accepts YYYY-MM and rejects invalid months', () => {
    const app = loadCrudHelpers();
    assert.equal(app.isValidEffectiveMonth('2026-11'), true);
    assert.equal(app.isValidEffectiveMonth('2024-02'), true);
    for (const value of ['2026-00', '2026-13', '2026-1', '26-11', '2026-11-01', '', null]) {
        assert.equal(app.isValidEffectiveMonth(value), false, String(value));
    }
});

test('JSON backup validation accepts all supported application themes', () => {
    const app = loadCrudHelpers();
    for (const currentTheme of ['dark', 'light', 'emerald', 'ocean', 'sand']) {
        assert.equal(app.isValidBackup({
            residents: [],
            income: [],
            expenses: [],
            notices: [],
            currentTheme
        }), true, currentTheme);
    }
});
