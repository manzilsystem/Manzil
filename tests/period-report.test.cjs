const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const reports = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function toCents(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function monthLabelToKey(month) {
    const [name, year] = String(month || '').trim().split(/\s+/);
    const index = monthNames.indexOf(name);
    return index < 0 || !/^\d{4}$/.test(year || '') ? null : `${year}-${String(index + 1).padStart(2, '0')}-01`;
}

function makeGetPaidAmountForMonth(state) {
    return (residentId, month) => {
        const paidCents = (state.income || []).reduce((sum, payment) => {
            if (payment.residentId !== residentId || payment.month !== month) return sum;
            const amount = Number(payment.amount);
            return sum + (Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0);
        }, 0);
        return paidCents / 100;
    };
}

function getSubscriptionAmountForMonth(state, resident, month) {
    if (!resident) return 0;
    const monthKey = monthLabelToKey(month);
    const rates = Array.isArray(resident.subscriptionRates) ? resident.subscriptionRates : [];
    if (!monthKey || !rates.length) return Number(resident.monthlyAmount ?? state.defaultSubscription) || 0;
    const applicable = rates
        .filter(rate => /^\d{4}-\d{2}-01$/.test(rate.effectiveMonth) && rate.effectiveMonth <= monthKey)
        .sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
    return applicable.length
        ? Math.max(0, Number(applicable[applicable.length - 1].monthlyAmount) || 0)
        : 0;
}

const baseResident = {
    id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100,
    createdAt: '2024-01-01T00:00:00.000Z'
};

function loadReport(options = {}) {
    const elements = {
        periodReportPreset: { value: options.preset ?? '6' },
        periodReportFrom: { value: options.from ?? 'يناير 2024' },
        periodReportTo: { value: options.to ?? 'مارس 2024' },
        periodReportPreview: { innerHTML: '' },
        periodReportPrintBtn: { disabled: true },
        periodReportExportBtn: { disabled: true },
        printBuildingTitle: { textContent: '' },
        printBuildingMeta: { textContent: '' }
    };
    const state = {
        buildingName: 'عمارة النور',
        managerName: 'المدير',
        residents: [baseResident],
        income: [
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' },
            { id: 'i2', residentId: 'r1', month: 'فبراير 2024', amount: 40, paymentMethod: 'cash' }
        ],
        expenses: [{ id: 'e1', month: 'فبراير 2024', title: 'كهرباء', amount: 25, category: 'صيانة' }],
        ...options.state
    };
    const calls = { print: 0, toasts: [] };
    const getPaid = makeGetPaidAmountForMonth(state);
    const getSub = (resident, month) => getSubscriptionAmountForMonth(state, resident, month);
    const sandbox = {
        state,
        monthsNames: monthNames,
        getCurrentMonth: () => options.currentMonth || 'مارس 2024',
        monthLabelToKey,
        toCents,
        fmtNum: value => String(Number(value) || 0),
        fmtMoney: value => `${String(Number(value) || 0)} ج.م`,
        esc: value => String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character])),
        formatDate: () => '01/03/2024',
        getIncomePaymentMethodLabel: method => ({ cash: 'نقدًا' }[method] || 'غير محدد'),
        getPaidAmountForMonth: getPaid,
        getSubscriptionAmountForMonth: getSub,
        getMonthOutstanding: (resident, month) => {
            const dueCents = toCents(getSub(resident, month));
            const paidCents = toCents(getPaid(resident.id, month));
            return Math.max(0, dueCents - paidCents) / 100;
        },
        requireManager: () => true,
        toast: (message, kind) => calls.toasts.push(`${kind}:${message}`),
        setTimeout: () => {},
        Blob: class { constructor(parts, options) { sandbox.__blob = { parts, type: options && options.type }; } },
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }
    };
    const app = vm.runInNewContext(
        reports + '\n({\n            buildPeriodReport, buildPeriodMonthKeys, generatePeriodReport, renderPeriodReportHtml,\n            applyPeriodReportPreset, onPeriodReportRangeChange, exportPeriodReportCsv, printPeriodReport,\n            getPeriodReportSignature, invalidatePeriodReportPreview, invalidatePeriodReportIfStale, clearPeriodReportPreview\n        })',
        sandbox
    );
    sandbox.window = {
        print() { calls.print += 1; },
        addEventListener() {}
    };
    sandbox.document = {
        getElementById: id => elements[id] || null,
        body: { classList: { add() {}, remove() {} } },
        createElement: () => ({
            href: '',
            download: '',
            click() {
                calls.download = { filename: this.download, content: String(sandbox.__blob.parts[0]) };
            }
        })
    };
    return { app, sandbox, state, elements, calls };
}

