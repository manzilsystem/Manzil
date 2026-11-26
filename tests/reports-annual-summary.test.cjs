const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const reportsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const insightsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-insights.js'), 'utf8');
const annualSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-annual-summary.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const renderSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'render.js'), 'utf8');
const template = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.template.html'), 'utf8');
const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function monthLabelToKey(month) {
    const [name, year] = String(month || '').trim().split(/\s+/);
    const index = monthNames.indexOf(name);
    return index < 0 || !/^\d{4}$/.test(year || '') ? null : `${year}-${String(index + 1).padStart(2, '0')}-01`;
}

function loadAnnual(overrides = {}) {
    const elements = {
        annualSummaryYear: { value: '', innerHTML: '' },
        annualSummaryPreview: { innerHTML: '', dataset: {} },
        annualSummaryChartContainer: {},
        annualSummaryPrintBtn: { disabled: true },
        annualSummaryPdfBtn: { disabled: true },
        annualSummaryCsvBtn: { disabled: true },
        annualSummaryExcelBtn: { disabled: true },
        printBuildingTitle: { textContent: '' },
        printBuildingMeta: { textContent: '' }
    };
    const state = {
        buildingName: 'عمارة النور',
        managerName: 'المدير',
        residents: [
            { id: 'r1', apartmentNumber: '3', name: 'أحمد', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z' },
            { id: 'r2', apartmentNumber: '5', name: 'سارة', monthlyAmount: 200, createdAt: '2024-01-01T00:00:00.000Z' }
        ],
        income: [
            // يناير: سداد كامل (100 + 200)
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, purposeCode: 'subscription', date: '2024-01-08T12:00:00' },
            { id: 'i2', residentId: 'r2', month: 'يناير 2024', amount: 200, purposeCode: 'subscription', date: '2024-01-10T12:00:00' },
            // فبراير: سداد جزئي (150 من 300)
            { id: 'i3', residentId: 'r1', month: 'فبراير 2024', amount: 150, purposeCode: 'subscription', date: '2024-02-09T12:00:00' },
            // تحصيل صيانة (ليس اشتراكًا): لا يدخل الملخص
            { id: 'i4', residentId: 'r1', month: 'يناير 2024', amount: 40, purposeCode: 'maintenance', date: '2024-01-12T12:00:00' }
        ],
        expenses: [
            { id: 'e1', month: 'يناير 2024', amount: 50, category: 'نظافة', date: '2024-01-15T12:00:00' }
        ],
        adjustments: [],
        ...overrides
    };
    const calls = { downloads: [], excels: [], pdfs: [], charts: [], printed: false, events: [] };
    const sandbox = {
        state,
        Date,
        console,
        monthsNames: monthNames,
        setTimeout: () => {},
        toCents: value => Math.round((Number(value) || 0) * 100),
        fmtNum: value => String(Number(value) || 0),
        fmtMoney: value => `${Number(value) || 0} ج.م`,
        esc: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])),
        getCurrentMonth: () => 'يونيو 2024',
        monthLabelToKey,
        monthKeyToLabel: key => `${monthNames[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
        getStatementMonthLabel: key => `${monthNames[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
        getBuildingMonthOptions: () => monthNames.map(name => `${name} 2024`),
        getMonthlyDueAmountForMonth: (resident, month) => {
            const key = monthLabelToKey(month);
            const start = String(resident.createdAt || '').slice(0, 7);
            if (!(key && key.slice(0, 7) >= start)) return 0;
            const settlement = (state.adjustments || []).find(adjustment => adjustment.residentId === resident.id
                && adjustment.effectiveMonth === key && adjustment.kind === 'settlement');
            if (settlement) return Math.max(0, Number(settlement.amount) || 0);
            return Number(resident.monthlyAmount) || 0;
        },
        // نفس قاعدة state.js: التحصيلات الموجبة فقط + مدفوعات التسوية المرتبطة بشهرها
        getMonthlyDuePaidAmount: (residentId, month) => {
            const key = monthLabelToKey(month);
            const subscription = state.income.filter(payment => payment.residentId === residentId
                && monthLabelToKey(payment.month) === key
                && payment.purposeCode === 'subscription'
                && Number(payment.amount) > 0)
                .reduce((sum, payment) => sum + Number(payment.amount), 0);
            const settlement = (state.adjustments || []).find(adjustment => adjustment.residentId === residentId
                && adjustment.effectiveMonth === key && adjustment.kind === 'settlement');
            if (!settlement) return subscription;
            const settlementPaid = state.income.filter(payment => payment.purposeCode === 'settlement'
                && payment.settlementAdjustmentId === settlement.id && Number(payment.amount) > 0)
                .reduce((sum, payment) => sum + Number(payment.amount), 0);
            return subscription + settlementPaid;
        },
        isResidentActiveInMonth: (resident, key) => key.slice(0, 7) >= String(resident.createdAt || '').slice(0, 7),
        getIncomePurposeFormCode: purpose => (purpose === 'subscription' ? 'subscription' : 'other'),
        formatApartmentLabel: value => `شقة ${String(value ?? '').trim()}`,
        requireManager: () => true,
        toast: (message, kind) => calls.events.push(`${kind}:${message}`),
        document: {
            body: { classList: makeClassList() },
            getElementById: id => elements[id] || null,
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: () => {},
            createElement: () => ({ click() { calls.downloads.push({ name: this.download }); } })
        },
        window: {
            print() { calls.printed = true; },
            addEventListener() {}
        }
    };
    const api = vm.runInNewContext(
        `${reportsSource}\n${insightsSource}\n${annualSource}\n({
            REPORT_TABS, REPORT_PANEL_IDS, REPORT_OUTPUT_BUTTON_IDS, REPORT_FILTER_DESCRIPTORS,
            buildAnnualSummaryReport, renderAnnualSummaryHtml, renderAnnualSummaryPdfHtml,
            annualSummaryCsvRows, annualSummaryStatItems, annualSummaryYears, getAnnualSummarySignature,
            generateAnnualSummaryReport, getSelectedAnnualSummarySnapshot,
            invalidateAnnualSummaryPreview, invalidateAnnualSummaryIfStale,
            populateAnnualSummaryFilters, clearAnnualSummaryFilters,
            printAnnualSummaryReport, exportAnnualSummaryCsv,
            exportAnnualSummaryExcel, exportAnnualSummaryPdf
        })`,
        sandbox,
        { filename: 'reports-annual-summary.test.cjs' }
    );
    sandbox.downloadCsv = (filename, rows) => { calls.downloads.push({ filename, rows }); return true; };
    sandbox.exportReportExcel = (filename, sheets) => { calls.excels.push({ filename, sheets }); return true; };
    sandbox.downloadStatementPdf = async (pdfHtml, filename, buttonId) => {
        calls.pdfs.push({ filename, html: pdfHtml, buttonId });
        return true;
    };
    sandbox.destroyChartsInContainer = () => { calls.charts.push('destroy'); };
    sandbox.createChartContainer = (containerId, canvasId) => ({
        id: canvasId,
        attributes: {},
        setAttribute(key, value) { this.attributes[key] = value; }
    });
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

test('annual summary report is wired into the generated shell', () => {
    assert.match(template, /<script src="js\/reports\/extended\/reports-annual-summary\.js"><\/script>/);
    assert.match(html, /<script src="js\/reports\/extended\/reports-annual-summary\.js\?v=[a-f0-9]+"><\/script>/);
    assert.match(html, /data-report-nav="annualSummary"[^>]*aria-controls="annualSummaryPanel"[^>]*onclick="switchReportTab\('annualSummary'\)"/);
    assert.match(html, /id="annualSummaryPreview"[^>]*aria-live="polite"/);
    assert.match(html, /id="annualSummaryPrintBtn"[^>]*onclick="printAnnualSummaryReport\(\)"[^>]*disabled/);
    assert.match(css, /\[data-report-nav="annualSummary"\] \{/);
    assert.match(css, /body\.print-annual-summary #tab-reports > :not\(#annualSummaryPanel\)/);
    assert.match(renderSource, /invalidateAnnualSummaryIfStale\(\)/);
    assert.match(renderSource, /populateAnnualSummaryFilters\(\)/);
    const { api } = loadAnnual();
    assert.ok(api.REPORT_TABS.includes('annualSummary'));
    assert.equal(api.REPORT_PANEL_IDS.annualSummary, 'annualSummaryPanel');
    assert.equal(api.REPORT_OUTPUT_BUTTON_IDS.annualSummary, 'annualSummaryPrintBtn');
    assert.ok(api.REPORT_FILTER_DESCRIPTORS.annualSummary.some(filter => filter.id === 'annualSummaryYear'));
});

test('annual summary computes each month and totals in cents', () => {
    const { api } = loadAnnual();
    const report = api.buildAnnualSummaryReport('2024', new Date('2024-06-10T12:00:00'));
    assert.ok(report, 'report builds');
    assert.equal(report.rows.length, 12);
    assert.equal(report.monthCount, 6, 'يونيو هو الشهر الحالي: 6 أشهر محسوبة');
    const jan = report.rows.find(row => row.key === '2024-01-01');
    assert.equal(jan.future, false);
    assert.equal(jan.dueCents, 30000);
    assert.equal(jan.paidCents, 30000, 'تحصيل الصيانة لا يدخل الاشتراكات');
    assert.equal(jan.pct, 100);
    assert.equal(jan.expenseCents, 5000);
    assert.equal(jan.netCents, 25000);
    assert.equal(jan.outstandingCents, 0);
    const feb = report.rows.find(row => row.key === '2024-02-01');
    assert.equal(feb.paidCents, 15000);
    assert.equal(feb.pct, 50);
    // أحمد دفع 150 (زيادة 50 عن مستحقه) وسارة لم تدفع شيئًا: المتبقي متأخرات سارة 200 كاملة،
    // لأن زيادة مقيم لا تغطي متأخرات مقيم آخر.
    assert.equal(feb.outstandingCents, 20000);
    const jul = report.rows.find(row => row.key === '2024-07-01');
    assert.equal(jul.future, true, 'بعد الشهر الحالي: شرطات');
    assert.equal(jul.pct, null);
    // الإجماليات على الأشهر الستة المحسوبة فقط
    assert.equal(report.totals.dueCents, 180000);
    assert.equal(report.totals.paidCents, 45000);
    assert.equal(report.totals.expenseCents, 5000);
    assert.equal(report.totals.netCents, 40000);
    assert.equal(report.totals.outstandingCents, 140000);
    // متوسط النسبة على الأشهر ذات المستحق: (100+50+0+0+0+0)/6
    assert.equal(report.avgPct, 25);
});

test('annual summary counts settlements and positive payments only, per resident', () => {
    // شهر مارس: أحمد اتفق على تسوية 60 بدل اشتراكه 100، دفع 30 اشتراك + 20 تسوية،
    // وله حركة سالبة -10 (عكس قيد) لا يجوز أن تنقص المحصل.
    // سارة لم تدفع شيئًا: متأخراتها 200 كاملة ولا تغطيها زيادة غيرها.
    const { api } = loadAnnual({
        adjustments: [
            { id: 'adj1', residentId: 'r1', effectiveMonth: '2024-03-01', kind: 'settlement', amount: 60 }
        ],
        income: [
            { id: 'i10', residentId: 'r1', month: 'مارس 2024', amount: 30, purposeCode: 'subscription', date: '2024-03-05T12:00:00' },
            { id: 'i11', residentId: 'r1', month: 'مارس 2024', amount: 20, purposeCode: 'settlement', settlementAdjustmentId: 'adj1', date: '2024-03-09T12:00:00' },
            { id: 'i12', residentId: 'r1', month: 'مارس 2024', amount: -10, purposeCode: 'subscription', date: '2024-03-11T12:00:00' }
        ],
        expenses: []
    });
    const report = api.buildAnnualSummaryReport('2024', new Date('2024-06-10T12:00:00'));
    const mar = report.rows.find(row => row.key === '2024-03-01');
    assert.equal(mar.dueCents, 26000, 'المستحق = تسوية أحمد 60 + اشتراك سارة 200');
    assert.equal(mar.paidCents, 5000, 'المحصل = 30 اشتراك + 20 تسوية، والحركة السالبة مستبعدة');
    assert.equal(mar.outstandingCents, 21000, 'متبقي أحمد 10 + متبقي سارة 200');
    assert.equal(mar.pct, 19, '50/260 ≈ 19%');
});

test('annual summary renders grid, dashes for future months and totals row', () => {
    const { api } = loadAnnual();
    const report = api.buildAnnualSummaryReport('2024', new Date('2024-06-10T12:00:00'));
    const htmlOut = api.renderAnnualSummaryHtml(report);
    assert.match(htmlOut, /الملخص السنوي 2024 · عمارة النور/);
    assert.match(htmlOut, /نسبة التحصيل/);
    assert.match(htmlOut, /sheet-cards/, 'الجدول السباعي يتحول لبطاقات على الهاتف');
    assert.match(htmlOut, /إجمالي 2024/);
    assert.match(htmlOut, /—/, 'الأشهر القادمة تظهر بشرطات');
    const csv = api.annualSummaryCsvRows(report);
    assert.equal(csv.length, 14, 'ترويسة + 12 شهرًا + إجمالي');
    assert.equal(JSON.stringify(csv[0]), JSON.stringify(['الشهر', 'المستحق', 'المحصل', 'نسبة التحصيل %', 'المصروفات', 'الصافي', 'المتبقي']));
    const julCsv = csv.find(row => row[0] === 'يوليو 2024');
    assert.equal(JSON.stringify(julCsv), JSON.stringify(['يوليو 2024', '', '', '', '', '', '']), 'صف الشهر القادم فارغ');
    assert.equal(JSON.stringify(csv[13][0]), JSON.stringify('إجمالي 2024'));
});

test('annual summary preview lifecycle: generate, invalidate, export parity', async () => {
    const { api, elements, calls } = loadAnnual();
    elements.annualSummaryYear.value = '2024';
    api.generateAnnualSummaryReport();
    assert.match(elements.annualSummaryPreview.innerHTML, /الملخص السنوي 2024/);
    assert.equal(elements.annualSummaryPrintBtn.disabled, false);
    assert.ok(calls.charts.some(entry => entry.id === 'annualSummaryChart'), 'bar chart drawn');
    api.exportAnnualSummaryCsv();
    assert.equal(calls.downloads.length, 1);
    assert.match(calls.downloads[0].filename, /manzil_annual_summary_2024\.csv/);
    api.exportAnnualSummaryExcel();
    assert.equal(calls.excels.length, 1);
    assert.match(calls.excels[0].filename, /manzil_annual_summary_2024/);
    await api.exportAnnualSummaryPdf();
    assert.equal(calls.pdfs.length, 1);
    assert.match(calls.pdfs[0].html, /الملخص السنوي 2024/);
    api.printAnnualSummaryReport();
    assert.equal(calls.printed, true);
    api.invalidateAnnualSummaryPreview();
    assert.match(elements.annualSummaryPreview.innerHTML, /غيّرت الفلاتر المعاينة/);
    assert.equal(elements.annualSummaryPrintBtn.disabled, true);
});

test('annual summary invalidates when data changes underneath', () => {
    const { api, elements, state } = loadAnnual();
    elements.annualSummaryYear.value = '2024';
    api.generateAnnualSummaryReport();
    assert.match(elements.annualSummaryPreview.innerHTML, /الملخص السنوي 2024/);
    state.income.push({ id: 'i9', residentId: 'r2', month: 'مارس 2024', amount: 200, purposeCode: 'subscription', date: '2024-03-01T12:00:00' });
    api.invalidateAnnualSummaryIfStale();
    assert.match(elements.annualSummaryPreview.innerHTML, /غيّرت الفلاتر المعاينة|اضغط «معاينة»/, 'data change invalidates the preview');
});

test('annual summary handles a year without any dues', () => {
    const { api } = loadAnnual({ residents: [], income: [], expenses: [] });
    const report = api.buildAnnualSummaryReport('2024', new Date('2024-06-10T12:00:00'));
    assert.equal(report.totals.dueCents, 0);
    assert.equal(report.avgPct, null, 'لا متوسط بلا مستحقات');
    const htmlOut = api.renderAnnualSummaryHtml(report);
    assert.match(htmlOut, /الملخص السنوي 2024/);
});

test('annual summary uses owner terminology only', () => {
    assert.doesNotMatch(annualSource, /ساكن|سكان/);
    assert.match(annualSource, /الملخص السنوي/);
});
