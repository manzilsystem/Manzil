const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'UTC';

// توقعات الخزنة (#646): حسابات خط الأساس والتوقع بالقرش، بلا DOM.
// تثبت أن مرجع «now» الموثّق يُحترم فعلًا، وأن نسبة التحصيل تُحسب على
// أشهر المستحق فقط وبحد أقصى 100%، وأن متوسط المصروفات على الأشهر الستة
// كلها، وأن أول شهر عجز هو أول شهر متوقع يقفل برصيد سالب.
const stateSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');
const reportsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const extendedSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-extended.js'), 'utf8');
const insightsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-insights.js'), 'utf8');
const forecastSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-cashbox-forecast.js'), 'utf8');

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
    const sandbox = {
        Date,
        console,
        setTimeout: () => {},
        document: domStub(),
        window: {},
        localStorage: { getItem: () => null, setItem: () => {} },
        sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        HTMLSelectElement: class HTMLSelectElement {},
        requireManager: () => true
    };
    const api = vm.runInNewContext(
        `${stateSource}\n${reportsSource}\n${extendedSource}\n${insightsSource}\n${forecastSource}\n({
            state, monthLabelToKey, monthKeyToLabel, buildCashboxForecastReport
        })`,
        sandbox,
        { filename: 'cashbox-forecast.js' }
    );
    return { api, sandbox };
}

