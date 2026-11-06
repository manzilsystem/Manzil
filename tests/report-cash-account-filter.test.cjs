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
    other: 'أخرى'
};
const PURPOSE_FORM_CODES = ['subscription', 'development', 'emergency', 'other'];
const CASH_ACCOUNTS = {
    main: { label: 'الخزنة الرئيسية', shortLabel: 'الرئيسية' },
    development: { label: 'صندوق التطوير', shortLabel: 'التطوير' },
    emergency: { label: 'صندوق الصيانة الطارئة', shortLabel: 'الطوارئ' }
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
        landlordReportPurpose: { value: options.purpose ?? '' },
        periodReportPurpose: { value: options.purpose ?? '' },
        statementPurpose: { value: options.purpose ?? '' },
        landlordReportCashAccount: { value: options.cashAccount ?? '' },
        periodReportCashAccount: { value: options.cashAccount ?? '' },
        statementResidentSelect: { value: 'r1' },
        periodReportFrom: { value: options.from ?? 'يناير 2024' },
        periodReportTo: { value: options.to ?? 'مارس 2024' },
        periodReportPreset: { value: '6' },
        landlordReportPreview: { innerHTML: '', dataset: {} },
        periodReportPreview: { innerHTML: '', dataset: {} },
        residentStatementPreview: { innerHTML: '', dataset: {} },
        reportPrintBtn: { disabled: true },
        reportPdfBtn: { disabled: true },
        reportExportBtn: { disabled: true },
        periodReportPrintBtn: { disabled: true },
        periodReportExportBtn: { disabled: true },
        statementPrintBtn: { disabled: true },
        statementPdfBtn: { disabled: true },
        unitReportPdfBtn: { disabled: true },
        statementCsvBtn: { disabled: true },
        printBuildingTitle: { textContent: '' },
        printBuildingMeta: { textContent: '' }
    };
    const state = {
        buildingName: 'عمارة النور',
        managerName: 'المدير',
        defaultSubscription: 100,
        residents: [{ id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z' }],
        income: [
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash', purposeCode: 'subscription', cashAccountCode: 'main' },
            { id: 'i2', residentId: 'r1', month: 'يناير 2024', amount: 50, paymentMethod: 'cash', purposeCode: 'development', cashAccountCode: 'development' },
            { id: 'i3', residentId: 'r1', month: 'يناير 2024', amount: 20, paymentMethod: 'wallet', purposeCode: 'subscription' },
            { id: 'i4', residentId: 'r1', month: 'يناير 2024', amount: 30, paymentMethod: 'instapay', purposeCode: 'emergency', cashAccountCode: 'emergency' },
            { id: 'i5', residentId: 'r1', month: 'فبراير 2024', amount: 40, paymentMethod: 'cash', purposeCode: 'subscription', cashAccountCode: 'main' },
            { id: 'i6', residentId: 'r1', month: 'فبراير 2024', amount: 60, paymentMethod: 'cash', purposeCode: 'development', cashAccountCode: 'development' },
            { id: 'i7', residentId: 'r1', month: 'مارس 2024', amount: 30, paymentMethod: 'cash', purposeCode: 'development', cashAccountCode: 'development' },
            { id: 'i8', residentId: 'r1', month: 'مارس 2024', amount: 25, paymentMethod: 'cash', purposeCode: 'subscription', cashAccountCode: 'emergency' }
        ],
        expenses: [
            { id: 'e1', month: 'يناير 2024', title: 'كهرباء', amount: 10, category: 'مرافق', cashAccountCode: 'main' },
            { id: 'e2', month: 'يناير 2024', title: 'دهانات', amount: 5, category: 'تطوير', cashAccountCode: 'development' },
            { id: 'e3', month: 'يناير 2024', title: 'سباكة', amount: 7, category: 'صيانة', cashAccountCode: 'emergency' },
            { id: 'e4', month: 'فبراير 2024', title: 'بلاط', amount: 25, category: 'تطوير', cashAccountCode: 'development' }
        ],
        adjustments: []
    };
    const calls = { toasts: [] };
    const sandbox = {
        state,
        monthsNames: monthNames,
        INCOME_PURPOSE_LABELS: PURPOSE_LABELS,
        INCOME_PURPOSE_FORM_CODES: PURPOSE_FORM_CODES,
        CASH_ACCOUNTS,
        getCurrentMonth: () => 'مارس 2024',
        monthLabelToKey,
        toCents,
        normalizeIncomePurpose,
        getIncomePurposeFormCode,
        getIncomePurposeLabel: purpose => PURPOSE_LABELS[normalizeIncomePurpose(purpose)],
        isSubscriptionIncome: payment => normalizeIncomePurpose(payment?.purposeCode) === 'subscription',
        getCashAccountLabel: code => CASH_ACCOUNTS[code]?.label || CASH_ACCOUNTS.main.label,
        getPaidAmountForMonth: (residentId, month) => {
            const paidCents = state.income.reduce((sum, payment) => {
                if (payment.residentId !== residentId || payment.month !== month) return sum;
                if (normalizeIncomePurpose(payment.purposeCode) !== 'subscription') return sum;
                const amount = Number(payment.amount);
                return sum + (Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0);
            }, 0);
            return paidCents / 100;
        },
        getSubscriptionAmountForMonth: (resident, month) => {
            const monthKey = monthLabelToKey(month);
            const rates = Array.isArray(resident?.subscriptionRates) ? resident.subscriptionRates : [];
            if (!monthKey || !rates.length) return Number(resident?.monthlyAmount ?? state.defaultSubscription) || 0;
            const applicable = rates
                .filter(rate => /^\d{4}-\d{2}-01$/.test(rate.effectiveMonth) && rate.effectiveMonth <= monthKey)
                .sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
            return applicable.length
                ? Math.max(0, Number(applicable[applicable.length - 1].monthlyAmount) || 0)
                : 0;
        },
        getAdjustmentAmountForMonth: () => 0,
        getMonthOutstanding: (resident, month) => {
            const dueCents = toCents(Number(resident?.monthlyAmount ?? state.defaultSubscription) || 0);
            const paidCents = toCents(sandbox.getPaidAmountForMonth(resident.id, month));
            return Math.max(0, dueCents - paidCents) / 100;
        },
        getIncomePaymentMethodLabel: method => ({
            cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي'
        }[method] || 'غير محدد'),
        fmtNum: value => String(Number(value) || 0),
        fmtMoney: value => `${String(Number(value) || 0)} ج.م`,
        esc: value => String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character])),
        formatDate: () => '01/03/2024',
        requireManager: () => true,
        toast: (message, kind) => calls.toasts.push(`${kind}:${message}`),
        setTimeout: () => {},
        console,
        Blob: class { constructor(parts, opts) { sandbox.__blob = { parts, type: opts && opts.type }; } },
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
        Date
    };
    const api = vm.runInNewContext(
        `${reports}\n({\n            getLandlordReportData, getLandlordReportSignature, generateLandlordReport, exportToCSV,\n            renderLandlordReportPdfHtml, invalidateLandlordReportPreview,\n            buildPeriodReport, getPeriodReportSignature, generatePeriodReport, renderPeriodReportHtml,\n            exportPeriodReportCsv, invalidatePeriodReportPreview, getSelectedPeriodReportSnapshot,\n            populateReportCashAccountFilters, getReportCashAccountFilter, normalizeReportCashAccountFilter,\n            reportCashAccountMatches, reportCashAccountFilterLabel, filterReportIncome, filterReportExpenses\n        })`,
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

test('cash account filter markup sits in both report toolbars and is populated centrally', () => {
    [['landlordReportCashAccount', 'invalidateLandlordReportPreview'], ['periodReportCashAccount', 'invalidatePeriodReportPreview']].forEach(([id, handler]) => {
        assert.match(html, new RegExp(`id="${id}"[^>]*onchange="${handler}\\(\\)"`), id + ' must gate its preview');
    });
    assert.match(reports, /const REPORT_CASH_ACCOUNT_FILTER_IDS = \['landlordReportCashAccount', 'periodReportCashAccount', 'expensesReportCashAccount'\]/);
    assert.match(render, /populateReportCashAccountFilters\(\)/);
});

test('cash account dropdown lists the three funds plus the unfiltered option', () => {
    const { api, elements } = loadReports();
    const select = elements.landlordReportCashAccount;
    api.populateReportCashAccountFilters();
    assert.equal((select.innerHTML.match(/<option/g) || []).length, 4);
    assert.match(select.innerHTML, /<option value="">كل الصناديق<\/option>/);
    assert.match(select.innerHTML, /<option value="development">صندوق التطوير<\/option>/);
    assert.match(select.innerHTML, /<option value="emergency">صندوق الصيانة الطارئة<\/option>/);
    assert.equal(select.value, '');
});

test('cash account normalization rejects unknown funds and treats a missing fund as the main vault', () => {
    const { api } = loadReports();
    assert.equal(api.normalizeReportCashAccountFilter(''), '');
    assert.equal(api.normalizeReportCashAccountFilter('development'), 'development');
    assert.equal(api.normalizeReportCashAccountFilter('reserve'), '');
    assert.equal(api.reportCashAccountMatches({ cashAccountCode: 'development' }, 'development'), true);
    assert.equal(api.reportCashAccountMatches({ cashAccountCode: 'development' }, 'emergency'), false);
    assert.equal(api.reportCashAccountMatches({}, 'main'), true);
    assert.equal(api.reportCashAccountMatches({}, 'development'), false);
    assert.equal(api.reportCashAccountFilterLabel(''), 'كل الصناديق');
    assert.equal(api.reportCashAccountFilterLabel('emergency'), 'صندوق الصيانة الطارئة');
});

test('landlord data filters collections and expenses by the selected fund', () => {
    const { api } = loadReports();
    const development = api.getLandlordReportData('يناير 2024', '', 'development');
    assert.deepEqual(development.income.map(item => item.id), ['i2']);
    assert.deepEqual(development.expenses.map(item => item.id), ['e2']);
    const main = api.getLandlordReportData('يناير 2024', '', 'main');
    assert.deepEqual(main.income.map(item => item.id), ['i1', 'i3']);
    assert.deepEqual(main.expenses.map(item => item.id), ['e1']);
    assert.equal(api.getLandlordReportData('يناير 2024', '', '').income.length, 4);
});

test('fund and purpose filters combine on collections while expenses stay fund-only', () => {
    const { api } = loadReports();
    const data = api.getLandlordReportData('يناير 2024', 'development', 'development');
    assert.deepEqual(data.income.map(item => item.id), ['i2']);
    assert.deepEqual(data.expenses.map(item => item.id), ['e2']);
    const empty = api.getLandlordReportData('يناير 2024', 'subscription', 'development');
    assert.equal(empty.income.length, 0);
    assert.deepEqual(empty.expenses.map(item => item.id), ['e2']);
});

test('landlord preview shows the fund and hides building-wide dues when a fund is selected', () => {
    const { api, elements } = loadReports({ cashAccount: 'development' });
    api.generateLandlordReport();
    const preview = elements.landlordReportPreview.innerHTML;
    assert.match(preview, /الصندوق: صندوق التطوير/);
    assert.match(preview, /50 ج\.م/);
    assert.match(preview, /الحركات معروضة لصندوق «صندوق التطوير» فقط/);
    assert.doesNotMatch(preview, /report-stat-label">نسبة التحصيل</);
    assert.doesNotMatch(preview, /report-stat-label">المستحق</);
    assert.doesNotMatch(preview, /100 ج\.م/);
    assert.equal(elements.reportPdfBtn.disabled, false);
    assert.match(elements.landlordReportPreview.innerHTML, /دهانات/);
    assert.doesNotMatch(elements.landlordReportPreview.innerHTML, /كهرباء/);
});

test('selecting a fund invalidates the landlord preview and signature follows the fund', () => {
    const { api, elements } = loadReports({ cashAccount: 'development' });
    api.generateLandlordReport();
    elements.landlordReportCashAccount.value = 'emergency';
    api.invalidateLandlordReportPreview();
    assert.match(elements.landlordReportPreview.innerHTML, /تغيّر الشهر أو الفلتر/);
    assert.equal(elements.reportPdfBtn.disabled, true);
    assert.notEqual(
        api.getLandlordReportSignature('يناير 2024', '', 'development'),
        api.getLandlordReportSignature('يناير 2024', '', 'emergency')
    );
});

test('landlord CSV and PDF outputs follow the selected fund with a fund suffix', () => {
    const { api, calls } = loadReports({ cashAccount: 'development' });
    api.generateLandlordReport();
    api.exportToCSV();
    assert.equal(calls.download.filename, 'manzil_report_2024-01_development.csv');
    assert.match(calls.download.content, /"تحصيل","أحمد","3","يناير 2024","50","تطوير","صندوق التطوير"/);
    assert.match(calls.download.content, /"مصروف","دهانات","","يناير 2024","5","","صندوق التطوير"/);
    assert.doesNotMatch(calls.download.content, /كهرباء/);

    const pdf = api.renderLandlordReportPdfHtml('يناير 2024', '', 'development');
    assert.match(pdf, /تقرير الملاك — يناير 2024 • الصندوق: صندوق التطوير/);
    assert.match(pdf, /الحركات معروضة لصندوق «صندوق التطوير» فقط/);
    assert.doesNotMatch(pdf, /إجمالي المستحق/);
});

test('export refuses a CSV when the fund select was changed after the preview', () => {
    const { api, elements, calls } = loadReports({ cashAccount: 'development' });
    api.generateLandlordReport();
    elements.landlordReportCashAccount.value = 'emergency';
    api.exportToCSV();
    assert.equal(calls.download, undefined);
    assert.ok(calls.toasts.some(entry => entry.includes('اعرض معاينة الصندوق المحدد أولًا')));
});

test('period report filters movements and expenses by fund and hides dues', () => {
    const { api } = loadReports();
    const report = api.buildPeriodReport('يناير 2024', 'مارس 2024', '', 'development');
    assert.equal(report.showDues, false);
    assert.equal(report.cashAccountFilter, 'development');
    assert.equal(report.cashAccountLabel, 'صندوق التطوير');
    assert.equal(report.months.map(row => row.totalIncomeCents).join('|'), '5000|6000|3000');
    assert.equal(report.months.map(row => row.movementCount).join('|'), '1|1|1');
    assert.equal(report.months.map(row => row.expenseCents).join('|'), '500|2500|0');
    assert.equal(report.months.map(row => row.netCents).join('|'), '4500|3500|3000');
    assert.equal(report.totals.totalIncomeCents, 14000);
    assert.equal(report.totals.expenseCents, 3000);
    assert.equal(report.totals.expectedCents, 0);
    assert.equal(report.totals.outstandingCents, 0);
    assert.equal(report.totals.netCents, 11000);
    assert.equal(report.totals.rate, null);
    assert.equal(report.purposes.map(item => item.label).join('|'), 'تطوير');
});

test('period report combines fund and purpose filters', () => {
    const { api } = loadReports();
    const report = api.buildPeriodReport('يناير 2024', 'مارس 2024', 'development', 'development');
    assert.equal(report.showDues, false);
    assert.equal(report.totals.totalIncomeCents, 14000);
    assert.equal(report.totals.expenseCents, 3000);
    const empty = api.buildPeriodReport('يناير 2024', 'مارس 2024', 'emergency', 'development');
    assert.equal(empty.totals.totalIncomeCents, 0);
    assert.equal(empty.totals.expenseCents, 3000);
});

test('period preview and CSV switch to fund columns and note the fund', () => {
    const { api, elements, calls } = loadReports({ cashAccount: 'development' });
    api.generatePeriodReport();
    const preview = elements.periodReportPreview.innerHTML;
    assert.match(preview, /الصندوق: صندوق التطوير/);
    assert.match(preview, /تحصيل الصندوق/);
    assert.match(preview, /<th>تحصيل الصندوق<\/th>/);
    assert.match(preview, /حركة/);
    assert.doesNotMatch(preview, /<th>المستحق<\/th>/);
    assert.doesNotMatch(preview, /<th>نسبة التحصيل<\/th>/);

    api.exportPeriodReportCsv();
    assert.equal(calls.download.filename, 'manzil_period_2024-01_2024-03_development.csv');
    assert.match(calls.download.content, /"الشهر","تحصيل الصندوق","عدد الحركات","المصروف","الصافي"/);
    assert.match(calls.download.content, /"الصندوق","صندوق التطوير"/);
    assert.doesNotMatch(calls.download.content, /"المستحق"/);
});

test('period snapshot guard refuses a changed fund and the signature follows it', () => {
    const { api, elements, calls } = loadReports({ cashAccount: 'development' });
    assert.notEqual(
        api.getPeriodReportSignature('يناير 2024', 'مارس 2024', '', 'development'),
        api.getPeriodReportSignature('يناير 2024', 'مارس 2024', '', 'emergency')
    );
    api.generatePeriodReport();
    elements.periodReportCashAccount.value = 'emergency';
    assert.equal(api.getSelectedPeriodReportSnapshot(), null);
    assert.ok(calls.toasts.some(entry => entry.includes('اعرض معاينة الصندوق المحدد أولًا')));
});
