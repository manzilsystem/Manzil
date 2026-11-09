const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'UTC';
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const stateSource = read('js/state.js');
const crudSource = read('js/crud.js');
const renderSource = read('js/render.js');
const accessSource = read('js/access.js');
const noticesSource = read('js/notices.js');
const html = read('index.html');

const fixedNow = new Date('2024-05-15T12:00:00.000Z');
class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow.getTime(); }
}

function loadState() {
    return vm.runInNewContext(
        `${stateSource}\n({ state, getIncomeMonthLabels, getIncomeMonthOptionLabel, formatApartmentLabel, getBuildingMonthOptions, calculateIncomeAllocationPreview })`,
        { Date: FixedDate },
        { filename: 'js/state.js' }
    );
}

function resident(overrides = {}) {
    return {
        id: 'r1',
        name: 'أحمد',
        apartmentNumber: '3',
        createdAt: '2024-01-10T00:00:00.000Z',
        monthlyAmount: 100,
        subscriptionRates: [{ effectiveMonth: '2024-01-01', monthlyAmount: 100 }],
        ...overrides
    };
}

test('apartment labels are prefixed once and never duplicated', () => {
    const app = loadState();
    assert.equal(app.formatApartmentLabel('3'), 'شقة 3');
    assert.equal(app.formatApartmentLabel('شقة 3'), 'شقة 3');
    assert.equal(app.formatApartmentLabel('12B'), 'شقة 12B');
    assert.equal(app.formatApartmentLabel(''), 'شقة —');
});

test('income months include the recent year so past months stay selectable', () => {
    const app = loadState();
    app.state.residents = [resident()];
    const labels = Array.from(app.getIncomeMonthLabels(app.state.residents[0]));
    assert.equal(labels[0], 'يونيو 2023');
    assert.equal(labels.at(-1), 'مايو 2024');
    assert.ok(labels.includes('أبريل 2024'));
    assert.ok(labels.includes('مايو 2024'));
    assert.ok(!labels.includes('يناير 2021'));
    assert.equal(labels.length, 12);
});

test('an apartment without creation data still offers the recent year plus recorded months', () => {
    const app = loadState();
    app.state.residents = [resident({ createdAt: '' , subscriptionRates: [] })];
    app.state.income = [{ id: 'p1', residentId: 'r1', amount: 100, month: 'فبراير 2024' }];
    const labels = Array.from(app.getIncomeMonthLabels(app.state.residents[0]));
    assert.equal(labels[0], 'يونيو 2023');
    assert.equal(labels.at(-1), 'مايو 2024');
    assert.ok(labels.includes('فبراير 2024'));
    assert.equal(labels.length, 12);
});

test('month options carry paid, overdue and due status for the selected apartment', () => {
    const app = loadState();
    app.state.subscriptionDueDay = 28;
    app.state.subscriptionGraceDays = 10;
    app.state.residents = [resident()];
    app.state.income = [{ id: 'p1', residentId: 'r1', amount: 100, month: 'فبراير 2024' }];
    const target = app.state.residents[0];
    assert.equal(app.getIncomeMonthOptionLabel(target, 'فبراير 2024'), 'فبراير 2024 · مسدد');
    assert.equal(app.getIncomeMonthOptionLabel(target, 'يناير 2024'), 'يناير 2024 · متأخر 100 ج.م');
    assert.equal(app.getIncomeMonthOptionLabel(target, 'مايو 2024'), 'مايو 2024 · مستحق 100 ج.م');
});

test('month selectors keep twelve recent months available for new records', () => {
    const app = loadState();
    const options = Array.from(app.getBuildingMonthOptions(12));
    assert.equal(options.length, 12);
    assert.equal(options.at(-1), 'مايو 2024');
    assert.equal(options[0], 'يونيو 2023');
});

