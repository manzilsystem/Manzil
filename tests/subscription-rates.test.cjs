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
