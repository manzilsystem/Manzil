const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const excelSource = read('js/reports/shared/excel-exporter.js');
const reportsSource = read('js/reports.js');
const partial = read('src/partials/main-tabs.html');

function extractFunction(source, name) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, `function ${name} not found`);
    let depth = 0;
    for (let i = source.indexOf('{', start); i < source.length; i += 1) {
        if (source[i] === '{') depth += 1;
        if (source[i] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`unterminated function ${name}`);
}

function loadExcelRows() {
    const sandbox = { console, toast() {}, downloadCsv() {} };
    sandbox.window = sandbox;
    vm.runInNewContext(excelSource, sandbox, { filename: 'excel-exporter.js' });
    return sandbox;
}

const adjustmentsReport = {
    rangeLabel: 'يناير 2024 – مارس 2024',
    residentLabel: 'كل الشقق',
    kindLabel: 'كل الأنواع',
    kindFilter: '',
    residentFilter: '',
    fromMonth: 'يناير 2024',
    toMonth: 'مارس 2024',
    generatedAt: '2024-04-01T00:00:00.000Z',
    totals: { amountCents: 4000, count: 2, residentCount: 2 },
    list: [
        { apartmentNumber: '3', residentName: 'أحمد', month: 'يناير 2024', kindLabel: 'إعفاء', amountCents: 3000, reason: 'حالة وفاة' },
        { apartmentNumber: '10', residentName: 'سعيد', month: 'مارس 2024', kindLabel: 'تخفيض', amountCents: 1000, reason: '' }
    ]
};

test('adjustments report maps to summary and detail rows in pounds', () => {
    const { summary, details } = loadExcelRows().adjustmentsReportToExcelRows(adjustmentsReport);
    assert.deepEqual(JSON.parse(JSON.stringify(summary.slice(0, 2))), [['البند', 'القيمة'], ['الفترة', 'يناير 2024 – مارس 2024']]);
    assert.ok(summary.some(row => row[0] === 'إجمالي المبلغ' && row[1] === 40));
    assert.equal(details.length, 3);
    assert.deepEqual(JSON.parse(JSON.stringify(details[1])), ['3', 'أحمد', 'يناير 2024', 'إعفاء', 30, 'حالة وفاة']);
    assert.deepEqual(JSON.parse(JSON.stringify(details[2])), ['10', 'سعيد', 'مارس 2024', 'تخفيض', 10, '']);
});

test('arrears report maps every unpaid month to one detail row', () => {
    const report = {
        totalDebt: 450, overdueResidents: 1, overdueMonths: 2,
        buckets: { 'شهر واحد': 0, '2–3 أشهر': 1, '4 أشهر فأكثر': 0 },
        residents: [{
            resident: { apartmentNumber: '7', name: 'منى' }, bucket: '2–3 أشهر',
            unpaidMonths: [{ month: 'يناير 2024', amount: 200, daysOverdue: 40 }, { month: 'فبراير 2024', amount: 250, daysOverdue: 10 }]
        }]
    };
    const { summary, details } = loadExcelRows().arrearsReportToExcelRows(report);
    assert.ok(summary.some(row => row[0] === 'إجمالي المتأخرات' && row[1] === 450));
    assert.ok(summary.some(row => row[0] === '2–3 أشهر' && row[1] === 1));
    assert.equal(details.length, 3);
    assert.deepEqual(JSON.parse(JSON.stringify(details[1])), ['7', 'منى', '2–3 أشهر', 'يناير 2024', 200, 40]);
    assert.equal(details[0].length, details[2].length);
});

function loadExporters({ manager = true, report = adjustmentsReport, arrears } = {}) {
    const calls = { excel: [], toasts: [] };
    const code = ['exportAdjustmentsReportExcel', 'exportArrearsExcel'].map(name => extractFunction(reportsSource, name)).join('\n');
    const sandbox = {
        state: { buildingName: 'عمارة النور' },
        requireManager: () => manager,
        getSelectedAdjustmentsReportSnapshot: () => report,
        reportResidentFileSlug: value => value || '',
        getPeriodReportFileSlug: () => '2024-01_2024-03',
        formatDate: value => `d:${value}`,
        buildArrearsReport: () => arrears || { residents: [] },
        getArrearsReportFilters: () => ({}),
        adjustmentsReportToExcelRows: () => ({ summary: [['s']], details: [['d']] }),
        arrearsReportToExcelRows: () => ({ summary: [['s']], details: [['d']] }),
        exportReportWithDetailExcel: (...args) => calls.excel.push(args),
        toast: (message, type) => calls.toasts.push({ message, type })
    };
    const api = vm.runInNewContext(`${code}\n({ exportAdjustmentsReportExcel, exportArrearsExcel })`, sandbox);
    return { api, calls };
}

test('adjustments Excel export uses the previewed snapshot and a scoped filename', () => {
    const { api, calls } = loadExporters();
    api.exportAdjustmentsReportExcel();
    assert.equal(calls.excel.length, 1);
    assert.equal(calls.excel[0][0], 'manzil_adjustments_2024-01_2024-03');
    assert.match(calls.excel[0][1], /الإعفاءات والتخفيضات/);
});

test('adjustments Excel export does nothing without a fresh preview or manager access', () => {
    const noPreview = loadExporters({ report: null });
    noPreview.api.exportAdjustmentsReportExcel();
    assert.equal(noPreview.calls.excel.length, 0);
    const notManager = loadExporters({ manager: false });
    notManager.api.exportAdjustmentsReportExcel();
    assert.equal(notManager.calls.excel.length, 0);
});

test('arrears Excel export warns instead of writing an empty workbook', () => {
    const empty = loadExporters();
    empty.api.exportArrearsExcel();
    assert.equal(empty.calls.excel.length, 0);
    assert.equal(empty.calls.toasts.at(-1).type, 'error');
    const filled = loadExporters({ arrears: { residents: [{ resident: {}, unpaidMonths: [] }] } });
    filled.api.exportArrearsExcel();
    assert.equal(filled.calls.excel.length, 1);
    assert.match(filled.calls.excel[0][0], /^manzil_arrears_\d+$/);
});

test('Excel buttons exist and the adjustments one follows the preview gate', () => {
    assert.match(partial, /id="adjustmentsReportExcelBtn" onclick="exportAdjustmentsReportExcel\(\)" disabled/);
    assert.match(partial, /onclick="exportArrearsExcel\(\)"/);
    assert.match(extractFunction(reportsSource, 'setAdjustmentsReportActionsEnabled'), /adjustmentsReportExcelBtn/);
    assert.match(partial, /report-actions-4 no-print">\s*<button type="button" id="adjustmentsReportPrintBtn"/);
});
