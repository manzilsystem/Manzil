const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'UTC';
const stateSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');
const crudSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');
const fixedNow = new Date('2024-05-15T12:00:00.000Z');
class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow.getTime(); }
}
function load() {
    return vm.runInNewContext(
        `${stateSource}\n${crudSource}\n({ state, calculateIncomeAllocationPreview })`,
        { Date: FixedDate },
        { filename: 'advance-payment-allocation.js' }
    );
}
function resident(id, createdAt = '2024-01-01T00:00:00.000Z', rates = [{ effectiveMonth: '2024-01-01', monthlyAmount: 100 }]) {
    return { id, name: id, apartmentNumber: id, createdAt, monthlyAmount: 100, subscriptionRates: rates };
}

test('advance payment clears oldest arrears before allocating to the selected and future months', () => {
    const app = load();
    app.state.residents = [resident('r1')];
    app.state.income = [
        { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 50 },
        { id: 'i2', residentId: 'r1', month: 'فبراير 2024', amount: 100 }
    ];
    const result = app.calculateIncomeAllocationPreview('r1', 150, 'مايو 2024');
    assert.deepEqual(
        JSON.parse(JSON.stringify(result.allocations)),
        [
            { month: 'يناير 2024', amount: 50, amountCents: 5000 },
            { month: 'مارس 2024', amount: 100, amountCents: 10000 }
        ]
    );
    assert.equal(result.remainingCents, 0);
});

test('advance payment allocates excess across future months without exceeding each month due', () => {
    const app = load();
    app.state.residents = [resident('r1', '2024-05-01T00:00:00.000Z')];
    const result = app.calculateIncomeAllocationPreview('r1', 250, 'مايو 2024');
    assert.deepEqual(
        JSON.parse(JSON.stringify(result.allocations)),
        [
            { month: 'مايو 2024', amount: 100, amountCents: 10000 },
            { month: 'يونيو 2024', amount: 100, amountCents: 10000 },
            { month: 'يوليو 2024', amount: 50, amountCents: 5000 }
        ]
    );
    assert.equal(result.totalAllocated, 250);
    assert.equal(result.remainingAmount, 0);
});

test('advance allocations use the effective subscription amount for each month', () => {
    const app = load();
    app.state.residents = [resident('r1', '2024-01-01T00:00:00.000Z', [
        { effectiveMonth: '2024-01-01', monthlyAmount: 100 },
        { effectiveMonth: '2024-03-01', monthlyAmount: 150 }
    ])];
    const result = app.calculateIncomeAllocationPreview('r1', 350, 'مايو 2024');
    assert.deepEqual(
        JSON.parse(JSON.stringify(result.allocations.map(item => [item.month, item.amount]))),
        [['يناير 2024', 100], ['فبراير 2024', 100], ['مارس 2024', 150]]
    );
});

test('allocation rejects an amount that exceeds the supported future horizon instead of dropping the remainder', () => {
    const app = load();
    app.state.residents = [resident('r1', '2024-05-01T00:00:00.000Z')];
    const result = app.calculateIncomeAllocationPreview('r1', 500000, 'مايو 2024');
    assert.equal(result.horizonExceeded, true);
    assert.ok(result.remainingCents > 0);
});

test('allocation rejects the previous UTC month when the apartment was created after Cairo local midnight', () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = 'Africa/Cairo';
    try {
        const app = load();
        const apartment = resident('r1', '2026-10-31T22:30:00.000Z');
        app.state.residents = [apartment];

        const result = app.calculateIncomeAllocationPreview('r1', 100, 'أكتوبر 2026');

        assert.equal(new Date(apartment.createdAt).getUTCMonth(), 9);
        assert.equal(new Date(apartment.createdAt).getMonth(), 10);
        assert.equal(result.invalidStart, true);
        assert.equal(result.allocations.length, 0);
    } finally {
        process.env.TZ = previousTimezone;
    }
});

test('allocation rejects a starting month before the apartment creation date', () => {
    const app = load();
    app.state.residents = [resident('r1', '2024-05-01T00:00:00.000Z')];
    const result = app.calculateIncomeAllocationPreview('r1', 100, 'أبريل 2024');
    assert.equal(result.invalidStart, true);
});

test('income form previews the split and saves separate month allocations with one shared reference', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /id="incomeAllocationPreview"/);
    assert.match(html, /onchange="previewIncomeAllocation\(\)"/);
    assert.match(crudSource, /calculateIncomeAllocationPreview\(residentId, amount, month, 120(?:, policyOverride)?\)/);
    assert.ok(crudSource.includes('دفعة موزعة ${paymentReference}'));
    assert.match(crudSource, /if \(!requireManager\(\) \|\| incomeSaving\) return/);
});
