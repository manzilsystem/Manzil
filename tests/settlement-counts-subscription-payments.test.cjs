const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'UTC';
const stateSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');
const reportsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const fixedNow = new Date('2024-05-15T12:00:00.000Z');
class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow.getTime(); }
}
function load() {
    return vm.runInNewContext(
        `${stateSource}\n${reportsSource}\n({ state, getMonthlyDuePaidAmount, getMonthOutstanding, getSettlementRemainingAmount, getSettlementPaidAmount, buildResidentStatement, clearReportModelCache })`,
        {
            Date: FixedDate,
            console,
            document: {
                getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                addEventListener: () => {},
                createElement: () => ({ style: {}, classList: { add: () => {} }, setAttribute: () => {}, appendChild: () => {} }),
                body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
                head: { appendChild: () => {} },
                documentElement: { style: { setProperty: () => {} }, setAttribute: () => {}, dir: 'rtl', lang: 'ar' }
            },
            window: {},
            localStorage: { getItem: () => null, setItem: () => {} },
            sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
            HTMLSelectElement: class HTMLSelectElement {},
            getCashAccountLabel: () => 'الخزنة',
            requireManager: () => true
        },
        { filename: 'settlement-counts-subscription-payments.js' }
    );
}

function seedBuilding(app, { subscriptionPaid = 0, settlementPaid = 0, agreement = 60 }) {
    app.state.residents = [{
        id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100,
        createdAt: '2024-01-01T00:00:00.000Z',
        subscriptionRates: [{ effectiveMonth: '2024-01-01', monthlyAmount: 100 }]
    }];
    app.state.adjustments = [{
        id: 's1', residentId: 'r1', effectiveMonth: '2024-02-01',
        kind: 'settlement', amount: agreement, reason: 'ظروف'
    }];
    app.state.income = [];
    if (subscriptionPaid > 0) {
        app.state.income.push({
            id: 'sub1', residentId: 'r1', month: 'فبراير 2024', amount: subscriptionPaid,
            purposeCode: 'subscription', cashAccountCode: 'main', paymentMethod: 'cash',
            date: '2024-02-01T12:00:00.000Z'
        });
    }
    if (settlementPaid > 0) {
        app.state.income.push({
            id: 'set1', residentId: 'r1', month: 'فبراير 2024', amount: settlementPaid,
            purposeCode: 'settlement', settlementAdjustmentId: 's1', cashAccountCode: 'main',
            paymentMethod: 'cash', date: '2024-02-02T12:00:00.000Z'
        });
    }
    return app.state.adjustments[0];
}

test('subscription paid before the settlement counts against the settled due', () => {
    const app = load();
    const settlement = seedBuilding(app, { subscriptionPaid: 30 });
    assert.equal(app.getMonthlyDuePaidAmount('r1', 'فبراير 2024'), 30);
    assert.equal(app.getMonthOutstanding(app.state.residents[0], 'فبراير 2024'), 30);
    assert.equal(app.getSettlementRemainingAmount(settlement), 30);
});

test('subscription plus settlement payments close the settled month exactly', () => {
    const app = load();
    const settlement = seedBuilding(app, { subscriptionPaid: 30, settlementPaid: 30 });
    assert.equal(app.getMonthlyDuePaidAmount('r1', 'فبراير 2024'), 60);
    assert.equal(app.getMonthOutstanding(app.state.residents[0], 'فبراير 2024'), 0);
    assert.equal(app.getSettlementRemainingAmount(settlement), 0);
});

test('combined payments above the agreement never go negative', () => {
    const app = load();
    const settlement = seedBuilding(app, { subscriptionPaid: 50, settlementPaid: 60 });
    assert.equal(app.getMonthOutstanding(app.state.residents[0], 'فبراير 2024'), 0);
    assert.equal(app.getSettlementRemainingAmount(settlement), 0);
});

test('a subscription payment that alone exceeds the agreement fully settles the month', () => {
    const app = load();
    const settlement = seedBuilding(app, { subscriptionPaid: 80 });
    assert.equal(app.getMonthOutstanding(app.state.residents[0], 'فبراير 2024'), 0);
    assert.equal(app.getSettlementRemainingAmount(settlement), 0);
    assert.equal(app.getSettlementPaidAmount('s1'), 0);
});

test('the resident statement counts both payment kinds on the settled month', () => {
    const app = load();
    seedBuilding(app, { subscriptionPaid: 30, settlementPaid: 20 });
    const statement = app.buildResidentStatement('r1');
    const february = statement.months.find(row => row.month === 'فبراير 2024');
    assert.equal(february.netDueCents, 6000);
    assert.equal(february.paidCents, 5000);
    assert.equal(february.remainingCents, 1000);
});

test('property: outstanding and remaining stay consistent for random payment splits', () => {
    let a = 42;
    const rand = () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 60; i += 1) {
        const app = load();
        const agreement = 1 + Math.floor(rand() * 199);
        const subscriptionPaid = Math.floor(rand() * 250);
        const settlementPaid = Math.floor(rand() * 250);
        const settlement = seedBuilding(app, { agreement, subscriptionPaid, settlementPaid });
        const outstandingCents = Math.round(app.getMonthOutstanding(app.state.residents[0], 'فبراير 2024') * 100);
        const expectedCents = Math.max(0, agreement * 100 - subscriptionPaid * 100 - settlementPaid * 100);
        assert.equal(outstandingCents, expectedCents, `outstanding (case ${i})`);
        assert.equal(Math.round(app.getSettlementRemainingAmount(settlement) * 100), expectedCents, `remaining (case ${i})`);
        app.clearReportModelCache();
        const statement = app.buildResidentStatement('r1');
        const february = statement.months.find(row => row.month === 'فبراير 2024');
        assert.equal(february.remainingCents, expectedCents, `statement (case ${i})`);
        assert.ok(outstandingCents >= 0 && february.remainingCents >= 0);
    }
});