test('period report bills every month in the range and totals in cents', () => {
    const { app } = loadReport();
    const report = app.buildPeriodReport('يناير 2024', 'مارس 2024');
    assert.equal(report.months.map(row => row.month).join('|'), 'يناير 2024|فبراير 2024|مارس 2024');
    assert.equal(report.months.map(row => row.expectedCents).join('|'), '10000|10000|10000');
    assert.equal(report.months.map(row => row.collectedCents).join('|'), '10000|4000|0');
    assert.equal(report.months.map(row => row.outstandingCents).join('|'), '0|6000|10000');
    assert.equal(report.months.map(row => row.rate).join('|'), '100|40|0');
    assert.equal(report.totals.expectedCents, 30000);
    assert.equal(report.totals.collectedCents, 14000);
    assert.equal(report.totals.outstandingCents, 16000);
    assert.equal(report.totals.expenseCents, 2500);
    assert.equal(report.totals.netCents, 11500);
    assert.equal(report.totals.unpaidMonths, 2);
    assert.equal(report.totals.rate, 47);
    assert.equal(report.rangeLabel, 'يناير 2024 – مارس 2024');
});

test('period report crosses year boundaries without dropping months', () => {
    const { app } = loadReport();
    const keys = app.buildPeriodMonthKeys('نوفمبر 2024', 'فبراير 2025');
    assert.equal(keys.join('|'), '2024-11-01|2024-12-01|2025-01-01|2025-02-01');
    const report = app.buildPeriodReport('نوفمبر 2024', 'فبراير 2025');
    assert.equal(report.months.length, 4);
    assert.equal(report.months[2].month, 'يناير 2025');
});

test('period report only bills residents who had joined by each month', () => {
    const { app } = loadReport({
        state: {
            residents: [
                baseResident,
                { id: 'r2', name: 'سالم', apartmentNumber: '4', monthlyAmount: 200, createdAt: '2024-03-01T00:00:00.000Z' }
            ]
        }
    });
    const report = app.buildPeriodReport('يناير 2024', 'مارس 2024');
    assert.equal(report.months.map(row => row.expectedCents).join('|'), '10000|10000|30000');
});

test('period report applies the subscription rate effective in each month', () => {
    const { app } = loadReport({
        state: {
            residents: [{
                ...baseResident,
                subscriptionRates: [
                    { effectiveMonth: '2024-01-01', monthlyAmount: 100 },
                    { effectiveMonth: '2024-03-01', monthlyAmount: 150 }
                ]
            }]
        }
    });
    const report = app.buildPeriodReport('يناير 2024', 'مارس 2024');
    assert.equal(report.months.map(row => row.expectedCents).join('|'), '10000|10000|15000');
});

test('period report leaves the rate blank when a month carries no dues', () => {
    const { app } = loadReport({ state: { residents: [] } });
    const report = app.buildPeriodReport('يناير 2024', 'فبراير 2024');
    assert.equal(report.months.map(row => row.rate).join('|'), '|');
    assert.equal(report.totals.rate, null);
    assert.match(app.renderPeriodReportHtml(report), /—/);
});