test('a late selected month can be settled first without changing the building policy', () => {
    const app = loadState();
    app.state.paymentAllocationPolicy = 'oldest_first';
    app.state.residents = [resident()];
    const oldest = app.calculateIncomeAllocationPreview('r1', 100, 'مايو 2024');
    assert.equal(oldest.allocations[0].month, 'يناير 2024');

    const selected = app.calculateIncomeAllocationPreview('r1', 100, 'مايو 2024', 120, 'selected_month_first');
    assert.equal(selected.allocations[0].month, 'مايو 2024');
    assert.equal(app.state.paymentAllocationPolicy, 'oldest_first');
});

test('the income form exposes sorted apartment choices, a resident summary and an explicit month grid', () => {
    assert.match(html, /id="incomeResident"[^>]*onchange="handleIncomeResidentChange\(\)"/);
    assert.match(html, /id="incomeResidentSummary"/);
    assert.match(html, /id="incomeMonthsWrap"/);
    assert.match(html, /id="incomeMonthsGrid" role="group"/);
    assert.match(html, /id="incomeMonthsSummary"/);
    assert.match(html, /<input type="month" id="incomeMonthPicker"[^>]*onchange="handleIncomeMonthPickerChange\(\)"/);
    assert.match(html, /id="incomeMonthPickerHint"[^>]*aria-live="polite"/);
    assert.match(html, /applyIncomeMonthQuickAction\('arrears'\)/);
    assert.match(html, /applyIncomeMonthQuickAction\('current'\)/);
    assert.match(html, /applyIncomeMonthQuickAction\('two'\)/);
    assert.match(html, /applyIncomeMonthQuickAction\('three'\)/);
    assert.match(html, /applyIncomeMonthQuickAction\('clear'\)/);
    assert.match(html, /id="incomeAmount"[^>]*oninput="handleIncomeAmountInput\(\)"/);
    assert.match(html, /id="incomeNotes"[^>]*oninput="previewIncomeAllocation\(\)"/);
    assert.match(html, /setIncomeNoteSuggestion\('سداد متأخرات'\)/);
    assert.match(html, /id="incomeReceiptModal"/);
    assert.match(html, /id="incomeMonth"[^>]*onchange="previewIncomeAllocation\(\)"/);
    assert.doesNotMatch(html, /incomeAllocationMode/);
    assert.doesNotMatch(html, /incomeAllocationPolicyHelp/);
    assert.doesNotMatch(html, /incomeCustomMonthWrap/);
    assert.doesNotMatch(html, /incomeCustomMonthSelect/);
    assert.doesNotMatch(html, /incomeCustomYearSelect/);
    assert.doesNotMatch(crudSource, /__custom__/);
    assert.doesNotMatch(crudSource, /applyIncomeCustomMonth/);
    assert.doesNotMatch(crudSource, /syncIncomeAllocationMode/);
    assert.doesNotMatch(crudSource, /getIncomeAllocationPolicyOverride/);
    assert.match(crudSource, /function getSelectedIncomeMonths\(\)/);
    assert.match(crudSource, /function renderIncomeMonthsGrid\(resident\)/);
    assert.match(crudSource, /function handleIncomeMonthPickerChange\(\)/);
    assert.match(crudSource, /function updateIncomeMonthPickerHint\(resident = null\)/);
    assert.match(crudSource, /function applyIncomeMonthQuickAction\(action\)/);
    assert.match(crudSource, /function handleIncomeMonthToggle\(input\)/);
    assert.match(crudSource, /calculateIncomeAllocationPreview\(residentId, amount, month, 120, '', selectedMonths\)/);
    assert.match(renderSource, /localeCompare\(String\(b\.apartmentNumber \|\| ''\), 'ar', \{ numeric: true \}\)/);
    assert.match(renderSource, /formatApartmentLabel\(r\.apartmentNumber\)/);
    assert.match(renderSource, /openIncomeReceiptModal\('\$\{i\.id\}'\)/);
});

