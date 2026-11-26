const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'UTC';
const stateSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');
const fixedNow = new Date('2024-05-15T12:00:00.000Z');
class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow.getTime(); }
}
function load() {
    return vm.runInNewContext(
        `${stateSource}\n({ state, monthLabelToKey, monthKeyToLabel, getMonthOutstanding, getPaidAmountForMonth, calculateIncomeAllocationPreview, calculateCumulativeDebt })`,
        { Date: FixedDate },
        { filename: 'allocation-invariants.js' }
    );
}

// Deterministic PRNG (mulberry32) so failures reproduce exactly.
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

function randomState(app, rand) {
    const startKey = `2024-${String(1 + Math.floor(rand() * 3)).padStart(2, '0')}-01`;
    const rates = [];
    let amount = [0, 50, 100, 150, 200][Math.floor(rand() * 5)];
    const rateCount = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < rateCount; i += 1) {
        rates.push({ effectiveMonth: shiftKey(startKey, i * 2), monthlyAmount: amount });
        amount += [0, 0, 25, 50][Math.floor(rand() * 4)];
    }
    app.state.residents = [{
        id: 'r1', name: 'r1', apartmentNumber: '1',
        createdAt: `${startKey}T00:00:00.000Z`,
        billingStartMonth: rand() < 0.5 ? startKey : null,
        monthlyAmount: rates[0].monthlyAmount,
        subscriptionRates: rates
    }];
    app.state.income = [];
    app.state.expenses = [];
    app.state.adjustments = [];
    // Random pre-existing payments on random months.
    const paymentCount = Math.floor(rand() * 6);
    for (let i = 0; i < paymentCount; i += 1) {
        const key = shiftKey(startKey, Math.floor(rand() * 6));
        app.state.income.push({
            id: `p${i}`, residentId: 'r1', month: label(key),
            amount: Math.floor(rand() * 150), purposeCode: 'subscription',
            date: `${key}T12:00:00.000Z`
        });
    }
    // Random waiver/discount adjustments.
    const adjustmentCount = Math.floor(rand() * 3);
    for (let i = 0; i < adjustmentCount; i += 1) {
        const key = shiftKey(startKey, Math.floor(rand() * 6));
        app.state.adjustments.push({
            id: `a${i}`, residentId: 'r1', effectiveMonth: key,
            kind: ['waiver', 'discount'][Math.floor(rand() * 2)],
            amount: Math.floor(rand() * 60)
        });
    }
    return startKey;
}

test('allocation never exceeds a month outstanding, the paid amount, or double-books a month (policy fuzz)', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
        const rand = rng(seed);
        const app = load();
        const startKey = randomState(app, rand);
        const resident = app.state.residents[0];
        const policies = ['oldest_first', 'selected_month_first'];
        for (const policy of policies) {
            const selectedOffset = Math.floor(rand() * 8);
            const selectedMonth = label(shiftKey(startKey, selectedOffset));
            const amount = 1 + Math.floor(rand() * 3000);
            const result = app.calculateIncomeAllocationPreview('r1', amount, selectedMonth, 120, policy);
            if (result.invalid) continue;
            const perMonth = new Map();
            for (const item of result.allocations) {
                assert.ok(item.amountCents > 0, `zero allocation (seed ${seed}, ${policy})`);
                perMonth.set(item.month, (perMonth.get(item.month) || 0) + item.amountCents);
            }
            let totalCents = 0;
            for (const [month, cents] of perMonth) {
                const outstandingCents = Math.round(app.getMonthOutstanding(resident, month) * 100);
                assert.ok(
                    cents <= outstandingCents,
                    `month ${month} over-allocated: ${cents} > outstanding ${outstandingCents} (seed ${seed}, ${policy}, amount ${amount})`
                );
                totalCents += cents;
            }
            assert.ok(
                totalCents <= Math.round(amount * 100),
                `allocated ${totalCents} beyond the paid amount (seed ${seed}, ${policy})`
            );
            assert.equal(result.remainingCents, Math.round(amount * 100) - totalCents);
        }
    }
});

test('selected-months allocation respects the same invariants', () => {
    for (let seed = 100; seed <= 140; seed += 1) {
        const rand = rng(seed);
        const app = load();
        const startKey = randomState(app, rand);
        const resident = app.state.residents[0];
        const selected = [];
        const pickCount = 1 + Math.floor(rand() * 3);
        for (let i = 0; i < pickCount; i += 1) {
            const key = shiftKey(startKey, Math.floor(rand() * 8));
            const month = label(key);
            if (!selected.includes(month)) selected.push(month);
        }
        const amount = 1 + Math.floor(rand() * 3000);
        const result = app.calculateIncomeAllocationPreview('r1', amount, selected[0], 120, '', selected);
        if (result.invalid) continue;
        const perMonth = new Map();
        for (const item of result.allocations) {
            perMonth.set(item.month, (perMonth.get(item.month) || 0) + item.amountCents);
        }
        let totalCents = 0;
        for (const [month, cents] of perMonth) {
            const outstandingCents = Math.round(app.getMonthOutstanding(resident, month) * 100);
            assert.ok(
                cents <= outstandingCents,
                `month ${month} over-allocated: ${cents} > outstanding ${outstandingCents} (seed ${seed}, selected ${selected})`
            );
            totalCents += cents;
        }
        assert.ok(totalCents <= Math.round(amount * 100));
        assert.equal(result.remainingCents, Math.round(amount * 100) - totalCents);
    }
});

test('every allocation lands on a month at or after the billing start', () => {
    for (let seed = 200; seed <= 230; seed += 1) {
        const rand = rng(seed);
        const app = load();
        const startKey = randomState(app, rand);
        const amount = 1 + Math.floor(rand() * 2000);
        const result = app.calculateIncomeAllocationPreview('r1', amount, label(shiftKey(startKey, 2)));
        if (result.invalid) continue;
        for (const item of result.allocations) {
            const key = app.monthLabelToKey(item.month);
            assert.ok(key >= startKey, `allocated before billing start: ${key} < ${startKey} (seed ${seed})`);
        }
    }
});

test('cumulative debt equals the sum of per-month outstanding over billed overdue months', () => {
    for (let seed = 300; seed <= 330; seed += 1) {
        const rand = rng(seed);
        const app = load();
        const startKey = randomState(app, rand);
        const resident = app.state.residents[0];
        const debt = app.calculateCumulativeDebt('r1');
        let expectedCents = 0;
        for (let key = startKey; key <= '2024-05-01'; key = shiftKey(key, 1)) {
            expectedCents += Math.round(app.getMonthOutstanding(resident, label(key)) * 100);
        }
        // All months in the range end before or within the current fixed month (due day 1 passed).
        assert.equal(Math.round(debt.totalDebt * 100), expectedCents, `debt mismatch (seed ${seed})`);
    }
});
