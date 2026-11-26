const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const reportsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const insightsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-insights.js'), 'utf8');
const forecastSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-cashbox-forecast.js'), 'utf8');
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

function loadForecast(overrides = {}) {
    const elements = {
        cashForecastHorizon: { value: '3' },
        cashForecastPreview: { innerHTML: '', dataset: {} },
        cashForecastChartContainer: {},
        cashForecastPrintBtn: { disabled: true },
        cashForecastPdfBtn: { disabled: true },
        cashForecastCsvBtn: { disabled: true },
        cashForecastExcelBtn: { disabled: true },
        printBuildingTitle: { textContent: '' },
        printBuildingMeta: { textContent: '' }
    };
    const state = {
        buildingName: 'عمارة النور',
        managerName: 'المدير',
        cashAccountBalances: { main: 1000 },
        residents: [
            { id: 'r1', apartmentNumber: '3', name: 'أحمد', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z' },
            { id: 'r2', apartmentNumber: '5', name: 'سارة', monthlyAmount: 200, createdAt: '2024-01-01T00:00:00.000Z' }
        ],
        income: [
            // يناير: سداد كامل 300
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, purposeCode: 'subscription', date: '2024-01-08T12:00:00' },
            { id: 'i2', residentId: 'r2', month: 'يناير 2024', amount: 200, purposeCode: 'subscription', date: '2024-01-10T12:00:00' },
            // فبراير: سداد جزئي 150
            { id: 'i3', residentId: 'r1', month: 'فبراير 2024', amount: 150, purposeCode: 'subscription', date: '2024-02-09T12:00:00' },
            // مارس: بلا تحصيل
            // أبريل إلى يونيو: سداد كامل 300 لكل شهر
            { id: 'i4', residentId: 'r1', month: 'أبريل 2024', amount: 100, purposeCode: 'subscription', date: '2024-04-05T12:00:00' },
            { id: 'i5', residentId: 'r2', month: 'أبريل 2024', amount: 200, purposeCode: 'subscription', date: '2024-04-06T12:00:00' },
            { id: 'i6', residentId: 'r1', month: 'مايو 2024', amount: 100, purposeCode: 'subscription', date: '2024-05-05T12:00:00' },
            { id: 'i7', residentId: 'r2', month: 'مايو 2024', amount: 200, purposeCode: 'subscription', date: '2024-05-06T12:00:00' },
            { id: 'i8', residentId: 'r1', month: 'يونيو 2024', amount: 100, purposeCode: 'subscription', date: '2024-06-05T12:00:00' },
            { id: 'i9', residentId: 'r2', month: 'يونيو 2024', amount: 200, purposeCode: 'subscription', date: '2024-06-06T12:00:00' }
        ],
        expenses: [
            { id: 'e1', month: 'يناير 2024', amount: 50, category: 'نظافة', date: '2024-01-15T12:00:00' },
            { id: 'e2', month: 'مارس 2024', amount: 100, category: 'صيانة', date: '2024-03-15T12:00:00' }
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
        getCurrentMonth: () => 'يوليو 2024',
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
        getCashAccountBalance: code => Number(state.cashAccountBalances?.[code]) || 0,
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
        `${reportsSource}\n${insightsSource}\n${forecastSource}\n({
            REPORT_TABS, REPORT_PANEL_IDS, REPORT_OUTPUT_BUTTON_IDS, REPORT_FILTER_DESCRIPTORS,
            buildCashboxForecastReport, renderCashboxForecastHtml, renderCashboxForecastEmptyHtml,
            renderCashForecastPdfHtml, cashForecastCsvRows, cashForecastStatItems, getCashForecastSignature,
            generateCashForecastReport, getSelectedCashForecastSnapshot,
            invalidateCashForecastPreview, invalidateCashForecastIfStale,
            populateCashForecastFilters, clearCashForecastFilters,
            printCashForecastReport, exportCashForecastCsv,
            exportCashForecastExcel, exportCashForecastPdf
        })`,
        sandbox,
        { filename: 'reports-cashbox-forecast.test.cjs' }
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

test('cashbox forecast report is wired into the generated shell', () => {
    assert.match(template, /<script src="js\/reports\/extended\/reports-cashbox-forecast\.js"><\/script>/);
    assert.match(html, /<script src="js\/reports\/extended\/reports-cashbox-forecast\.js\?v=[a-f0-9]+"><\/script>/);
    assert.match(html, /data-report-nav="cashForecast"[^>]*aria-controls="cashForecastPanel"[^>]*onclick="switchReportTab\('cashForecast'\)"/);
    assert.match(html, /id="cashForecastPreview"[^>]*aria-live="polite"/);
    assert.match(html, /id="cashForecastPrintBtn"[^>]*onclick="printCashForecastReport\(\)"[^>]*disabled/);
    assert.match(css, /\[data-report-nav="cashForecast"\] \{/);
    assert.match(css, /body\.print-cash-forecast #tab-reports > :not\(#cashForecastPanel\)/);
    assert.match(renderSource, /invalidateCashForecastIfStale\(\)/);
    assert.match(renderSource, /populateCashForecastFilters\(\)/);
    const { api } = loadForecast();
    assert.ok(api.REPORT_TABS.includes('cashForecast'));
    assert.equal(api.REPORT_PANEL_IDS.cashForecast, 'cashForecastPanel');
    assert.equal(api.REPORT_OUTPUT_BUTTON_IDS.cashForecast, 'cashForecastPrintBtn');
    assert.ok(api.REPORT_FILTER_DESCRIPTORS.cashForecast.some(filter => filter.id === 'cashForecastHorizon'));
});

test('cashbox forecast baseline: average rate and expenses from the six closed months', () => {
    const { api } = loadForecast();
    const report = api.buildCashboxForecastReport(3, new Date('2024-07-10T12:00:00'));
    assert.ok(report, 'report builds');
    assert.equal(report.baseline.length, 6);
    assert.equal(report.baselineMonths, 6, 'كل الأشهر الستة فيها مستحق');
    // النسب: 100%، 50%، 0%، 100%، 100%، 100% → متوسط 75%
    assert.equal(Math.round(report.avgRate * 100), 75);
    // المصروفات: 50 و100 على 6 أشهر → 25 ج.م
    assert.equal(report.avgExpenseCents, 2500);
    assert.equal(report.startBalanceCents, 100000);
});

test('cashbox forecast projects balances and finds the first deficit month', () => {
    const { api } = loadForecast();
    const report = api.buildCashboxForecastReport(3, new Date('2024-07-10T12:00:00'));
    assert.equal(report.projections.length, 3);
    const august = report.projections[0];
    assert.equal(august.label, 'أغسطس 2024');
    assert.equal(august.dueCents, 30000);
    assert.equal(august.expectedPaidCents, 22500, '75% من المستحق');
    assert.equal(august.expectedExpenseCents, 2500);
    assert.equal(august.netCents, 20000);
    assert.equal(august.balanceCents, 120000);
    assert.equal(report.endBalanceCents, 160000);
    assert.equal(report.firstDeficitLabel, null, 'لا عجز مع رصيد كافٍ');
    // رصيد سالب: أول شهر يظهر العجز
    const deficit = api.buildCashboxForecastReport.call(null, 3, new Date('2024-07-10T12:00:00'));
    assert.equal(deficit.firstDeficitLabel, null);
    const { api: poorApi } = loadForecast({ cashAccountBalances: { main: -500 } });
    const poor = poorApi.buildCashboxForecastReport(3, new Date('2024-07-10T12:00:00'));
    assert.equal(poor.firstDeficitLabel, 'أغسطس 2024');
    assert.equal(poor.endBalanceCents, 10000, '-50000 + 3×20000');
});

test('cashbox forecast baseline counts settlements and ignores reversals', () => {
    // فبراير: أحمد اتفق على تسوية 80 بدل 100، دفع 50 اشتراك + 20 تسوية،
    // وله عكس قيد -10 لا يجوز أن ينقص المحصل. سارة دفعت 200 كاملة.
    // المحصل الصحيح 270 من مستحق 280 ≈ 96%، لا 240 من 300 (80%).
    const { api } = loadForecast({
        adjustments: [
            { id: 'adj1', residentId: 'r1', effectiveMonth: '2024-02-01', kind: 'settlement', amount: 80 }
        ],
        income: [
            { id: 'i20', residentId: 'r1', month: 'فبراير 2024', amount: 50, purposeCode: 'subscription', date: '2024-02-05T12:00:00' },
            { id: 'i21', residentId: 'r1', month: 'فبراير 2024', amount: 20, purposeCode: 'settlement', settlementAdjustmentId: 'adj1', date: '2024-02-09T12:00:00' },
            { id: 'i22', residentId: 'r1', month: 'فبراير 2024', amount: -10, purposeCode: 'subscription', date: '2024-02-11T12:00:00' },
            { id: 'i23', residentId: 'r2', month: 'فبراير 2024', amount: 200, purposeCode: 'subscription', date: '2024-02-06T12:00:00' }
        ]
    });
    const report = api.buildCashboxForecastReport(3, new Date('2024-07-10T12:00:00'));
    const feb = report.baseline.find(row => row.key === '2024-02-01');
    assert.equal(feb.dueCents, 28000, 'المستحق = تسوية أحمد 80 + اشتراك سارة 200');
    assert.equal(feb.paidCents, 27000, 'المحصل = 50 اشتراك + 20 تسوية + 200 سارة، والعكسية مستبعدة');
    assert.equal(Math.round(feb.rate * 100), 96);
});

test('cashbox forecast baseline window follows the now reference', () => {
    const { api } = loadForecast();
    // ساعة الحاضنة ثابتة على يوليو 2024؛ مرجع now في مارس يجب أن يحرك النافذة.
    const march = api.buildCashboxForecastReport(3, new Date('2024-03-15T12:00:00'));
    assert.equal(march.baseline[0].key, '2023-09-01', 'خط الأساس يبدأ قبل 6 أشهر من مارس');
    assert.equal(march.baseline[5].key, '2024-02-01');
    assert.equal(march.projections[0].key, '2024-04-01', 'التوقع يبدأ من الشهر التالي للمرجع');
    // بلا مرجع now: النافذة من ساعة التطبيق (يوليو 2024 في الحاضنة).
    const appClock = api.buildCashboxForecastReport(3);
    assert.equal(appClock.baseline[5].key, '2024-06-01');
});

test('cashbox forecast honors the six-month horizon', () => {
    const { api } = loadForecast();
    const report = api.buildCashboxForecastReport(6, new Date('2024-07-10T12:00:00'));
    assert.equal(report.horizon, 6);
    assert.equal(report.projections.length, 6);
    assert.equal(report.projections[5].label, 'يناير 2025', 'الأفق يعبر حدود السنة');
});

test('cashbox forecast renders projection table, baseline and deficit alert', () => {
    const { api } = loadForecast({ cashAccountBalances: { main: -500 } });
    const report = api.buildCashboxForecastReport(3, new Date('2024-07-10T12:00:00'));
    const htmlOut = api.renderCashboxForecastHtml(report);
    assert.match(htmlOut, /توقعات الخزنة · عمارة النور/);
    assert.match(htmlOut, /تدخل في عجز متوقع ابتداءً من أغسطس 2024/);
    assert.match(htmlOut, /الرصيد المتوقع شهرًا بشهر/);
    assert.match(htmlOut, /خط الأساس - آخر 6 أشهر مغلقة/);
    assert.match(htmlOut, /sheet-cards/, 'الجداول تتحول لبطاقات على الهاتف');
    const csv = api.cashForecastCsvRows(report);
    assert.equal(csv.length, 16, 'ترويسة + 3 شهور + فاصل + ترويسة خط الأساس + 6 أشهر + 4 ملخص');
    assert.equal(JSON.stringify(csv[0]), JSON.stringify(['الشهر', 'المستحق المتوقع', 'التحصيل المتوقع', 'المصروفات المتوقعة', 'الصافي', 'الرصيد المتوقع']));
    assert.equal(JSON.stringify(csv[15]), JSON.stringify(['أول شهر عجز متوقع', 'أغسطس 2024']));
});

test('cashbox forecast empty state: no baseline months means no guessed rate', () => {
    const { api, elements, calls } = loadForecast({ residents: [], income: [], expenses: [] });
    const report = api.buildCashboxForecastReport(3, new Date('2024-07-10T12:00:00'));
    assert.equal(report.baselineMonths, 0);
    assert.equal(report.avgRate, null, 'لا نسبة مخمنة');
    elements.cashForecastHorizon.value = '3';
    api.generateCashForecastReport();
    assert.match(elements.cashForecastPreview.innerHTML, /لا يمكن حساب متوسط نسبة التحصيل/);
    assert.equal(elements.cashForecastPrintBtn.disabled, true, 'التصدير معطل بلا توقع');
    api.exportCashForecastCsv();
    assert.equal(calls.downloads.length, 0, 'لا تصدير بلا معاينة صالحة');
});

test('cashbox forecast preview lifecycle: generate, invalidate, export parity', async () => {
    const { api, elements, calls } = loadForecast();
    elements.cashForecastHorizon.value = '3';
    api.generateCashForecastReport();
    assert.match(elements.cashForecastPreview.innerHTML, /توقعات الخزنة/);
    assert.equal(elements.cashForecastPrintBtn.disabled, false);
    assert.ok(calls.charts.some(entry => entry.id === 'cashForecastChart'), 'bar chart drawn');
    api.exportCashForecastCsv();
    assert.equal(calls.downloads.length, 1);
    assert.match(calls.downloads[0].filename, /manzil_cashbox_forecast_2024-10\.csv/);
    api.exportCashForecastExcel();
    assert.equal(calls.excels.length, 1);
    await api.exportCashForecastPdf();
    assert.equal(calls.pdfs.length, 1);
    assert.match(calls.pdfs[0].html, /توقعات الخزنة/);
    api.printCashForecastReport();
    assert.equal(calls.printed, true);
    api.invalidateCashForecastPreview();
    assert.match(elements.cashForecastPreview.innerHTML, /غيّرت الفلاتر المعاينة/);
    assert.equal(elements.cashForecastPrintBtn.disabled, true);
});

test('cashbox forecast invalidates when data changes underneath', () => {
    const { api, elements, state } = loadForecast();
    elements.cashForecastHorizon.value = '3';
    api.generateCashForecastReport();
    assert.match(elements.cashForecastPreview.innerHTML, /توقعات الخزنة/);
    state.income.push({ id: 'i10', residentId: 'r1', month: 'يوليو 2024', amount: 100, purposeCode: 'subscription', date: '2024-07-01T12:00:00' });
    api.invalidateCashForecastIfStale();
    assert.match(elements.cashForecastPreview.innerHTML, /غيّرت الفلاتر المعاينة|اضغط «معاينة»/, 'data change invalidates the preview');
});

test('cashbox forecast uses owner terminology only', () => {
    assert.doesNotMatch(forecastSource, /ساكن|سكان/);
    assert.match(forecastSource, /توقعات الخزنة/);
});
