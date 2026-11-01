const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'UTC';
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');
const fixedNow = new Date('2024-05-15T12:00:00.000Z');

class FixedDate extends Date {
    constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
    }

    static now() {
        return fixedNow.getTime();
    }
}

function loadCalculators() {
    const sandbox = { Date: FixedDate };
    return vm.runInNewContext(
        `${source}\n({ state, getPaidAmountForMonth, getMonthOutstanding, calculateCumulativeDebt, buildArrearsReport, getArrearsBucket })`,
        sandbox,
        { filename: 'js/state.js' }
    );
}

test('generateId returns a valid UUID v4 when randomUUID is unavailable', () => {
    const cryptoMock = {
        getRandomValues(bytes) {
            bytes.fill(0);
            return bytes;
        },
    };
    const generateId = vm.runInNewContext(
        `${source}\ngenerateId`,
        { crypto: cryptoMock, Uint8Array, Math },
        { filename: 'js/state.js' }
    );

    assert.match(generateId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('getPaidAmountForMonth totals only matching positive finite payments', () => {
    const app = loadCalculators();
    app.state.income = [
        { residentId: 'a', month: 'يناير 2024', amount: 30 },
        { residentId: 'a', month: 'يناير 2024', amount: '20' },
        { residentId: 'a', month: 'فبراير 2024', amount: 50 },
        { residentId: 'b', month: 'يناير 2024', amount: 70 },
        { residentId: 'a', month: 'يناير 2024', amount: -5 },
        { residentId: 'a', month: 'يناير 2024', amount: 'invalid' },
    ];

    assert.equal(app.getPaidAmountForMonth('a', 'يناير 2024'), 50);
});

test('getMonthOutstanding supports partial payments and never returns negative debt', () => {
    const app = loadCalculators();
    app.state.defaultSubscription = 100;
    app.state.income = [
        { residentId: 'a', month: 'يناير 2024', amount: 40 },
        { residentId: 'a', month: 'فبراير 2024', amount: 120 },
    ];

    assert.equal(app.getMonthOutstanding({ id: 'a' }, 'يناير 2024'), 60);
    assert.equal(app.getMonthOutstanding({ id: 'a', monthlyAmount: 100 }, 'فبراير 2024'), 0);
    assert.equal(app.getMonthOutstanding(null, 'يناير 2024'), 0);
});

test('arrears calculations preserve two-decimal currency precision', () => {
    const app = loadCalculators();
    app.state.residents = [
        { id: 'a', createdAt: '2024-05-01T00:00:00.000Z', monthlyAmount: 0.3 },
        { id: 'b', createdAt: '2024-05-01T00:00:00.000Z', monthlyAmount: 0.2 },
    ];
    app.state.income = [
        { residentId: 'a', month: 'مايو 2024', amount: 0.1 },
        { residentId: 'a', month: 'مايو 2024', amount: 0.1 },
    ];

    assert.equal(app.getPaidAmountForMonth('a', 'مايو 2024'), 0.2);
    assert.equal(app.getMonthOutstanding(app.state.residents[0], 'مايو 2024'), 0.1);
    assert.equal(app.calculateCumulativeDebt('a').totalDebt, 0.1);
    assert.equal(app.buildArrearsReport().totalDebt, 0.3);
});

test('calculateCumulativeDebt lists only unpaid months and sums partial balances', () => {
    const app = loadCalculators();
    app.state.residents = [{ id: 'a', createdAt: '2024-01-01T00:00:00.000Z', monthlyAmount: 100 }];
    app.state.income = [
        { residentId: 'a', month: 'يناير 2024', amount: 100 },
        { residentId: 'a', month: 'فبراير 2024', amount: 40 },
        { residentId: 'a', month: 'أبريل 2024', amount: 100 },
    ];

    assert.deepEqual(
        JSON.parse(JSON.stringify(app.calculateCumulativeDebt('a'))),
        {
            count: 3,
            totalDebt: 260,
            unpaidMonths: ['فبراير 2024', 'مارس 2024', 'مايو 2024'],
        }
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(app.calculateCumulativeDebt('unknown'))),
        { count: 0, totalDebt: 0, unpaidMonths: [] }
    );
});

test('getArrearsBucket groups month counts at the documented boundaries', () => {
    const app = loadCalculators();

    assert.equal(app.getArrearsBucket(1), 'شهر واحد');
    assert.equal(app.getArrearsBucket(2), '2–3 أشهر');
    assert.equal(app.getArrearsBucket(3), '2–3 أشهر');
    assert.equal(app.getArrearsBucket(4), '4 أشهر فأكثر');
});
