'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
// الاختبار يعمل بدون npm install في CI: نستخدم نسخة xlsx المضمّنة في vendor
const XLSX = require(path.join(root, 'vendor', 'xlsx.full.min.js'));
const excelSource = fs.readFileSync(path.join(root, 'js', 'reports', 'shared', 'excel-exporter.js'), 'utf8');

/** يشغّل المصدّر بمكتبة XLSX الحقيقية ويلتقط بايتات الملف النازل. */
function loadExporter() {
    const downloads = [];
    const sandbox = {
        console,
        window: {},
        XLSX,
        TextEncoder,
        TextDecoder,
        Blob: class { constructor(parts) { this.parts = parts; } },
        URL: {
            createObjectURL: blob => {
                downloads.push(blob.parts[0] instanceof Uint8Array ? blob.parts[0] : new Uint8Array(blob.parts[0]));
                return 'blob:test';
            },
            revokeObjectURL: () => {}
        },
        document: { createElement: () => ({ href: '', download: '', click: () => {} }) },
        setTimeout: () => 0,
        downloadCsv: () => {},
        toast: () => {}
    };
    sandbox.window = sandbox;
    vm.runInNewContext(excelSource, sandbox, { filename: 'excel-exporter.js' });
    return { sandbox, downloads };
}

/** يقرأ سجلات zip المخزنة (بدون ضغط) ويعيد خريطة اسم → نص. */
function unzipTextEntries(u8) {
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const entries = new Map();
    let offset = 0;
    while (offset + 30 <= u8.length && view.getUint32(offset, true) === 0x04034b50) {
        const method = view.getUint16(offset + 8, true);
        const csize = view.getUint32(offset + 18, true);
        const nameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);
        const name = new TextDecoder('utf-8').decode(u8.slice(offset + 30, offset + 30 + nameLen));
        const start = offset + 30 + nameLen + extraLen;
        assert.equal(method, 0, `${name} يجب أن يكون مخزنًا بدون ضغط`);
        entries.set(name, new TextDecoder('utf-8').decode(u8.slice(start, start + csize)));
        offset = start + csize;
    }
    return entries;
}

function exportBytes(sheets) {
    const { sandbox, downloads } = loadExporter();
    const ok = sandbox.exportReportExcel('report', sheets);
    assert.equal(ok, true);
    assert.equal(downloads.length, 1);
    return downloads[0];
}

const apartmentsSheets = () => [
    {
        name: 'الشقق',
        rows: [
            ['تقرير أداء الشقق'],
            ['الفترة', 'يناير 2024 – مارس 2024'],
            [],
            ['الشقة', 'المستحق', 'المحصّل', 'المتبقٍ', 'نسبة التحصيل', 'آخر تحصيل'],
            ['شقة 7 · منى', '1000.00', '750.00', '250.00', '75%', '2024-03-31'],
            ['شقة 12 · سعيد', '800.00', '800.00', '0.00', '100%', ''],
            [],
            ['الإجمالي', '1800.00', '1550.00', '250.00', '86%', '']
        ],
        options: { autoFilter: true, freezeHeader: true, columnWidths: [26, 16, 16, 16, 14, 18] }
    },
    {
        name: 'الملخص',
        rows: [['البند', 'القيمة'], ['عدد الشقق', 2], ['المستحق', 1800], ['نسبة التحصيل', 86]]
    }
];

test('الأوراق من اليمين لليسار والملف يُقرأ بعد الحقن', () => {
    const bytes = exportBytes(apartmentsSheets());
    const entries = unzipTextEntries(bytes);
    const sheet1 = entries.get('xl/worksheets/sheet1.xml');
    assert.match(sheet1, /<sheetView workbookViewId="0" rightToLeft="1"/);
    // سلامة الملف: يُقرأ بالكامل دون أخطاء
    const back = XLSX.read(bytes, { type: 'array', cellDates: true, cellNF: true });
    assert.deepEqual(back.SheetNames, ['الشقق', 'الملخص']);
});

