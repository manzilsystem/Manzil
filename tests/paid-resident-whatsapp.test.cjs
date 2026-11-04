const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'render.js'), 'utf8');
const start = source.indexOf('function renderResidentsGrid()');
const end = source.indexOf(String.fromCharCode(10) + 'function clearResidentFilters()', start);
assert.ok(start >= 0 && end > start, 'renderResidentsGrid source must exist');
const renderResidentsGridSource = source.slice(start, end);

function renderCard({ paid, hasReceipt = true, priorDebt = !paid }) {
    const elements = {
        residentsGrid: { innerHTML: '' },
        searchResidentsInput: { value: '' },
        residentStatusFilter: { value: 'all' },
        residentSort: { value: 'apartment' }
    };
    const resident = { id: 'resident-1', name: 'أحمد', apartmentNumber: '3', phone: '01012345678', monthlyAmount: 100 };
    const income = hasReceipt
        ? [{ id: 'payment-1', residentId: resident.id, month: 'نوفمبر 2026', date: '2026-11-04T10:00:00.000Z', amount: 100 }]
        : [];
    const sandbox = {
        state: { residents: [resident], income, defaultSubscription: 100 },
        document: { getElementById: id => elements[id] || null },
        getMonthOutstanding: () => paid ? 0 : 100,
        getPaidAmountForMonth: () => paid ? 100 : 0,
        calculateCumulativeDebt: () => ({ totalDebt: priorDebt ? 100 : 0, count: priorDebt ? 1 : 0 }),
        getCurrentMonth: () => 'نوفمبر 2026',
        isSubscriptionMonthOverdue: () => true,
        esc: value => String(value ?? ''),
        fmtNum: value => String(value ?? 0)
    };
    vm.runInNewContext(renderResidentsGridSource + String.fromCharCode(10) + 'renderResidentsGrid();', sandbox, { filename: 'js/render.js' });
    return elements.residentsGrid.innerHTML;
}

test('fully paid apartment shows WhatsApp receipt action instead of overdue reminder', () => {
    const html = renderCard({ paid: true });
    assert.match(html, /sendIncomeReceiptOnWhatsApp\('payment-1'\)/);
    assert.match(html, /إرسال إيصال واتساب/);
    assert.doesNotMatch(html, /sendWhatsAppReminder/);
});

test('fully paid apartment without a current-month receipt has no misleading WhatsApp action', () => {
    const html = renderCard({ paid: true, hasReceipt: false });
    assert.doesNotMatch(html, /sendIncomeReceiptOnWhatsApp|sendWhatsAppReminder/);
});

test('unpaid apartment keeps the WhatsApp arrears reminder action', () => {
    const html = renderCard({ paid: false });
    assert.match(html, /sendWhatsAppReminder\('resident-1'\)/);
    assert.match(html, /إرسال تذكير واتساب/);
    assert.doesNotMatch(html, /sendIncomeReceiptOnWhatsApp/);
});

test('paid current month keeps arrears reminder when older months remain unpaid', () => {
    const html = renderCard({ paid: true, priorDebt: true });
    assert.match(html, /sendWhatsAppReminder\('resident-1'\)/);
    assert.doesNotMatch(html, /sendIncomeReceiptOnWhatsApp/);
});
