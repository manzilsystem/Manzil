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
        periodReportPreview: { innerHTML: '', dataset: {} },
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
        getIncomePaymentMethodLabel: method => ({
            cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي'
        }[method] || 'غير محدد'),
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
        reports + '\n({\n            buildPeriodReport, buildPeriodMonthKeys, generatePeriodReport, renderPeriodReportHtml,\n            applyPeriodReportPreset, onPeriodReportRangeChange, exportPeriodReportCsv, printPeriodReport,\n            getPeriodReportSignature, invalidatePeriodReportPreview, invalidatePeriodReportIfStale, clearPeriodReportPreview,\n            getPeriodMonthSpan, getPeriodRangeError, PERIOD_REPORT_MAX_MONTHS\n        })',
        sandbox
    );
    sandbox.window = {
        print() { calls.print += 1; },
        addEventListener() {}
    };
    sandbox.document = {
        getElementById: id => elements[id] || null,
        querySelector: () => null,
        querySelectorAll: () => [],
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

test('a period range of exactly 60 months builds the full month list', () => {
    const { app } = loadReport();
    const keys = app.buildPeriodMonthKeys('يناير 2019', 'ديسمبر 2023');
    assert.equal(app.PERIOD_REPORT_MAX_MONTHS, 60);
    assert.equal(keys.length, 60);
    assert.equal(keys[0], '2019-01-01');
    assert.equal(keys[59], '2023-12-01');
    assert.equal(app.buildPeriodReport('يناير 2019', 'ديسمبر 2023').months.length, 60);
});

test('a period longer than 60 months is rejected instead of silently truncated', () => {
    const { app, elements, calls } = loadReport({ from: 'ديسمبر 2018', to: 'ديسمبر 2023' });
    assert.equal(app.getPeriodMonthSpan('2018-12-01', '2023-12-01'), 61);
    assert.equal(app.buildPeriodMonthKeys('ديسمبر 2018', 'ديسمبر 2023'), null);
    assert.equal(app.buildPeriodReport('ديسمبر 2018', 'ديسمبر 2023'), null);
    assert.match(app.getPeriodRangeError('ديسمبر 2018', 'ديسمبر 2023'), /أقصى مدة لتقرير الفترة 60 شهرًا/);

    app.generatePeriodReport();
    assert.match(elements.periodReportPreview.innerHTML, /أقصى مدة لتقرير الفترة 60 شهرًا/);
    assert.equal(elements.periodReportPrintBtn.disabled, true);
    assert.equal(elements.periodReportExportBtn.disabled, true);
    assert.ok(calls.toasts.some(entry => entry.includes('أقصى مدة لتقرير الفترة 60 شهرًا')));
});

test('a rejected long range keeps its signature tied to the selected endpoints only', () => {
    const { app, state } = loadReport();
    const signature = app.getPeriodReportSignature('ديسمبر 2018', 'ديسمبر 2023');
    state.income.push({ id: 'mid', residentId: 'r1', month: 'مايو 2020', amount: 10, paymentMethod: 'cash' });
    assert.equal(app.getPeriodReportSignature('ديسمبر 2018', 'ديسمبر 2023'), signature);
    state.income.push({ id: 'edge', residentId: 'r1', month: 'ديسمبر 2023', amount: 10, paymentMethod: 'cash' });
    assert.notEqual(app.getPeriodReportSignature('ديسمبر 2018', 'ديسمبر 2023'), signature);
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
    assert.equal(lines[5], '');
    assert.equal(lines[6], '"طريقة التحصيل","عدد الحركات","المبلغ","نسبته من المحصّل %"');
    assert.equal(lines[7], '"نقدًا","2","140","100"');
    assert.equal(lines.length, 8);

    sandbox.state.income.push({ id: 'i3', residentId: 'r1', month: 'مارس 2024', amount: 150, paymentMethod: 'cash' });
    app.invalidatePeriodReportIfStale();
    assert.match(elements.periodReportPreview.innerHTML, /تغيّرت البيانات/);
    assert.equal(elements.periodReportPrintBtn.disabled, true);
    assert.equal(elements.periodReportExportBtn.disabled, true);

    app.generatePeriodReport();
    elements.periodReportTo.value = 'أبريل 2024';
    app.onPeriodReportRangeChange();
    assert.match(elements.periodReportPreview.innerHTML, /تغيّرت الفترة أو الغرض أو البيانات/);
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

const mixedChannels = {
    income: [
        { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' },
        { id: 'i2', residentId: 'r1', month: 'فبراير 2024', amount: 40, paymentMethod: 'cash' },
        { id: 'i3', residentId: 'r1', month: 'فبراير 2024', amount: 60, paymentMethod: 'instapay' },
        { id: 'i4', residentId: 'r1', month: 'مارس 2024', amount: 10, paymentMethod: 'wallet' },
        { id: 'i5', residentId: 'r1', month: 'أبريل 2024', amount: 500, paymentMethod: 'bank_transfer' }
    ]
};

test('period report splits collections by channel and the split equals collected', () => {
    const { app } = loadReport({ state: mixedChannels });
    const report = app.buildPeriodReport('يناير 2024', 'مارس 2024');
    assert.equal(report.methods.map(item => item.label).join('|'), 'نقدًا|InstaPay|محفظة إلكترونية');
    assert.equal(report.methods.map(item => item.cents).join('|'), '14000|6000|1000');
    assert.equal(report.methods.map(item => item.count).join('|'), '2|1|1');
    assert.equal(report.methods.map(item => item.share).join('|'), '67|29|5');
    assert.equal(report.methods.reduce((sum, item) => sum + item.cents, 0), report.totals.collectedCents);
});

test('the period preview lists each channel with its movement count and share', () => {
    const { app } = loadReport({ state: mixedChannels });
    const html = app.renderPeriodReportHtml(app.buildPeriodReport('يناير 2024', 'مارس 2024'));
    assert.match(html, /التحصيل حسب الطريقة<\/span><span class="report-block-count">3<\/span>/);
    assert.match(html, /InstaPay <span class="report-list-meta">· 1 حركة · 29%<\/span>/);
    assert.match(html, /<span class="report-list-value text-emerald-400 report-amount">140 ج\.م<\/span>/);
    assert.match(html, /توزيع الطرق يغطي كل تحصيلات أشهر الفترة، ومجموعه يساوي إجمالي التحصيل/);
});

test('a period without collections says so instead of inventing channels', () => {
    const { app } = loadReport({ state: { income: [] } });
    const report = app.buildPeriodReport('يناير 2024', 'فبراير 2024');
    assert.equal(report.methods.length, 0);
    assert.equal(report.totals.collectedCents, 0);
    const html = app.renderPeriodReportHtml(report);
    assert.match(html, /<span class="report-block-count">0<\/span>/);
    assert.match(html, /لا تحصيلات في هذه الفترة\./);
});

test('switching a payment to another channel invalidates the period signature', () => {
    const { app, state } = loadReport();
    const signature = app.getPeriodReportSignature('يناير 2024', 'مارس 2024');
    state.income[0].paymentMethod = 'instapay';
    assert.notEqual(app.getPeriodReportSignature('يناير 2024', 'مارس 2024'), signature);
});
