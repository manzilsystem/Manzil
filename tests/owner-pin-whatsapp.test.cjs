const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const accessSource = fs.readFileSync('js/access.js', 'utf8');

function runRequest(phone = '') {
    const opened = [];
    const noticeClasses = new Set(['hidden']);
    const elements = {
        authIdentifier: { value: phone },
        authPassword: { value: '654321' },
        pinRequestNotice: { classList: { remove: name => noticeClasses.delete(name) } },
    };
    const sandbox = {
        document: {
            getElementById: id => elements[id] || null,
            addEventListener() {},
        },
        window: { open: (...args) => opened.push(args) },
        updateAccessSwitchButton() {},
    };
    const requestOwnerPinOnWhatsApp = vm.runInNewContext(
        `${accessSource}\nrequestOwnerPinOnWhatsApp`,
        sandbox
    );
    requestOwnerPinOnWhatsApp();
    return { opened, noticeClasses };
}

test('login screen offers a manual WhatsApp PIN request and explains the send step', () => {
    assert.match(html, /onclick="requestOwnerPinOnWhatsApp\(\)"/);
    assert.match(html, /id="pinRequestNotice"[^>]*role="status"/);
    assert.match(html, /اضغط «إرسال» لإبلاغ مدير المبنى/);
});

test('WhatsApp request opens the configured support number with Arabic text and no secret', () => {
    const { opened, noticeClasses } = runRequest('01098765432');
    assert.equal(opened.length, 1);
    assert.equal(opened[0][1], '_blank');
    assert.equal(opened[0][2], 'noopener,noreferrer');
    const url = new URL(opened[0][0]);
    assert.equal(url.hostname, 'wa.me');
    assert.equal(url.pathname, '/201027767039');
    const message = url.searchParams.get('text');
    assert.match(message, /الرقم السري/);
    assert.match(message, /01098765432/);
    assert.doesNotMatch(message, /كلمة المرور|PIN الحالي|654321/);
    assert.equal(noticeClasses.has('hidden'), false);
});

test('WhatsApp request works if the owner has not entered a phone number', () => {
    const { opened } = runRequest('');
    const url = new URL(opened[0][0]);
    assert.equal(url.pathname, '/201027767039');
    assert.match(url.searchParams.get('text'), /أحتاج الرقم السري/);
    assert.doesNotMatch(url.searchParams.get('text'), /رقم الجوال الذي أحاول الدخول به/);
});
