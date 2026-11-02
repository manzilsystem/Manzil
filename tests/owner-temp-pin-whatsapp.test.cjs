const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const crudSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');

function runSend({ phone = '', pin = '', apartmentNumber = '' } = {}) {
    const opened = [];
    const toasts = [];
    const elements = {
        ownerTempPinPhone: { textContent: phone, dataset: { phone, apartmentNumber } },
        ownerTempPinValue: { value: pin },
    };
    const sandbox = {
        document: { getElementById: id => elements[id] || null },
        window: { open: (...args) => opened.push(args) },
        toast: (message, type) => toasts.push({ message, type }),
    };
    const sendOwnerTempPinOnWhatsApp = vm.runInNewContext(
        `${crudSource}\nsendOwnerTempPinOnWhatsApp`,
        sandbox,
        { filename: 'js/crud.js' }
    );
    sendOwnerTempPinOnWhatsApp();
    return { opened, toasts };
}

test('temporary PIN modal offers WhatsApp to the registered owner number and requires manual send', () => {
    assert.match(html, /onclick="sendOwnerTempPinOnWhatsApp\(\)"/);
    assert.match(html, /إرسال للمالك عبر واتساب/);
    assert.match(html, /راجع الرقم والرسالة ثم اضغط «إرسال»/);
});

test('WhatsApp opens to the registered number with the temporary PIN and apartment number', () => {
    const { opened, toasts } = runSend({
        phone: '+201068004792',
        pin: '256379',
        apartmentNumber: '12',
    });

    assert.equal(opened.length, 1);
    assert.equal(opened[0][1], '_blank');
    assert.equal(opened[0][2], 'noopener,noreferrer');
    const url = new URL(opened[0][0]);
    assert.equal(url.hostname, 'wa.me');
    assert.equal(url.pathname, '/201068004792');
    const message = url.searchParams.get('text');
    assert.match(message, /رمز الدخول المؤقت/);
    assert.match(message, /للشقة 12/);
    assert.match(message, /256379/);
    assert.match(message, /تغييره عند أول دخول/);
    assert.equal(toasts[0].type, 'success');
});

test('invalid phone or PIN does not open a WhatsApp message', () => {
    const { opened, toasts } = runSend({ phone: '010123', pin: '123', apartmentNumber: '12' });

    assert.equal(opened.length, 0);
    assert.equal(toasts[0].type, 'error');
});
