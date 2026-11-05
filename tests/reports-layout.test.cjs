const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const reports = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const render = fs.readFileSync(path.join(__dirname, '..', 'js', 'render.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');
const reportTab = html.slice(html.indexOf('id="tab-reports"'), html.indexOf('id="appCopyright"'));

test('landlord report remains immediately visible in the reports tab', () => {
    const landlord = reportTab.indexOf('id="landlordReportPreview"');
    const firstDisclosure = reportTab.indexOf('<details');
    assert.ok(landlord >= 0 && (firstDisclosure < 0 || landlord < firstDisclosure));
});

test('monthly close and arrears are collapsed disclosures with their controls preserved', () => {
    assert.match(reportTab, /<details class="app-card[^>]*>[\s\S]*?id="monthlyCloseTitle"/);
    assert.match(reportTab, /<details class="app-card[^>]*>[\s\S]*?كشف المتأخرات/);
    for (const id of ['monthlyCloseMonthSelect', 'monthlyCloseReviewButton', 'monthlyClosePdfButton', 'monthlyClosePreview', 'arrearsApartmentFilter', 'arrearsStatusFilter', 'arrearsFromMonth', 'arrearsToMonth', 'arrearsReportContainer']) {
        assert.ok(reportTab.includes('id="' + id + '"'), 'missing ' + id);
    }
    assert.match(reportTab, /exportArrearsCSV\(\)/);
});

test('report disclosure summaries do not contain interactive buttons', () => {
    for (const summary of reportTab.matchAll(/<summary[\s\S]*?<\/summary>/g)) {
        assert.doesNotMatch(summary[0], /<button\b/);
    }
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
    assert.match(reports, /function exportToCSV\(month = landlordReportMonth\)/);
    assert.match(reports, /const \{ income: inc, expenses: exp \} = getLandlordReportData\(reportMonth\)/);
    assert.match(reports, /manzil_report_\$\{monthKey \? monthKey\.slice\(0, 7\) : Date\.now\(\)\}\.csv/);
    assert.doesNotMatch(reports, /state\.income\.forEach\(i =>/);
});

test('landlord report aggregates money in cents and formats with fmtMoney', () => {
    assert.match(stateSource, /function toCents\(value\)/);
    assert.match(stateSource, /function fmtMoney\(value\)/);
    assert.match(reports, /const totalIncCents = inc\.reduce\(\(sum, i\) => sum \+ toCents\(i\.amount\), 0\)/);
    assert.match(reports, /const totalExpCents = exp\.reduce\(\(sum, e\) => sum \+ toCents\(e\.amount\), 0\)/);
    assert.match(reports, /totals\.cents \+= toCents\(payment\.amount\)/);
    assert.match(reports, /fmtMoney\(netCents \/ 100\)/);
    assert.doesNotMatch(reports, /parseFloat\(i\.amount\)/);
});

test('reports surface shares card headers, stat tiles, and tabular numerals', () => {
    assert.match(css, /\.report-card-head \{/);
    assert.match(css, /\.report-card-title \{/);
    assert.match(css, /\.report-stat-value \{[^}]*font-variant-numeric: tabular-nums/);
    assert.match(css, /\.report-amount \{ font-variant-numeric: tabular-nums/);
    assert.match(css, /#printableArea \.app-card, #printableArea \.app-input, #printableArea \.report-stat \{/);
    assert.equal((reportTab.match(/class="report-card-title"/g) || []).length, 5);
    assert.equal((reports.match(/class="report-stat"/g) || []).length, 10);
    assert.equal((render.match(/class="report-stat"/g) || []).length, 4);
    assert.match(reports, /text-emerald-400 report-amount/);
    assert.match(render, /text-rose-400 report-amount/);
});

test('reports section has a header, quick jump chips, and unified actions', () => {
    assert.match(reportTab, /class="report-section-head no-print"/);
    assert.match(reportTab, /class="report-jump-chips"/);
    assert.match(reports, /function jumpToReportPanel\(panelId\)/);
    assert.equal((reportTab.match(/class="report-card-icon /g) || []).length, 5);
    assert.equal((reportTab.match(/class="report-card-badge /g) || []).length, 3);
    assert.match(reportTab, /class="report-actions report-actions-4/);
    assert.match(reportTab, /class="report-toolbar no-print"/);
    assert.match(reportTab, /class="report-preview text-xs/);
    assert.match(css, /\.report-action:disabled \{/);
    assert.match(css, /\.report-action-primary \{/);
    assert.match(css, /\.report-preview-empty \{/);
    assert.match(css, /\.report-list-row \{/);
    assert.match(css, /\.arrears-card, \.report-surface \{/);
    assert.match(css, /\.audit-log-row::before/);
});

test('generated previews use the shared report blocks and theme-safe styles', () => {
    assert.doesNotMatch(reports, /border-slate-800 py-1/);
    assert.match(reports, /class="report-preview-header"/);
    assert.match(reports, /class="report-stats report-stats-4"/);
    assert.match(reports, /class="report-block-title"/);
    assert.match(render, /class="arrears-card" open/);
    assert.match(render, /class="arrears-badge"/);
    assert.match(render, /class="audit-log-meta"/);
});

test('landlord report compares expected dues with collections', () => {
    assert.match(reports, /function getMonthlyBillingTotals\(month\)/);
    assert.match(reports, /getSubscriptionAmountForMonth\(resident, month\)/);
    assert.match(reports, /getMonthOutstanding\(resident, month\)/);
    assert.match(reports, /const \{ expectedCents, outstandingCents \} = getMonthlyBillingTotals\(m\)/);
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
    assert.match(reports, /function buildResidentStatement\(residentId\)/);
    assert.match(reports, /function getResidentStatementSignature\(residentId\)/);
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
    assert.match(reports, /manzil_unit_\$\{getStatementFileSlug\(statement\)\}\.pdf/);
    assert.match(reports, /function renderUnitReportPdfHtml\(statement\)/);
    assert.match(reports, /بيانات الوحدة/);
});

test('resident statement entry is reachable from the resident profile', () => {
    const crud = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');
    const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    assert.match(crud, /onclick="openResidentStatementFromProfile/);
    assert.match(crud, /function openResidentStatementFromProfile\(residentId\)/);
    assert.match(crud, /switchTab\('reports'\)/);
    assert.match(crud, /generateResidentStatement\(\)/);
    assert.match(app, /function ensurePdfLibrary\(\)/);
});
