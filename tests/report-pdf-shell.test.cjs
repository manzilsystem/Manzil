const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const reports = read('js/reports.js');
const monthlyClose = read('js/monthly-close.js');
const stateSource = read('js/state.js');

test('reports.js declares one shared PDF shell used by every report', () => {
    assert.match(reports, /function reportPdfDocumentOpen\(\)/);
    assert.match(reports, /function reportPdfHeader\(titleLines, metaLines\)/);
    assert.match(reports, /function reportPdfFooter\(generatedLabel\)/);
});

test('every PDF renderer builds its header and footer from the shared shell', () => {
    ['renderLandlordReportPdfHtml', 'renderResidentStatementPdfHtml', 'renderUnitReportPdfHtml'].forEach(name => {
        const body = reports.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
        assert.ok(body, `${name} not found in reports.js`);
        assert.match(body[0], /reportPdfDocumentOpen\(\)/, `${name} must open the shared document shell`);
        assert.match(body[0], /reportPdfHeader\(/, `${name} must use the shared header`);
        assert.match(body[0], /reportPdfFooter\(generatedAtLabel\)/, `${name} must use the shared footer`);
    });

    const monthly = monthlyClose.match(/function renderMonthlyClosePdfHtml\([^]*?\n\}/);
    assert.ok(monthly, 'renderMonthlyClosePdfHtml not found in monthly-close.js');
    assert.match(monthly[0], /reportPdfDocumentOpen\(\)/);
    assert.match(monthly[0], /reportPdfHeader\(/);
    assert.match(monthly[0], /reportPdfFooter\(generatedAtLabel\)/);
});

test('no PDF renderer keeps a hand-rolled header or footer block', () => {
    [reports, monthlyClose].forEach(source => {
        assert.doesNotMatch(source, /<header style="text-align:center;border-bottom:2px solid #334155/);
        assert.doesNotMatch(source, /<footer style="font-size:9px;color:#64748b;margin-top:18px;text-align:center">Manzil — '/);
    });
});

test('the shared PDF shell escapes the building name and renders RTL content', () => {
    const sandbox = {};
    const api = vm.runInNewContext(
        `${stateSource}\n${reports}\n({ reportPdfDocumentOpen, reportPdfHeader, reportPdfFooter, state })`,
        sandbox,
        { filename: 'report-pdf-shell-test.js' }
    );
    api.state.buildingName = 'عمارة <b>النور</b>';

    assert.match(api.reportPdfDocumentOpen(), /^<div dir="rtl" lang="ar"/);

    const header = api.reportPdfHeader(['عنوان التقرير'], ['سطر الوصف']);
    assert.match(header, /<header style="text-align:center;border-bottom:2px solid #334155;padding-bottom:12px;margin-bottom:18px">/);
    assert.match(header, /عمارة &lt;b&gt;النور&lt;\/b&gt;/);
    assert.match(header, /عنوان التقرير/);
    assert.match(header, /سطر الوصف/);

    const footer = api.reportPdfFooter('١ يناير ٢٠٢٤');
    assert.match(footer, /^<footer style="font-size:9px;color:#64748b;margin-top:18px;text-align:center">Manzil — /);
    assert.match(footer, /١ يناير ٢٠٢٤<\/footer>$/);
});
