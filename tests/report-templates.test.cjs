const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const reports = fs.readFileSync('js/reports.js', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');

const TABS = ['landlord', 'period', 'cashflow', 'expenses', 'adjustments', 'statement', 'apartments', 'monthlyClose', 'arrears'];

test('every filterable report type can save and re-apply a template', () => {
    const block = reports.slice(reports.indexOf('const REPORT_TEMPLATE_TABS'), reports.indexOf('function getReportTemplateControlIds'));
    for (const tab of TABS) {
        assert.match(block, new RegExp('\\b' + tab + ': \\{'), tab + ' must be template-enabled');
        assert.match(reports, new RegExp('\\b' + tab + ': \\['), tab + ' must have filter descriptors');
    }
});

test('presets are re-applied relative to the current month, not as stale ranges', () => {
    assert.match(reports, /usePreset && \/\(From\|To\)\$\/\.test\(id\)/);
    assert.match(reports, /period: \{ preset: 'periodReportPreset'/);
    assert.match(reports, /cashflow: \{ preset: 'cashFlowPreset'/);
    assert.match(reports, /apartments: \{ preset: 'apartmentsReportPreset'/);
});

test('templates have a name limit, duplicate guard and a cap', () => {
    assert.match(reports, /REPORT_TEMPLATE_LIMIT = 8/);
    assert.match(reports, /tpl\.name === name/);
    assert.match(reports, /maxlength="\$\{REPORT_TEMPLATE_NAME_MAX\}"/);
});

test('old period templates still apply', () => {
    assert.match(reports, /legacy\.fromMonth/);
    assert.match(reports, /periodReportPreset: 'custom'/);
});

test('template UI uses 44px targets and is hidden from print', () => {
    assert.match(css, /\.report-template-actions \.report-action, \.report-template-save \.report-action \{ min-height: 2\.75rem; \}/);
    assert.match(reports, /report-template-fold no-print/);
});
