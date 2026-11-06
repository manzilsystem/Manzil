const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const reports = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const render = fs.readFileSync(path.join(__dirname, '..', 'js', 'render.js'), 'utf8');
const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const PURPOSE_LABELS = {
    subscription: 'اشتراك شهري',
    services: 'أخرى',
    development: 'تطوير',
    emergency: 'صيانة طارئة',
    penalty: 'أخرى',
    donation: 'أخرى',
    other: 'أخرى',
    settlement: 'سداد تسوية'
};
const PURPOSE_FORM_CODES = ['subscription', 'development', 'emergency', 'settlement', 'other'];
const CASH_ACCOUNTS = {
    main: { label: 'الخزنة الرئيسية' },
    development: { label: 'صندوق التطوير' },
    emergency: { label: 'صندوق الصيانة الطارئة' }
};
const PAYMENT_METHOD_LABELS = {
    cash: 'نقدًا',
    wallet: 'محفظة إلكترونية',
    instapay: 'InstaPay',
    bank_transfer: 'تحويل بنكي'
};

function toCents(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function monthLabelToKey(month) {
    const [name, year] = String(month || '').trim().split(/\s+/);
    const index = monthNames.indexOf(name);
    return index < 0 || !/^\d{4}$/.test(year || '') ? null : `${year}-${String(index + 1).padStart(2, '0')}-01`;
}

function getStatementMonthLabel(key) {
    const match = String(key || '').match(/^(\d{4})-(\d{2})-01$/);
    return match ? `${monthNames[Number(match[2]) - 1]} ${match[1]}` : '';
}

function shiftStatementMonthKey(key, delta) {
    const match = String(key || '').match(/^(\d{4})-(\d{2})-01$/);
    if (!match) return '';
    const date = new Date(Number(match[1]), Number(match[2]) - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function normalizeIncomePurpose(purpose) {
    const value = String(purpose || '').trim();
    return Object.prototype.hasOwnProperty.call(PURPOSE_LABELS, value) ? value : 'subscription';
}

function getIncomePurposeFormCode(purpose) {
    const normalized = normalizeIncomePurpose(purpose);
    return PURPOSE_FORM_CODES.includes(normalized) ? normalized : 'other';
}

function loadReports(options = {}) {
    const elements = {
        reportMonthSelect: { value: options.reportMonth ?? 'يناير 2024' },
        landlordReportResident: { value: options.landlordResident ?? '' },
        landlordReportPurpose: { value: options.purpose ?? '' },
        landlordReportCashAccount: { value: options.cashAccount ?? '' },
        landlordReportPaymentMethod: { value: options.method ?? '' },
        landlordReportPreview: { innerHTML: '', dataset: {} },
        reportPrintBtn: { disabled: true },
        reportPdfBtn: { disabled: true },
        reportExportBtn: { disabled: true },
        periodReportFrom: { value: 'يناير 2024' },
        periodReportTo: { value: 'فبراير 2024' },
        periodReportPreset: { value: 'custom' },
        periodReportPurpose: { value: options.periodPurpose ?? '' },
        periodReportCashAccount: { value: options.periodCashAccount ?? '' },
        periodReportResident: { value: options.periodResident ?? '' },
        periodReportPreview: { innerHTML: '', dataset: {} },
        periodReportPrintBtn: { disabled: true },
        periodReportExportBtn: { disabled: true },
        printBuildingTitle: { textContent: '' },
        printBuildingMeta: { textContent: '' }
    };
    const state = {
        buildingName: 'عمارة النور',
        managerName: 'المدير',
        defaultSubscription: 100,
        residents: [
            { id: 'r2', name: 'سعيد', apartmentNumber: '10', monthlyAmount: 200, createdAt: '2024-01-01T00:00:00.000Z' },
            { id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z' }
        ],
        income: [
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash', purposeCode: 'subscription', cashAccountCode: 'main' },
            { id: 'i2', residentId: 'r1', month: 'يناير 2024', amount: 50, paymentMethod: 'cash', purposeCode: 'development', cashAccountCode: 'development' },
            { id: 'i3', residentId: 'r2', month: 'يناير 2024', amount: 50, paymentMethod: 'instapay', purposeCode: 'subscription', cashAccountCode: 'main' },
            { id: 'i4', residentId: 'r2', month: 'يناير 2024', amount: 30, paymentMethod: 'cash', purposeCode: 'emergency', cashAccountCode: 'emergency' },
            { id: 'i5', residentId: 'r2', month: 'فبراير 2024', amount: 200, paymentMethod: 'wallet', purposeCode: 'subscription', cashAccountCode: 'main' }
        ],
        expenses: [
            { id: 'e1', month: 'يناير 2024', title: 'كهرباء', amount: 10, category: 'مرافق', cashAccountCode: 'main' },
            { id: 'e2', month: 'يناير 2024', title: 'دهانات', amount: 5, category: 'تطوير', cashAccountCode: 'development' },
            { id: 'e3', month: 'فبراير 2024', title: 'سباكة', amount: 20, category: 'صيانة', cashAccountCode: 'main' }
        ],
        adjustments: []
    };
    const calls = { toasts: [] };
    const sandbox = {
        state,
        monthsNames: monthNames,
        INCOME_PURPOSE_LABELS: PURPOSE_LABELS,
        INCOME_PURPOSE_FORM_CODES: PURPOSE_FORM_CODES,
        INCOME_PAYMENT_METHOD_LABELS: PAYMENT_METHOD_LABELS,
        CASH_ACCOUNTS,
        getCurrentMonth: () => 'فبراير 2024',
        monthLabelToKey,
        getStatementMonthLabel,
        shiftStatementMonthKey,
        toCents,
        normalizeIncomePurpose,
        getIncomePurposeFormCode,
        getIncomePurposeLabel: purpose => PURPOSE_LABELS[normalizeIncomePurpose(purpose)],
        isSubscriptionIncome: payment => normalizeIncomePurpose(payment?.purposeCode) === 'subscription',
        getCashAccountLabel: code => CASH_ACCOUNTS[code]?.label || CASH_ACCOUNTS.main.label,
        getIncomePaymentMethodLabel: method => PAYMENT_METHOD_LABELS[method] || 'غير محدد',
        getPaidAmountForMonth: (residentId, month) => {
            const paidCents = state.income.reduce((sum, payment) => {
                if (payment.residentId !== residentId || payment.month !== month) return sum;
                if (normalizeIncomePurpose(payment.purposeCode) !== 'subscription') return sum;
                return sum + toCents(payment.amount);
            }, 0);
            return paidCents / 100;
        },
        getSubscriptionAmountForMonth: resident => Number(resident?.monthlyAmount ?? state.defaultSubscription) || 0,
        getAdjustmentAmountForMonth: () => 0,
        getMonthOutstanding: (resident, month) => {
            const dueCents = toCents(Number(resident?.monthlyAmount ?? state.defaultSubscription) || 0);
            const paidCents = toCents(sandbox.getPaidAmountForMonth(resident.id, month));
            return Math.max(0, dueCents - paidCents) / 100;
        },
        fmtNum: value => String(Number(value) || 0),
        fmtMoney: value => `${String(Number(value) || 0)} ج.م`,
        esc: value => String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character])),
        formatDate: () => '01/01/2024',
        requireManager: () => true,
        toast: (message, kind) => calls.toasts.push(`${kind}:${message}`),
        setTimeout: () => {},
        console,
        Blob: class { constructor(parts, opts) { sandbox.__blob = { parts, type: opts && opts.type }; } },
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
        Date
    };
    const api = vm.runInNewContext(
        `${reports}\n({\n            getLandlordReportData, getLandlordReportSignature, generateLandlordReport, exportToCSV,\n            renderLandlordReportPdfHtml, invalidateLandlordReportPreview,\n            populateReportResidentFilters, getReportResidentFilter, normalizeReportResidentFilter,\n            reportPaymentMatchesResident, reportResidentFilterLabel, reportResidentFileSlug, filterReportIncome,\n            buildPeriodReport, getPeriodReportSignature, generatePeriodReport, renderPeriodReportHtml,\n            exportPeriodReportCsv, invalidatePeriodReportPreview, getSelectedPeriodReportSnapshot\n        })`,
        sandbox,
        { filename: 'js/reports.js' }
    );
    sandbox.document = {
        getElementById: id => elements[id] || null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => ({
            href: '',
            download: '',
            click() { calls.download = { filename: this.download, content: String(sandbox.__blob.parts[0]) }; }
        })
    };
    sandbox.window = { print() {}, addEventListener() {} };
    return { api, sandbox, state, elements, calls };
}

test('apartment selects sit in both report toolbars and are populated centrally', () => {
    assert.match(html, /id="landlordReportResident"[^>]*onchange="invalidateLandlordReportPreview\(\)"/);
    assert.match(html, /id="periodReportResident"[^>]*onchange="invalidatePeriodReportPreview\(\)"/);
    assert.match(render, /populateReportResidentFilters\(\)/);
    const { api, elements } = loadReports();
    api.populateReportResidentFilters();
    assert.match(elements.landlordReportResident.innerHTML, /<option value="">كل الشقق<\/option>/);
    assert.match(elements.periodReportResident.innerHTML, /<option value="r1">شقة 3 · أحمد<\/option>/);
    const landlordOptions = elements.landlordReportResident.innerHTML;
    assert.ok(landlordOptions.indexOf('شقة 3 · أحمد') < landlordOptions.indexOf('شقة 10 · سعيد'));
});

test('apartment values normalize and expose a label and filename slug', () => {
    const { api } = loadReports();
    assert.equal(api.normalizeReportResidentFilter('r2'), 'r2');
    assert.equal(api.normalizeReportResidentFilter(' r1 '), 'r1');
    assert.equal(api.normalizeReportResidentFilter('missing'), '');
    assert.equal(api.reportResidentFilterLabel('r2'), 'شقة 10 · سعيد');
    assert.equal(api.reportResidentFilterLabel(''), 'كل الشقق');
    assert.equal(api.reportResidentFileSlug('r2'), '10');
    assert.equal(api.reportPaymentMatchesResident({ residentId: 'r2' }, 'r2'), true);
    assert.equal(api.reportPaymentMatchesResident({ residentId: 'r1' }, 'r2'), false);
    assert.equal(api.reportPaymentMatchesResident({}, ''), true);
});

test('landlord data scopes collections to one apartment and keeps expenses', () => {
    const { api } = loadReports();
    const r2 = api.getLandlordReportData('يناير 2024', '', '', '', 'r2');
    assert.deepEqual(r2.income.map(item => item.id), ['i3', 'i4']);
    assert.equal(r2.expenses.length, 2);

    const r1 = api.getLandlordReportData('يناير 2024', '', '', '', 'r1');
    assert.deepEqual(r1.income.map(item => item.id), ['i1', 'i2']);

    const combined = api.getLandlordReportData('يناير 2024', '', '', 'cash', 'r2');
    assert.deepEqual(combined.income.map(item => item.id), ['i4']);

    const none = api.getLandlordReportData('يناير 2024', '', '', '', 'missing');
    assert.equal(none.income.length, 0);
});

test('apartment filter changes both report signatures', () => {
    const { api } = loadReports();
    assert.notEqual(
        api.getLandlordReportSignature('يناير 2024', '', '', '', 'r1'),
        api.getLandlordReportSignature('يناير 2024', '', '', '', 'r2')
    );
    assert.equal(
        api.getLandlordReportSignature('يناير 2024', '', '', '', 'r2'),
        api.getLandlordReportSignature('يناير 2024', '', '', '', 'r2')
    );
    assert.notEqual(
        api.getPeriodReportSignature('يناير 2024', 'فبراير 2024', '', '', 'r1'),
        api.getPeriodReportSignature('يناير 2024', 'فبراير 2024', '', '', 'r2')
    );
});

test('landlord preview scopes dues and collections to the apartment', () => {
    const { api, elements } = loadReports({ landlordResident: 'r2' });
    api.generateLandlordReport();
    const preview = elements.landlordReportPreview.innerHTML;
    assert.match(preview, /الشقة: شقة 10 · سعيد/);
    assert.match(preview, /التحصيلات معروضة لشقة «شقة 10 · سعيد» فقط/);
    assert.match(preview, /المستحق ونسبة التحصيل يخصان هذه الشقة/);
    assert.match(preview, /<p class="report-stat-label">المستحق<\/p><p class="report-stat-value">200 ج\.م/);
    assert.match(preview, /<p class="report-stat-label">نسبة التحصيل<\/p><p class="report-stat-value">25%/);
    assert.match(preview, /كهرباء/);
    assert.doesNotMatch(preview, /أحمد/);
    assert.equal(elements.reportExportBtn.disabled, false);
});

test('changing the apartment invalidates the preview and guards CSV', () => {
    const { api, elements, calls } = loadReports({ landlordResident: 'r2' });
    api.generateLandlordReport();
    elements.landlordReportResident.value = 'r1';
    api.invalidateLandlordReportPreview();
    assert.match(elements.landlordReportPreview.innerHTML, /تغيّر الشهر أو الفلتر أو البيانات/);
    assert.equal(elements.reportExportBtn.disabled, true);

    elements.landlordReportResident.value = 'r2';
    api.generateLandlordReport();
    elements.landlordReportResident.value = 'r1';
    api.exportToCSV();
    assert.equal(calls.download, undefined);
    assert.ok(calls.toasts.some(entry => entry.includes('اعرض معاينة الشقة المحددة أولًا')));
});

test('landlord CSV and PDF carry the apartment filter', () => {
    const { api, elements, calls } = loadReports({ landlordResident: 'r2' });
    api.generateLandlordReport();
    api.exportToCSV();
    assert.equal(calls.download.filename, 'manzil_report_2024-01_apt_10.csv');
    assert.match(calls.download.content, /"تحصيل","سعيد","10","يناير 2024","50"/);
    assert.match(calls.download.content, /"تحصيل","سعيد","10","يناير 2024","30"/);
    assert.doesNotMatch(calls.download.content, /أحمد/);
    assert.match(calls.download.content, /"مصروف","كهرباء"/);
    assert.equal(elements.reportExportBtn.disabled, false);

    const pdf = api.renderLandlordReportPdfHtml('يناير 2024', '', '', '', 'r2');
    assert.match(pdf, /الشقة: شقة 10 · سعيد/);
    assert.match(pdf, /التحصيلات معروضة لشقة «شقة 10 · سعيد» فقط/);
    assert.match(pdf, /المستحق ونسبة التحصيل يخصان هذه الشقة/);
    assert.doesNotMatch(pdf, /أحمد/);
});

test('period report scopes its months and dues to one apartment', () => {
    const { api } = loadReports();
    const report = api.buildPeriodReport('يناير 2024', 'فبراير 2024', '', '', 'r2');
    assert.equal(report.showDues, true);
    assert.equal(report.residentLabel, 'شقة 10 · سعيد');
    assert.deepEqual(JSON.parse(JSON.stringify(report.months.map(row => [row.month, row.totalIncomeCents, row.expectedCents, row.outstandingCents]))), [
        ['يناير 2024', 8000, 20000, 15000],
        ['فبراير 2024', 20000, 20000, 0]
    ]);
    assert.equal(report.totals.totalIncomeCents, 28000);
    assert.equal(report.totals.expectedCents, 40000);
    assert.equal(report.totals.outstandingCents, 15000);

    const html = api.renderPeriodReportHtml(report);
    assert.match(html, /الشقة: شقة 10 · سعيد/);
    assert.match(html, /المستحق ونسبة التحصيل يخصان الشقة المحددة/);
    assert.match(html, /التحصيلات معروضة لشقة «شقة 10 · سعيد» فقط/);
});

test('period apartment filter hides dues when combined with a fund and scopes its CSV', () => {
    const { api, elements, calls } = loadReports({ periodResident: 'r2', periodCashAccount: 'main' });
    api.generatePeriodReport();
    const preview = elements.periodReportPreview.innerHTML;
    assert.doesNotMatch(preview, /<p class="report-stat-label">المستحق/);
    assert.match(preview, /لا يظهران عند تصفية الصندوق مع الشقة/);
    assert.match(preview, /الحركات معروضة لصندوق «الخزنة الرئيسية» فقط/);
    assert.match(preview, /تحصيل الصندوق/);

    elements.periodReportCashAccount.value = '';
    api.invalidatePeriodReportPreview();
    assert.match(elements.periodReportPreview.innerHTML, /تغيّرت الفترة أو الفلتر أو البيانات/);

    elements.periodReportCashAccount.value = '';
    elements.periodReportResident.value = 'r2';
    api.generatePeriodReport();
    elements.periodReportResident.value = 'r1';
    api.exportPeriodReportCsv();
    assert.equal(calls.download, undefined);
    assert.ok(calls.toasts.some(entry => entry.includes('اعرض معاينة الشقة المحددة أولًا')));

    elements.periodReportResident.value = 'r2';
    api.generatePeriodReport();
    api.exportPeriodReportCsv();
    assert.equal(calls.download.filename, 'manzil_period_2024-01_2024-02_apt_10.csv');
    assert.match(calls.download.content, /"الشقة","شقة 10 · سعيد"/);
    assert.match(calls.download.content, /"يناير 2024","200","50","150","25","15","65"/);
    assert.doesNotMatch(calls.download.content, /أحمد/);
});
