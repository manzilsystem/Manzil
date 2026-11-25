const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const reports = read('js/reports.js');
const monthlyClose = read('js/monthly-close.js');

test('Cairo is bundled locally in every weight and cached by the service worker', () => {
    const css = read('fonts/cairo.css');
    const sw = read('sw.js');
    const html = read('index.html');
    assert.match(html, /<link rel="stylesheet" href="fonts\/cairo\.css\?v=[0-9a-f]+">/);
    assert.ok(!html.includes('fonts.googleapis.com/css2'), 'the Google Fonts stylesheet must not be loaded');
    assert.ok(sw.includes("./fonts/cairo.css?v="));
    ['400', '600', '700', '900'].forEach(weight => {
        const file = `fonts/cairo-v${weight}.woff2`;
        const bytes = fs.readFileSync(path.join(root, file));
        assert.equal(bytes.subarray(0, 4).toString(), 'wOF2', `${file} must be a woff2 file`);
        const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 10);
        assert.ok(css.includes(`cairo-v${weight}.woff2?v=${hash}`), `${file} url in cairo.css must carry its content hash`);
        assert.ok(sw.includes(`./${file}?v=${hash}`), `${file} must be in the service worker shell`);
    });
});

test('PDF export loads the fonts, paginates on rows and stamps page numbers', () => {
    assert.match(reports, /document\.fonts\.load\(weight \+ ' 16px Cairo'/);
    assert.match(reports, /await loadReportPdfFonts\(\);\s*\n\s*paginateReportRoot\(/);
    assert.match(reports, /drawReportPdfPageNumbers\(pdf, paper, buildingName\)/);
    assert.match(reports, /' • {0,2}صفحة '|صفحة ' \+ page \+ ' من ' \+ total/);
    assert.match(monthlyClose, /renderReportRootToPdfBlob\(root, /);
    assert.doesNotMatch(reports, /pagebreak: \{ mode: \['avoid-all'/);
    assert.doesNotMatch(reports, /\.manzil-pdf section\{break-inside:avoid\}/);
    assert.match(reports, /\.manzil-pdf thead\{display:table-header-group\}/);
});

test('report PDF dates use Latin digits like every amount', () => {
    const api = vm.runInNewContext(`${reports}\n({ reportPdfDate })`, {}, { filename: 'pdf-date-test.js' });
    const label = api.reportPdfDate('2026-11-25T10:00:00.000Z');
    assert.match(label, /2026/);
    assert.doesNotMatch(label, /[\u0660-\u0669]/);
    assert.equal(api.reportPdfDate(''), '');
});

test('page height matches html2pdf slicing for A4 and A5', () => {
    const api = vm.runInNewContext(`${reports}\n({ reportPdfPagePx })`, {}, { filename: 'pdf-page-px-test.js' });
    assert.equal(api.reportPdfPagePx(null, { w: 210, h: 297 }), 1063);
    assert.equal(api.reportPdfPagePx(null, { w: 148, h: 210 }), 733);
});
