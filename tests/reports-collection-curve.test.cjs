const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const reportsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const insightsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-insights.js'), 'utf8');
const curveSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-collection-curve.js'), 'utf8');
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

function loadCurve(overrides = {}) {
    const elements = {
        collectionCurveFromMonth: { value: '' },
        collectionCurveToMonth: { value: '' },
        collectionCurvePreview: { innerHTML: '', dataset: {} },
        collectionCurveChartContainer: {},
        collectionCurvePrintBtn: { disabled: true },
        collectionCurvePdfBtn: { disabled: true },
        collectionCurveCsvBtn: { disabled: true },
        collectionCurveExcelBtn: { disabled: true },
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
            { id: 'r2', apartmentNumber: '5', name: 'سارة', monthlyAmount: 200, createdAt: '2024-01-01T00:00:00.000Z' }
        ],
        income: [
            // سداد مبكر (قبل شهر الاستحقاق): يدخل المنحنى من أول نقطة.
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, purposeCode: 'subscription', date: '2023-12-28T12:00:00' },
            // سداد يوم 10 (بعد الاستحقاق قبل نهاية السماح) لشقة سارة في يناير.
            { id: 'i2', residentId: 'r2', month: 'يناير 2024', amount: 200, purposeCode: 'subscription', date: '2024-01-10T12:00:00' },
            // سداد متأخر عن شهر فبراير: جاء في مارس، يدخل الإجمالي دون المنحنى.
            { id: 'i3', residentId: 'r1', month: 'فبراير 2024', amount: 100, purposeCode: 'subscription', date: '2024-03-02T12:00:00' },
            // سداد بلا تاريخ موثق: يدخل الإجمالي فقط.
            { id: 'i4', residentId: 'r2', month: 'فبراير 2024', amount: 200, purposeCode: 'subscription', date: '' }
        ],
        expenses: [],
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
        getCurrentMonth: () => 'مارس 2024',
        monthLabelToKey,
        monthKeyToLabel: key => `${monthNames[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
        getStatementMonthLabel: key => `${monthNames[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
        getBuildingMonthOptions: () => ['يناير 2024', 'فبراير 2024', 'مارس 2024'],
        getMonthlyDueAmountForMonth: (resident, month) => {
            const key = monthLabelToKey(month);
            const start = String(resident.createdAt || '').slice(0, 7);
            return key && key.slice(0, 7) >= start ? Number(resident.monthlyAmount) || 0 : 0;
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
        `${reportsSource}\n${insightsSource}\n${curveSource}\n({
            REPORT_TABS, REPORT_PANEL_IDS, REPORT_OUTPUT_BUTTON_IDS, REPORT_FILTER_DESCRIPTORS,
            buildCollectionCurveReport, renderCollectionCurveHtml, renderCollectionCurvePdfHtml,
            collectionCurveCsvRows, collectionCurveStatItems, getCollectionCurveSignature,
            generateCollectionCurveReport, getSelectedCollectionCurveSnapshot,
            invalidateCollectionCurvePreview, invalidateCollectionCurveIfStale,
            populateCollectionCurveFilters, clearCollectionCurveFilters,
            printCollectionCurveReport, exportCollectionCurveCsv,
            exportCollectionCurveExcel, exportCollectionCurvePdf
        })`,
        sandbox,
        { filename: 'reports-collection-curve.test.cjs' }
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

test('collection curve report is wired into the generated shell', () => {
    assert.match(template, /<script src="js\/reports\/extended\/reports-collection-curve\.js"><\/script>/);
    assert.match(html, /<script src="js\/reports\/extended\/reports-collection-curve\.js\?v=[a-f0-9]+"><\/script>/);
    assert.match(html, /data-report-nav="collectionCurve"[^>]*aria-controls="collectionCurvePanel"[^>]*onclick="switchReportTab\('collectionCurve'\)"/);
    assert.match(html, /id="collectionCurvePreview"[^>]*aria-live="polite"/);
    assert.match(html, /id="collectionCurvePrintBtn"[^>]*onclick="printCollectionCurveReport\(\)"[^>]*disabled/);
    assert.match(css, /\[data-report-nav="collectionCurve"\] \{/);
    assert.match(css, /body\.print-collection-curve #tab-reports > :not\(#collectionCurvePanel\)/);
    assert.match(renderSource, /invalidateCollectionCurveIfStale\(\)/);
    assert.match(renderSource, /populateCollectionCurveFilters\(months, current\)/);
    const { api } = loadCurve();
    assert.ok(api.REPORT_TABS.includes('collectionCurve'));
    assert.equal(api.REPORT_PANEL_IDS.collectionCurve, 'collectionCurvePanel');
    assert.equal(api.REPORT_OUTPUT_BUTTON_IDS.collectionCurve, 'collectionCurvePrintBtn');
    assert.ok(api.REPORT_FILTER_DESCRIPTORS.collectionCurve.some(filter => filter.id === 'collectionCurveFromMonth'));
});

test('collection curve measures cumulative collection against each milestone', () => {
    const { api } = loadCurve();
    const report = api.buildCollectionCurveReport('يناير 2024', 'فبراير 2024', new Date('2024-03-10T12:00:00'));
    assert.ok(report, 'report builds');
    assert.equal(report.rows.length, 2);
    const jan = report.rows.find(row => row.key === '2024-01-01');
    // يناير: أحمد سدد مبكرًا (100 من 300) وسارة يوم 10 (200 من 300).
    assert.equal(jan.dueCents, 30000);
    assert.equal(jan.milestones[0].pct, 33, 'يوم الاستحقاق: السداد المبكر فقط');
    assert.equal(jan.milestones[1].pct, 100, 'نهاية السماح (يوم 15): سداد سارة يوم 10 دخل');
    assert.equal(jan.paidPct, 100);
    assert.equal(jan.outstandingCents, 0);
    const feb = report.rows.find(row => row.key === '2024-02-01');
    // فبراير: سداد أحمد جاء في مارس (خارج المنحنى) وسارة بلا تاريخ.
    assert.equal(feb.milestones[3].pct, 0, 'لا تحصيل داخل الشهر نفسه');
    assert.equal(feb.paidPct, 100, 'المحصّل حتى الآن يشمل المتأخر وبلا تاريخ');
    assert.equal(report.undatedCount, 1);
    assert.equal(report.totals.dueCents, 60000);
    assert.equal(report.totals.paidCents, 60000);
});

test('collection curve rejects periods over twelve months and inverted ranges', () => {
    const { api } = loadCurve();
    assert.equal(api.buildCollectionCurveReport('فبراير 2024', 'يناير 2024'), null);
    assert.equal(api.buildCollectionCurveReport('يناير 2020', 'يناير 2024'), null, 'أكثر من 12 شهرًا');
});

test('collection curve renders header, milestones, cards table and totals', () => {
    const { api } = loadCurve();
    const report = api.buildCollectionCurveReport('يناير 2024', 'فبراير 2024', new Date('2024-03-10T12:00:00'));
    const htmlOut = api.renderCollectionCurveHtml(report);
    assert.match(htmlOut, /تقرير منحنى التحصيل · عمارة النور/);
    assert.match(htmlOut, /يوم الاستحقاق/);
    assert.match(htmlOut, /نهاية السماح/);
    assert.match(htmlOut, /المحصّل حتى الآن/);
    assert.match(htmlOut, /sheet-cards/, 'الجدول ذو الأعمدة الثمانية يتحول لبطاقات على الهاتف');
    assert.match(htmlOut, /الإجمالي/);
    assert.match(htmlOut, /تحصيل بلا تاريخ موثق/);
    const csv = api.collectionCurveCsvRows(report);
    assert.equal(csv.length, 4, 'صف لكل شهر + ترويسة + إجمالي');
    assert.equal(JSON.stringify(csv[0]), JSON.stringify(['الشهر', 'المستحق', 'حتى يوم الاستحقاق %', 'حتى نهاية السماح %', 'حتى منتصف الشهر %', 'حتى نهاية الشهر %', 'المحصل حتى الآن %', 'المتبقي']));
});

test('collection curve preview lifecycle: generate, invalidate, export parity', async () => {
    const { api, elements, calls } = loadCurve();
    elements.collectionCurveFromMonth.value = 'يناير 2024';
    elements.collectionCurveToMonth.value = 'فبراير 2024';
    api.generateCollectionCurveReport();
    assert.match(elements.collectionCurvePreview.innerHTML, /تقرير منحنى التحصيل/);
    assert.equal(elements.collectionCurvePrintBtn.disabled, false);
    assert.ok(calls.charts.some(entry => entry.id === 'collectionCurveChart'), 'bar chart drawn');
    api.exportCollectionCurveCsv();
    assert.equal(calls.downloads.length, 1);
    assert.match(calls.downloads[0].filename, /manzil_collection_curve_2024-01_2024-02\.csv/);
    api.exportCollectionCurveExcel();
    assert.equal(calls.excels.length, 1);
    await api.exportCollectionCurvePdf();
    assert.equal(calls.pdfs.length, 1);
    assert.match(calls.pdfs[0].html, /تقرير منحنى التحصيل/);
    api.printCollectionCurveReport();
    assert.equal(calls.printed, true);
    api.invalidateCollectionCurvePreview();
    assert.match(elements.collectionCurvePreview.innerHTML, /غيّرت الفلاتر المعاينة/);
    assert.equal(elements.collectionCurvePrintBtn.disabled, true);
});

test('collection curve invalidates when data changes underneath', () => {
    const { api, elements, state } = loadCurve();
    elements.collectionCurveFromMonth.value = 'يناير 2024';
    elements.collectionCurveToMonth.value = 'فبراير 2024';
    api.generateCollectionCurveReport();
    assert.match(elements.collectionCurvePreview.innerHTML, /تقرير منحنى التحصيل/);
    state.income.push({ id: 'i9', residentId: 'r1', month: 'مارس 2024', amount: 100, purposeCode: 'subscription', date: '2024-03-01T12:00:00' });
    api.invalidateCollectionCurveIfStale();
    assert.match(elements.collectionCurvePreview.innerHTML, /غيّرت الفلاتر المعاينة|اضغط «معاينة»/, 'data change invalidates the preview');
});

test('collection curve empty state is explicit', () => {
    const { api } = loadCurve({ residents: [], income: [] });
    const report = api.buildCollectionCurveReport('يناير 2024', 'فبراير 2024', new Date('2024-03-10T12:00:00'));
    assert.equal(report.rows.length, 0);
    const htmlOut = api.renderCollectionCurveHtml(report);
    assert.match(htmlOut, /لا توجد مستحقات في هذه الفترة/);
});

test('collection curve uses owner terminology only', () => {
    assert.doesNotMatch(curveSource, /ساكن|سكان/);
    assert.match(curveSource, /التحصيل/);
});
