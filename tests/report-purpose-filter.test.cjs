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
    services: 'خدمات ونظافة',
    development: 'تطوير',
    emergency: 'صيانة طارئة',
    penalty: 'غرامة',
    donation: 'تبرع',
    other: 'أخرى'
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

function loadReports(options = {}) {
    const elements = {
        reportMonthSelect: { value: options.reportMonth ?? 'يناير 2024' },
        landlordReportPurpose: { value: options.purpose ?? '' },
        periodReportPurpose: { value: options.purpose ?? '' },
        statementPurpose: { value: options.purpose ?? '' },
        statementResidentSelect: { value: options.residentId ?? 'r1' },
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
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash', purposeCode: 'subscription' },
            { id: 'i2', residentId: 'r1', month: 'يناير 2024', amount: 50, paymentMethod: 'cash', purposeCode: 'development' },
            { id: 'i3', residentId: 'r1', month: 'فبراير 2024', amount: 40, paymentMethod: 'cash', purposeCode: 'subscription' },
            { id: 'i4', residentId: 'r1', month: 'فبراير 2024', amount: 60, paymentMethod: 'instapay', purposeCode: 'services' },
            { id: 'i5', residentId: 'r1', month: 'مارس 2024', amount: 30, paymentMethod: 'cash', purposeCode: 'development' }
        ],
        expenses: [
            { id: 'e1', month: 'يناير 2024', title: 'كهرباء', amount: 10, category: 'مرافق' },
            { id: 'e2', month: 'فبراير 2024', title: 'صيانة', amount: 25, category: 'صيانة' }
        ]
    };
    const calls = { toasts: [] };
    const sandbox = {
        state,
        monthsNames: monthNames,
        INCOME_PURPOSE_LABELS: PURPOSE_LABELS,
        getCurrentMonth: () => 'مارس 2024',
        monthLabelToKey,
        toCents,
        normalizeIncomePurpose,
        getIncomePurposeLabel: purpose => PURPOSE_LABELS[normalizeIncomePurpose(purpose)],
        isSubscriptionIncome: payment => normalizeIncomePurpose(payment?.purposeCode) === 'subscription',
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
        getMonthOutstanding: (resident, month) => {
            const dueCents = toCents(Number(resident?.monthlyAmount ?? state.defaultSubscription) || 0);
            const paidCents = toCents(sandbox.getPaidAmountForMonth(resident.id, month));
            return Math.max(0, dueCents - paidCents) / 100;
        },
        getIncomePaymentMethodLabel: method => ({
            cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي'
        }[method] || 'غير محدد'),
        getCashAccountLabel: code => ({ main: 'الخزنة الرئيسية', development: 'صندوق التطوير', emergency: 'صندوق الطوارئ' }[code || 'main']),
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
        `${reports}\n({\n            getLandlordReportData, getLandlordReportSignature, generateLandlordReport, exportToCSV,\n            renderLandlordReportPdfHtml, invalidateLandlordReportPreview,\n            buildPeriodReport, getPeriodReportSignature, generatePeriodReport, renderPeriodReportHtml,\n            exportPeriodReportCsv, invalidatePeriodReportPreview, getSelectedPeriodReportSnapshot,\n            buildResidentStatement, getResidentStatementSignature, generateResidentStatement,\n            renderResidentStatementHtml, renderResidentStatementPdfHtml, renderUnitReportPdfHtml, buildUnitReportStatement, exportUnitReportPdf,\n            exportResidentStatementCsv, invalidateResidentStatementPreview, getResidentStatementSnapshot,\n            populateReportPurposeFilters, getReportPurposeFilter, reportPaymentMatchesPurpose\n        })`,
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

test('purpose filter markup sits in the three report toolbars and is populated centrally', () => {
    [['landlordReportPurpose', 'invalidateLandlordReportPreview'], ['periodReportPurpose', 'invalidatePeriodReportPreview'], ['statementPurpose', 'invalidateResidentStatementPreview']].forEach(([id, handler]) => {
        assert.match(html, new RegExp(`id="${id}"[^>]*onchange="${handler}\\(\\)"`), id + ' must gate its preview');
    });
    assert.match(reports, /const REPORT_PURPOSE_FILTER_IDS = \['landlordReportPurpose', 'periodReportPurpose', 'statementPurpose'\]/);
    assert.match(reports, /function populateReportPurposeFilters\(\)/);
    assert.match(render, /populateReportPurposeFilters\(\)/);
});

test('the purpose dropdown lists all purposes plus the unfiltered option', () => {
    const { api, elements } = loadReports();
    const select = elements.landlordReportPurpose;
    api.populateReportPurposeFilters();
    assert.equal((select.innerHTML.match(/<option/g) || []).length, 8);
    assert.match(select.innerHTML, /<option value="">كل الأغراض<\/option>/);
    assert.match(select.innerHTML, /<option value="development">تطوير<\/option>/);
    assert.equal(select.value, '');
});

test('landlord data keeps expenses and filters collections by purpose', () => {
    const { api } = loadReports();
    const data = api.getLandlordReportData('يناير 2024', 'development');
    assert.deepEqual(data.income.map(item => item.id), ['i2']);
    assert.deepEqual(data.expenses.map(item => item.id), ['e1']);
    assert.equal(api.getLandlordReportData('يناير 2024', '').income.length, 2);
});

test('landlord preview shows purpose collections and hides dues when the purpose is not subscription', () => {
    const { api, elements } = loadReports({ purpose: 'development' });
    api.generateLandlordReport();
    const preview = elements.landlordReportPreview.innerHTML;
    assert.match(preview, /الغرض: تطوير/);
    assert.match(preview, /تحصيل الغرض/);
    assert.match(preview, /50 ج\.م/);
    assert.match(preview, /عدد الحركات/);
    assert.match(preview, /غير مرتبطة بأغراض التحصيل/);
    assert.doesNotMatch(preview, /report-stat-label">نسبة التحصيل</);
    assert.doesNotMatch(preview, /report-stat-label">المستحق</);
    assert.equal(elements.reportPdfBtn.disabled, false);
});

test('subscription filtering keeps dues and collection rate in the landlord report', () => {
    const { api, elements } = loadReports({ purpose: 'subscription' });
    api.generateLandlordReport();
    const preview = elements.landlordReportPreview.innerHTML;
    assert.match(preview, /نسبة التحصيل/);
    assert.match(preview, /report-stat-label">المستحق</);
    assert.match(preview, /100 ج\.م/);
    assert.doesNotMatch(preview, /50 ج\.م/);
});

test('changing the purpose invalidates the landlord preview and signature follows the filter', () => {
    const { api, elements } = loadReports({ purpose: 'development' });
    api.generateLandlordReport();
    assert.match(elements.landlordReportPreview.innerHTML, /تحصيل الغرض/);
    elements.landlordReportPurpose.value = 'services';
    api.invalidateLandlordReportPreview();
    assert.match(elements.landlordReportPreview.innerHTML, /تغيّر الشهر أو الغرض/);
    assert.equal(elements.reportPdfBtn.disabled, true);
    assert.notEqual(
        api.getLandlordReportSignature('يناير 2024', 'development'),
        api.getLandlordReportSignature('يناير 2024', 'services')
    );
});

test('landlord CSV and PDF outputs follow the selected purpose', () => {
    const { api, elements, calls } = loadReports({ purpose: 'development' });
    api.generateLandlordReport();
    api.exportToCSV();
    assert.equal(calls.download.filename, 'manzil_report_2024-01_development.csv');
    assert.match(calls.download.content, /"تحصيل","أحمد","3","يناير 2024","50","تطوير"/);
    assert.doesNotMatch(calls.download.content, /"تحصيل","أحمد","3","يناير 2024","100"/);
    assert.match(calls.download.content, /"مصروف","كهرباء"/);

    const pdf = api.renderLandlordReportPdfHtml('يناير 2024', 'development');
    assert.match(pdf, /تقرير الملاك — يناير 2024 • الغرض: تطوير/);
    assert.match(pdf, /تحصيل الغرض/);
    assert.doesNotMatch(pdf, /إجمالي المستحق/);
});

test('period report filters collections and drops subscription dues for non-subscription purposes', () => {
    const { api } = loadReports();
    const report = api.buildPeriodReport('يناير 2024', 'مارس 2024', 'development');
    assert.equal(report.showDues, false);
    assert.equal(report.purposeLabel, 'تطوير');
    assert.equal(report.months.map(row => row.totalIncomeCents).join('|'), '5000|0|3000');
    assert.equal(report.months.map(row => row.movementCount).join('|'), '1|0|1');
    assert.equal(report.totals.totalIncomeCents, 8000);
    assert.equal(report.totals.expectedCents, 0);
    assert.equal(report.totals.outstandingCents, 0);
    assert.equal(report.totals.expenseCents, 3500);
    assert.equal(report.totals.netCents, 4500);
    assert.equal(report.totals.rate, null);
    assert.equal(report.purposes.map(item => item.label).join('|'), 'تطوير');
    assert.equal(report.methods.length, 1);
    assert.equal(report.methods[0].cents, 8000);
});

test('period preview and CSV switch to purpose columns when dues do not apply', () => {
    const { api, elements, calls } = loadReports({ purpose: 'development' });
    api.generatePeriodReport();
    const preview = elements.periodReportPreview.innerHTML;
    assert.match(preview, /الغرض: تطوير/);
    assert.match(preview, /تحصيل الغرض/);
    assert.doesNotMatch(preview, /<th>المستحق<\/th>/);
    assert.doesNotMatch(preview, /<th>نسبة التحصيل<\/th>/);

    api.exportPeriodReportCsv();
    assert.equal(calls.download.filename, 'manzil_period_2024-01_2024-03_development.csv');
    assert.match(calls.download.content, /"الشهر","تحصيل الغرض","عدد الحركات","المصروف","الصافي"/);
    assert.match(calls.download.content, /"الغرض","تطوير"/);
    assert.doesNotMatch(calls.download.content, /"المستحق"/);
});

test('period subscription filtering keeps the monthly dues ledger', () => {
    const { api } = loadReports();
    const report = api.buildPeriodReport('يناير 2024', 'مارس 2024', 'subscription');
    assert.equal(report.showDues, true);
    assert.equal(report.totals.collectedCents, 14000);
    assert.equal(report.totals.otherIncomeCents, 0);
    assert.equal(report.totals.expectedCents, 30000);
    assert.equal(report.totals.rate, 47);
    assert.equal(report.purposes.map(item => item.label).join('|'), 'اشتراك شهري');
    const preview = api.renderPeriodReportHtml(report);
    assert.match(preview, /<th>المستحق<\/th>/);
    assert.match(preview, /الاشتراكات فقط/);
});

test('period signature and snapshot guard include the purpose filter', () => {
    const { api, elements, calls } = loadReports({ purpose: 'development' });
    assert.notEqual(
        api.getPeriodReportSignature('يناير 2024', 'مارس 2024', 'development'),
        api.getPeriodReportSignature('يناير 2024', 'مارس 2024', 'services')
    );
    api.generatePeriodReport();
    elements.periodReportPurpose.value = 'services';
    assert.equal(api.getSelectedPeriodReportSnapshot(), null);
    assert.ok(calls.toasts.some(entry => entry.includes('اعرض معاينة الغرض المحدد أولًا')));
});

test('statement filters payments and hides the monthly dues table for non-subscription purposes', () => {
    const { api } = loadReports();
    const statement = api.buildResidentStatement('r1', 'development');
    assert.equal(statement.showDues, false);
    assert.equal(statement.purposeLabel, 'تطوير');
    assert.deepEqual(statement.payments.map(item => item.id), ['i2', 'i5']);
    assert.equal(statement.totals.filteredPaidCents, 8000);
    assert.equal(statement.totals.paidCents, 14000);
    const preview = api.renderResidentStatementHtml(statement);
    assert.match(preview, /مدفوع الغرض/);
    assert.match(preview, /80 ج\.م/);
    assert.doesNotMatch(preview, /statement-table/);
    assert.doesNotMatch(preview, /خدمات ونظافة/);
    assert.doesNotMatch(preview, /إجمالي المستحق/);
});

test('statement subscription filtering keeps the dues ledger and subscription movements', () => {
    const { api } = loadReports();
    const statement = api.buildResidentStatement('r1', 'subscription');
    assert.equal(statement.showDues, true);
    assert.deepEqual(statement.payments.map(item => item.id), ['i1', 'i3']);
    const preview = api.renderResidentStatementHtml(statement);
    assert.match(preview, /statement-table/);
    assert.match(preview, /إجمالي المستحق/);
    assert.doesNotMatch(preview, /خدمات ونظافة/);
    assert.doesNotMatch(preview, /تطوير/);
});

test('unit report ignores the purpose filter and keeps every unit movement', () => {
    const { api } = loadReports();
    const filtered = api.buildResidentStatement('r1', 'development');
    const statement = api.buildUnitReportStatement(filtered);
    assert.equal(statement.purposeFilter, '');
    assert.equal(statement.showDues, true);
    assert.equal(statement.payments.length, 5);
    const preview = api.renderUnitReportPdfHtml(statement);
    assert.match(preview, /خدمات ونظافة/);
    assert.match(preview, /اشتراك شهري/);
    assert.match(preview, /تطوير/);
    assert.match(preview, /بغض النظر عن فلتر الغرض/);
});

test('statement CSV and signatures follow the purpose filter', () => {
    const { api, calls, elements } = loadReports({ purpose: 'development' });
    api.generateResidentStatement();
    api.exportResidentStatementCsv();
    assert.equal(calls.download.filename, 'manzil_statement_3_2024-03_development.csv');
    assert.match(calls.download.content, /"الغرض","تطوير"/);
    assert.match(calls.download.content, /"تحصيل","مارس 2024","30","تطوير"/);
    assert.doesNotMatch(calls.download.content, /"المستحق"/);
    assert.notEqual(
        api.getResidentStatementSignature('r1', 'development'),
        api.getResidentStatementSignature('r1', 'services')
    );
    elements.statementPurpose.value = 'services';
    assert.equal(api.getResidentStatementSnapshot(), null);
    api.invalidateResidentStatementPreview();
    assert.match(elements.residentStatementPreview.innerHTML, /تغيّر الساكن أو الغرض/);
});

test('payment matching treats missing purpose as subscription and accepts known codes', () => {
    const { api } = loadReports();
    assert.equal(api.reportPaymentMatchesPurpose({ purposeCode: '' }, 'subscription'), true);
    assert.equal(api.reportPaymentMatchesPurpose({ purposeCode: 'development' }, 'development'), true);
    assert.equal(api.reportPaymentMatchesPurpose({ purposeCode: 'development' }, 'services'), false);
    assert.equal(api.reportPaymentMatchesPurpose({ purposeCode: 'development' }, ''), true);
});
