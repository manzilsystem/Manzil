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
const css = read('css/style.css');

test('landlord report card exposes a gated real-PDF download action', () => {
    assert.match(html, /id="reportPdfBtn"[^>]*onclick="exportLandlordReportPdf\(\)"[^>]*disabled/);
    assert.match(html, /class="report-actions report-actions-3 no-print"/);
    assert.match(css, /\.report-actions-3/);
    assert.match(reports, /\['reportPrintBtn', 'reportPdfBtn', 'reportExportBtn'\]/);
});

test('landlord report PDF export is manager-only, preview-gated, and validates the blob', () => {
    assert.match(reports, /async function exportLandlordReportPdf\(\)[\s\S]*?requireManager\(\)/);
    assert.match(reports, /selected && selected !== landlordReportMonth/);
    assert.match(reports, /getLandlordReportSignature\(landlordReportMonth\) !== landlordReportSignature/);
    assert.match(reports, /await ensurePdfLibrary\(\)/);
    assert.match(reports, /outputPdf\('blob'\)/);
    assert.match(reports, /pdfBlob\.type !== 'application\/pdf'/);
    assert.match(reports, /manzil_landlord_report_\$\{monthKey \? monthKey\.slice\(0, 7\) : 'report'\}\.pdf/);
    assert.match(reports, /landlord_report_pdf_generation_failed/);
});

test('landlord report PDF html is Arabic RTL and mirrors the previewed month data', () => {
    const sandbox = {};
    const api = vm.runInNewContext(
        `${stateSource}\n${reports}\n({ renderLandlordReportPdfHtml, state })`,
        sandbox,
        { filename: 'reports-pdf-test.js' }
    );
    Object.assign(api.state, {
        buildingName: 'عمارة <b>النور</b>',
        managerName: 'مدير التجربة',
        defaultSubscription: 100,
        residents: [{ id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z' }],
        income: [
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' },
            { id: 'i2', residentId: 'r1', month: 'يناير 2024', amount: 50, paymentMethod: 'instapay' }
        ],
        expenses: [{ id: 'e1', title: 'صيانة <x>', month: 'يناير 2024', amount: 30, category: 'كهرباء' }]
    });

    const htmlOut = api.renderLandlordReportPdfHtml('يناير 2024');
    assert.match(htmlOut, /dir="rtl"/);
    assert.match(htmlOut, /lang="ar"/);
    assert.match(htmlOut, /عمارة &lt;b&gt;النور&lt;\/b&gt;/);
    assert.match(htmlOut, /تقرير الملاك — يناير 2024/);
    assert.match(htmlOut, /صيانة &lt;x&gt;/);
    assert.match(htmlOut, /150 ج\.م/);
    assert.match(htmlOut, /30 ج\.م/);
    assert.match(htmlOut, /120 ج\.م/);
    assert.match(htmlOut, /InstaPay/);
    assert.match(htmlOut, /نقدًا/);
});
