const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const reports = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const render = fs.readFileSync(path.join(__dirname, '..', 'js', 'render.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function toCents(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function monthLabelToKey(month) {
    const [name, year] = String(month || '').trim().split(/\s+/);
    const index = monthNames.indexOf(name);
    return index < 0 || !/^\d{4}$/.test(year || '') ? null : `${year}-${String(index + 1).padStart(2, '0')}-01`;
}

function loadReports(options = {}) {
    const elements = {
        adjustmentsReportFrom: { value: options.from ?? 'يناير 2024' },
        adjustmentsReportTo: { value: options.to ?? 'مارس 2024' },
        adjustmentsReportResident: { value: options.resident ?? '' },
        adjustmentsReportKind: { value: options.kind ?? '' },
        adjustmentsReportPreview: { innerHTML: '', dataset: {} },
        adjustmentsReportPrintBtn: { disabled: true },
        adjustmentsReportExportBtn: { disabled: true },
        printBuildingTitle: { textContent: '' },
        printBuildingMeta: { textContent: '' }
    };
    const state = {
        buildingName: 'عمارة النور',
        managerName: 'المدير',
        residents: [
            { id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z' },
            { id: 'r2', name: 'سعيد', apartmentNumber: '10', monthlyAmount: 200, createdAt: '2024-01-01T00:00:00.000Z' }
        ],
        adjustments: [
            { id: 'a1', residentId: 'r1', kind: 'waiver', effectiveMonth: '2024-01-01', amount: 30, reason: 'حالة وفاة' },
            { id: 'a2', residentId: 'r1', kind: 'discount', effectiveMonth: '2024-02-01', amount: 10, reason: 'خصم أخوة' },
            { id: 'a3', residentId: 'r2', kind: 'waiver', effectiveMonth: '2024-02-01', amount: 200, reason: 'إعفاء كامل' },
            { id: 'a4', residentId: 'r2', kind: 'discount', effectiveMonth: '2024-03-01', amount: 50, reason: 'تخفيض تشجيعي' },
            { id: 'a5', residentId: 'r1', kind: 'waiver', effectiveMonth: '2024-05-01', amount: 99, reason: 'خارج الفترة' }
        ]
    };
    const calls = { toasts: [] };
    const sandbox = {
        state,
        monthsNames: monthNames,
        getCurrentMonth: () => 'مارس 2024',
        monthLabelToKey,
        toCents,
        fmtNum: value => String(Number(value) || 0),
        fmtMoney: value => `${String(Number(value) || 0)} ج.م`,
        esc: value => String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character])),
        formatDate: () => '01/03/2024',
        getAdjustmentKindLabel: kind => ({ waiver: 'إعفاء', discount: 'تخفيض' }[kind] || 'تسوية'),
        requireManager: () => true,
        toast: (message, kind) => calls.toasts.push(`${kind}:${message}`),
        setTimeout: () => {},
        console,
        Blob: class { constructor(parts, opts) { sandbox.__blob = { parts, type: opts && opts.type }; } },
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
        Date
    };
    const api = vm.runInNewContext(
        `${reports}\n({\n            buildAdjustmentsReport, getAdjustmentsReportSignature, generateAdjustmentsReport, renderAdjustmentsReportHtml,\n            exportAdjustmentsReportCsv, printAdjustmentsReport, getSelectedAdjustmentsReportSnapshot,\n            invalidateAdjustmentsReportPreview, invalidateAdjustmentsReportIfStale,\n            populateAdjustmentsReportFilters, getAdjustmentReportKindFilter, normalizeAdjustmentReportKindFilter,\n            getAdjustmentsReportSelection, REPORT_TABS, REPORT_PANEL_IDS, REPORT_OUTPUT_BUTTON_IDS\n        })`,
        sandbox,
        { filename: 'js/reports.js' }
    );
    sandbox.document = {
        getElementById: id => elements[id] || null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => ({
            href: '',
            download: '',
            click() { calls.download = { filename: this.download, content: String(sandbox.__blob.parts[0]) }; }
        })
    };
    sandbox.window = { print() {}, addEventListener() {} };
    return { api, sandbox, state, elements, calls };
}

