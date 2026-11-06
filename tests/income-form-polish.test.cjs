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

test('income months start from the apartment record instead of a fixed multi-year window', () => {
    const app = loadState();
    app.state.residents = [resident()];
    const labels = Array.from(app.getIncomeMonthLabels(app.state.residents[0]));
    assert.equal(labels[0], 'يناير 2024');
    assert.equal(labels.at(-1), 'مايو 2024');
    assert.ok(!labels.includes('يناير 2021'));
    assert.ok(!labels.includes('ديسمبر 2023'));
    assert.equal(labels.length, 5);
});

test('an apartment without creation data only offers recorded months plus the current month', () => {
    const app = loadState();
    app.state.residents = [resident({ createdAt: '' , subscriptionRates: [] })];
    app.state.income = [{ id: 'p1', residentId: 'r1', amount: 100, month: 'فبراير 2024' }];
    const labels = Array.from(app.getIncomeMonthLabels(app.state.residents[0]));
    assert.deepEqual(labels, ['فبراير 2024', 'مايو 2024']);
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

test('the income form exposes sorted apartment choices, a resident summary and late-month controls', () => {
    assert.match(html, /id="incomeResident"[^>]*onchange="handleIncomeResidentChange\(\)"/);
    assert.match(html, /id="incomeResidentSummary"/);
    assert.match(html, /id="incomeAllocationMode"/);
    assert.match(html, /value="selected"/);
    assert.match(html, /id="incomeNotes"[^>]*oninput="previewIncomeAllocation\(\)"/);
    assert.match(html, /setIncomeNoteSuggestion\('سداد متأخرات'\)/);
    assert.match(html, /id="incomeReceiptModal"/);
    assert.match(html, /id="incomeMonth"[^>]*onchange="handleIncomeMonthChange\(\)"/);
    assert.match(html, /id="incomeCustomMonthWrap"/);
    assert.match(html, /id="incomeCustomMonthSelect"/);
    assert.match(html, /id="incomeCustomYearSelect"/);
    assert.match(html, /onclick="applyIncomeCustomMonth\(\)"/);
    assert.match(crudSource, /<option value="__custom__">شهر آخر…<\/option>/);
    assert.match(crudSource, /function handleIncomeMonthChange\(\)/);
    assert.match(crudSource, /function applyIncomeCustomMonth\(\)/);
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
    assert.match(crudSource, /policyOverride === 'selected_month_first'/);
});
