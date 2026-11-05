const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const monthsNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function monthLabelToKey(month) {
    const [name, year] = String(month || '').trim().split(/\s+/);
    const index = monthsNames.indexOf(name);
    if (index < 0 || !/^\d{4}$/.test(year || '')) return null;
    return `${year}-${String(index + 1).padStart(2, '0')}-01`;
}

function loadExporter(state, selectedMonth = '') {
    const downloads = [];
    const toasts = [];
    let anchor = null;
    const sandbox = {
        state,
        requireManager: () => true,
        toast: (message, type) => { toasts.push({ message, type }); },
        monthLabelToKey,
        getIncomePaymentMethodLabel: method => method || 'غير محدد',
        toCents: value => {
            const amount = Number(value);
            return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
        },
        Blob: class {
            constructor(parts) { this.parts = parts; }
        },
        URL: {
            createObjectURL: blob => { downloads.push(blob.parts.join('')); return 'blob:test'; },
            revokeObjectURL: () => {},
        },
        setTimeout: callback => { callback(); return 0; },
        document: {
            getElementById: id => (id === 'reportMonthSelect' && selectedMonth ? { value: selectedMonth } : null),
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => {
                anchor = { download: '', href: '', click: () => {} };
                return anchor;
            },
        },
    };
    const app = vm.runInNewContext(`${source}\n({ exportToCSV, escapeCsvCell, buildCsv })`, sandbox, { filename: 'js/reports.js' });
    return {
        exportToCSV: app.exportToCSV,
        escapeCsvCell: app.escapeCsvCell,
        buildCsv: app.buildCsv,
        downloads,
        toasts,
        getAnchor: () => anchor
    };
}

test('CSV cells escape quotes and neutralize formula prefixes in text', () => {
    const { escapeCsvCell } = loadExporter({ residents: [], income: [], expenses: [] });

    assert.equal(escapeCsvCell('say "hi"'), '"say ""hi"""');
    assert.equal(escapeCsvCell('=SUM(A1)'), '"\'=SUM(A1)"');
    assert.equal(escapeCsvCell('  @command'), '"\'  @command"');
    assert.equal(escapeCsvCell('+1'), '"\'+1"');
    assert.equal(escapeCsvCell(null), '""');
    assert.equal(escapeCsvCell(-25), '"-25"');
});

test('CSV builder emits a BOM and CRLF-delimited rows', () => {
    const { buildCsv } = loadExporter({ residents: [], income: [], expenses: [] });
    const csv = buildCsv([['النوع', 'المبلغ'], ['تحصيل', 100]]);

    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.endsWith('"تحصيل","100"'));
    assert.match(csv, /\r\n/);
});

test('both report exports use the shared CSV downloader', () => {
    assert.equal((source.match(/function escapeCsvCell/g) || []).length, 1);
    assert.doesNotMatch(source, /const csvCell =/);
    assert.match(source, /downloadCsv\(`manzil_report_/);
    assert.match(source, /downloadCsv\(`manzil_arrears_/);
});

test('CSV export leaves missing optional expense fields blank instead of writing undefined', () => {
    const { exportToCSV, downloads, getAnchor } = loadExporter({
        residents: [],
        income: [],
        expenses: [{ title: 'مصروف قديم', month: 'يناير 2024', amount: 25 }],
    });

    exportToCSV('يناير 2024');
    const csv = downloads[0];
    assert.ok(csv.endsWith('"مصروف","مصروف قديم","","يناير 2024","25","","الخزنة الرئيسية","",""'));
    assert.doesNotMatch(csv, /undefined/);
    assert.equal(getAnchor().download, 'manzil_report_2024-01.csv');
});

test('CSV export preserves existing expense category and notes', () => {
    const { exportToCSV, downloads } = loadExporter({
        residents: [],
        income: [],
        expenses: [{ title: 'صيانة', category: 'كهرباء', notes: 'فاتورة', month: 'يناير 2024', amount: 25 }],
    });

    exportToCSV('يناير 2024');
    assert.match(downloads[0], /"صيانة","","يناير 2024","25","","الخزنة الرئيسية","","كهرباء فاتورة"/);
});

test('CSV export resolves each collection to its own resident', () => {
    const { exportToCSV, downloads } = loadExporter({
        residents: [
            { id: 'r1', name: 'أحمد', apartmentNumber: '3' },
            { id: 'r2', name: 'سارة', apartmentNumber: '7' },
        ],
        income: [
            { id: 'i1', residentId: 'r2', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' },
            { id: 'i2', residentId: 'r1', month: 'يناير 2024', amount: 200, paymentMethod: 'cash' },
            { id: 'i3', residentId: 'missing', month: 'يناير 2024', amount: 50, paymentMethod: 'cash' },
        ],
        expenses: [],
    });

    exportToCSV('يناير 2024');
    assert.match(downloads[0], /"تحصيل","سارة","7","يناير 2024","100"/);
    assert.match(downloads[0], /"تحصيل","أحمد","3","يناير 2024","200"/);
    assert.match(downloads[0], /"تحصيل","","","يناير 2024","50"/);
});

test('CSV export only includes records from the selected report month', () => {
    const { exportToCSV, downloads, toasts } = loadExporter({
        residents: [{ id: 'r1', name: 'أحمد', apartmentNumber: '3' }],
        income: [
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' },
            { id: 'i2', residentId: 'r1', month: 'فبراير 2024', amount: 900, paymentMethod: 'cash' },
        ],
        expenses: [
            { title: 'كهرباء', month: 'يناير 2024', amount: 40 },
            { title: 'مياه', month: 'مارس 2024', amount: 500 },
        ],
    });

    exportToCSV('يناير 2024');
    assert.match(downloads[0], /يناير 2024/);
    assert.doesNotMatch(downloads[0], /فبراير 2024/);
    assert.doesNotMatch(downloads[0], /مارس 2024/);
    assert.deepEqual(toasts, [{ message: 'تم تصدير تقرير يناير 2024', type: 'success' }]);
});

test('CSV export refuses to run without a previewed report month', () => {
    const { exportToCSV, downloads, toasts } = loadExporter({ residents: [], income: [], expenses: [] });

    exportToCSV();
    assert.equal(downloads.length, 0);
    assert.deepEqual(toasts, [{ message: 'اعرض معاينة التقرير أولًا', type: 'error' }]);
});

test('CSV export refuses a preview that no longer matches the selected month', () => {
    const { exportToCSV, downloads, toasts } = loadExporter({
        residents: [],
        income: [{ id: 'i1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' }],
        expenses: [],
    }, 'فبراير 2024');

    exportToCSV('يناير 2024');
    assert.equal(downloads.length, 0);
    assert.deepEqual(toasts, [{ message: 'اعرض معاينة الشهر المحدد أولًا', type: 'error' }]);
});
