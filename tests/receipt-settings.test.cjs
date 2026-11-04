const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const settingsSource = read('js/state.js') + '\\n' + read('js/settings.js');
const noticesSource = read('js/notices.js');

function makeStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
}

test('receipt thank-you message defaults safely and is scoped to the active building', () => {
    const storage = makeStorage();
    const sandbox = { activeBuildingId: 'building-a', localStorage: storage, state: {} };
    const api = vm.runInNewContext(settingsSource + '\n({ getReceiptSettingsKey, getReceiptThankYouMessage, DEFAULT_RECEIPT_THANK_YOU })', sandbox);
    assert.equal(api.getReceiptThankYouMessage(), api.DEFAULT_RECEIPT_THANK_YOU);
    storage.setItem('manzil:building-a:receipt-thank-you', 'شكراً لسدادكم');
    assert.equal(api.getReceiptThankYouMessage(), 'شكراً لسدادكم');
    sandbox.activeBuildingId = 'building-b';
    assert.equal(api.getReceiptThankYouMessage(), api.DEFAULT_RECEIPT_THANK_YOU);
    sandbox.activeBuildingId = 'building-a';
    storage.setItem('manzil:building-a:receipt-thank-you', '   ');
    assert.equal(api.getReceiptThankYouMessage(), api.DEFAULT_RECEIPT_THANK_YOU);
});

test('receipt preview updates as plain text and never triggers a send', () => {
    const elements = {
        settingsReceiptThankYou: { value: 'نشكركم على السداد' },
        settingsReceiptPreview: { textContent: '' }
    };
    let opened = false;
    const sandbox = {
        document: { getElementById: id => elements[id] || null },
        state: { buildingName: 'عمارة الاختبار' },
        window: { open: () => { opened = true; } }
    };
    const api = vm.runInNewContext(settingsSource + '\n({ renderReceiptPreview })', sandbox);
    api.renderReceiptPreview();
    assert.match(elements.settingsReceiptPreview.textContent, /عمارة الاختبار/);
    assert.match(elements.settingsReceiptPreview.textContent, /نشكركم على السداد/);
    assert.equal(opened, false);
    elements.settingsReceiptThankYou.value = '';
    api.renderReceiptPreview();
    assert.match(elements.settingsReceiptPreview.textContent, /شكراً لالتزامكم/);
});

test('WhatsApp receipt uses the saved custom thank-you message', () => {
    let openedUrl = '';
    const sandbox = {
        requireManager: () => true,
        state: {
            income: [{ id: 'income-1', residentId: 'resident-1', amount: 500, month: 'نوفمبر 2026', date: '2026-11-04', paymentMethod: 'cash' }],
            residents: [{ id: 'resident-1', name: 'أحمد', apartmentNumber: '12', phone: '01012345678' }],
            buildingName: 'عمارة الاختبار'
        },
        cleanPhone: () => '201012345678',
        getReceiptThankYouMessage: () => 'شكراً مخصصاً من الإعدادات',
        getIncomePaymentMethodLabel: () => 'نقدًا',
        fmtNum: value => String(value),
        formatDate: () => '04/11/2026',
        window: { open: url => { openedUrl = url; } },
        toast: () => {}
    };
    const api = vm.runInNewContext(noticesSource + '\n({ sendIncomeReceiptOnWhatsApp })', sandbox);
    api.sendIncomeReceiptOnWhatsApp('income-1');
    assert.ok(openedUrl.startsWith('https://wa.me/201012345678?text='));
    const message = decodeURIComponent(openedUrl.split('text=')[1]);
    assert.match(message, /شكراً مخصصاً من الإعدادات/);
    assert.match(message, /طريقة الدفع: نقدًا/);
});
