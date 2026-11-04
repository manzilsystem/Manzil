const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const stateSource = read('js/state.js');
const settingsSource = stateSource + '\n' + read('js/settings.js');
const noticesSource = read('js/notices.js');

function makeStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
}

test('reminder template defaults safely and is isolated per building', () => {
    const storage = makeStorage();
    const sandbox = { activeBuildingId: 'building-a', localStorage: storage };
    const api = vm.runInNewContext(stateSource + '\n({ getReminderTemplateKey, getReminderMessageTemplate, DEFAULT_REMINDER_TEMPLATE })', sandbox);
    assert.equal(api.getReminderMessageTemplate(), api.DEFAULT_REMINDER_TEMPLATE);
    storage.setItem('manzil:building-a:arrears-reminder-template', 'رسالة {name}');
    assert.equal(api.getReminderMessageTemplate(), 'رسالة {name}');
    sandbox.activeBuildingId = 'building-b';
    assert.equal(api.getReminderMessageTemplate(), api.DEFAULT_REMINDER_TEMPLATE);
    sandbox.activeBuildingId = 'building-a';
    storage.setItem('manzil:building-a:arrears-reminder-template', '   ');
    assert.equal(api.getReminderMessageTemplate(), api.DEFAULT_REMINDER_TEMPLATE);
});

test('reminder placeholders are replaced and unknown placeholders are removed', () => {
    const api = vm.runInNewContext(stateSource + '\n({ renderReminderTemplate })', {});
    const message = api.renderReminderTemplate(
        'مرحباً {name}، {amount} جنيه، {months}، {unknown}',
        { name: 'أحمد', amount: '900', months: 'أكتوبر، نوفمبر' }
    );
    assert.equal(message, 'مرحباً أحمد، 900 جنيه، أكتوبر، نوفمبر، ');
});

test('settings preview uses sample values and does not open WhatsApp', () => {
    const elements = {
        settingsReminderTemplate: { value: 'أهلاً {name}، متأخراتكم {amount} ج.م في {months}' },
        settingsReminderPreview: { textContent: '' }
    };
    let opened = false;
    const sandbox = {
        localStorage: makeStorage(),
        document: { getElementById: id => elements[id] || null },
        window: { open: () => { opened = true; } }
    };
    const api = vm.runInNewContext(settingsSource + '\nstate.buildingName = "عمارة النور";\n({ renderReminderPreview })', sandbox);
    api.renderReminderPreview();
    assert.match(elements.settingsReminderPreview.textContent, /أهلاً أحمد/);
    assert.match(elements.settingsReminderPreview.textContent, /1,250 ج.م/);
    assert.match(elements.settingsReminderPreview.textContent, /سبتمبر 2026/);
    assert.equal(opened, false);
});

test('WhatsApp reminder uses the custom template and actual arrears values', () => {
    const opened = [];
    const messages = [];
    const sandbox = {
        state: {
            buildingName: 'عمارة النور',
            residents: [{ id: 'resident-1', name: 'أحمد', apartmentNumber: '12', phone: '01012345678' }]
        },
        requireManager: () => true,
        calculateCumulativeDebt: () => ({
            count: 2, totalDebt: 900, unpaidMonths: ['أكتوبر 2026', 'نوفمبر 2026']
        }),
        cleanPhone: () => '201012345678',
        getReminderMessageTemplate: () => 'مرحباً {name}، الشقة {apartment}، المتأخرات {amount} ({count}) في {months}',
        renderReminderTemplate: (template, values) => template.replace(/\{([a-z_]+)\}/gi, (match, key) =>
            Object.prototype.hasOwnProperty.call(values, key.toLowerCase()) ? String(values[key.toLowerCase()]) : ''
        ),
        fmtNum: value => String(value),
        getCurrentMonth: () => 'نوفمبر 2026',
        window: { open: url => opened.push(url) },
        toast: (message, type) => messages.push({ message, type })
    };
    const api = vm.runInNewContext(noticesSource + '\n({ sendWhatsAppReminder })', sandbox);
    api.sendWhatsAppReminder('resident-1');
    assert.equal(opened.length, 1);
    const url = new URL(opened[0]);
    assert.equal(url.pathname, '/201012345678');
    const message = url.searchParams.get('text');
    assert.match(message, /مرحباً أحمد/);
    assert.match(message, /الشقة 12/);
    assert.match(message, /المتأخرات 900 \(2\)/);
    assert.match(message, /أكتوبر 2026، نوفمبر 2026/);
    assert.equal(messages.length, 0);
});

test('reminder is not opened for a resident without outstanding debt', () => {
    const opened = [];
    const messages = [];
    const sandbox = {
        state: { residents: [{ id: 'resident-1', name: 'أحمد', phone: '01012345678' }] },
        requireManager: () => true,
        calculateCumulativeDebt: () => ({ count: 0, totalDebt: 0, unpaidMonths: [] }),
        toast: (message, type) => messages.push({ message, type })
    };
    const api = vm.runInNewContext(noticesSource + '\n({ sendWhatsAppReminder })', sandbox);
    api.sendWhatsAppReminder('resident-1');
    assert.equal(opened.length, 0);
    assert.match(messages[0].message, /لا توجد متأخرات/);
});


test('reminder template character counter updates live and warns near the limit', () => {
    const elements = {
        settingsReminderTemplate: { value: 'رسالة تجريبية' },
        settingsReminderCharacterCount: { textContent: '', classList: { toggle() {} } },
        settingsReminderPreview: { textContent: '' }
    };
    const api = vm.runInNewContext(settingsSource + '\\nstate.buildingName = "عمارة النور";\\n({ renderReminderPreview })', {
        document: { getElementById: id => elements[id] || null }
    });
    api.renderReminderPreview();
    assert.equal(elements.settingsReminderCharacterCount.textContent, '13 / 500 حرف');
    elements.settingsReminderTemplate.value = 'أ'.repeat(450);
    let nearLimit = false;
    elements.settingsReminderCharacterCount.classList.toggle = (name, enabled) => {
        if (name === 'is-near-limit') nearLimit = enabled;
    };
    api.renderReminderPreview();
    assert.equal(elements.settingsReminderCharacterCount.textContent, '450 / 500 حرف');
    assert.equal(nearLimit, true);
});
