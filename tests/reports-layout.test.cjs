const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
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