test('adjustments report is wired as a report tab with filters and gated outputs', () => {
    assert.match(html, /data-report-nav="adjustments"[^>]*aria-controls="adjustmentsReportCard"[^>]*onclick="switchReportTab\('adjustments'\)"/);
    assert.match(html, /id="adjustmentsReportCard"/);
    [['adjustmentsReportFrom', 'invalidateAdjustmentsReportPreview'], ['adjustmentsReportTo', 'invalidateAdjustmentsReportPreview'], ['adjustmentsReportResident', 'invalidateAdjustmentsReportPreview'], ['adjustmentsReportKind', 'invalidateAdjustmentsReportPreview']].forEach(([id, handler]) => {
        assert.match(html, new RegExp(`id="${id}"[^>]*onchange="${handler}\\(\\)"`), id + ' must invalidate the preview');
    });
    assert.match(html, /id="adjustmentsReportPrintBtn"[^>]*onclick="printAdjustmentsReport\(\)"[^>]*disabled/);
    assert.match(html, /id="adjustmentsReportExportBtn"[^>]*onclick="exportAdjustmentsReportCsv\(\)"[^>]*disabled/);
    assert.match(render, /populateAdjustmentsReportFilters\(months, current\)/);
    assert.match(render, /invalidateAdjustmentsReportIfStale\(\)/);
    assert.match(css, /body\.print-adjustments #tab-reports > :not\(#adjustmentsReportCard\)/);
});

test('adjustments report registers the tab and its output button', () => {
    const { api } = loadReports();
    assert.ok(api.REPORT_TABS.includes('adjustments'));
    assert.equal(api.REPORT_PANEL_IDS.adjustments, 'adjustmentsReportCard');
    assert.equal(api.REPORT_OUTPUT_BUTTON_IDS.adjustments, 'adjustmentsReportPrintBtn');
});

test('adjustments report groups the range by month and kind and ignores outside months', () => {
    const { api } = loadReports();
    const report = api.buildAdjustmentsReport('يناير 2024', 'مارس 2024');
    assert.equal(report.months.map(row => row.month).join('|'), 'يناير 2024|فبراير 2024|مارس 2024');
    assert.equal(report.months.map(row => row.amountCents).join('|'), '3000|21000|5000');
    assert.equal(report.months.map(row => row.count).join('|'), '1|2|1');
    assert.equal(report.totals.amountCents, 29000);
    assert.equal(report.totals.count, 4);
    assert.equal(report.totals.residentCount, 2);
    assert.equal(report.totals.monthCount, 3);
    assert.equal(report.kinds.map(item => item.label).join('|'), 'إعفاء|تخفيض');
    assert.equal(report.kinds.map(item => item.cents).join('|'), '23000|6000');
    assert.deepEqual(report.list.map(item => item.id), ['a4', 'a2', 'a3', 'a1']);
    assert.equal(report.rangeLabel, 'يناير 2024 – مارس 2024');
});

test('adjustments report filters by apartment, kind, or both', () => {
    const { api } = loadReports();
    const resident = api.buildAdjustmentsReport('يناير 2024', 'مارس 2024', 'r2');
    assert.equal(resident.totals.amountCents, 25000);
    assert.deepEqual(resident.list.map(item => item.id), ['a4', 'a3']);
    assert.equal(resident.residentLabel, 'شقة 10 · سعيد');

    const waiver = api.buildAdjustmentsReport('يناير 2024', 'مارس 2024', '', 'waiver');
    assert.equal(waiver.totals.amountCents, 23000);
    assert.deepEqual(waiver.list.map(item => item.id), ['a3', 'a1']);
    assert.equal(waiver.kindLabel, 'إعفاء');

    const combined = api.buildAdjustmentsReport('يناير 2024', 'مارس 2024', 'r2', 'waiver');
    assert.equal(combined.totals.amountCents, 20000);
    assert.deepEqual(combined.list.map(item => item.id), ['a3']);

    const discount = api.buildAdjustmentsReport('يناير 2024', 'مارس 2024', 'r2', 'discount');
    assert.equal(discount.totals.count, 1);
    assert.equal(discount.totals.amountCents, 5000);

    const empty = api.buildAdjustmentsReport('يناير 2024', 'يناير 2024', 'r2', 'discount');
    assert.equal(empty.totals.count, 0);
    assert.equal(empty.totals.amountCents, 0);
});

test('adjustments report rejects invalid and oversized ranges', () => {
    const { api } = loadReports();
    assert.equal(api.buildAdjustmentsReport('مارس 2024', 'يناير 2024'), null);
    assert.equal(api.buildAdjustmentsReport('يناير 2018', 'ديسمبر 2023'), null);
    assert.ok(api.buildAdjustmentsReport('يناير 2019', 'ديسمبر 2023'));
    assert.equal(api.normalizeAdjustmentReportKindFilter('waiver'), 'waiver');
    assert.equal(api.normalizeAdjustmentReportKindFilter('settlement'), '');
});

test('adjustments preview shows filters, totals, breakdowns and details', () => {
    const { api, elements } = loadReports({ resident: 'r2', kind: 'waiver' });
    api.generateAdjustmentsReport();
    const preview = elements.adjustmentsReportPreview.innerHTML;
    assert.match(preview, /تقرير الإعفاءات والتخفيضات يناير 2024 – مارس 2024/);
    assert.match(preview, /الشقة: شقة 10 · سعيد/);
    assert.match(preview, /النوع: إعفاء/);
    assert.match(preview, /إجمالي الإعفاءات والتخفيضات/);
    assert.match(preview, /200 ج\.م/);
    assert.match(preview, /التوزيع حسب النوع/);
    assert.match(preview, /المعروض لشقة «شقة 10 · سعيد» فقط/);
    assert.match(preview, /المعروض لنوع «إعفاء» فقط/);
    assert.match(preview, /إعفاء كامل/);
    assert.doesNotMatch(preview, /خصم أخوة/);
    assert.equal(elements.adjustmentsReportPrintBtn.disabled, false);
    assert.equal(elements.adjustmentsReportExportBtn.disabled, false);
});

test('adjustments signature follows range, apartment and kind', () => {
    const { api } = loadReports();
    assert.notEqual(
        api.getAdjustmentsReportSignature('يناير 2024', 'مارس 2024', '', ''),
        api.getAdjustmentsReportSignature('يناير 2024', 'مارس 2024', 'r2', '')
    );
    assert.notEqual(
        api.getAdjustmentsReportSignature('يناير 2024', 'مارس 2024', '', ''),
        api.getAdjustmentsReportSignature('يناير 2024', 'مارس 2024', '', 'waiver')
    );
    assert.equal(
        api.getAdjustmentsReportSignature('يناير 2024', 'مارس 2024', '', ''),
        api.getAdjustmentsReportSignature('يناير 2024', 'مارس 2024', '', '')
    );
});

test('adjustments CSV includes metadata, details and apartment/kind suffixes', () => {
    const { api, calls } = loadReports({ resident: 'r2', kind: 'waiver' });
    api.generateAdjustmentsReport();
    api.exportAdjustmentsReportCsv();
    assert.equal(calls.download.filename, 'manzil_adjustments_2024-01_2024-03_apt_10_waiver.csv');
    assert.match(calls.download.content, /"الفترة","يناير 2024 – مارس 2024","الشقة","شقة 10 · سعيد","النوع","إعفاء"/);
    assert.match(calls.download.content, /"الشقة","اسم المالك","الشهر","النوع","المبلغ","السبب"/);
    assert.match(calls.download.content, /"10","سعيد","فبراير 2024","إعفاء","200","إعفاء كامل"/);
    assert.match(calls.download.content, /"الإجمالي","","","","200"/);
    assert.doesNotMatch(calls.download.content, /خصم أخوة/);
});

test('changing an adjustments filter invalidates the preview and guards export', () => {
    const { api, elements, calls } = loadReports({ resident: 'r2' });
    api.generateAdjustmentsReport();
    elements.adjustmentsReportResident.value = 'r1';
    api.invalidateAdjustmentsReportPreview();
    assert.match(elements.adjustmentsReportPreview.innerHTML, /تغيّر الشهر أو الفلتر/);
    assert.equal(elements.adjustmentsReportExportBtn.disabled, true);

    elements.adjustmentsReportResident.value = 'r2';
    api.generateAdjustmentsReport();
    elements.adjustmentsReportResident.value = 'r1';
    api.exportAdjustmentsReportCsv();
    assert.equal(calls.download, undefined);
    assert.ok(calls.toasts.some(entry => entry.includes('اعرض معاينة الشقة المحددة أولًا')));

    api.generateAdjustmentsReport();
    elements.adjustmentsReportKind.value = 'waiver';
    assert.equal(api.getSelectedAdjustmentsReportSnapshot(), null);
    assert.ok(calls.toasts.some(entry => entry.includes('اعرض معاينة النوع المحدد أولًا')));

    elements.adjustmentsReportKind.value = '';
    api.generateAdjustmentsReport();
    elements.adjustmentsReportFrom.value = 'فبراير 2024';
    assert.equal(api.getSelectedAdjustmentsReportSnapshot(), null);
    assert.ok(calls.toasts.some(entry => entry.includes('اعرض معاينة الفترة المحددة أولًا')));
});

test('renderAll invalidates the adjustments preview when an adjustment changes', () => {
    const { api, sandbox, elements } = loadReports();
    api.generateAdjustmentsReport();
    assert.match(elements.adjustmentsReportPreview.innerHTML, /الإجمالي/);
    sandbox.state.adjustments.push({ id: 'a6', residentId: 'r1', kind: 'waiver', effectiveMonth: '2024-01-01', amount: 5, reason: 'جديد' });
    api.invalidateAdjustmentsReportIfStale();
    assert.match(elements.adjustmentsReportPreview.innerHTML, /تغيّرت البيانات/);
    assert.equal(elements.adjustmentsReportPrintBtn.disabled, true);
});

test('adjustments filters populate from the shared month list and keep the selection', () => {
    const { api, elements } = loadReports();
    elements.adjustmentsReportFrom.value = 'فبراير 2024';
    elements.adjustmentsReportTo.value = 'مارس 2024';
    api.populateAdjustmentsReportFilters(['يناير 2024', 'فبراير 2024', 'مارس 2024'], 'مارس 2024');
    assert.equal(elements.adjustmentsReportFrom.value, 'فبراير 2024');
    assert.equal(elements.adjustmentsReportTo.value, 'مارس 2024');
    elements.adjustmentsReportFrom.value = '';
    api.populateAdjustmentsReportFilters(['أكتوبر 2023', 'يناير 2024', 'فبراير 2024', 'مارس 2024'], 'مارس 2024');
    assert.equal(elements.adjustmentsReportFrom.value, 'أكتوبر 2023');
});
