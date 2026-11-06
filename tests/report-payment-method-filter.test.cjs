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
        landlordReportCashAccount: { value: options.cashAccount ?? '' },
        landlordReportPaymentMethod: { value: options.method ?? '' },
        landlordReportPreview: { innerHTML: '', dataset: {} },
        reportPrintBtn: { disabled: true },
        reportPdfBtn: { disabled: true },
        reportExportBtn: { disabled: true },
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
            { id: 'i5', residentId: 'r1', month: 'فبراير 2024', amount: 40, paymentMethod: 'cash', purposeCode: 'subscription', cashAccountCode: 'main' }
        ],
        expenses: [
            { id: 'e1', month: 'يناير 2024', title: 'كهرباء', amount: 10, category: 'مرافق', cashAccountCode: 'main' },
            { id: 'e2', month: 'يناير 2024', title: 'دهانات', amount: 5, category: 'تطوير', cashAccountCode: 'development' }
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
        getCurrentMonth: () => 'يناير 2024',
        monthLabelToKey,
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
        getSubscriptionAmountForMonth: (resident) => Number(resident?.monthlyAmount ?? state.defaultSubscription) || 0,
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
        `${reports}\n({\n            getLandlordReportData, getLandlordReportSignature, generateLandlordReport, exportToCSV,\n            renderLandlordReportPdfHtml, generateLandlordReport, invalidateLandlordReportPreview,\n            populateReportPaymentMethodFilters, getReportPaymentMethodFilter, normalizeReportPaymentMethodFilter,\n            reportPaymentMatchesMethod, reportPaymentMethodFilterLabel, filterReportIncome\n        })`,
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

test('payment method filter sits in the landlord toolbar and is populated centrally', () => {
    assert.match(html, /id="landlordReportPaymentMethod"[^>]*onchange="invalidateLandlordReportPreview\(\)"/);
    assert.match(render, /populateReportPaymentMethodFilters\(\)/);
    const { api, elements } = loadReports();
    api.populateReportPaymentMethodFilters();
    assert.match(elements.landlordReportPaymentMethod.innerHTML, /<option value="">كل الطرق<\/option>/);
    assert.match(elements.landlordReportPaymentMethod.innerHTML, /<option value="instapay">InstaPay<\/option>/);
    assert.match(elements.landlordReportPaymentMethod.innerHTML, /<option value="bank_transfer">تحويل بنكي<\/option>/);
});

test('payment method values normalize against the supported methods', () => {
    const { api } = loadReports();
    assert.equal(api.normalizeReportPaymentMethodFilter('cash'), 'cash');
    assert.equal(api.normalizeReportPaymentMethodFilter(' wallet '), 'wallet');
    assert.equal(api.normalizeReportPaymentMethodFilter('cheque'), '');
    assert.equal(api.normalizeReportPaymentMethodFilter(''), '');
    assert.equal(api.reportPaymentMethodFilterLabel('instapay'), 'InstaPay');
    assert.equal(api.reportPaymentMethodFilterLabel(''), 'كل الطرق');
    assert.equal(api.reportPaymentMatchesMethod({ paymentMethod: 'cash' }, 'cash'), true);
    assert.equal(api.reportPaymentMatchesMethod({ paymentMethod: 'wallet' }, 'cash'), false);
    assert.equal(api.reportPaymentMatchesMethod({}, ''), true);
});

test('landlord report data filters collections by method and keeps expenses', () => {
    const { api } = loadReports();
    const cash = api.getLandlordReportData('يناير 2024', '', '', 'cash');
    assert.deepEqual(cash.income.map(item => item.id), ['i1', 'i2']);
    assert.equal(cash.expenses.length, 2);

    const wallet = api.getLandlordReportData('يناير 2024', '', '', 'wallet');
    assert.deepEqual(wallet.income.map(item => item.id), ['i3']);

    const combined = api.getLandlordReportData('يناير 2024', 'subscription', '', 'wallet');
    assert.deepEqual(combined.income.map(item => item.id), ['i3']);

    const fundAndMethod = api.getLandlordReportData('يناير 2024', '', 'development', 'cash');
    assert.deepEqual(fundAndMethod.income.map(item => item.id), ['i2']);

    const none = api.getLandlordReportData('يناير 2024', '', '', 'bank_transfer');
    assert.equal(none.income.length, 0);
});

test('payment method filter changes the signature', () => {
    const { api } = loadReports();
    assert.notEqual(
        api.getLandlordReportSignature('يناير 2024', '', '', 'cash'),
        api.getLandlordReportSignature('يناير 2024', '', '', 'wallet')
    );
    assert.equal(
        api.getLandlordReportSignature('يناير 2024', '', '', 'cash'),
        api.getLandlordReportSignature('يناير 2024', '', '', 'cash')
    );
});

test('preview hides building-wide dues and explains the method filter', () => {
    const { api, elements } = loadReports({ method: 'instapay' });
    api.generateLandlordReport();
    const preview = elements.landlordReportPreview.innerHTML;
    assert.match(preview, /طريقة الدفع: InstaPay/);
    assert.match(preview, /تحصيل الطريقة/);
    assert.match(preview, /التحصيلات معروضة لطريقة «InstaPay» فقط/);
    assert.doesNotMatch(preview, /report-stat-label">المستحق/);
    assert.doesNotMatch(preview, /report-stat-label">نسبة التحصيل/);
    assert.match(preview, /30 ج\.م/);
    assert.doesNotMatch(preview, /أحمد · 100/);
    assert.equal(elements.reportExportBtn.disabled, false);
});

test('changing the method invalidates the preview and guards CSV', () => {
    const { api, elements, calls } = loadReports({ method: 'cash' });
    api.generateLandlordReport();
    elements.landlordReportPaymentMethod.value = 'wallet';
    api.invalidateLandlordReportPreview();
    assert.match(elements.landlordReportPreview.innerHTML, /تغيّر الشهر أو الفلتر أو البيانات/);
    assert.equal(elements.reportExportBtn.disabled, true);

    elements.landlordReportPaymentMethod.value = 'cash';
    api.generateLandlordReport();
    elements.landlordReportPaymentMethod.value = 'wallet';
    api.exportToCSV();
    assert.equal(calls.download, undefined);
    assert.ok(calls.toasts.some(entry => entry.includes('اعرض معاينة طريقة الدفع المحددة أولًا')));
});

test('CSV scopes collections to the method and suffixes the filename', () => {
    const { api, elements, calls } = loadReports({ method: 'wallet' });
    api.generateLandlordReport();
    api.exportToCSV();
    assert.equal(calls.download.filename, 'manzil_report_2024-01_pay_wallet.csv');
    assert.match(calls.download.content, /"تحصيل","أحمد","3","يناير 2024","20","اشتراك شهري","الخزنة الرئيسية","محفظة إلكترونية"/);
    assert.doesNotMatch(calls.download.content, /"نقدًا"/);
    assert.match(calls.download.content, /"مصروف","كهرباء"/);
    assert.equal(elements.reportExportBtn.disabled, false);
});

test('PDF header and footer carry the method filter', () => {
    const { api } = loadReports();
    const pdf = api.renderLandlordReportPdfHtml('يناير 2024', '', '', 'instapay');
    assert.match(pdf, /طريقة الدفع: InstaPay/);
    assert.match(pdf, /التحصيلات معروضة لطريقة «InstaPay» فقط/);
    assert.match(pdf, /30/);
    assert.doesNotMatch(pdf, /نقدًا/);
});
