const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const reportsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const extendedSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-extended.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const renderSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'render.js'), 'utf8');
const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function monthLabelToKey(month) {
    const [name, year] = String(month || '').trim().split(/\s+/);
    const index = monthNames.indexOf(name);
    return index < 0 || !/^\d{4}$/.test(year || '') ? null : `${year}-${String(index + 1).padStart(2, '0')}-01`;
}

function shiftMonth(key, offset) {
    const date = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function loadExtended() {
    const elements = {
        cashFlowFrom: { value: 'يناير 2024' },
        cashFlowTo: { value: 'فبراير 2024' },
        cashFlowPreset: { value: 'custom' },
        cashFlowCashAccount: { value: '' },
        cashFlowPreview: { innerHTML: '', dataset: {} },
        extendedCashFlowChartContainer: {},
        cashFlowPrintBtn: { disabled: true },
        cashFlowPdfBtn: { disabled: true },
        cashFlowExportBtn: { disabled: true },
        cashFlowExcelBtn: { disabled: true },
        apartmentsReportFrom: { value: 'يناير 2024' },
        apartmentsReportTo: { value: 'فبراير 2024' },
        apartmentsReportPreset: { value: 'custom' },
        apartmentsReportResident: { value: '' },
        apartmentsReportPreview: { innerHTML: '', dataset: {} },
        extendedApartmentsChartContainer: {},
        apartmentsPrintBtn: { disabled: true },
        apartmentsPdfBtn: { disabled: true },
        apartmentsExportBtn: { disabled: true },
        apartmentsExcelBtn: { disabled: true },
        printBuildingTitle: { textContent: '' },
        printBuildingMeta: { textContent: '' }
    };
    const state = {
        buildingName: 'عمارة النور',
        managerName: 'المدير',
        residents: [
            { id: 'r1', apartmentNumber: '3', name: 'أحمد', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z' },
            { id: 'r2', apartmentNumber: '5', name: 'سارة', monthlyAmount: 200, createdAt: '2024-02-01T00:00:00.000Z' }
        ],
        income: [
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, purposeCode: 'subscription', cashAccountCode: 'main', date: '2024-01-05' },
            { id: 'i2', residentId: 'r1', month: 'فبراير 2024', amount: 60, purposeCode: 'subscription', cashAccountCode: 'main', date: '2024-02-05' },
            { id: 'i3', residentId: 'r2', month: 'فبراير 2024', amount: 200, purposeCode: 'subscription', cashAccountCode: 'development', date: '2024-02-06' },
            { id: 'i4', residentId: 'r1', month: 'فبراير 2024', amount: 50, purposeCode: 'other', cashAccountCode: 'development', date: '2024-02-07' }
        ],
        expenses: [
            { id: 'e1', month: 'يناير 2024', amount: 30, category: 'مرافق', cashAccountCode: 'main' },
            { id: 'e2', month: 'فبراير 2024', amount: 20, category: 'صيانة', cashAccountCode: 'development' }
        ],
        adjustments: []
    };
    const calls = { downloads: [], excels: [], pdfs: [], charts: [], printed: false, events: [] };
    const sandbox = {
        state,
        Date,
        console,
        monthsNames: monthNames,
        setTimeout: () => {},
        CASH_ACCOUNTS: {
            main: { label: 'الخزنة الرئيسية' },
            development: { label: 'صندوق التطوير' },
            emergency: { label: 'صندوق الطوارئ' }
        },
        REPORT_CHART_COLORS: { emerald: '#059669', rose: '#e11d48', amber: '#d97706', indigo: '#6366f1', sky: '#0284c7', slate: '#64748b' },
        toCents: value => Math.round((Number(value) || 0) * 100),
        fmtNum: value => String(Number(value) || 0),
        fmtMoney: value => `${Number(value) || 0} ج.م`,
        esc: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])),
        getCurrentMonth: () => 'مارس 2024',
        monthLabelToKey,
        getStatementMonthLabel: key => `${monthNames[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
        shiftStatementMonthKey: shiftMonth,
        getBuildingMonthOptions: () => ['يناير 2024', 'فبراير 2024', 'مارس 2024'],
        getCashAccountLabel: code => sandbox.CASH_ACCOUNTS[code]?.label || 'الخزنة الرئيسية',
        getIncomePurposeLabel: code => ({ subscription: 'اشتراك شهري', other: 'أخرى' }[code] || 'أخرى'),
        getMonthlyDueAmountForMonth: (resident, month) => {
            const key = monthLabelToKey(month);
            const start = String(resident.createdAt || '').slice(0, 7);
            return key && key.slice(0, 7) >= start ? Number(resident.monthlyAmount) || 0 : 0;
        },
        getMonthOutstanding: resident => resident.id === 'r1' ? 40 : 0,
        getResidentBillingStartKey: resident => String(resident.createdAt || '').slice(0, 7) + '-01',
        formatApartmentLabel: value => {
            const raw = String(value ?? '').trim();
            if (!raw) return 'شقة —';
            return /^شقة(?:\s|$)/.test(raw) ? raw : `شقة ${raw}`;
        },
        formatDate: value => String(value || '').slice(0, 10),
        requireManager: () => true,
        toast: (message, kind) => calls.events.push(`${kind}:${message}`),
        Blob: class { constructor(parts, options) { sandbox.__blob = { parts, type: options && options.type }; } },
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
        localStorage: {
            store: new Map(),
            getItem(key) { return this.store.get(key) || null; },
            setItem(key, value) { this.store.set(key, String(value)); }
        },
        document: {
            body: { classList: makeClassList() },
            getElementById: id => elements[id] || null,
            querySelector: selector => {
                const match = /\[data-report-nav="([^"]+)"\]/.exec(selector);
                const labels = { cashflow: 'التدفق النقدي', apartments: 'أداء الشقق', landlord: 'تقرير الملاك' };
                return match ? {
                    dataset: { reportNav: match[1] },
                    classList: makeClassList(),
                    querySelector: () => ({ textContent: labels[match[1]] || match[1] })
                } : null;
            },
            querySelectorAll: () => [],
            addEventListener: () => {},
            createElement: () => ({ click() { calls.downloads.push({ name: this.download, content: String(sandbox.__blob?.parts?.[0] || '') }); } })
        },
        window: {
            print() { calls.printed = true; },
            addEventListener() {}
        }
    };
    const api = vm.runInNewContext(
        `${reportsSource}\n${extendedSource}\n({
            REPORT_TABS, REPORT_PANEL_IDS, REPORT_OUTPUT_BUTTON_IDS,
            buildCashFlowReport, getCashFlowSignature, generateCashFlowReport,
            getSelectedCashFlowSnapshot, invalidateCashFlowPreview, invalidateCashFlowIfStale,
            cashFlowCsvRows, renderCashFlowHtml, renderCashFlowPdfHtml, printCashFlowReport, exportCashFlowCsv,
            exportCashFlowExcel, exportCashFlowPdf, invalidateExtendedReportsIfStale,
            buildApartmentPerformanceReport, generateApartmentsReport, getSelectedApartmentsSnapshot,
            invalidateApartmentsPreview, apartmentsCsvRows, renderApartmentsHtml, renderApartmentsPdfHtml,
            printApartmentsReport, exportApartmentsCsv, exportApartmentsExcel, exportApartmentsPdf,
            populateExtendedReportFilters, initExtendedReportsUI
        })`,
        sandbox,
        { filename: 'reports-extended.test.cjs' }
    );
    sandbox.downloadStatementPdf = async (pdfHtml, filename, buttonId) => {
        calls.pdfs.push({ filename, html: pdfHtml, buttonId });
        return true;
    };
    sandbox.exportReportExcel = (filename, sheets) => {
        calls.excels.push({ filename, sheets });
        return true;
    };
    sandbox.destroyChartsInContainer = () => { calls.charts.push('destroy'); };
    sandbox.createChartContainer = (containerId, canvasId) => ({
        id: canvasId,
        attributes: {},
        setAttribute(key, value) { this.attributes[key] = value; }
    });
    sandbox.renderLineSeries = (id, labels, series) => calls.charts.push({ id, labels, series });
    sandbox.renderBarValues = (id, labels, values) => calls.charts.push({ id, labels, values });
    return { api, sandbox, elements, state, calls };
}

function makeClassList() {
    const classes = new Set();
    return {
        add: name => classes.add(name),
        remove: name => classes.delete(name),
        contains: name => classes.has(name),
        toggle(name, force) {
            const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
            if (shouldAdd) classes.add(name); else classes.delete(name);
            return shouldAdd;
        }
    };
}

test('extended reports are wired into the generated shell', () => {
    assert.match(html, /data-report-nav="cashflow"[^>]*aria-controls="cashFlowPanel"/);
    assert.match(html, /data-report-nav="apartments"[^>]*aria-controls="apartmentsPanel"/);
    assert.match(html, /id="cashFlowPreview"[^>]*aria-live="polite"/);
    assert.match(html, /id="apartmentsReportPreview"[^>]*aria-live="polite"/);
    assert.match(html, /<script src="js\/reports\/extended\/reports-extended\.js(?:\?v=[a-f0-9]+)?"><\/script>/);
    assert.match(renderSource, /populateExtendedReportFilters\(months, current\)/);
    assert.match(renderSource, /invalidateExtendedReportsIfStale\(\)/);
    const { api } = loadExtended();
    assert.ok(api.REPORT_TABS.includes('cashflow'));
    assert.ok(api.REPORT_TABS.includes('apartments'));
    assert.equal(api.REPORT_PANEL_IDS.cashflow, 'cashFlowPanel');
    assert.equal(api.REPORT_PANEL_IDS.apartments, 'apartmentsPanel');
    assert.equal(api.REPORT_OUTPUT_BUTTON_IDS.cashflow, 'cashFlowPrintBtn');
    assert.equal(api.REPORT_OUTPUT_BUTTON_IDS.apartments, 'apartmentsPrintBtn');
});

test('cash flow report totals months, funds, purposes and categories in cents', () => {
    const { api } = loadExtended();
    const report = api.buildCashFlowReport('يناير 2024', 'فبراير 2024');
    assert.equal(report.months.map(row => row.month).join('|'), 'يناير 2024|فبراير 2024');
    assert.equal(report.months.map(row => row.incomeCents).join('|'), '10000|31000');
    assert.equal(report.months.map(row => row.expenseCents).join('|'), '3000|2000');
    assert.equal(report.months.map(row => row.netCents).join('|'), '7000|29000');
    assert.equal(report.totals.incomeCents, 41000);
    assert.equal(report.totals.expenseCents, 5000);
    assert.equal(report.totals.netCents, 36000);
    assert.equal(report.totals.averageIncomeCents, 20500);
    assert.equal(report.totals.bestMonth.month, 'فبراير 2024');
    assert.equal(report.totals.worstMonth.month, 'يناير 2024');
    assert.equal(report.funds.map(fund => fund.code).join('|'), 'development|main|emergency');
    assert.equal(report.funds.find(fund => fund.code === 'main').incomeCents, 16000);
    assert.equal(report.purposes.map(item => item.label).join('|'), 'اشتراك شهري|أخرى');
    assert.equal(report.purposes.map(item => item.cents).join('|'), '36000|5000');
    assert.equal(report.categories.map(item => item.label).join('|'), 'مرافق|صيانة');
});

test('cash flow report respects the fund filter and rejects invalid ranges', () => {
    const { api } = loadExtended();
    const report = api.buildCashFlowReport('يناير 2024', 'فبراير 2024', 'development');
    assert.equal(report.cashAccountFilter, 'development');
    assert.equal(report.totals.incomeCents, 25000);
    assert.equal(report.totals.expenseCents, 2000);
    assert.equal(report.funds.length, 1);
    assert.equal(report.funds[0].label, 'صندوق التطوير');
    assert.equal(api.buildCashFlowReport('فبراير 2024', 'يناير 2024'), null);
    assert.equal(api.buildCashFlowReport('', 'فبراير 2024'), null);
});

test('apartment performance respects residency start and per-resident filter', () => {
    const { api } = loadExtended();
    const report = api.buildApartmentPerformanceReport('يناير 2024', 'فبراير 2024');
    assert.equal(report.rows.length, 2);
    const first = report.rows[0];
    assert.equal(first.label, 'شقة 3 · أحمد');
    assert.equal(first.months.length, 2);
    assert.equal(first.dueCents, 20000);
    assert.equal(first.paidCents, 16000);
    assert.equal(first.remainingCents, 4000);
    assert.equal(first.rate, 80);
    assert.equal(first.otherIncomeCents, 5000);
    assert.equal(first.lastPaymentDate, '2024-02-07');
    const second = report.rows[1];
    assert.equal(second.months.length, 1, 'the second apartment joined in February');
    assert.equal(second.dueCents, 20000);
    assert.equal(second.remainingCents, 0);
    assert.equal(report.totals.dueCents, 40000);
    assert.equal(report.totals.paidCents, 36000);
    assert.equal(report.totals.remainingCents, 4000);
    assert.equal(report.totals.rate, 90);
    const filtered = api.buildApartmentPerformanceReport('يناير 2024', 'فبراير 2024', 'r1');
    assert.equal(filtered.rows.length, 1);
    assert.equal(filtered.rows[0].resident.id, 'r1');
});

test('generate previews render shared blocks, draw charts and gate every output', () => {
    const { api, elements, calls, state } = loadExtended();
    api.generateCashFlowReport();
    assert.match(elements.cashFlowPreview.innerHTML, /report-preview-title/);
    assert.match(elements.cashFlowPreview.innerHTML, /report-stats report-stats-4/);
    assert.match(elements.cashFlowPreview.innerHTML, /تقرير التدفق النقدي/);
    assert.equal(elements.cashFlowPrintBtn.disabled, false);
    assert.equal(elements.cashFlowPdfBtn.disabled, false);
    assert.equal(elements.cashFlowExportBtn.disabled, false);
    assert.equal(elements.cashFlowExcelBtn.disabled, false);
    assert.ok(calls.charts.some(entry => entry.id === 'cashFlowChart'));
    assert.ok(api.getSelectedCashFlowSnapshot());

    api.generateApartmentsReport();
    assert.match(elements.apartmentsReportPreview.innerHTML, /تفاصيل كل شقة/);
    assert.equal(elements.apartmentsPrintBtn.disabled, false);
    assert.equal(elements.apartmentsExcelBtn.disabled, false);
    assert.ok(calls.charts.some(entry => entry.id === 'apartmentsChart'));

    state.income.push({ id: 'i5', month: 'فبراير 2024', amount: 10, cashAccountCode: 'main', purposeCode: 'subscription', residentId: 'r1' });
    api.invalidateExtendedReportsIfStale();
    assert.equal(elements.cashFlowPrintBtn.disabled, true);
    assert.equal(elements.apartmentsPrintBtn.disabled, true);
    assert.equal(api.getSelectedCashFlowSnapshot(), null);
    assert.equal(api.getSelectedApartmentsSnapshot(), null);
});

test('a plain render keeps fresh previews and field-only edits invalidate them', () => {
    const { api, elements, state } = loadExtended();
    api.generateCashFlowReport();
    api.generateApartmentsReport();

    // إعادة الرسم دون تغيّر البيانات لا يجب أن تُبطل المعاينة الصالحة.
    api.invalidateExtendedReportsIfStale();
    assert.equal(elements.cashFlowPrintBtn.disabled, false);
    assert.equal(elements.apartmentsPrintBtn.disabled, false);
    assert.match(elements.cashFlowPreview.innerHTML, /تقرير التدفق النقدي/);

    // تغيير الصندوق بمبلغ ثابت لا يغيّر المجاميع لكنه يغيّر نتيجة التقرير.
    state.income[0].cashAccountCode = 'development';
    api.invalidateExtendedReportsIfStale();
    assert.equal(elements.cashFlowPrintBtn.disabled, true);
    assert.equal(elements.apartmentsPrintBtn.disabled, true);
    assert.equal(elements.cashFlowPreview.dataset.stale, 'true');
});

test('changing a filter invalidates the previewed report and its outputs', () => {
    const { api, elements } = loadExtended();
    api.generateCashFlowReport();
    elements.cashFlowCashAccount.value = 'main';
    api.invalidateCashFlowPreview();
    assert.equal(elements.cashFlowPrintBtn.disabled, true);
    assert.match(elements.cashFlowPreview.innerHTML, /غيّرت الفلاتر/);
    api.generateCashFlowReport();
    assert.equal(api.getSelectedCashFlowSnapshot().cashAccountFilter, 'main');
    assert.match(api.getCashFlowSignature(), /main/);
});

test('CSV, Excel and PDF outputs use the previewed snapshot', async () => {
    const { api, calls } = loadExtended();
    api.generateCashFlowReport();
    api.generateApartmentsReport();
    api.exportCashFlowCsv();
    api.exportApartmentsCsv();
    api.exportCashFlowExcel();
    api.exportApartmentsExcel();
    await api.exportCashFlowPdf();
    await api.exportApartmentsPdf();
    assert.ok(calls.downloads.some(download => /manzil_cashflow_2024-01_2024-02\.csv/.test(download.name)));
    assert.ok(calls.downloads.some(download => /manzil_apartments_2024-01_2024-02\.csv/.test(download.name)));
    assert.equal(calls.excels.length, 2);
    assert.equal(calls.pdfs.length, 2);
    assert.ok(calls.pdfs.some(pdf => pdf.buttonId === 'cashFlowPdfBtn' && /dir="rtl" lang="ar"/.test(pdf.html)));
    assert.ok(calls.pdfs.some(pdf => pdf.buttonId === 'apartmentsPdfBtn' && /تقرير أداء الشقق/.test(pdf.html)));
    assert.match(api.cashFlowCsvRows(api.getSelectedCashFlowSnapshot()).join('|'), /الإجمالي/);
    api.printCashFlowReport();
    api.printApartmentsReport();
    assert.equal(calls.printed, true);
    assert.match(api.renderCashFlowPdfHtml(api.getSelectedCashFlowSnapshot()), /dir="rtl" lang="ar"/);
    assert.match(api.renderApartmentsPdfHtml(api.getSelectedApartmentsSnapshot()), /تقرير أداء الشقق/);
});