test('income preview, list and receipts surface payment notes', () => {
    assert.match(crudSource, /ملاحظات الدفع/);
    assert.match(renderSource, /stripIncomeBatchNote\(i\.notes\)/);
    assert.match(accessSource, /function buildManagerReceiptPreview/);
    assert.match(accessSource, /function openIncomeReceiptModal/);
    assert.match(accessSource, /function printActiveIncomeReceipt/);
    assert.match(accessSource, /function sendActiveIncomeReceiptOnWhatsApp/);
    assert.match(noticesSource, /ملاحظات الدفع:/);
});

test('saving a collection opens the manager receipt automatically', () => {
    assert.match(crudSource, /openIncomeReceiptModal\(rows\[0\]\.id\)/);
});

function loadReceiptImageApi() {
    const sandbox = {
        Date: FixedDate,
        esc: value => String(value ?? ''),
        fmtNum: value => String(value),
        formatDate: value => (value ? String(value) : ''),
        getIncomePaymentMethodLabel: value => String(value || ''),
        document: { addEventListener() {}, getElementById: () => null, createElement: () => ({}) },
        console
    };
    return vm.runInNewContext(
        `${stateSource}\n${accessSource}\n({ state, buildReceiptImagePlan, receiptImageFilename, RECEIPT_IMAGE_SCALE, RECEIPT_IMAGE_WIDTH })`,
        sandbox,
        { filename: 'receipt-image.js' }
    );
}

test('manager receipt modal exposes a guarded high-quality image export button', () => {
    assert.match(html, /id="incomeReceiptImageBtn"[^>]*onclick="exportActiveIncomeReceiptImage\(\)"/);
    assert.match(accessSource, /async function exportActiveIncomeReceiptImage\(\)[\s\S]*?requireManager\(\)/);
    assert.match(accessSource, /receipt_image_generation_failed/);
    assert.match(accessSource, /incomeReceiptImageBtn[^]*?button\.disabled = true/);
});

test('receipt image renders on a 2x-3x canvas and exports a PNG', () => {
    assert.match(accessSource, /RECEIPT_IMAGE_SCALE = 2\.5/);
    assert.match(accessSource, /ctx\.scale\(plan\.scale, plan\.scale\)/);
    assert.match(accessSource, /toBlob\(blob => resolve\(blob\), 'image\/png'\)/);
    assert.match(accessSource, /canvas\.width = Math\.round\(plan\.width \* plan\.scale\)/);
});

test('receipt image plan exposes header, body and footer with the receipt totals', () => {
    const app = loadReceiptImageApi();
    app.state.buildingName = 'عمارة الاختبار';
    const receipt = {
        reference: 'RCPT-2026-01',
        date: '2026-01-05',
        paymentMethod: 'instapay',
        purposeSummary: 'اشتراك شهري',
        cashboxSummary: 'الخزنة الرئيسية',
        totalAmount: 150,
        payments: [
            { id: 'p1', amount: 100, month: 'يناير 2026', purposeCode: 'subscription', cashAccountCode: 'main' },
            { id: 'p2', amount: 50, month: 'فبراير 2026', purposeCode: 'subscription', cashAccountCode: 'main' }
        ]
    };
    const plan = app.buildReceiptImagePlan(receipt, resident());
    assert.equal(plan.sections.join(','), 'header,body,footer');
    assert.equal(plan.width, 720);
    assert.ok(plan.scale >= 2 && plan.scale <= 3);
    assert.ok(plan.height > 400);
    assert.equal(plan.items.length, 2);
    assert.equal(plan.items[0].amount, '100 ج.م');
    assert.equal(plan.total, '150 ج.م');
    assert.equal(plan.fields.length, 6);
    assert.equal(plan.fields[1][1], 'شقة 3');
    assert.equal(app.receiptImageFilename(receipt), 'manzil_receipt_RCPT-2026-01.png');
    assert.equal(app.receiptImageFilename({}), 'manzil_receipt_receipt.png');
});