test('a reversed period range produces no report and explains itself', () => {
    const { app, elements, calls } = loadReport({ from: 'مارس 2024', to: 'يناير 2024' });
    assert.equal(app.buildPeriodReport('مارس 2024', 'يناير 2024'), null);
    app.generatePeriodReport();
    assert.match(elements.periodReportPreview.innerHTML, /الفترة غير صحيحة/);
    assert.equal(elements.periodReportPrintBtn.disabled, true);
    assert.ok(calls.toasts.some(entry => entry.includes('شهر البداية بعد شهر النهاية')));
});

test('period preview gates print and csv until a fresh preview exists', () => {
    const { app, elements, calls, sandbox } = loadReport();
    app.generatePeriodReport();
    assert.match(elements.periodReportPreview.innerHTML, /تقرير الفترة يناير 2024 – مارس 2024/);
    assert.match(elements.periodReportPreview.innerHTML, /<tfoot>/);
    assert.equal(elements.periodReportPrintBtn.disabled, false);
    assert.equal(elements.periodReportExportBtn.disabled, false);

    app.printPeriodReport();
    assert.equal(calls.print, 1);

    app.exportPeriodReportCsv();
    assert.equal(calls.download.filename, 'manzil_period_2024-01_2024-03.csv');
    const lines = calls.download.content.replace(/^\uFEFF/, '').split('\r\n');
    assert.equal(lines[0], '"الشهر","المستحق","المحصّل","غير المحصّل","نسبة التحصيل %","المصروف","الصافي"');
    assert.equal(lines[1], '"يناير 2024","100","100","0","100","0","100"');
    assert.equal(lines[4], '"الإجمالي","300","140","160","47","25","115"');

    sandbox.state.income.push({ id: 'i3', residentId: 'r1', month: 'مارس 2024', amount: 150, paymentMethod: 'cash' });
    app.invalidatePeriodReportIfStale();
    assert.match(elements.periodReportPreview.innerHTML, /تغيّرت البيانات/);
    assert.equal(elements.periodReportPrintBtn.disabled, true);
    assert.equal(elements.periodReportExportBtn.disabled, true);

    app.generatePeriodReport();
    elements.periodReportTo.value = 'أبريل 2024';
    app.onPeriodReportRangeChange();
    assert.match(elements.periodReportPreview.innerHTML, /تغيّرت الفترة أو البيانات/);
    assert.equal(sandbox.document.getElementById('periodReportPreset').value, 'custom');

    app.printPeriodReport();
    assert.equal(calls.print, 1, 'print must refuse a range that no longer matches the preview');
});

test('period quick presets fill the range from the current month', () => {
    const three = loadReport({ preset: '3' });
    three.app.applyPeriodReportPreset();
    assert.equal(three.elements.periodReportFrom.value, 'يناير 2024');
    assert.equal(three.elements.periodReportTo.value, 'مارس 2024');

    const yearStart = loadReport({ preset: 'ytd', currentMonth: 'أبريل 2024', from: 'يناير 2024', to: 'أبريل 2024' });
    yearStart.app.applyPeriodReportPreset();
    assert.equal(yearStart.elements.periodReportFrom.value, 'يناير 2024');
    assert.equal(yearStart.elements.periodReportTo.value, 'أبريل 2024');

    const custom = loadReport({ preset: 'custom', from: 'فبراير 2024', to: 'مارس 2024' });
    custom.app.applyPeriodReportPreset();
    assert.equal(custom.elements.periodReportFrom.value, 'فبراير 2024');
});

test('period signature follows residents and subscription settings inside the range', () => {
    const { app, state } = loadReport({ state: { defaultSubscription: 100 } });
    const signature = app.getPeriodReportSignature('يناير 2024', 'مارس 2024');
    state.defaultSubscription = 250;
    assert.notEqual(app.getPeriodReportSignature('يناير 2024', 'مارس 2024'), signature);
    state.defaultSubscription = 100;
    state.expenses.push({ id: 'e2', month: 'أبريل 2024', title: 'خارج الفترة', amount: 999 });
    assert.equal(app.getPeriodReportSignature('يناير 2024', 'مارس 2024'), signature);
});
