const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const access = read('js/access.js');
const sw = read('sw.js');

function createOwnerAccess(role = 'owner', phone = '01012345678') {
    const opened = [];
    const messages = [];
    const state = {
        managerPhone: phone,
        managerName: 'محمد المدير',
        buildingName: 'عمارة النور',
        residents: [{ id: 'unit-1', name: 'أحمد', apartmentNumber: '3' }],
        income: [
            { id: 'payment-1', residentId: 'unit-1', amount: 100, month: 'أكتوبر 2026', paymentMethod: 'instapay', date: '2026-11-04T10:00:00.000Z', notes: 'دفعة موزعة ABC123 (1/2)' },
            { id: 'payment-2', residentId: 'unit-1', amount: 50, month: 'نوفمبر 2026', paymentMethod: 'instapay', date: '2026-11-04T10:00:00.000Z', notes: 'دفعة موزعة ABC123 (2/2)' },
            { id: 'payment-3', residentId: 'unit-1', amount: 25, month: 'سبتمبر 2026', paymentMethod: 'cash', date: '2026-10-01T10:00:00.000Z', notes: 'سداد منفصل' },
            { id: 'foreign-payment', residentId: 'unit-2', amount: 999, month: 'أكتوبر 2026', paymentMethod: 'cash', date: '2026-11-04T10:00:00.000Z', notes: 'دفعة موزعة ABC123 (1/2)' }
        ]
    };
    const sandbox = {
        state,
        currentUserRole: role,
        currentResidentId: 'unit-1',
        activeSession: { user: { id: 'owner-user-1' } },
        activeBuildingId: 'building-1',
        document: { addEventListener() {} },
        updateAccessSwitchButton() {},
        toast: (message, type) => messages.push({ message, type }),
        window: { open: url => opened.push(url) },
        encodeURIComponent
    };
    const api = vm.runInNewContext(
        access + String.fromCharCode(10) + '({ groupOwnerPaymentsIntoReceipts, getOwnerManagerWhatsAppPhone, contactOwnerManager })',
        sandbox,
        { filename: 'js/access.js' }
    );
    return { api, opened, messages, state };
}

test('owner receipts combine distributed collections into one receipt and remain scoped to the current unit', () => {
    const { api } = createOwnerAccess();
    const receipts = api.groupOwnerPaymentsIntoReceipts('unit-1');
    assert.equal(receipts.length, 2);

    const distributed = receipts.find(receipt => receipt.reference === 'ABC123');
    assert.ok(distributed);
    assert.equal(distributed.totalAmount, 150);
    assert.equal(distributed.payments.length, 2);
    assert.equal(distributed.payments.map(payment => payment.month).join('|'), 'أكتوبر 2026|نوفمبر 2026');

    const separate = receipts.find(receipt => receipt.reference === 'PAYMENT3');
    assert.ok(separate);
    assert.equal(separate.totalAmount, 25);
    assert.ok(receipts.every(receipt => receipt.payments.every(payment => payment.residentId === 'unit-1')));
});

test('owner portal includes receipts, monthly arrears detail and direct manager contact', () => {
    assert.match(access, /function groupOwnerPaymentsIntoReceipts\(residentId\)/);
    assert.match(access, /aria-labelledby="ownerReceiptsTitle"/);
    assert.match(access, /إيصالات السداد/);
    assert.match(access, /تفصيل الشهور المتأخرة/);
    assert.match(access, /function contactOwnerManager\(\)/);
    assert.match(access, /href="tel:\$\{esc\(managerPhoneTel\)\}"/);
    assert.match(access, /onclick="contactOwnerManager\(\)"/);
    assert.match(access, /currentUserRole !== 'owner'/);
});

test('owner can contact the building manager through the configured WhatsApp number', () => {
    const { api, opened } = createOwnerAccess();
    assert.equal(api.getOwnerManagerWhatsAppPhone(), '201012345678');
    api.contactOwnerManager();

    assert.equal(opened.length, 1);
    const url = new URL(opened[0]);
    assert.equal(url.pathname, '/201012345678');
    const message = url.searchParams.get('text');
    assert.match(message, /عمارة النور/);
    assert.match(message, /الشقة: 3/);
    assert.match(message, /أحمد/);
});

test('manager cannot use the owner-only contact action and missing manager phone is handled', () => {
    const manager = createOwnerAccess('manager');
    manager.api.contactOwnerManager();
    assert.equal(manager.opened.length, 0);

    const missingPhone = createOwnerAccess('owner', '');
    missingPhone.api.contactOwnerManager();
    assert.equal(missingPhone.opened.length, 0);
    assert.match(missingPhone.messages[0].message, /رقم مدير العمارة غير مسجل/);
});

test('owner portal feature refreshes the installed application cache', () => {
    assert.match(sw, /CACHE_NAME = 'manzil-v67'/);
});
