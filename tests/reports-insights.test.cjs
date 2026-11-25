const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const reportsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const insightsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-insights.js'), 'utf8');
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

function shiftMonth(key, offset) {
    const date = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

const MS_PER_DAY = 86400000;

function loadInsights(overrides = {}) {
    const elements = {
        paymentBehaviorResident: { value: '' },
        paymentBehaviorPreview: { innerHTML: '', dataset: {} },
        insightsPaymentBehaviorChartContainer: {},
        paymentBehaviorPrintBtn: { disabled: true },
        paymentBehaviorPdfBtn: { disabled: true },
        paymentBehaviorCsvBtn: { disabled: true },
        paymentBehaviorExcelBtn: { disabled: true },
        printBuildingTitle: { textContent: '' },
        printBuildingMeta: { textContent: '' }
    };
    const state = {
        buildingName: 'عمارة النور',
        managerName: 'المدير',
        subscriptionDueDay: 5,
        subscriptionGraceDays: 10,
        residents: [
            { id: 'r1', apartmentNumber: '3', name: 'أحمد', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z' },
            { id: 'r2', apartmentNumber: '5', name: 'سارة', monthlyAmount: 200, createdAt: '2024-01-01T00:00:00.000Z' },
            { id: 'r3', apartmentNumber: '7', name: 'خالد', monthlyAmount: 150, createdAt: '2024-01-01T00:00:00.000Z' }
        ],
        income: [
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, purposeCode: 'subscription', date: '2024-01-10T12:00:00' },
            { id: 'i2', residentId: 'r1', month: 'فبراير 2024', amount: 100, purposeCode: 'subscription', date: '2024-02-20T12:00:00' },
            { id: 'i3', residentId: 'r2', month: 'يناير 2024', amount: 200, purposeCode: 'subscription', date: '2024-01-30T12:00:00' },
            { id: 'i4', residentId: 'r2', month: 'فبراير 2024', amount: 200, purposeCode: 'subscription', date: '2024-02-28T12:00:00' },
            { id: 'i5', residentId: 'r2', month: 'مارس 2024', amount: 200, purposeCode: 'subscription', date: '2024-03-20T12:00:00' },
            { id: 'i6', residentId: 'r3', month: 'يناير 2024', amount: 150, purposeCode: 'subscription', date: '2024-01-05T12:00:00' },
            { id: 'i7', residentId: 'r3', month: 'فبراير 2024', amount: 150, purposeCode: 'subscription', date: '2024-02-05T12:00:00' },
            { id: 'i8', residentId: 'r3', month: 'مارس 2024', amount: 150, purposeCode: 'subscription', date: '2024-03-05T12:00:00' }
        ],
        expenses: [],
        adjustments: [],
        ...overrides
    };
    const calls = { downloads: [], excels: [], pdfs: [], charts: [], printed: false, events: [] };
    // نفس قاعدة state.js: التأخير يبدأ بعد يوم الاستحقاق + السماح، بالتوقيت المحلي.
    const dueDeadline = monthLabel => {
        const key = monthLabelToKey(monthLabel);
        if (!key) return null;
        const dueDay = Math.min(28, Math.max(1, Number(state.subscriptionDueDay) || 1));
        const graceDays = Math.min(31, Math.max(0, Number(state.subscriptionGraceDays) || 0));
        return new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, dueDay + graceDays + 1);
    };
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
        getCurrentMonth: () => 'مارس 2024',
        monthLabelToKey,
        getStatementMonthLabel: key => `${monthNames[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
        shiftStatementMonthKey: shiftMonth,
        getBuildingMonthOptions: () => ['يناير 2024', 'فبراير 2024', 'مارس 2024'],
        getResidentBillingStartKey: resident => String(resident.createdAt || '').slice(0, 7) + '-01',
        getMonthlyDueAmountForMonth: (resident, month) => {
            const key = monthLabelToKey(month);
            const start = String(resident.createdAt || '').slice(0, 7);
            return key && key.slice(0, 7) >= start ? Number(resident.monthlyAmount) || 0 : 0;
        },
        isSubscriptionMonthOverdue: (monthLabel, now) => {
            const deadline = dueDeadline(monthLabel);
            const current = now instanceof Date ? now : new Date(now);
            return Boolean(deadline && Number.isFinite(current.getTime()) && current >= deadline);
        },
        getSubscriptionOverdueDays: (monthLabel, now) => {
            const deadline = dueDeadline(monthLabel);
            const current = now instanceof Date ? now : new Date(now);
            if (!deadline || !Number.isFinite(current.getTime()) || current < deadline) return 0;
            return Math.floor((current.getTime() - deadline.getTime()) / MS_PER_DAY) + 1;
        },
        getIncomePurposeFormCode: purpose => (purpose === 'subscription' ? 'subscription' : 'other'),
        formatApartmentLabel: value => `شقة ${String(value ?? '').trim()}`,
        formatDate: value => String(value || '').slice(0, 10),
        requireManager: () => true,
        toast: (message, kind) => calls.events.push(`${kind}:${message}`),
        document: {
            body: { classList: makeClassList() },
            getElementById: id => elements[id] || null,
            querySelector: () => null,
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
        `${reportsSource}\n${insightsSource}\n({
            REPORT_TABS, REPORT_PANEL_IDS, REPORT_OUTPUT_BUTTON_IDS, REPORT_FILTER_DESCRIPTORS,
            buildPayerBehaviorReport, getPayerBehaviorSignature, generatePayerBehaviorReport,
            getSelectedPayerBehaviorSnapshot, invalidatePayerBehaviorPreview, invalidatePayerBehaviorIfStale,
            payerBehaviorCsvRows, renderPayerBehaviorHtml, renderPayerBehaviorPdfHtml,
            printPayerBehaviorReport, exportPayerBehaviorCsv, exportPayerBehaviorExcel, exportPayerBehaviorPdf,
            invalidateInsightsReportsIfStale, populateInsightsReportFilters, clearInsightsFilters
        })`,
        sandbox,
        { filename: 'reports-insights.test.cjs' }
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

test('payer behavior report is wired into the generated shell', () => {
    assert.match(template, /<script src="js\/reports\/extended\/reports-insights\.js"><\/script>/);
    assert.match(html, /<script src="js\/reports\/extended\/reports-insights\.js\?v=[a-f0-9]+"><\/script>/);
    assert.match(html, /data-report-nav="paymentBehavior"[^>]*aria-controls="paymentBehaviorPanel"[^>]*onclick="switchReportTab\('paymentBehavior'\)"/);
    assert.match(html, /id="paymentBehaviorPreview"[^>]*aria-live="polite"/);
    assert.match(html, /id="paymentBehaviorPrintBtn"[^>]*onclick="printPayerBehaviorReport\(\)"[^>]*disabled/);
    assert.match(css, /\[data-report-nav="paymentBehavior"\] \{/);
    assert.match(css, /body\.print-payment-behavior #tab-reports > :not\(#paymentBehaviorPanel\)/);
    assert.match(renderSource, /invalidateInsightsReportsIfStale\(\)/);
    assert.match(renderSource, /populateInsightsReportFilters\(months, current\)/);
    const { api } = loadInsights();
    assert.ok(api.REPORT_TABS.includes('paymentBehavior'));
    assert.equal(api.REPORT_PANEL_IDS.paymentBehavior, 'paymentBehaviorPanel');
    assert.equal(api.REPORT_OUTPUT_BUTTON_IDS.paymentBehavior, 'paymentBehaviorPrintBtn');
    assert.ok(Array.isArray(api.REPORT_FILTER_DESCRIPTORS.paymentBehavior));
});

test('payer behavior scores on-time, late and chronic residents from paid_at vs due day plus grace', () => {
    const { api } = loadInsights();
    const report = api.buildPayerBehaviorReport('', new Date('2024-03-25T12:00:00'));
    assert.equal(report.dueDay, 5);
    assert.equal(report.graceDays, 10);
    assert.equal(report.rows.length, 3);
    const byResident = new Map(report.rows.map(row => [row.resident.id, row]));
    const committed = byResident.get('r3');
    assert.equal(committed.judgedCount, 3);
    assert.equal(committed.onTimeCount, 3);
    assert.equal(committed.onTimePct, 100);
    assert.equal(committed.chronic, false);
    const mixed = byResident.get('r1');
    assert.equal(mixed.judgedCount, 3);
    assert.equal(mixed.onTimeCount, 1);
    assert.equal(mixed.lateCount, 2);
    assert.equal(mixed.onTimePct, 33);
    // فبراير: 5 أيام تأخير، مارس غير مسدد: 10 أيام حتى 25 مارس
    assert.equal(mixed.avgDelayDays, 8);
    assert.equal(mixed.maxDelayDays, 10);
    assert.equal(mixed.outstandingCents, 10000);
    assert.equal(mixed.chronic, false);
    const chronic = byResident.get('r2');
    assert.equal(chronic.lateCount, 3);
    assert.equal(chronic.chronic, true);
    assert.equal(report.totals.chronicCount, 1);
    // الأدنى التزامًا أولًا
    assert.equal(report.rows[0].resident.id, 'r2');
    assert.equal(report.rows[2].resident.id, 'r3');
    assert.equal(report.totals.judgedCount, 9);
    assert.equal(report.totals.onTimeCount, 4);
    assert.equal(report.totals.onTimePct, 44);
});

test('payer behavior skips pending months and months before the resident billing start', () => {
    const { api } = loadInsights();
    // مارس لم يتجاوز السماح بعد: لا يدخل في الحكم لمن لم يسدد
    const report = api.buildPayerBehaviorReport('', new Date('2024-03-10T12:00:00'));
    const byResident = new Map(report.rows.map(row => [row.resident.id, row]));
    const mixed = byResident.get('r1');
    assert.equal(mixed.judgedCount, 2);
    assert.equal(mixed.pendingCount, 1);
    const committed = byResident.get('r3');
    // خالد سدد مارس مبكرًا في الموعد فيدخل في الحكم
    assert.equal(committed.judgedCount, 3);
    // ساكن جديد لم يبدأ بعد: لا شهور محسوبة
    const { api: api2 } = loadInsights({
        residents: [{ id: 'r9', apartmentNumber: '9', name: 'جديد', monthlyAmount: 100, createdAt: '2024-04-01T00:00:00.000Z' }],
        income: []
    });
    const fresh = api2.buildPayerBehaviorReport('', new Date('2024-03-25T12:00:00'));
    assert.equal(fresh.rows[0].judgedCount, 0);
    assert.equal(fresh.rows[0].onTimePct, null);
});

test('payer behavior excludes fully paid months with no recorded date from the judgment', () => {
    const { api } = loadInsights({
        income: [
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, purposeCode: 'subscription' }
        ]
    });
    const report = api.buildPayerBehaviorReport('', new Date('2024-03-25T12:00:00'));
    const row = report.rows.find(item => item.resident.id === 'r1');
    // يناير مسدد بلا تاريخ: خارج الحكم؛ فبراير ومارس غير مسددين ومتأخرين
    assert.equal(row.unknownCount, 1);
    assert.equal(row.judgedCount, 2);
    assert.equal(row.lateCount, 2);
    assert.equal(report.totals.unknownCount, 1);
    const htmlOut = api.renderPayerBehaviorHtml(report);
    assert.match(htmlOut, /بلا تاريخ موثق/);
});

test('payer behavior preview generates, invalidates on data change and blocks stale export', () => {
    const { api, elements, state, calls } = loadInsights();
    api.generatePayerBehaviorReport();
    assert.match(elements.paymentBehaviorPreview.innerHTML, /سلوك كل مالك/);
    assert.match(elements.paymentBehaviorPreview.innerHTML, /متأخر مزمن/);
    assert.match(elements.paymentBehaviorPreview.innerHTML, /ملتزم/);
    assert.equal(elements.paymentBehaviorPrintBtn.disabled, false);
    assert.equal(elements.paymentBehaviorCsvBtn.disabled, false);
    assert.ok(calls.charts.some(call => call.id === 'paymentBehaviorChart'));
    // تغيير البيانات يبطل المعاينة ويعطل التصدير
    state.income.push({ id: 'i9', residentId: 'r1', month: 'مارس 2024', amount: 100, purposeCode: 'subscription', date: '2024-03-10T12:00:00' });
    api.invalidateInsightsReportsIfStale();
    assert.equal(elements.paymentBehaviorPrintBtn.disabled, true);
    assert.match(elements.paymentBehaviorPreview.innerHTML, /اضغط «معاينة» لتحديث التقرير/);
    assert.equal(api.getSelectedPayerBehaviorSnapshot(), null);
});

test('payer behavior csv, excel, pdf and print use the previewed snapshot', async () => {
    const { api, calls } = loadInsights();
    api.generatePayerBehaviorReport();
    api.exportPayerBehaviorCsv();
    assert.equal(calls.downloads.length, 1);
    assert.match(calls.downloads[0].filename, /^manzil_payment_behavior_\d+\.csv$/);
    const header = [...calls.downloads[0].rows.find(row => row[0] === 'الشقة')];
    assert.deepEqual(header, ['الشقة', 'أشهر محسوبة', 'في الموعد', 'متأخر', 'الالتزام %', 'متوسط التأخير (يوم)', 'أطول تأخير (يوم)', 'الحالة']);
    const total = [...calls.downloads[0].rows.find(row => row[0] === 'الإجمالي')];
    assert.deepEqual(total.slice(1, 5), [9, 4, 5, 44]);
    api.exportPayerBehaviorExcel();
    assert.equal(calls.excels.length, 1);
    assert.equal(calls.excels[0].sheets.length, 2);
    await api.exportPayerBehaviorPdf();
    assert.equal(calls.pdfs.length, 1);
    assert.match(calls.pdfs[0].html, /تقرير سلوك السداد/);
    assert.match(calls.pdfs[0].filename, /\.pdf$/);
    api.printPayerBehaviorReport();
    assert.equal(calls.printed, true);
});

test('payer behavior resident filter narrows the report and the clear restores it', () => {
    const { api, elements } = loadInsights();
    elements.paymentBehaviorResident.value = 'r2';
    api.generatePayerBehaviorReport();
    const snapshot = api.getSelectedPayerBehaviorSnapshot();
    assert.equal(snapshot.rows.length, 1);
    assert.equal(snapshot.rows[0].resident.id, 'r2');
    api.clearInsightsFilters('paymentBehavior');
    assert.equal(elements.paymentBehaviorResident.value, '');
    assert.equal(api.getSelectedPayerBehaviorSnapshot(), null);
});
