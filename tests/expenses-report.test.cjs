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

const CASH_ACCOUNTS = {
    main: { label: 'الخزنة الرئيسية', shortLabel: 'الرئيسية' },
    development: { label: 'صندوق التطوير', shortLabel: 'التطوير' },
    emergency: { label: 'صندوق الصيانة الطارئة', shortLabel: 'الطوارئ' }
};

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
        expensesReportFrom: { value: options.from ?? 'يناير 2024' },
        expensesReportTo: { value: options.to ?? 'مارس 2024' },
        expensesReportCashAccount: { value: options.cashAccount ?? '' },
        expensesReportCategory: { value: options.category ?? '' },
        expensesReportPreview: { innerHTML: '', dataset: {} },
        expensesReportPrintBtn: { disabled: true },
        expensesReportExportBtn: { disabled: true },
        printBuildingTitle: { textContent: '' },
        printBuildingMeta: { textContent: '' }
    };
    const state = {
        buildingName: 'عمارة النور',
        managerName: 'المدير',
        expenses: [
            { id: 'e1', month: 'يناير 2024', title: 'كهرباء', amount: 10, category: 'مرافق', cashAccountCode: 'main' },
            { id: 'e2', month: 'يناير 2024', title: 'دهانات', amount: 5, category: 'تطوير', cashAccountCode: 'development' },
            { id: 'e3', month: 'يناير 2024', title: 'سباكة', amount: 7, category: 'صيانة', cashAccountCode: 'emergency' },
            { id: 'e4', month: 'فبراير 2024', title: 'بلاط', amount: 25, category: 'تطوير', cashAccountCode: 'development' },
            { id: 'e5', month: 'فبراير 2024', title: 'متنوع', amount: 3 },
            { id: 'e6', month: 'مارس 2024', title: 'دهانات', amount: 20, category: 'تطوير', cashAccountCode: 'development' },
            { id: 'e7', month: 'مايو 2024', title: 'خارج الفترة', amount: 99, category: 'تطوير', cashAccountCode: 'development' }
        ]
    };
    const calls = { toasts: [] };
    const sandbox = {
        state,
        monthsNames: monthNames,
        CASH_ACCOUNTS,
        getCashAccountLabel: code => CASH_ACCOUNTS[code]?.label || CASH_ACCOUNTS.main.label,
        getCurrentMonth: () => 'مارس 2024',
        monthLabelToKey,
        toCents,
        fmtNum: value => String(Number(value) || 0),
        fmtMoney: value => `${String(Number(value) || 0)} ج.م`,
        esc: value => String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character])),
        formatDate: () => '01/03/2024',
        requireManager: () => true,
        toast: (message, kind) => calls.toasts.push(`${kind}:${message}`),
        setTimeout: () => {},
        console,
        Blob: class { constructor(parts, opts) { sandbox.__blob = { parts, type: opts && opts.type }; } },
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
        Date
    };
    const api = vm.runInNewContext(
        `${reports}\n({\n            buildExpensesReport, getExpensesReportSignature, generateExpensesReport, renderExpensesReportHtml,\n            exportExpensesReportCsv, printExpensesReport, getSelectedExpensesReportSnapshot,\n            invalidateExpensesReportPreview, invalidateExpensesReportIfStale, onExpensesReportRangeChange,\n            populateExpensesReportFilters, getExpensesReportCategoryFilter, getExpenseCategoryValue,\n            getExpensesReportSelection, REPORT_TABS, REPORT_PANEL_IDS, REPORT_OUTPUT_BUTTON_IDS\n        })`,
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

test('expenses report is wired as a report tab with filters and gated outputs', () => {
    assert.match(html, /data-report-nav="expenses"[^>]*aria-controls="expensesReportCard"[^>]*onclick="switchReportTab\('expenses'\)"/);
    assert.match(html, /id="expensesReportCard"/);
    [['expensesReportFrom', 'onExpensesReportRangeChange'], ['expensesReportTo', 'onExpensesReportRangeChange'], ['expensesReportCashAccount', 'invalidateExpensesReportPreview'], ['expensesReportCategory', 'invalidateExpensesReportPreview']].forEach(([id, handler]) => {
        assert.match(html, new RegExp(`id="${id}"[^>]*onchange="${handler}\\(\\)"`), id + ' must invalidate the preview');
    });
    assert.match(html, /id="expensesReportPrintBtn"[^>]*onclick="printExpensesReport\(\)"[^>]*disabled/);
    assert.match(html, /id="expensesReportExportBtn"[^>]*onclick="exportExpensesReportCsv\(\)"[^>]*disabled/);
    assert.match(render, /populateExpensesReportFilters\(months, current\)/);
    assert.match(render, /invalidateExpensesReportIfStale\(\)/);
    assert.match(css, /body\.print-expenses #tab-reports > :not\(#expensesReportCard\)/);
});

test('expenses report registers the expenses tab and output button', () => {
    const { api } = loadReports();
    assert.ok(api.REPORT_TABS.includes('expenses'));
    assert.equal(api.REPORT_PANEL_IDS.expenses, 'expensesReportCard');
    assert.equal(api.REPORT_OUTPUT_BUTTON_IDS.expenses, 'expensesReportPrintBtn');
});

test('expenses report bills each month and ignores expenses outside the range', () => {
    const { api } = loadReports();
    const report = api.buildExpensesReport('يناير 2024', 'مارس 2024');
    assert.equal(report.months.map(row => row.month).join('|'), 'يناير 2024|فبراير 2024|مارس 2024');
    assert.equal(report.months.map(row => row.expenseCents).join('|'), '2200|2800|2000');
    assert.equal(report.months.map(row => row.count).join('|'), '3|2|1');
    assert.equal(report.totals.expenseCents, 7000);
    assert.equal(report.totals.count, 6);
    assert.equal(report.totals.monthCount, 3);
    assert.equal(report.totals.averageCents, 2333);
    assert.equal(report.categories.map(item => item.label).join('|'), 'تطوير|مرافق|صيانة|غير مصنف');
    assert.equal(report.categories.map(item => item.cents).join('|'), '5000|1000|700|300');
    assert.equal(report.funds.map(item => item.code).join('|'), 'development|main|emergency');
    assert.equal(report.funds.map(item => item.cents).join('|'), '5000|1300|700');
    assert.equal(report.rangeLabel, 'يناير 2024 – مارس 2024');
});

test('expenses report filters by fund, category, or both', () => {
    const { api } = loadReports();
    const development = api.buildExpensesReport('يناير 2024', 'مارس 2024', 'development');
    assert.equal(development.totals.expenseCents, 5000);
    assert.deepEqual(development.list.map(item => item.id), ['e6', 'e4', 'e2']);
    assert.equal(development.funds.length, 1);
    assert.equal(development.cashAccountLabel, 'صندوق التطوير');

    const main = api.buildExpensesReport('يناير 2024', 'مارس 2024', 'main');
    assert.equal(main.totals.expenseCents, 1300);
    assert.deepEqual(main.list.map(item => item.id), ['e5', 'e1']);

    const category = api.buildExpensesReport('يناير 2024', 'مارس 2024', '', 'تطوير');
    assert.equal(category.totals.expenseCents, 5000);
    assert.equal(category.categoryLabel, 'تطوير');

    const combined = api.buildExpensesReport('يناير 2024', 'مارس 2024', 'development', 'تطوير');
    assert.equal(combined.totals.expenseCents, 5000);

    const empty = api.buildExpensesReport('يناير 2024', 'مارس 2024', 'emergency', 'تطوير');
    assert.equal(empty.totals.expenseCents, 0);
    assert.equal(empty.totals.count, 0);
    assert.equal(empty.totals.averageCents, 0);
});

test('expenses report rejects invalid ranges beyond the shared period limit', () => {
    const { api } = loadReports();
    assert.equal(api.buildExpensesReport('مارس 2024', 'يناير 2024'), null);
    assert.equal(api.buildExpensesReport('يناير 2018', 'ديسمبر 2023'), null);
    assert.ok(api.buildExpensesReport('يناير 2019', 'ديسمبر 2023'));
    assert.ok(api.buildExpensesReport('يناير 2023', 'ديسمبر 2023'));
});

test('expenses preview shows filters, totals, breakdowns and details', () => {
    const { api, elements } = loadReports({ cashAccount: 'development', category: 'تطوير' });
    api.generateExpensesReport();
    const preview = elements.expensesReportPreview.innerHTML;
    assert.match(preview, /تقرير المصروفات يناير 2024 – مارس 2024/);
    assert.match(preview, /الصندوق: صندوق التطوير/);
    assert.match(preview, /التصنيف: تطوير/);
    assert.match(preview, /إجمالي المصروف/);
    assert.match(preview, /50 ج\.م/);
    assert.match(preview, /المصروف حسب التصنيف/);
    assert.match(preview, /المصروف حسب الصندوق/);
    assert.match(preview, /المصروفات معروضة لصندوق/);
    assert.doesNotMatch(preview, /كهرباء/);
    assert.equal(elements.expensesReportPrintBtn.disabled, false);
    assert.equal(elements.expensesReportExportBtn.disabled, false);
});

test('expenses preview renders the filtered fund note and category note', () => {
    const { api, elements } = loadReports({ cashAccount: 'development' });
    api.generateExpensesReport();
    const preview = elements.expensesReportPreview.innerHTML;
    assert.match(preview, /المصروفات معروضة لصندوق «صندوق التطوير» فقط/);
    assert.match(preview, /تفاصيل المصروفات/);
    assert.match(preview, /دهانات/);
    assert.doesNotMatch(preview, /سباكة/);
});

test('expenses signature follows range, fund and category filters', () => {
    const { api } = loadReports();
    assert.notEqual(
        api.getExpensesReportSignature('يناير 2024', 'مارس 2024', '', ''),
        api.getExpensesReportSignature('يناير 2024', 'مارس 2024', 'development', '')
    );
    assert.notEqual(
        api.getExpensesReportSignature('يناير 2024', 'مارس 2024', '', 'تطوير'),
        api.getExpensesReportSignature('يناير 2024', 'مارس 2024', '', 'مرافق')
    );
    assert.equal(
        api.getExpensesReportSignature('يناير 2024', 'مارس 2024', '', ''),
        api.getExpensesReportSignature('يناير 2024', 'مارس 2024', '', '')
    );
});

test('expenses CSV includes filter metadata, details and a fund/category suffix', () => {
    const { api, calls } = loadReports({ cashAccount: 'development', category: 'تطوير' });
    api.generateExpensesReport();
    api.exportExpensesReportCsv();
    assert.equal(calls.download.filename, 'manzil_expenses_2024-01_2024-03_development_تطوير.csv');
    assert.match(calls.download.content, /"الفترة","يناير 2024 – مارس 2024","الصندوق","صندوق التطوير","التصنيف","تطوير"/);
    assert.match(calls.download.content, /"الشهر","البيان","التصنيف","الصندوق","المبلغ","ملاحظات"/);
    assert.match(calls.download.content, /"مارس 2024","دهانات","تطوير","صندوق التطوير","20"/);
    assert.match(calls.download.content, /"الإجمالي","","","","50"/);
    assert.doesNotMatch(calls.download.content, /كهرباء/);
});

test('changing an expenses filter invalidates the preview and guards export', () => {
    const { api, elements, calls } = loadReports({ cashAccount: 'development' });
    api.generateExpensesReport();
    elements.expensesReportCashAccount.value = 'emergency';
    api.invalidateExpensesReportPreview();
    assert.match(elements.expensesReportPreview.innerHTML, /تغيّرت الفترة أو الفلتر/);
    assert.equal(elements.expensesReportExportBtn.disabled, true);

    elements.expensesReportCashAccount.value = 'development';
    api.generateExpensesReport();
    elements.expensesReportCashAccount.value = 'emergency';
    api.exportExpensesReportCsv();
    assert.equal(calls.download, undefined);
    assert.ok(calls.toasts.some(entry => entry.includes('اعرض معاينة الصندوق المحدد أولًا')));

    api.generateExpensesReport();
    elements.expensesReportCategory.value = 'مرافق';
    assert.equal(api.getSelectedExpensesReportSnapshot(), null);
    assert.ok(calls.toasts.some(entry => entry.includes('اعرض معاينة التصنيف المحدد أولًا')));

    api.generateExpensesReport();
    elements.expensesReportFrom.value = 'فبراير 2024';
    assert.equal(api.getSelectedExpensesReportSnapshot(), null);
    assert.ok(calls.toasts.some(entry => entry.includes('اعرض معاينة الفترة المحددة أولًا')));
});

test('renderAll invalidates the expenses preview when expense data changes', () => {
    const { api, sandbox, elements } = loadReports();
    api.generateExpensesReport();
    assert.match(elements.expensesReportPreview.innerHTML, /الإجمالي/);
    sandbox.state.expenses.push({ id: 'e8', month: 'يناير 2024', title: 'جديد', amount: 1, category: 'مرافق', cashAccountCode: 'main' });
    api.invalidateExpensesReportIfStale();
    assert.match(elements.expensesReportPreview.innerHTML, /تغيّرت البيانات/);
    assert.equal(elements.expensesReportPrintBtn.disabled, true);
});

test('expenses category filter populates from the expense categories and keeps the selection', () => {
    const { api, elements } = loadReports();
    elements.expensesReportCategory.value = 'تطوير';
    api.populateExpensesReportFilters(['يناير 2024', 'فبراير 2024', 'مارس 2024'], 'مارس 2024');
    assert.match(elements.expensesReportCategory.innerHTML, /<option value="">كل التصنيفات<\/option>/);
    assert.match(elements.expensesReportCategory.innerHTML, /<option value="تطوير">تطوير<\/option>/);
    assert.match(elements.expensesReportCategory.innerHTML, /<option value="غير مصنف">غير مصنف<\/option>/);
    assert.equal(elements.expensesReportCategory.value, 'تطوير');
    assert.equal(elements.expensesReportFrom.value, 'يناير 2024');
    assert.equal(elements.expensesReportTo.value, 'مارس 2024');
});
