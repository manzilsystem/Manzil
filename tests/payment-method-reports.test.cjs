const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const reports = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const access = fs.readFileSync(path.join(__dirname, '..', 'js', 'access.js'), 'utf8');

function renderReport() {
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
            expenses: []
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

test('CSV export includes a payment method column for collections', () => {
    assert.match(reports, /\['النوع','الوصف','الشقة','الشهر','المبلغ','طريقة الدفع','ملاحظات'\]/);
    assert.match(reports, /getIncomePaymentMethodLabel\(i\.paymentMethod\)/);
});

test('owner read-only payment history displays the recorded payment method', () => {
    assert.match(access, /getIncomePaymentMethodLabel\(payment\.paymentMethod\)/);
});
