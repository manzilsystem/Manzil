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
function domStub() {
    return {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        createElement: () => ({ style: {}, classList: { add: () => {} }, setAttribute: () => {}, appendChild: () => {} }),
        body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
        head: { appendChild: () => {} },
        documentElement: { style: { setProperty: () => {} }, setAttribute: () => {}, dir: 'rtl', lang: 'ar' }
    };
}
function load() {
    return vm.runInNewContext(
        `${stateSource}\n${reportsSource}\n({ state, monthLabelToKey, monthKeyToLabel, getMonthOutstanding, getMonthlyBillingTotals, calculateCumulativeDebt, buildArrearsReport, buildPeriodReport, buildResidentStatement, clearReportModelCache })`,
        {
            Date: FixedDate,
            console,
            document: domStub(),
            window: {},
            localStorage: { getItem: () => null, setItem: () => {} },
            HTMLSelectElement: class HTMLSelectElement {},
            getCashAccountLabel: code => ({ main: 'الخزنة الرئيسية', development: 'صندوق التطوير', emergency: 'صندوق الطوارئ' }[code || 'main']),
            requireManager: () => true,
            sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
        },
        { filename: 'report-consistency-fuzz.js' }
    );
}

function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
function label(key) {
    const [year, month] = key.split('-').map(Number);
    return `${AR_MONTHS[month - 1]} ${year}`;
}
function shiftKey(key, offset) {
    const [year, month] = key.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1 + offset, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

// A small building: 1-4 residents with random rates, payments and adjustments.
function randomBuilding(app, rand) {
    app.state.residents = [];
    app.state.income = [];
    app.state.expenses = [];
    app.state.adjustments = [];
    app.state.defaultSubscription = 0;
    const residentCount = 1 + Math.floor(rand() * 4);
    for (let r = 0; r < residentCount; r += 1) {
        const startKey = `2024-${String(1 + Math.floor(rand() * 4)).padStart(2, '0')}-01`;
        const rateAmount = [0, 50, 100, 150, 200][Math.floor(rand() * 5)];
        const useRates = rand() < 0.7;
        app.state.residents.push({
            id: `r${r}`, name: `r${r}`, apartmentNumber: String(r + 1),
            createdAt: `${startKey}T00:00:00.000Z`,
            billingStartMonth: rand() < 0.5 ? startKey : null,
            monthlyAmount: rateAmount,
            subscriptionRates: useRates ? [{ effectiveMonth: startKey, monthlyAmount: rateAmount }] : []
        });
        const paymentCount = Math.floor(rand() * 7);
        for (let i = 0; i < paymentCount; i += 1) {
            const key = shiftKey(startKey, Math.floor(rand() * 7));
            app.state.income.push({
                id: `p${r}_${i}`, residentId: `r${r}`, month: label(key),
                amount: Math.floor(rand() * 180), purposeCode: 'subscription',
                cashAccountCode: 'main', paymentMethod: 'cash',
                date: `${key}T12:00:00.000Z`
            });
        }
        const adjustmentCount = Math.floor(rand() * 3);
        for (let i = 0; i < adjustmentCount; i += 1) {
            const key = shiftKey(startKey, Math.floor(rand() * 6));
            app.state.adjustments.push({
                id: `a${r}_${i}`, residentId: `r${r}`, effectiveMonth: key,
                kind: ['waiver', 'discount'][Math.floor(rand() * 2)],
                amount: Math.floor(rand() * 60), reason: 'fuzz'
            });
        }
    }
}

test('arrears report totals equal the sum of per-resident cumulative debts', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
        const rand = rng(seed);
        const app = load();
        randomBuilding(app, rand);
        const report = app.buildArrearsReport();
        let expectedDebtCents = 0;
        let expectedMonths = 0;
        let expectedResidents = 0;
        for (const resident of app.state.residents) {
            const debt = app.calculateCumulativeDebt(resident.id);
            expectedDebtCents += Math.round(debt.totalDebt * 100);
            if (debt.count > 0) expectedResidents += 1;
            expectedMonths += debt.count;
        }
        assert.equal(Math.round(report.totalDebt * 100), expectedDebtCents, `totalDebt mismatch (seed ${seed})`);
        assert.equal(report.overdueResidents, expectedResidents, `overdueResidents mismatch (seed ${seed})`);
        assert.equal(report.overdueMonths, expectedMonths, `overdueMonths mismatch (seed ${seed})`);
        const bucketSum = report.buckets['شهر واحد'] + report.buckets['2–3 أشهر'] + report.buckets['4 أشهر فأكثر'];
        assert.equal(bucketSum, expectedResidents, `buckets do not add up (seed ${seed})`);
    }
});

