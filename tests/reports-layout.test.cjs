const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const reports = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const render = fs.readFileSync(path.join(__dirname, '..', 'js', 'render.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const reportTab = html.slice(html.indexOf('id="tab-reports"'), html.indexOf('id="appCopyright"'));
const reportConstants = reports.slice(0, reports.indexOf('const REPORT_TONE_CLASSES'));

test('the reports tab opens on the icon grid with every panel closed', () => {
    const panels = [...reportTab.matchAll(/<(?:div) id="(landlordReportPrint|periodReportCard|residentStatementCard|monthlyClosePanel|arrearsPanel|auditLogPanel)"([^>]*)>/g)];
    assert.deepEqual(panels.map(match => match[1]), ['landlordReportPrint', 'periodReportCard', 'residentStatementCard', 'monthlyClosePanel', 'arrearsPanel', 'auditLogPanel']);
    panels.forEach(match => assert.match(match[2], /hidden/, match[1] + ' must start hidden so the grid is the only thing on screen'));
    assert.match(reportTab, /id="tab-reports" class="[^"]*" data-report-view="grid"/, 'the section remembers which view is open');
});

test('monthly close and arrears are panels with their controls preserved', () => {
    for (const id of ['monthlyCloseTitle', 'monthlyCloseMonthSelect', 'monthlyCloseReviewButton', 'monthlyClosePdfButton', 'monthlyClosePreview', 'arrearsApartmentFilter', 'arrearsStatusFilter', 'arrearsFromMonth', 'arrearsToMonth', 'arrearsReportContainer']) {
        assert.ok(reportTab.includes('id="' + id + '"'), 'missing ' + id);
    }
    assert.match(reportTab, /exportArrearsCSV\(\)/);
    assert.doesNotMatch(reportTab, /<details\b(?!\s*class="[^"]*report-chart-fold)/, 'only chart folds may be disclosure panels');
});

test('the reports nav offers one entry per panel and marks the active one', () => {
    const entries = [...reportTab.matchAll(/data-report-nav="([a-zA-Z]+)" aria-controls="([a-zA-Z]+)"/g)];
    assert.deepEqual(entries.map(match => match[1]), ['landlord', 'period', 'cashflow', 'expenses', 'adjustments', 'statement', 'apartments', 'monthlyClose', 'arrears', 'audit']);
    assert.deepEqual(entries.map(match => match[2]), ['landlordReportPrint', 'periodReportCard', 'cashFlowPanel', 'expensesReportCard', 'adjustmentsReportCard', 'residentStatementCard', 'apartmentsPanel', 'monthlyClosePanel', 'arrearsPanel', 'auditLogPanel']);
    entries.forEach(match => assert.ok(reportTab.includes('id="' + match[2] + '"'), match[2] + ' has no panel'));
    assert.equal((reportTab.match(/class="report-nav-item is-active[^"]*"/g) || []).length, 0, 'no card is open until the user taps one');
    assert.equal((reportTab.match(/aria-current="page"/g) || []).length, 0, 'the active marker is set only while a report is open');
});

test('changing the report month invalidates the preview and output actions', () => {
    assert.match(reportTab, /id="reportMonthSelect"[^>]*onchange="invalidateLandlordReportPreview\(\)"/);
    assert.match(reportTab, /id="landlordReportPreview"[^>]*aria-live="polite"/);
    assert.match(reportTab, /id="reportPrintBtn"[^>]*onclick="printLandlordReport\(\)"[^>]*disabled/);
    assert.match(reportTab, /id="reportExportBtn"[^>]*onclick="exportToCSV\(\)"[^>]*disabled/);
    assert.match(reports, /function invalidateLandlordReportIfStale\(\)/);
    assert.match(render, /invalidateLandlordReportIfStale\(\)/);
});

test('export is scoped to the previewed month and uses a month-based filename', () => {
    assert.match(reports, /function exportToCSV\(month = landlordReportMonth, purposeFilter = landlordReportPurposeFilter, cashAccountFilter = landlordReportCashAccountFilter, paymentMethodFilter = landlordReportPaymentMethodFilter, residentFilter = landlordReportResidentFilter\)/);
    assert.match(reports, /if \(landlordReportSignature && getLandlordReportSignature\(reportMonth, purposeFilter, cashAccountFilter, paymentMethodFilter, residentFilter\) !== landlordReportSignature\)/);
    assert.match(reports, /const \{ income: inc, expenses: exp \} = getLandlordReportData\(reportMonth, purposeFilter, cashAccountFilter, paymentMethodFilter, residentFilter\)/);
    assert.match(reports, /manzil_report_\$\{monthKey \? monthKey\.slice\(0, 7\) : Date\.now\(\)\}\$\{purposeSuffix\}\$\{cashSuffix\}\$\{paymentSuffix\}\$\{residentSuffix\}\.csv/);
    assert.doesNotMatch(reports, /state\.income\.forEach\(i =>/);
});

test('statement PDF downloader only takes the rendered html and file metadata', () => {
    assert.match(reports, /async function downloadStatementPdf\(html, filename, buttonId, successMessage, logLabel, isPreviewValid\)/);
    assert.doesNotMatch(reports, /downloadStatementPdf\(\s*statement,/);
    assert.doesNotMatch(reports, /downloadStatementPdf\(\s*unitStatement,/);
});

test('landlord report aggregates money in cents and formats with fmtMoney', () => {
    assert.match(stateSource, /function toCents\(value\)/);
    assert.match(stateSource, /function fmtMoney\(value\)/);
    assert.match(reports, /const totalIncCents = inc\.reduce\(\(sum, i\) => sum \+ toCents\(i\.amount\), 0\)/);
    assert.match(reports, /const totalExpCents = exp\.reduce\(\(sum, e\) => sum \+ toCents\(e\.amount\), 0\)/);
    assert.match(reports, /totals\.cents \+= toCents\(payment\.amount\)/);
    assert.match(reports, /fmtMoney\(item\.cents \/ 100\)/);
    assert.doesNotMatch(reports, /parseFloat\(i\.amount\)/);
});

test('reports surface shares card headers, stat tiles, and tabular numerals', () => {
    assert.match(css, /\.report-card-head \{/);
    assert.match(css, /\.report-card-title \{/);
    assert.match(css, /\.report-stat-value \{[^}]*font-variant-numeric: tabular-nums/);
    assert.match(css, /\.report-amount \{ font-variant-numeric: tabular-nums/);
    assert.match(css, /#printableArea \.app-card, #printableArea \.app-input, #printableArea \.report-stat \{/);
    assert.equal((reportTab.match(/class="report-card-title"/g) || []).length, 10);
    assert.equal((reportTab.match(/class="report-card-badge /g) || []).length, 10);
    assert.equal((reports.match(/class="report-stat"/g) || []).length, 2, 'every preview now builds its KPI cells through renderReportStatTiles');
    assert.equal((render.match(/class="report-stat"/g) || []).length, 0, 'arrears and audit KPIs come from the shared helper');
    assert.match(reports, /sheet-positive/);
    assert.match(render, /sheet-negative/);
});

test('landlord and statement previews share one summary model with their PDFs', () => {
    assert.match(reports, /function buildLandlordReportModel\(month, purposeFilter = '', cashAccountFilter = '', paymentMethodFilter = '', residentFilter = ''\)/);
    assert.match(reports, /function getLandlordSummaryItems\(model\)/);
    assert.match(reports, /function getResidentStatementSummaryItems\(statement\)/);
    assert.equal((reports.match(/const statsHtml = renderReportStatTiles\(/g) || []).length, 2, 'both previews render from the shared tile helper');
    assert.equal((reports.match(/const summaryRows = renderPdfSummaryRows\(/g) || []).length, 2, 'both PDFs render from the shared summary helper');
});

test('reports section has a header, an icon nav, and unified actions', () => {
    assert.match(reportTab, /class="report-section-head no-print"/);
    assert.match(reportTab, /class="report-nav no-print" aria-label="أنواع التقارير" onkeydown="handleReportTabKeydown\(event\)"/);
    assert.doesNotMatch(reportTab, /report-jump-chip/, 'the chip row is gone now that the nav switches panels');
    assert.match(reports, /function switchReportTab\(tab\)/);
    assert.match(reports, /function handleReportTabKeydown\(event\)/);
    assert.match(reports, /function jumpToReportPanel\(panelId\)/);
    assert.equal((reportTab.match(/class="report-card-icon /g) || []).length, 10);
    assert.equal((reportTab.match(/class="report-nav-icon" aria-hidden="true"/g) || []).length, 10);
    assert.equal((reportTab.match(/class="report-nav-item[^"]*report-tone-[a-z]+"/g) || []).length, 10, 'each nav card carries its report tone so the accent, border and ring follow the tone system');
    assert.match(reportTab, /class="report-actions report-actions-4/);
    assert.match(reportTab, /class="report-toolbar no-print"/);
    assert.match(reportTab, /class="report-preview text-xs/);
    assert.match(css, /\.report-nav \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)/, 'two columns on mobile');
    assert.match(css, /@media \(min-width: 640px\) \{ \.report-nav \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)/, 'three columns from 640px');
    assert.doesNotMatch(css, /\.report-nav \{ grid-template-columns: repeat\(6/, 'the six-across strip is gone so each card has room for its copy');
    assert.match(css, /@media \(max-width: 639\.98px\) \{[^@]*\.report-nav-item \{ flex-direction: column/, 'phone tiles stack icon over copy so two columns still fit the Arabic labels');
    assert.match(css, /\.report-nav-item \{[^}]*min-height: 4\.8rem/, 'cards stay compact enough to leave the panel reachable on a phone');
    assert.match(css, /\.report-nav-item::before \{/, 'the tone glow behind each card');
    assert.match(css, /\.report-nav-item:hover \{[^}]*transform: translateY\(-2px\)/);
    assert.match(css, /\.report-nav-item\.is-active \{[^}]*box-shadow: 0 0 0 2px color-mix\(in srgb, var\(--report-tone, var\(--accent-color\)\) 28%, transparent\)/, 'the active card is ringed in its own tone');
    assert.match(css, /\.report-nav-item\.is-ready::after \{ background: var\(--state-success\)/, 'a ready preview stays green whatever the report tone is');
    assert.match(css, /\.report-nav-item\.is-stale::after \{ background: var\(--state-warning\)/, 'a stale preview stays amber whatever the report tone is');
    assert.match(css, /@media \(max-width: 639\.98px\) \{[\s\S]*?\.report-toolbar > \.report-field \{ flex: 0 0 auto; \}/, 'stacked fields must drop the row flex-basis, which made every toolbar 12rem taller on phones');
    assert.match(css, /\.report-action:disabled \{/);
    assert.match(css, /\.report-action-primary \{/);
    assert.match(css, /\.report-preview:has\(> \.report-preview-empty:only-child\) \{/);
    assert.match(css, /\.report-list-row \{/);
    assert.match(css, /\.arrears-card, \.report-surface \{/);
    assert.match(css, /\.audit-log-row::before/);
});

test('tapping a card opens that report full page and back returns to the grid', () => {
    assert.match(reportTab, /id="reportViewBar" class="report-view-bar no-print"/);
    assert.match(reportTab, /class="report-view-back" onclick="showReportGrid\(\)" aria-label="رجوع إلى شبكة التقارير"/);
    ['reportViewIcon', 'reportViewTitle', 'reportViewMeta'].forEach(id => assert.ok(reportTab.includes('id="' + id + '"'), 'missing ' + id));
    assert.match(reports, /function showReportGrid\(\)/);
    assert.match(reports, /function resetReportView\(\)/);
    assert.match(reports, /function renderReportViewBar\(tab\)/);
    assert.match(reports, /function handleReportViewKeydown\(event\)/);
    assert.match(reports, /document\.getElementById\('tab-reports'\)\?\.setAttribute\('data-report-view', 'panel'\)/);
    assert.match(reports, /if \(getReportView\(\) !== 'panel'\) return false;/, 'back only makes sense while a report is open');
    assert.match(reports, /if \(event\.key !== 'Escape' \|\| getReportView\(\) !== 'panel'\) return;/);
    assert.match(reports, /typeof getTopmostOpenModal === 'function' && getTopmostOpenModal\(\)/, 'an open modal keeps its own Escape');
    assert.match(reports, /item\.querySelector\('\.report-nav-copy b'\)\?\.textContent/, 'the bar title is read from the card so the two never drift apart');
    assert.match(app, /document\.addEventListener\('keydown', handleReportViewKeydown\)/);
    assert.match(app, /const reportsOpen = !document\.getElementById\('tab-reports'\)\?\.classList\.contains\('hidden'\);/, 'read before the loop unhides the tab');
    assert.match(app, /if \(tab === 'reports' && !reportsOpen && typeof resetReportView === 'function'\) resetReportView\(\)/, 'entering the tab lands on the grid, but re-entering it from a print call keeps the open report');
    assert.match(reports, /function resetReportView\(\) \{\s*closeReportPanel\(\{ focusCard: false \}\);/, 'resetting the view must not steal focus from the caller');
    assert.doesNotMatch(reports, /switchReportTab\(next\.dataset\.reportNav\)/, 'arrow keys move focus between cards instead of opening reports');
    assert.match(css, /#tab-reports\[data-report-view="panel"\] \.report-section-head \{ display: none; \}/, 'the grid leaves the screen while a report is open');
    assert.match(css, /#tab-reports\[data-report-view="panel"\] \.report-view-bar \{ display: flex; \}/);
    assert.match(css, /\.report-view-bar \{[\s\S]*?scroll-margin-top: 6\.5rem;/, 'the sticky header must not swallow the back bar');
});

test('the nav marker follows the same freshness gate as the output buttons', () => {
    assert.match(reports, /const REPORT_OUTPUT_BUTTON_IDS = \{[\s\S]*landlord: 'reportPrintBtn'[\s\S]*period: 'periodReportPrintBtn'[\s\S]*statement: 'statementPrintBtn'[\s\S]*monthlyClose: 'monthlyClosePdfButton'/);
    assert.match(reports, /function syncReportNavStatus\(\)/);
    assert.match(reports, /item\.classList\.toggle\('is-ready', ready\)/);
    assert.match(reports, /function markReportPreviewStale\(previewId, stale\)/);
    ['setLandlordReportActionsEnabled', 'setPeriodReportActionsEnabled', 'setResidentStatementActionsEnabled'].forEach(name => {
        const body = new RegExp('function ' + name + '\\(enabled\\) \\{[\\s\\S]*?\\n\\}').exec(reports)[0];
        assert.match(body, /markReportPreviewStale\('[a-zA-Z]+Preview', !enabled\)/);
        assert.match(body, /syncReportNavStatus\(\)/);
    });
    assert.match(render, /invalidatePeriodReportIfStale\(\);[\s\S]*?syncReportNavStatus\(\);/);
    const monthlyClose = fs.readFileSync(path.join(__dirname, '..', 'js', 'monthly-close.js'), 'utf8');
    assert.match(monthlyClose, /markReportPreviewStale\('monthlyClosePreview', true\)/);
    assert.equal((monthlyClose.match(/syncReportNavStatus\(\)/g) || []).length, 3);
});

test('generated previews use the shared report blocks and theme-safe styles', () => {
    const extended = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-extended.js'), 'utf8');
    const monthlyClose = fs.readFileSync(path.join(__dirname, '..', 'js', 'monthly-close.js'), 'utf8');
    assert.doesNotMatch(reports, /border-slate-800 py-1/);
    assert.match(reports, /class="report-preview-header"/);
    assert.match(reports, /class="report-stats report-stats-4"/);
    assert.match(reports, /class="report-block-title"/);
    assert.match(render, /renderSheetBlock\('ملخص المتأخرات'/);
    assert.match(render, /renderSheetBlock\('تفاصيل الأشهر غير المسددة'/);
    assert.match(render, /renderSheetTable\(headers, rows/);

    // One contract for every preview: header, KPI table, blocks, chart fold, notes.
    assert.match(reports, /function renderReportHeader\(title, metaLines = \[\]\)/);
    assert.match(reports, /function renderReportNotes\(paragraphs\)/);
    assert.match(reports, /function renderChartFold\(canvasId, label\)/);
    assert.match(reports, /function renderChartFoldContainer\(containerId, label\)/);
    ['landlordReportChart', 'periodReportChart', 'expensesReportChart', 'adjustmentsReportChart'].forEach(id =>
        assert.match(reports, new RegExp("renderChartFold\\('" + id + "'")));
    ['extendedCashFlowChartContainer', 'extendedApartmentsChartContainer'].forEach(id =>
        assert.match(extended, new RegExp("renderChartFoldContainer\\('" + id + "'")));
    assert.match(reports, /renderReportNotes\(\[/);
    assert.match(extended, /renderReportNotes\(\[/);
    assert.match(monthlyClose, /renderReportHeader\(/);
    assert.match(render, /renderReportHeader\(/);
    assert.match(css, /\.report-note-fold \{ border:/);
    assert.match(css, /#printableArea \.report-note-fold > \.report-note \{ display: block !important;/);
    assert.doesNotMatch(html, /id="extendedCashFlowChartContainer"/, 'chart containers now live inside their own preview');
    assert.doesNotMatch(html, /id="extendedApartmentsChartContainer"/);
});

test('landlord report compares expected dues with collections', () => {
    assert.match(reports, /function getMonthlyBillingTotals\(month, residentFilter = ''\)/);
    assert.match(reports, /getSubscriptionAmountForMonth\(resident, month\)/);
    assert.match(reports, /getMonthOutstanding\(resident, month\)/);
    assert.match(reports, /const \{ expectedCents, outstandingCents, adjustmentCents \} = showDues\s*\? getMonthlyBillingTotals\(month, residentFilter\)/);
    assert.match(reports, /collectionRate/);
    assert.match(reports, /isResidentActiveInMonth/);
    assert.match(reports, /function getExpenseCategoryTotals\(expenses\)/);
    assert.match(reports, /state\.defaultSubscription \?\? ''/);
    assert.match(reports, /state\.residents \|\| \[\]/);
});

test('printing a landlord report hides the rest of the reports tab', () => {
    assert.match(reports, /function printLandlordReport\(\)/);
    assert.match(reports, /document\.body\.classList\.add\('print-landlord'\)/);
    assert.match(reports, /meta\.textContent = `تقرير \$\{landlordReportMonth\}/);
    assert.match(css, /body\.print-landlord #tab-reports > :not\(#landlordReportPrint\) \{ display: none !important; \}/);
    assert.match(css, /body\.print-landlord #landlordReportPrint \{/);
});

test('audit log reports how many entries are shown and offers load more', () => {
    assert.match(render, /عرض \$\{fmtNum\(visible\.length\)\} من \$\{fmtNum\(filtered\.length\)\}/);
    assert.match(render, /renderAuditLog\(\{ more: true \}\)/);
    assert.doesNotMatch(render, /filtered\.slice\(0, 100\)/);
});

test('resident statement scopes a monthly ledger to one resident with gated outputs', () => {
    assert.ok(reportTab.includes('id="residentStatementCard"'));
    assert.match(reportTab, /id="statementResidentSelect"[^>]*onchange="invalidateResidentStatementPreview\(\)"/);
    assert.match(reportTab, /id="residentStatementPreview"[^>]*aria-live="polite"/);
    for (const id of ['statementPrintBtn', 'statementPdfBtn', 'unitReportPdfBtn', 'statementCsvBtn']) {
        assert.match(reportTab, new RegExp('id="' + id + '"[^>]*disabled'));
    }
    assert.match(reports, /function buildResidentStatement\(residentId, purposeFilter = ''\)/);
    assert.match(reports, /function getResidentStatementSignature\(residentId, purposeFilter = ''\)/);
    assert.match(reports, /\[resident, payments, adjustments, state\.defaultSubscription \?\? '', getCurrentMonth\(\), purposeFilter \|\| ''\]/);
    assert.match(reports, /function invalidateResidentStatementIfStale\(\)/);
    assert.match(render, /invalidateResidentStatementIfStale\(\)/);
    assert.match(render, /function populateStatementResidentSelect\(\)/);
    assert.match(reports, /getSubscriptionAmountForMonth\(resident, month\)/);
    assert.match(reports, /getPaidAmountForMonth\(resident.id, month\)/);
    assert.match(reports, /statement-table/);
    assert.match(css, /body\.print-statement #tab-reports > :not\(#residentStatementCard\) \{ display: none !important; \}/);
    assert.match(css, /body\.print-statement #residentStatementCard \{/);
    assert.match(reports, /await ensurePdfLibrary\(\)/);
    assert.match(reports, /manzil_statement_\$\{getStatementFileSlug\(statement\)\}\.csv/);
    assert.match(reports, /manzil_statement_\$\{getStatementFileSlug\(statement\)\}\.pdf/);
    assert.match(reports, /function exportUnitReportPdf\(\)/);
    assert.match(reports, /function buildUnitReportStatement\(statement\)/);
    assert.match(reports, /return buildResidentStatement\(statement\.resident\.id\) \|\| statement/);
    assert.match(reports, /const unitStatement = buildUnitReportStatement\(statement\)/);
    assert.match(reports, /manzil_unit_\$\{getStatementFileSlug\(unitStatement, false\)\}\.pdf/);
    assert.match(reports, /function renderUnitReportPdfHtml\(statement\)/);
    assert.doesNotMatch(reports, /statement\.allPayments/);
    assert.match(reports, /بيانات الوحدة/);
});

test('period report rolls the monthly landlord figures across a range with gated outputs', () => {
    assert.ok(reportTab.includes('id="periodReportCard"'));
    assert.match(reportTab, /switchReportTab\('period'\)/);
    assert.match(reportTab, /id="periodReportPreset"[^>]*onchange="applyPeriodReportPreset\(\)"/);
    for (const id of ['periodReportFrom', 'periodReportTo']) {
        assert.match(reportTab, new RegExp('id="' + id + '"[^>]*onchange="onPeriodReportRangeChange\\(\\)"'));
    }
    assert.match(reportTab, /id="periodReportPreview"[^>]*aria-live="polite"/);
    for (const id of ['periodReportPrintBtn', 'periodReportExportBtn']) {
        assert.match(reportTab, new RegExp('id="' + id + '"[^>]*disabled'));
    }
    assert.match(reports, /function buildPeriodReport\(fromMonth, toMonth, purposeFilter = '', cashAccountFilter = '', residentFilter = ''\)/);
    assert.match(reports, /const \{ expectedCents, outstandingCents, adjustmentCents \} = showDues\s*\? getMonthlyBillingTotals\(month, normalizedResident\)/);
    assert.match(reports, /function getPeriodReportSignature\(fromMonth, toMonth, purposeFilter = '', cashAccountFilter = '', residentFilter = ''\)/);
    assert.match(reports, /function invalidatePeriodReportIfStale\(\)/);
    assert.match(render, /invalidatePeriodReportIfStale\(\)/);
    assert.match(render, /function populatePeriodReportSelects\(months/);
    assert.match(reports, /manzil_period_\$\{getPeriodReportFileSlug\(report\)\}\$\{purposeSuffix\}\$\{cashSuffix\}\$\{residentSuffix\}\.csv/);
    assert.match(reports, /document\.body\.classList\.add\('print-period'\)/);
    assert.match(css, /body\.print-period #tab-reports > :not\(#periodReportCard\) \{ display: none !important; \}/);
    assert.match(css, /body\.print-period #periodReportCard \{/);
    assert.match(css, /\.statement-table tfoot td \{/);
    assert.match(css, /\.report-toolbar > \.report-field-narrow \{/);
    assert.match(css, /\.no-print, nav, #toastContainer \{ display: none !important; \}/);
    assert.doesNotMatch(css, /\.no-print, nav, header,/);
});

test('report hub offers live highlights, search, groups and recently used reports', () => {
    const template = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.template.html'), 'utf8');
    const extended = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-extended.js'), 'utf8');
    ['reportHub', 'reportHubSearch', 'reportHubStats', 'reportHubRecent', 'reportHubEmpty'].forEach(id =>
        assert.ok(reportTab.includes('id="' + id + '"'), 'missing hub element ' + id));
    ['all', 'financial', 'units', 'review'].forEach(group =>
        assert.ok(reportTab.includes('data-report-group="' + group + '"'), 'missing group chip ' + group));
    assert.match(reportTab, /oninput="filterReportNav\(\)"/);
    assert.match(reportTab, /onclick="setReportGroup\('financial'\)"/);
    assert.match(css, /\.report-hub \{ display: flex;/);
    assert.match(css, /\.report-nav-item\.is-filtered-out \{ display: none; \}/);
    assert.match(extended, /function renderReportHub\(\)/);
    assert.match(extended, /function filterReportNav\(\)/);
    assert.match(extended, /function setReportGroup\(group\)/);
    assert.match(extended, /const EXTENDED_RECENT_STORAGE_KEY = 'manzil_recent_reports'/);
    assert.match(render, /if \(typeof renderReportHub === 'function'\) renderReportHub\(\);/);
    assert.match(template, /<script src="js\/reports\/extended\/reports-extended\.js"><\/script>/);
    reportTab.match(/data-report-nav="[a-zA-Z]+"/g).forEach(attr => {
        const key = attr.replace('data-report-nav="', '').replace('"', '');
        const card = reportTab.slice(reportTab.indexOf(attr));
        assert.match(card.slice(0, 400), /data-report-group="(financial|units|review)"/, key + ' must belong to a group');
    });
});

test('the report workspace adds shortcuts, guided steps and a live output status', () => {
    const extended = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-extended.js'), 'utf8');

    assert.match(reportTab, /class="report-command-strip no-print"/);
    ['landlord', 'statement', 'arrears'].forEach(key =>
        assert.match(reportTab, new RegExp('data-report-shortcut="' + key + '"[^>]*onclick="switchReportTab\\(\'' + key + '\'\\)"'), key + ' shortcut must open its report'));
    assert.match(extended, /\[data-report-shortcut\]/);
    assert.match(extended, /nav\.dataset\.reportShortcut/);

    ['filters', 'preview', 'export'].forEach(step =>
        assert.match(reportTab, new RegExp('data-report-step="' + step + '"[^>]*onclick="focusReportStep\\(\'' + step + '\'\\)"'), step + ' step is wired'));
    assert.match(reportTab, /id="reportViewStatus"[^>]*aria-live="polite"/);
    assert.match(reports, /function renderReportViewStatus\(\)/);
    assert.match(reports, /renderReportViewStatus\(\);/);
    assert.match(reports, /function focusReportStep\(step\)/);
    assert.match(reports, /function copyReportTone\(target, item\)/);
    assert.match(reports, /copyReportTone\(panel, item\)/, 'the open panel carries its own report identity inside the preview');
    assert.match(reports, /'--report-glyph'/, 'the open report also carries its sequence watermark');
    assert.match(reports, /window\.focusReportStep = focusReportStep/);
    assert.match(reports, /REPORT_OUTPUT_BUTTON_IDS\[tab\]/, 'the status reads the same output gate as the print and export buttons');
    assert.match(css, /\.report-view-bar::after \{[\s\S]*?content: var\(--report-glyph/);
    assert.match(css, /@media screen \{[\s\S]*?#tab-reports\[data-report-view="panel"\] #scheduledReportsSection/, 'report tools must not linger above an open report');
    assert.match(css, /#tab-reports\[data-report-view="panel"\] \.report-panel > \.report-card-head \{ display: none; \}/, 'a panel must not repeat its title under the view bar');
    assert.match(css, /\.report-view-status\.is-ready::before \{ background: var\(--state-success\)/);
    assert.match(css, /\.report-view-status\.is-stale::before \{ background: var\(--state-warning\)/);

    const toneKeys = [...css.matchAll(/\[data-report-nav="([a-zA-Z]+)"\] \{[^}]*--report-tone:/g)].map(match => match[1]);
    assert.deepEqual(toneKeys, ['landlord', 'period', 'cashflow', 'expenses', 'adjustments', 'statement', 'apartments', 'monthlyClose', 'arrears', 'audit']);
});

test('generated previews are navigable and collapsible without weakening print', () => {
    assert.match(reports, /function renderSheetBlock\(title, headers, rows, options = \{\}\)/);
    assert.match(reports, /class="report-block-toggle no-print" data-report-block-toggle/);
    assert.match(reports, /<div class="report-block-body">/);
    assert.match(reports, /function enhanceReportPreviews\(root = document\)/);
    assert.match(reports, /function initReportPreviewInteractions\(\)/);
    assert.match(reports, /new MutationObserver\(\(\) => enhanceReportPreviews\(document\)\)/);
    assert.match(reports, /data-report-section-jump/);
    assert.match(css, /\.report-block\.is-collapsed \.report-block-body \{ display: none; \}/);
    assert.match(css, /\.report-section-rail \{[\s\S]*?display: flex;/);
    assert.match(css, /#printableArea \.report-block-body \{ display: block !important; \}/, 'collapsed on-screen sections must still print in full');
    assert.doesNotMatch(css, /@media print \{[\s\S]*?\.report-block\.is-collapsed \.report-block-body/);
});

test('cash flow and apartment performance are first-class report tabs', () => {
    const extended = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-extended.js'), 'utf8');
    ['cashFlowPanel', 'apartmentsPanel'].forEach(id => {
        assert.ok(reportTab.includes('id="' + id + '"'), 'missing panel ' + id);
        assert.ok(reportConstants.includes(id), 'panel ' + id + ' must be registered in reports.js');
    });
    ['cashFlowFrom', 'cashFlowTo', 'cashFlowPreset', 'cashFlowCashAccount', 'cashFlowPreview',
        'cashFlowPrintBtn', 'cashFlowPdfBtn', 'cashFlowExportBtn', 'cashFlowExcelBtn',
        'apartmentsReportFrom', 'apartmentsReportTo', 'apartmentsReportPreset', 'apartmentsReportResident',
        'apartmentsReportPreview', 'apartmentsPrintBtn', 'apartmentsPdfBtn', 'apartmentsExportBtn', 'apartmentsExcelBtn'
    ].forEach(id => assert.ok(reportTab.includes('id="' + id + '"'), 'missing control ' + id));
    assert.match(css, /body\.print-cashflow #tab-reports > :not\(#cashFlowPanel\)/);
    assert.match(css, /body\.print-apartments #tab-reports > :not\(#apartmentsPanel\)/);
    assert.match(extended, /function buildCashFlowReport\(fromMonth, toMonth, cashAccountFilter = ''\)/);
    assert.match(extended, /function buildApartmentPerformanceReport\(fromMonth, toMonth, residentFilter = ''\)/);
    assert.match(extended, /function generateCashFlowReport\(\)/);
    assert.match(extended, /function generateApartmentsReport\(\)/);
    assert.match(render, /populateExtendedReportFilters\(months, current\)/);
    assert.match(render, /invalidateExtendedReportsIfStale\(\)/);
});

test('resident statement entry is reachable from the resident profile', () => {
    const crud = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');
    assert.match(crud, /onclick="openResidentStatementFromProfile/);
    assert.match(crud, /function openResidentStatementFromProfile\(residentId\)/);
    assert.match(crud, /switchTab\('reports'\)/);
    assert.match(crud, /jumpToReportPanel\('residentStatementCard'\)/);
    assert.match(crud, /generateResidentStatement\(\)/);
    assert.doesNotMatch(crud, /card\.scrollIntoView/, 'opening the report already scrolls to the back bar, so the profile entry must not scroll twice');
    assert.match(app, /function ensurePdfLibrary\(\)/);
});

test('report previews use a calm rhythm and lined-up, readable tables', () => {
    const extended = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-extended.js'), 'utf8');

    // One shared flow wrapper gives every extended preview the same spacing
    // rhythm instead of gluing the header, tiles and blocks together.
    assert.equal((extended.match(/class="report-preview-flow"/g) || []).length, 2, 'both extended reports wrap their preview sections in the shared flow');
    assert.match(css, /\.report-preview-flow \{ display: flex; flex-direction: column; gap: var\(--space-105\); \}/);
    assert.match(css, /\.report-preview-flow > \.report-block \{[\s\S]*?padding: var\(--space-90\); border: 1px solid var\(--border-color\)/);

    // Tables have borders, even/odd rows and tabular numerals so columns line up.
    assert.match(css, /\.report-table-wrap \{ overflow-x: auto; border: 1px solid var\(--border-color\)/);
    assert.match(css, /\.statement-table \{ width: 100%; border-collapse: collapse; font-size: var\(--font-78\); \}/);
    assert.match(css, /\.statement-table th, \.statement-table td \{[^}]*border-bottom: 1px solid var\(--border-color\)/);
    assert.match(css, /\.statement-table tbody tr:nth-child\(even\) \{ background:/);
    assert.match(css, /\.statement-table td \{ font-variant-numeric: tabular-nums; \}/);

    // Printed/PDF reports get the same structural help through the shared shell.
    assert.match(reports, /const REPORT_PDF_DOCUMENT_STYLE = '<style>' \+/);
    assert.match(reports, /\.manzil-pdf tbody tr:nth-child\(even\)\{background:' \+ REPORT_PDF_PALETTE\.hairline \+ '\}/);
    assert.match(reports, /function reportPdfDocumentOpen\(\) \{[\s\S]*?class="manzil-pdf"[\s\S]*?REPORT_PDF_DOCUMENT_STYLE/);
});
