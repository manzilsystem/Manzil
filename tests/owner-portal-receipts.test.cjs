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
    const printDocument = { html: '', open() {}, write(value) { this.html += value; }, close() {} };
    const printWindow = {
        document: printDocument,
        focus() { this.focused = true; },
        print() { this.printed = true; },
        close() { this.closed = true; },
        opener: {}
    };
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
        esc: value => String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]),
        document: { addEventListener() {} },
        updateAccessSwitchButton() {},
        toast: (message, type) => messages.push({ message, type }),
        window: { open: url => { opened.push(url); return printWindow; } },
        setTimeout: callback => { callback(); return 0; },
        fmtNum: value => String(value ?? 0),
        formatDate: () => '04/11/2026',
        getIncomePaymentMethodLabel: method => method === 'instapay' ? 'InstaPay' : 'نقدًا',
        getReceiptThankYouMessage: () => 'شكراً لالتزامكم.',
        encodeURIComponent
    };
    const api = vm.runInNewContext(
        access + String.fromCharCode(10) + '({ groupOwnerPaymentsIntoReceipts, getOwnerManagerWhatsAppPhone, contactOwnerManager, printOwnerReceipt })',
        sandbox,
        { filename: 'js/access.js' }
    );
    return { api, opened, messages, state, printDocument, printWindow };
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
    assert.match(message, /الشقة: شقة 3/);
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


test('owner can print a unit-scoped receipt with all distributed months and save it as PDF', () => {
    const { api, opened, printDocument, printWindow } = createOwnerAccess();
    const receipt = api.groupOwnerPaymentsIntoReceipts('unit-1').find(item => item.reference === 'ABC123');
    api.printOwnerReceipt(receipt.id);

    assert.equal(opened[0], '');
    assert.match(printDocument.html, /إيصال استلام/);
    assert.match(printDocument.html, /عمارة النور/);
    assert.match(printDocument.html, /أحمد/);
    assert.match(printDocument.html, /الشقة<\/div><div class="value">شقة 3/);
    assert.match(printDocument.html, /أكتوبر 2026/);
    assert.match(printDocument.html, /نوفمبر 2026/);
    assert.match(printDocument.html, /المبلغ المستلم/);
    assert.match(printDocument.html, /150 ج.م/);
    assert.match(printDocument.html, /window\.print\(\)/);
    assert.doesNotMatch(printDocument.html, /999/);
    assert.equal(printWindow.opener, null);
    assert.equal(printWindow.focused, true);
    assert.equal(printWindow.printed, true);
});

test('printing owner receipts is unavailable to the manager role', () => {
    const { api, opened } = createOwnerAccess('manager');
    api.printOwnerReceipt('any-receipt');
    assert.equal(opened.length, 0);
});

test('owner portal feature refreshes the installed application cache', () => {
    assert.match(sw, /CACHE_NAME = 'manzil-v145'/);
});