test('period report outstanding equals per-month billing outstanding summed over residents', () => {
    for (let seed = 100; seed <= 130; seed += 1) {
        const rand = rng(seed);
        const app = load();
        randomBuilding(app, rand);
        const report = app.buildPeriodReport('يناير 2024', 'مايو 2024');
        assert.ok(report, `period report missing (seed ${seed})`);
        for (const row of report.months) {
            const billing = app.getMonthlyBillingTotals(row.month);
            assert.equal(row.expectedCents, billing.expectedCents, `expected mismatch ${row.month} (seed ${seed})`);
            assert.equal(row.outstandingCents, billing.outstandingCents, `outstanding mismatch ${row.month} (seed ${seed})`);
            assert.equal(row.adjustmentCents, billing.adjustmentCents, `adjustment mismatch ${row.month} (seed ${seed})`);
            // Total income equals the cents sum of that month's rows.
            const incomeCents = app.state.income
                .filter(item => item.month === row.month)
                .reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
            assert.equal(row.totalIncomeCents, incomeCents, `income mismatch ${row.month} (seed ${seed})`);
        }
        // Totals row equals the sum of month rows.
        const sum = field => report.months.reduce((acc, row) => acc + row[field], 0);
        assert.equal(report.totals.expectedCents, sum('expectedCents'), `totals.expected (seed ${seed})`);
        assert.equal(report.totals.outstandingCents, sum('outstandingCents'), `totals.outstanding (seed ${seed})`);
        assert.equal(report.totals.totalIncomeCents, sum('totalIncomeCents'), `totals.income (seed ${seed})`);
        assert.equal(report.totals.collectedCents, sum('collectedCents'), `totals.collected (seed ${seed})`);
        assert.equal(report.totals.netCents, report.totals.totalIncomeCents - report.totals.expenseCents, `net (seed ${seed})`);
    }
});

test('resident statement remaining equals per-month outstanding, and paid equals subscription payments', () => {
    for (let seed = 200; seed <= 230; seed += 1) {
        const rand = rng(seed);
        const app = load();
        randomBuilding(app, rand);
        for (const resident of app.state.residents) {
            app.clearReportModelCache();
            const statement = app.buildResidentStatement(resident.id);
            if (!statement) continue;
            let expectedRemainingCents = 0;
            for (const row of statement.months) {
                // Future months are not billed yet: the statement shows zero due/remaining for them,
                // while getMonthOutstanding returns the would-be outstanding. Past/current rows must match.
                const rowKey = app.monthLabelToKey(row.month);
                const expectedRow = rowKey > '2024-05-01' ? 0 : Math.round(app.getMonthOutstanding(resident, row.month) * 100);
                assert.equal(row.remainingCents, expectedRow, `row remaining mismatch ${resident.id} ${row.month} (seed ${seed})`);
                expectedRemainingCents += row.remainingCents;
            }
            assert.equal(
                statement.totals.remainingCents,
                expectedRemainingCents,
                `statement remaining mismatch for ${resident.id} (seed ${seed})`
            );
            const paidCents = app.state.income
                .filter(item => item.residentId === resident.id)
                .reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
            assert.equal(statement.totals.filteredPaidCents, paidCents, `statement paid mismatch for ${resident.id} (seed ${seed})`);
            // Monthly paid column matches the raw positive subscription payments of that month.
            for (const row of statement.months) {
                const monthPaid = app.state.income
                    .filter(item => item.residentId === resident.id && item.month === row.month && Number(item.amount) > 0)
                    .reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
                assert.equal(row.paidCents, monthPaid, `row paid mismatch ${resident.id} ${row.month} (seed ${seed})`);
            }
        }
    }
});
