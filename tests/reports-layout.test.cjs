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
    assert.doesNotMatch(reportTab, /<details\b/, 'the reports tab no longer mixes disclosure panels');
});

test('the reports nav offers one entry per panel and marks the active one', () => {
    const entries = [...reportTab.matchAll(/data-report-nav="([a-zA-Z]+)" aria-controls="([a-zA-Z]+)"/g)];
    assert.deepEqual(entries.map(match => match[1]), ['landlord', 'period', 'expenses', 'statement', 'monthlyClose', 'arrears', 'audit']);
    assert.deepEqual(entries.map(match => match[2]), ['landlordReportPrint', 'periodReportCard', 'expensesReportCard', 'residentStatementCard', 'monthlyClosePanel', 'arrearsPanel', 'auditLogPanel']);
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
    assert.match(reports, /function exportToCSV\(month = landlordReportMonth, purposeFilter = landlordReportPurposeFilter, cashAccountFilter = landlordReportCashAccountFilter, paymentMethodFilter = landlordReportPaymentMethodFilter\)/);
    assert.match(reports, /if \(landlordReportSignature && getLandlordReportSignature\(reportMonth, purposeFilter, cashAccountFilter, paymentMethodFilter\) !== landlordReportSignature\)/);
    assert.match(reports, /const \{ income: inc, expenses: exp \} = getLandlordReportData\(reportMonth, purposeFilter, cashAccountFilter, paymentMethodFilter\)/);
    assert.match(reports, /manzil_report_\$\{monthKey \? monthKey\.slice\(0, 7\) : Date\.now\(\)\}\$\{purposeSuffix\}\$\{cashSuffix\}\$\{paymentSuffix\}\.csv/);
    assert.doesNotMatch(reports, /state\.income\.forEach\(i =>/);
});

test('statement PDF downloader only takes the rendered html and file metadata', () => {
    assert.match(reports, /async function downloadStatementPdf\(html, filename, buttonId, successMessage, logLabel\)/);
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
    assert.equal((reportTab.match(/class="report-card-title"/g) || []).length, 7);
    assert.equal((reportTab.match(/class="report-card-badge /g) || []).length, 7);
    assert.equal((reports.match(/class="report-stat"/g) || []).length, 17, 'landlord, expenses, statement and conditional adjustment tiles come from the shared helpers');
    assert.equal((render.match(/class="report-stat"/g) || []).length, 4);
    assert.match(reports, /text-emerald-400 report-amount/);
    assert.match(render, /text-rose-400 report-amount/);
});

test('landlord and statement previews share one summary model with their PDFs', () => {
    assert.match(reports, /function buildLandlordReportModel\(month, purposeFilter = '', cashAccountFilter = '', paymentMethodFilter = ''\)/);
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
    assert.equal((reportTab.match(/class="report-card-icon /g) || []).length, 7);
    assert.equal((reportTab.match(/class="report-nav-icon" aria-hidden="true"/g) || []).length, 7);
    assert.equal((reportTab.match(/class="report-nav-item[^"]*report-tone-[a-z]+"/g) || []).length, 7, 'each nav card carries its report tone so the accent, border and ring follow the tone system');
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
    assert.match(css, /\.report-nav-item\.is-ready::after \{ background: #10b981/, 'a ready preview stays green whatever the report tone is');
    assert.match(css, /\.report-nav-item\.is-stale::after/);
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
    assert.doesNotMatch(reports, /border-slate-800 py-1/);
    assert.match(reports, /class="report-preview-header"/);
    assert.match(reports, /'report-stats report-stats-4'/);
    assert.match(reports, /class="report-block-title"/);
    assert.match(render, /class="arrears-card" open/);
    assert.match(render, /class="arrears-badge"/);
    assert.match(render, /class="audit-log-meta"/);
});

test('landlord report compares expected dues with collections', () => {
    assert.match(reports, /function getMonthlyBillingTotals\(month\)/);
    assert.match(reports, /getSubscriptionAmountForMonth\(resident, month\)/);
    assert.match(reports, /getMonthOutstanding\(resident, month\)/);
    assert.match(reports, /const \{ expectedCents, outstandingCents, adjustmentCents \} = showDues\s*\? getMonthlyBillingTotals\(month\)/);
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
    assert.match(reports, /\[resident, payments, adjustments, state\.defaultSubscription \?\? '', purposeFilter \|\| ''\]/);
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
    assert.match(reports, /function buildPeriodReport\(fromMonth, toMonth, purposeFilter = '', cashAccountFilter = ''\)/);
    assert.match(reports, /const \{ expectedCents, outstandingCents, adjustmentCents \} = showDues\s*\? getMonthlyBillingTotals\(month\)/);
    assert.match(reports, /function getPeriodReportSignature\(fromMonth, toMonth, purposeFilter = '', cashAccountFilter = ''\)/);
    assert.match(reports, /function invalidatePeriodReportIfStale\(\)/);
    assert.match(render, /invalidatePeriodReportIfStale\(\)/);
    assert.match(render, /function populatePeriodReportSelects\(months/);
    assert.match(reports, /manzil_period_\$\{getPeriodReportFileSlug\(report\)\}\$\{purposeSuffix\}\$\{cashSuffix\}\.csv/);
    assert.match(reports, /document\.body\.classList\.add\('print-period'\)/);
    assert.match(css, /body\.print-period #tab-reports > :not\(#periodReportCard\) \{ display: none !important; \}/);
    assert.match(css, /body\.print-period #periodReportCard \{/);
    assert.match(css, /\.statement-table tfoot td \{/);
    assert.match(css, /\.report-toolbar > \.report-field-narrow \{/);
    assert.match(css, /\.no-print, nav, #toastContainer \{ display: none !important; \}/);
    assert.doesNotMatch(css, /\.no-print, nav, header,/);
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