test('تجميد صف العنوان وإعدادات الطباعة الأفقية وتكرار صفوف العنوان', () => {
    const bytes = exportBytes(apartmentsSheets());
    const entries = unzipTextEntries(bytes);
    const sheet1 = entries.get('xl/worksheets/sheet1.xml');
    // صف العنوان في ورقة الشقق هو الرابع: يُجمّد حتى الصف الرابع
    assert.match(sheet1, /<pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"\/>/);
    assert.match(sheet1, /<sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr>/);
    assert.match(sheet1, /<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"\/>/);
    // ورقة بلا صف عنوان: تُطبع أفقيًا دون تجميد
    const sheet2 = entries.get('xl/worksheets/sheet2.xml');
    assert.doesNotMatch(sheet2, /<pane /);
    assert.match(sheet2, /orientation="landscape"/);
    // تكرار صفوف العنوان عند الطباعة
    const workbookXml = entries.get('xl/workbook.xml');
    assert.match(workbookXml, /name="_xlnm\.Print_Titles" localSheetId="0"/);
    assert.match(workbookXml, /!\$1:\$4/);
});

test('المبالغ أرقام بتنسيق ج.م والنسب والتواريخ ورقم الشقة أنواع حقيقية', () => {
    const bytes = exportBytes(apartmentsSheets());
    const back = XLSX.read(bytes, { type: 'array', cellDates: true, cellNF: true });
    const sheet = back.Sheets['الشقق'];
    // صف البيانات الأول (الخامس): المبالغ أرقام بتنسيق ج.م
    assert.equal(sheet['B5'].t, 'n');
    assert.equal(sheet['B5'].v, 1000);
    assert.equal(sheet['B5'].z, '#,##0 "ج.م"');
    assert.equal(sheet['D6'].v, 0);
    // النسبة رقم بلاحقة %
    assert.equal(sheet['E5'].t, 'n');
    assert.equal(sheet['E5'].v, 75);
    assert.equal(sheet['E5'].z, '0"%"');
    // آخر تحصيل خلية تاريخ حقيقية
    assert.equal(sheet['F5'].t, 'd');
    assert.ok(sheet['F5'].v instanceof Date);
    assert.equal(sheet['F5'].z, 'yyyy-mm-dd');
    // صف الإجمالي: قيم رقمية تطابق أرقام CSV (toFixed(2))
    assert.equal(sheet['B8'].v, 1800);
    assert.equal(sheet['C8'].v, 1550);
    assert.equal(sheet['D8'].v, 250);
    assert.equal(sheet['E8'].v, 86);
});

test('ورقة الملخص: تنسيق حسب تسمية البند وتاريخ الإنشاء كخلية تاريخ', () => {
    const { sandbox, downloads } = loadExporter();
    const ok = sandbox.exportReportWithDetailExcel('report', 'تقرير الفترة',
        [['البند', 'القيمة'], ['المستحق', 2400], ['نسبة التحصيل %', 75], ['عدد الحركات', 12]],
        [['الشهر', 'المستحق', 'المحصّل'], ['يناير 2024', 1200, 900]],
        { 'الفترة': 'يناير 2024', 'تاريخ الإنشاء': new Date('2024-04-01T00:00:00.000Z') });
    assert.equal(ok, true);
    const back = XLSX.read(downloads[0], { type: 'array', cellDates: true, cellNF: true });
    const summary = back.Sheets['الملخص'];
    // عمود القيمة يُنسَّق حسب تسمية البند
    const labels = {};
    for (let r = 1; r <= 12; r += 1) {
        const label = summary[`A${r}`] && summary[`A${r}`].v;
        if (typeof label === 'string') labels[label] = summary[`B${r}`];
    }
    assert.equal(labels['المستحق'].z, '#,##0 "ج.م"');
    assert.equal(labels['المستحق'].v, 2400);
    assert.equal(labels['نسبة التحصيل %'].z, '0"%"');
    assert.equal(labels['عدد الحركات'].z, '#,##0');
    assert.equal(labels['تاريخ الإنشاء'].t, 'd');
    assert.equal(labels['تاريخ الإنشاء'].z, 'yyyy-mm-dd');
    // ورقة التفاصيل: أعمدة المبالغ منسّقة من صف العنوان
    const details = back.Sheets['التفاصيل'];
    assert.equal(details['B2'].z, '#,##0 "ج.م"');
    assert.equal(details['B2'].v, 1200);
});

test('أرقام الشقق النصية تتحول إلى أرقام والقيم غير المنتهية تصبح فارغة', () => {
    const { sandbox, downloads } = loadExporter();
    const report = {
        totalDebt: 450, overdueResidents: 1, overdueMonths: 2,
        buckets: { 'شهر واحد': 0, '2–3 أشهر': 1 },
        residents: [{
            resident: { apartmentNumber: '7', name: 'منى' }, bucket: '2–3 أشهر',
            unpaidMonths: [{ month: 'يناير 2024', amount: 200, daysOverdue: 40 }, { month: 'فبراير 2024', amount: NaN, daysOverdue: 10 }]
        }]
    };
    const { summary, details } = sandbox.arrearsReportToExcelRows(report);
    assert.equal(sandbox.exportReportWithDetailExcel('arrears', 'تقرير المتأخرات', summary, details, {}), true);
    const back = XLSX.read(downloads[0], { type: 'array', cellDates: true, cellNF: true });
    const sheet = back.Sheets['التفاصيل'];
    // رقم الشقة رقم وليس نصًا
    assert.equal(sheet['A2'].t, 'n');
    assert.equal(sheet['A2'].v, 7);
    // مبلغ مستحق بتنسيق ج.م
    assert.equal(sheet['E2'].z, '#,##0 "ج.م"');
    assert.equal(sheet['E2'].v, 200);
    // أيام التأخر عدد صحيح
    assert.equal(sheet['F2'].z, '#,##0');
    // NaN يُحرس ولا يكتب كقيمة
    assert.ok(!sheet['E3'] || sheet['E3'].v === '' || sheet['E3'].v === undefined);
    // الملخص: إجمالي المتأخرات منسّق
    const summarySheet = back.Sheets['الملخص'];
    let totalCell = null;
    Object.keys(summarySheet).forEach(ref => {
        if (/^A\d+$/.test(ref) && summarySheet[ref].v === 'إجمالي المتأخرات') {
            totalCell = summarySheet[`B${ref.slice(1)}`];
        }
    });
    assert.ok(totalCell, 'إجمالي المتأخرات غير موجود في الملخص');
    assert.equal(totalCell.z, '#,##0 "ج.م"');
    assert.equal(totalCell.v, 450);
});

test('أسماء الأوراق تُنظّف من الرموز الممنوعة وتُزال إزدواجيتها', () => {
    const { sandbox } = loadExporter();
    const used = new Set();
    assert.equal(sandbox.sanitizeSheetName('أ/ب:ج*د?هـ[و]ز\\ح', used), 'أ ب ج د هـ و ز ح');
    assert.equal(sandbox.sanitizeSheetName('', used), 'Sheet');
    assert.equal(sandbox.sanitizeSheetName('الشقق', used), 'الشقق');
    assert.equal(sandbox.sanitizeSheetName('الشقق', used), 'الشقق (2)');
    const long = 'ا'.repeat(40);
    assert.equal(sandbox.sanitizeSheetName(long, used).length, 31);
    // الملف الناتج بأسماء مكررة لا يفشل
    const bytes = exportBytes([
        { name: 'الشقق', rows: [['الشهر', 'التحصيل'], ['يناير', 5]] },
        { name: 'الشقق', rows: [['الشهر', 'التحصيل'], ['فبراير', 6]] }
    ]);
    const back = XLSX.read(bytes, { type: 'array' });
    assert.deepEqual(back.SheetNames, ['الشقق', 'الشقق (2)']);
});

test('الحقن يتراجع للملف الأصلي عند بايتات غير صالحة', () => {
    const { sandbox } = loadExporter();
    const junk = new Uint8Array([1, 2, 3]);
    assert.deepEqual([...sandbox.patchXlsxArchive(junk, [{ path: 'xl/worksheets/sheet1.xml', landscape: true }])], [1, 2, 3]);
    const empty = sandbox.patchXlsxArchive(new Uint8Array([]), [{ path: 'x' }]);
    assert.equal(empty.length, 0);
});
