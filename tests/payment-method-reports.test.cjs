const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const reports = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const access = fs.readFileSync(path.join(__dirname, '..', 'js', 'access.js'), 'utf8');

function renderReport(overrides = {}) {
    const preview = { innerHTML: '' };
    const sandbox = {
        state: {
            buildingName: 'عمارة النور',
            residents: [{ id: 'r1', name: 'أحمد', apartmentNumber: '3' }],
            income: [
                { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' },
                { id: 'i2', residentId: 'r1', month: 'يناير 2024', amount: 250, paymentMethod: 'instapay' },
                { id: 'i3', residentId: 'r1', month: 'يناير 2024', amount: 50, paymentMethod: 'instapay' }
            ],
            expenses: [],
            ...overrides
        },
        document: {
            getElementById: id => id === 'reportMonthSelect'
                ? { value: 'يناير 2024' }
                : id === 'landlordReportPreview' ? preview : null
        },
        requireManager: () => true,
        toast() {},
        esc: value => String(value ?? ''),
        fmtNum: value => String(value),
        fmtMoney: value => `${value} ج.م`,
        toCents: value => {
            const amount = Number(value);
            return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
        },
        formatDate: () => '01/01/2024',
        getIncomePaymentMethodLabel: method => ({
            cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay',
            bank_transfer: 'تحويل بنكي'
        })[method] || 'غير محدد'
    };
    const app = vm.runInNewContext(reports + String.fromCharCode(10) + '({ generateLandlordReport })', sandbox);
    app.generateLandlordReport();
    return preview.innerHTML;
}

test('monthly report shows collection channel totals and each payment channel', () => {
    const html = renderReport();
    assert.match(html, /توزيع طرق الدفع/);
    assert.match(html, /نقدًا/);
    assert.match(html, /InstaPay/);
    assert.match(html, /100 ج\.م/);
    assert.match(html, /300 ج\.م/);
});

test('monthly report totals are aggregated in cents without float drift', () => {
    const html = renderReport({
        income: [
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 0.1, paymentMethod: 'cash' },
            { id: 'i2', residentId: 'r1', month: 'يناير 2024', amount: 0.2, paymentMethod: 'cash' }
        ],
        expenses: [{ title: 'كهرباء', month: 'يناير 2024', amount: 0.05 }]
    });

    assert.match(html, /0\.3 ج\.م/);
    assert.match(html, /0\.05 ج\.م/);
    assert.match(html, /0\.25 ج\.م/);
    assert.doesNotMatch(html, /0\.30000000000000004/);
});

test('monthly report resolves each payment to its resident through the index', () => {
    const html = renderReport({
        residents: [
            { id: 'r1', name: 'أحمد', apartmentNumber: '3' },
            { id: 'r2', name: 'سارة', apartmentNumber: '7' },
        ],
        income: [
            { id: 'i1', residentId: 'r2', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' },
            { id: 'i2', residentId: 'r1', month: 'يناير 2024', amount: 200, paymentMethod: 'cash' },
            { id: 'i3', residentId: 'missing', month: 'يناير 2024', amount: 50, paymentMethod: 'cash' }
        ]
    });

    assert.match(html, /سارة/);
    assert.match(html, /أحمد/);
    assert.match(html, /—/);
});

test('report lookups use a single residents index instead of repeated scans', () => {
    assert.equal((reports.match(/const residentsById = buildResidentIndex\(\)/g) || []).length, 2);
    assert.doesNotMatch(reports, /state\.residents\.find\(/);
});

test('CSV export includes a payment method column for collections', () => {
    assert.match(reports, /\['النوع','الوصف','الشقة','الشهر','المبلغ','طريقة الدفع','ملاحظات'\]/);
    assert.match(reports, /getIncomePaymentMethodLabel\(i\.paymentMethod\)/);
});

test('owner read-only payment history displays the recorded payment method', () => {
    assert.match(access, /getIncomePaymentMethodLabel\(payment\.paymentMethod\)/);
});
