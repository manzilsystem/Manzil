const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const notices = fs.readFileSync(path.join(root, 'js', 'notices.js'), 'utf8');
const render = fs.readFileSync(path.join(root, 'js', 'render.js'), 'utf8');

function loadReceiptApp(phone = '01012345678', extraIncome = []) {
    const opened = [];
    const messages = [];
    const sandbox = {
        getReceiptThankYouMessage: () => 'شكراً لالتزامكم، ونسعد دائماً بخدمتكم.',
        state: {
            buildingName: 'عمارة النور',
            residents: [{ id: 'resident-1', name: 'أحمد', apartmentNumber: '3', phone }],
            income: [
                { id: 'payment-1', residentId: 'resident-1', amount: 100, month: 'أكتوبر 2026', date: '2026-11-04T00:00:00.000Z', paymentMethod: 'instapay', notes: 'دفعة موزعة ABC123 (1/2)' },
                { id: 'payment-2', residentId: 'resident-1', amount: 50, month: 'نوفمبر 2026', date: '2026-11-04T00:00:00.000Z', paymentMethod: 'instapay', notes: 'دفعة موزعة ABC123 (2/2)' }
            ]
        },
        requireManager: () => true,
        toast: (message, type) => messages.push({ message, type }),
        fmtNum: value => String(value),
        getIncomePaymentMethodLabel: method => method === 'instapay' ? 'InstaPay' : 'غير محدد',
        formatDate: () => '04/11/2026',
        window: { open: url => opened.push(url) },
        encodeURIComponent
    };
    const app = vm.runInNewContext(`${notices}\n({ sendIncomeReceiptOnWhatsApp })`, sandbox);
    return { app, opened, messages };
}

function loadReceiptAppWithCollision() {
    return loadReceiptApp('01012345678', [{ id: 'other-payment', residentId: 'resident-1', amount: 999, month: 'ديسمبر 2026', date: '2026-11-04T00:00:00.000Z', paymentMethod: 'cash', notes: 'ملاحظة خارجية ABC123 ليست دفعة موزعة' }]);
}

test('WhatsApp receipt combines all months from one distributed payment', () => {
    const { app, opened } = loadReceiptApp();

    app.sendIncomeReceiptOnWhatsApp('payment-2');

    assert.equal(opened.length, 1);
    const url = new URL(opened[0]);
    assert.equal(url.pathname, '/201012345678');
    const message = url.searchParams.get('text');
    assert.match(message, /إيصال استلام — عمارة النور/);
    assert.match(message, /أحمد/);
    assert.match(message, /الشقة: شقة 3/);
    assert.match(message, /المبلغ المستلم: 150 ج.م/);
    assert.match(message, /طريقة الدفع: InstaPay/);
    assert.ok(message.indexOf('أكتوبر 2026: 100 ج.م') < message.indexOf('نوفمبر 2026: 50 ج.م'));
    assert.match(message, /رقم الإيصال: ABC123/);
    assert.match(message, /شكراً لالتزامكم/);
});

test('WhatsApp receipt requires a resident phone number', () => {
    const { app, opened, messages } = loadReceiptApp('');

    app.sendIncomeReceiptOnWhatsApp('payment-1');

    assert.equal(opened.length, 0);
    assert.match(messages[0].message, /أضف رقم هاتف الساكن/);
});

test('income cards expose a WhatsApp receipt action for each payment', () => {
    assert.match(render, /sendIncomeReceiptOnWhatsApp\('\$\{i\.id\}'\)/);
    assert.match(render, /إرسال إيصال واتساب/);
});


test('WhatsApp receipt excludes unrelated notes that merely contain the payment reference', () => {
    const { app, opened } = loadReceiptApp();
    const sandboxState = app; // Keep the public handler isolated; add the collision through the shared fixture below.
    void sandboxState;
    const fixture = loadReceiptAppWithCollision();
    fixture.app.sendIncomeReceiptOnWhatsApp('payment-1');
    const message = new URL(fixture.opened[0]).searchParams.get('text');
    assert.match(message, /المبلغ المستلم: 150 ج.م/);
    assert.doesNotMatch(message, /ملاحظة خارجية/);
});
