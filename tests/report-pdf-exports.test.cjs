const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const reports = read('js/reports.js');
const stateSource = read('js/state.js');
const html = read('index.html');

function loadApi() {
    return vm.runInNewContext(
        `${stateSource}\n${reports}\n({
            renderPeriodReportPdfHtml,
            renderExpensesReportPdfHtml,
            renderAdjustmentsReportPdfHtml,
            state
        })`,
        {},
        { filename: 'report-pdf-exports-test.js' }
    );
}

test('period, expenses and adjustments reports expose a PDF exporter wired to the shared downloader', () => {
    const expectations = [
        { fn: 'exportPeriodReportPdf', button: 'periodReportPdfBtn', file: /manzil_period_\$\{getPeriodReportFileSlug\(report\)\}\$\{purposeSuffix\}\$\{cashSuffix\}\$\{residentSuffix\}\.pdf/ },
        { fn: 'exportExpensesReportPdf', button: 'expensesReportPdfBtn', file: /manzil_expenses_\$\{getPeriodReportFileSlug\(report\)\}\$\{cashSuffix\}\$\{categorySuffix\}\.pdf/ },
        { fn: 'exportAdjustmentsReportPdf', button: 'adjustmentsReportPdfBtn', file: /manzil_adjustments_\$\{getPeriodReportFileSlug\(report\)\}\$\{residentSuffix\}\$\{kindSuffix\}\.pdf/ }
    ];
    expectations.forEach(expectation => {
        const body = reports.match(new RegExp(`async function ${expectation.fn}\\([^]*?\\n\\}`));
        assert.ok(body, `${expectation.fn} not found in reports.js`);
        assert.match(body[0], /await downloadStatementPdf\(/);
        assert.match(body[0], new RegExp(`'${expectation.button}'`));
        assert.match(body[0], expectation.file, `${expectation.fn} must keep its slug-based filename`);
    });
});

test('the three PDF renderers use the shared header, footer and RTL document shell', () => {
    ['renderPeriodReportPdfHtml', 'renderExpensesReportPdfHtml', 'renderAdjustmentsReportPdfHtml'].forEach(name => {
        const body = reports.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
        assert.ok(body, `${name} not found in reports.js`);
        assert.match(body[0], /reportPdfDocumentOpen\(\)/, `${name} must open the shared document shell`);
        assert.match(body[0], /reportPdfHeader\(/, `${name} must use the shared header`);
        assert.match(body[0], /reportPdfFooter\(generatedAtLabel\)/, `${name} must use the shared footer`);
    });
});

test('each report actions group offers print, PDF and CSV buttons', () => {
    const reportTab = html.slice(html.indexOf('id="tab-reports"'), html.indexOf('id="appCopyright"'));
    const groups = [
        ['periodReportPrintBtn', 'periodReportPdfBtn', 'periodReportExportBtn'],
        ['expensesReportPrintBtn', 'expensesReportPdfBtn', 'expensesReportExportBtn'],
        ['adjustmentsReportPrintBtn', 'adjustmentsReportPdfBtn', 'adjustmentsReportExportBtn']
    ];
    groups.forEach(([print, pdf, csv]) => {
        assert.match(reportTab, new RegExp(`id="${print}"[^>]*onclick="print[A-Za-z]+Report\\(\\)"[^>]*disabled`));
        assert.match(reportTab, new RegExp(`id="${pdf}"[^>]*onclick="export[A-Za-z]+ReportPdf\\(\\)"[^>]*disabled`));
        assert.match(reportTab, new RegExp(`id="${csv}"[^>]*onclick="export[A-Za-z]+ReportCsv\\(\\)"[^>]*disabled`));
    });
});

test('the new PDF renderers build RTL, escaped, shared-shell documents without a DOM', () => {
    const api = loadApi();
    api.state.buildingName = 'عمارة <b>النور</b>';
    const generatedAt = '2024-01-31T00:00:00.000Z';

    const period = api.renderPeriodReportPdfHtml({
        fromMonth: 'يناير ٢٠٢٤',
        toMonth: 'فبراير ٢٠٢٤',
        rangeLabel: 'يناير ٢٠٢٤ — فبراير ٢٠٢٤',
        showDues: true,
        months: [{ month: 'يناير ٢٠٢٤', expectedCents: 100000, collectedCents: 80000, outstandingCents: 20000, rate: 80, expenseCents: 10000, netCents: 70000 }],
        totals: { expectedCents: 100000, adjustmentCents: 0, collectedCents: 80000, outstandingCents: 20000, rate: 80, otherIncomeCents: 0, expenseCents: 10000, netCents: 70000 },
        methods: [{ label: 'نقدي', count: 1, cents: 80000, share: 100 }],
        purposes: [{ label: 'اشتراك شهري', count: 1, cents: 80000 }],
        purposeFilter: '', cashAccountFilter: '', residentFilter: '',
        generatedAt
    });
    assert.match(period, /^<div dir="rtl" lang="ar"/);
    assert.match(period, /<header style="text-align:center;border-bottom:2px solid #334155/);
    assert.match(period, /تقرير الفترة/);
    assert.match(period, /عمارة &lt;b&gt;النور&lt;\/b&gt;/);
    assert.match(period, /<footer style="font-size:9px;color:#64748b;margin-top:18px;text-align:center">Manzil — /);

    const expenses = api.renderExpensesReportPdfHtml({
        rangeLabel: 'يناير ٢٠٢٤',
        months: [{ month: 'يناير ٢٠٢٤', count: 2, expenseCents: 50000 }],
        totals: { expenseCents: 50000, count: 2, averageCents: 25000, monthCount: 1 },
        categories: [{ label: 'صيانة', count: 2, cents: 50000, share: 100 }],
        funds: [{ label: 'الخزنة الرئيسية', count: 2, cents: 50000, share: 100 }],
        list: [{ month: 'يناير ٢٠٢٤', title: 'إصلاح', category: 'صيانة', cashAccountCode: 'main', amount: 500, notes: '' }],
        cashAccountFilter: '', cashAccountLabel: 'كل الصناديق',
        categoryFilter: '', categoryLabel: 'كل التصنيفات',
        generatedAt
    });
    assert.match(expenses, /^<div dir="rtl" lang="ar"/);
    assert.match(expenses, /تقرير المصروفات/);
    assert.match(expenses, /<footer style="font-size:9px;color:#64748b;margin-top:18px;text-align:center">Manzil — /);

    const adjustments = api.renderAdjustmentsReportPdfHtml({
        fromMonth: 'يناير ٢٠٢٤',
        toMonth: 'يناير ٢٠٢٤',
        rangeLabel: 'يناير ٢٠٢٤',
        months: [{ month: 'يناير ٢٠٢٤', count: 1, amountCents: 30000 }],
        totals: { amountCents: 30000, count: 1, residentCount: 1, monthCount: 1 },
        kinds: [{ label: 'إعفاء', count: 1, cents: 30000, share: 100 }],
        list: [{ apartmentNumber: '١', residentName: 'أحمد', kindLabel: 'إعفاء', month: 'يناير ٢٠٢٤', amountCents: 30000, reason: 'ظروف' }],
        residentFilter: '', residentLabel: 'كل الشقق',
        kindFilter: '', kindLabel: 'كل الأنواع',
        generatedAt
    });
    assert.match(adjustments, /^<div dir="rtl" lang="ar"/);
    assert.match(adjustments, /تقرير الإعفاءات والتخفيضات/);
    assert.match(adjustments, /<footer style="font-size:9px;color:#64748b;margin-top:18px;text-align:center">Manzil — /);
});
