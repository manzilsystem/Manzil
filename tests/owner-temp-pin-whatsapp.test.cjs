const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const crudSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');

const noticesSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'notices.js'), 'utf8');
const cleanPhoneSource = noticesSource.slice(noticesSource.indexOf('function cleanPhone'), noticesSource.indexOf('function sendWhatsAppReminder'));

function runSend({ phone = '', pin = '', apartmentNumber = '', ownerName = '', buildingName = '', withCleanPhone = false } = {}) {
    const opened = [];
    const toasts = [];
    const elements = {
        ownerTempPinPhone: { textContent: phone, dataset: { phone, apartmentNumber, ownerName, buildingName } },
        ownerTempPinValue: { value: pin },
    };
    const sandbox = {
        document: { getElementById: id => elements[id] || null },
        window: { open: (...args) => opened.push(args) },
        toast: (message, type) => toasts.push({ message, type }),
    };
    const sendOwnerTempPinOnWhatsApp = vm.runInNewContext(
        `${withCleanPhone ? cleanPhoneSource : ''}\n${crudSource}\nsendOwnerTempPinOnWhatsApp`,
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
        pin: '25637901',
        apartmentNumber: '12',
        ownerName: 'محمد علي',
        buildingName: 'النور',
    });

    assert.equal(opened.length, 1);
    assert.equal(opened[0][1], '_blank');
    assert.equal(opened[0][2], 'noopener,noreferrer');
    const url = new URL(opened[0][0]);
    assert.equal(url.hostname, 'wa.me');
    assert.equal(url.pathname, '/201068004792');
    const message = url.searchParams.get('text');
    assert.match(message, /رمز الدخول المؤقت/);
    assert.match(message, /أهلًا بحضرتك أستاذ\/ة محمد علي/);
    assert.match(message, /في عمارة النور، شقة 12\./);
    assert.match(message, /25637901/);
    assert.match(message, /لا تشاركه مع أي شخص/);
    assert.match(message, /https:\/\/manzilsystem\.github\.io\/Manzil\//);
    assert.match(message, /مالك الشقة/);
    assert.match(message, /رقم الجوال المسجل/);
    assert.match(message, /رقم سري جديد من 6 أرقام/);
    assert.match(message, /إيصالات السداد/);
    assert.match(message, /إعلانات العمارة/);
    assert.equal(message.split('\n').filter(line => line.trim() === '25637901').length, 1);
    ['🏢', '🔑', '⚠️', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '💰', '🧾', '📜', '🔔', '📢', '📞'].forEach(emoji => {
        assert.ok(message.includes(emoji), `message must contain ${emoji}`);
    });
    assert.doesNotMatch(message, /^\d\) /m);
    assert.doesNotMatch(message, /^- /m);
    // Each numbered step sits in its own paragraph.
    assert.match(message, /1️⃣ [^\n]+\n\n2️⃣ [^\n]+\n\n3️⃣ [^\n]+\n\n4️⃣ [^\n]+\n\n5️⃣ /);
    assert.equal(toasts[0].type, 'success');
});

test('invalid phone or PIN does not open a WhatsApp message', () => {
    const { opened, toasts } = runSend({ phone: '010123', pin: '123', apartmentNumber: '12' });

    assert.equal(opened.length, 0);
    assert.equal(toasts[0].type, 'error');
});

test('a six-digit PIN is not treated as a newly issued temporary PIN', () => {
    const { opened, toasts } = runSend({ phone: '+201068004792', pin: '256379', apartmentNumber: '12' });

    assert.equal(opened.length, 0);
    assert.equal(toasts[0].type, 'error');
});

test('greeting and place fall back gracefully when the name or building name is missing', () => {
    const text = options => new URL(runSend({ phone: '+201068004792', pin: '25637901', ...options }).opened[0][0]).searchParams.get('text');

    const noName = text({ apartmentNumber: '12', buildingName: 'النور' });
    assert.match(noName, /^🏢 أهلًا بحضرتك 👋\n/);
    assert.doesNotMatch(noName, /أستاذ/);
    assert.match(noName, /في عمارة النور، شقة 12\./);

    const noBuilding = text({ apartmentNumber: '12', ownerName: 'سارة' });
    assert.match(noBuilding, /أستاذ\/ة سارة/);
    assert.match(noBuilding, /\(Manzil\) في شقة 12\./);
    assert.doesNotMatch(noBuilding, /في عمارة/);

    const bare = text({});
    assert.match(bare, /\(Manzil\)\.\n/);
});

test('WhatsApp link normalizes a stored Egyptian 01 number to 20 and keeps international numbers', () => {
    const egypt = runSend({ phone: '010 6800-4792', pin: '25637901', apartmentNumber: '12', withCleanPhone: true });
    assert.equal(new URL(egypt.opened[0][0]).pathname, '/201068004792');
    const uk = runSend({ phone: '+44 7911 123456', pin: '25637901', apartmentNumber: '12', withCleanPhone: true });
    assert.equal(new URL(uk.opened[0][0]).pathname, '/447911123456');
});