function seedTwoResidents(state) {
    state.residents = [
        { id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z' },
        { id: 'r2', name: 'سارة', apartmentNumber: '5', monthlyAmount: 200, createdAt: '2024-01-01T00:00:00.000Z' }
    ];
    state.income = [];
    state.expenses = [];
    state.adjustments = [];
    state.cashAccountBalances = { main: 0, development: 0, emergency: 0 };
}

function subscription(id, month, amount) {
    return { id, residentId: 'r1', month, amount, purposeCode: 'subscription', paymentMethod: 'cash', date: '2026-01-05' };
}

test('the documented now reference drives the baseline window', () => {
    const { api } = load();
    seedTwoResidents(api.state);
    const june = api.buildCashboxForecastReport(3, new Date(2026, 5, 15));
    const march = api.buildCashboxForecastReport(3, new Date(2026, 2, 15));
    assert.equal(june.baseline[0].key, '2025-12-01');
    assert.equal(june.baseline[5].key, '2026-05-01');
    assert.equal(march.baseline[0].key, '2025-09-01');
    assert.equal(march.baseline[5].key, '2026-02-01');
    assert.equal(june.projections[0].key, '2026-07-01', 'projections start the month after the current one');
});

test('baseline averages: rate capped at 100%, only subscription income counts, expenses averaged over all six months', () => {
    const { api } = load();
    seedTwoResidents(api.state);
    api.state.income = [
        subscription('i1', 'ديسمبر 2025', 300), // نسبة 100%
        subscription('i2', 'يناير 2026', 150),  // نسبة 50%
        subscription('i3', 'فبراير 2026', 600), // تتجاوز المستحق: تُحسب 100% فقط
        subscription('i4', 'أبريل 2026', 300),  // نسبة 100%
        subscription('i5', 'مايو 2026', 240),   // نسبة 80%
        // مارس بلا تحصيل: نسبة 0%
        // إيرادات ليست اشتراكًا لا تدخل في نسبة التحصيل أبدًا:
        { id: 'i6', residentId: 'r1', month: 'ديسمبر 2025', amount: 1000, purposeCode: 'other', paymentMethod: 'cash', date: '2025-12-05' },
        { id: 'i7', residentId: 'r2', month: 'يناير 2026', amount: 200, purposeCode: 'settlement', settlementAdjustmentId: 'adj9', paymentMethod: 'cash', date: '2026-01-05' }
    ];
    api.state.expenses = [
        { id: 'e1', month: 'أبريل 2026', title: 'كهرباء', amount: 60, category: 'مرافق' },
        { id: 'e2', month: 'مايو 2026', title: 'مياه', amount: 30, category: 'مرافق' }
    ];
    api.state.cashAccountBalances.main = 5000;

    const report = api.buildCashboxForecastReport(3, new Date(2026, 5, 15));
    assert.equal(report.baselineMonths, 6);
    assert.equal(report.baseline[2].rate, 1, 'February overpayment is capped at 100%');
    assert.equal(report.baseline[3].rate, 0, 'March without collection rates 0%');
    assert.ok(Math.abs(report.avgRate - (1 + 0.5 + 1 + 0 + 1 + 0.8) / 6) < 1e-9, 'avg rate over the six months');
    assert.equal(report.avgExpenseCents, 1500, '90 EGP over six months');
    assert.equal(report.startBalanceCents, 500000);

    // المستحق القادم 300 جنيهًا؛ المتوقع 300 × (4.3/6) = 215 بالضبط.
    const june = report.projections[0];
    assert.equal(june.dueCents, 30000);
    assert.equal(june.expectedPaidCents, 21500);
    assert.equal(june.expectedExpenseCents, 1500);
    assert.equal(june.netCents, 20000);
    assert.equal(june.balanceCents, 520000);
    assert.equal(report.endBalanceCents, 560000);
    assert.equal(report.firstDeficitLabel, null);
});

test('first deficit month is the first projected month closing negative', () => {
    const { api } = load();
    seedTwoResidents(api.state);
    api.state.income = [
        subscription('i1', 'ديسمبر 2025', 300),
        subscription('i2', 'يناير 2026', 150),
        subscription('i3', 'فبراير 2026', 600),
        subscription('i4', 'أبريل 2026', 300),
        subscription('i5', 'مايو 2026', 240)
    ];
    // متوسط مصروفات 250 جنيهًا: الصافي الشهري المتوقع 215 - 250 = -35.
    api.state.expenses = [{ id: 'e1', month: 'أبريل 2026', title: 'مصعد', amount: 1500, category: 'صيانة' }];
    api.state.cashAccountBalances.main = 50;

    const report = api.buildCashboxForecastReport(3, new Date(2026, 5, 15));
    assert.equal(report.avgExpenseCents, 25000);
    assert.equal(report.projections[0].balanceCents, 5000 + 21500 - 25000, 'July still positive');
    assert.equal(report.projections[1].balanceCents, 5000 + 2 * (21500 - 25000), 'August negative');
    assert.equal(report.firstDeficitLabel, 'أغسطس 2026');
    assert.equal(report.endBalanceCents, 5000 + 3 * (21500 - 25000));
});

test('months without any due are excluded from the rate average but keep their expenses', () => {
    const { api } = load();
    api.state.residents = [
        { id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, billingStartMonth: '2026-04-01' }
    ];
    api.state.income = [
        subscription('i1', 'أبريل 2026', 100),
        subscription('i2', 'مايو 2026', 50)
    ];
    api.state.expenses = [{ id: 'e1', month: 'ديسمبر 2025', title: 'تأسيس', amount: 60, category: 'أخرى' }];
    api.state.adjustments = [];
    api.state.cashAccountBalances = { main: 0, development: 0, emergency: 0 };

    const report = api.buildCashboxForecastReport(3, new Date(2026, 5, 15));
    assert.equal(report.baselineMonths, 2, 'only April and May had dues');
    assert.equal(report.baseline[0].rate, null, 'December had no due');
    assert.ok(Math.abs(report.avgRate - 0.75) < 1e-9, 'average over the two judged months only');
    assert.equal(report.avgExpenseCents, 1000, '60 EGP spread over all six months');
});

test('without any judged month the report never guesses a rate', () => {
    const { api } = load();
    api.state.residents = [];
    api.state.income = [];
    api.state.expenses = [{ id: 'e1', month: 'يناير 2026', title: 'حراسة', amount: 120, category: 'أمن' }];
    api.state.adjustments = [];
    api.state.cashAccountBalances = { main: 600, development: 0, emergency: 0 };

    const report = api.buildCashboxForecastReport(3, new Date(2026, 5, 15));
    assert.equal(report.baselineMonths, 0);
    assert.equal(report.avgRate, null);
    assert.equal(report.projections[0].expectedPaidCents, 0, 'no guessed collection');
    assert.equal(report.avgExpenseCents, 2000);
    assert.equal(report.endBalanceCents, 60000 - 3 * 2000, 'balance only drains by average expenses');
});

test('horizon honors 3 or 6 months and falls back to 3', () => {
    const { api } = load();
    seedTwoResidents(api.state);
    assert.equal(api.buildCashboxForecastReport(6, new Date(2026, 5, 15)).projections.length, 6);
    assert.equal(api.buildCashboxForecastReport('junk', new Date(2026, 5, 15)).projections.length, 3);
    assert.equal(api.buildCashboxForecastReport(undefined, new Date(2026, 5, 15)).horizon, 3);
});

test('baseline and projections roll over the year boundary', () => {
    const { api } = load();
    seedTwoResidents(api.state);
    const report = api.buildCashboxForecastReport(3, new Date(2027, 0, 10));
    assert.equal(report.baseline[0].key, '2026-07-01');
    assert.equal(report.baseline[5].key, '2026-12-01');
    assert.equal(report.projections[0].key, '2027-02-01');
    assert.equal(report.projections[0].label, 'فبراير 2027');
});
