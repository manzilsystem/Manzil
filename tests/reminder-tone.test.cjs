const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const stateSource = read('js/state.js');
const noticesSource = read('js/notices.js');

function makeStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
}

function loadState(storage = makeStorage(), id = 'building-a') {
    const sandbox = { activeBuildingId: id, localStorage: storage };
    const api = vm.runInNewContext(stateSource + '\n({ REMINDER_TONES, DEFAULT_REMINDER_TEMPLATE, getReminderTone, setReminderTone, getReminderMessageTemplate, getDefaultReminderTemplate, renderReminderTemplate })', sandbox);
    return { api, sandbox, storage };
}

const VALUES = { name: 'أحمد', building: 'عمارة النور', amount: '1,250', count: 3, months: 'سبتمبر، أكتوبر، نوفمبر' };

test('the default tone is the old formal text, so nothing changes until a tone is picked', () => {
    const { api } = loadState();
    assert.equal(api.getReminderTone(), 'formal');
    assert.equal(api.getReminderMessageTemplate(), api.DEFAULT_REMINDER_TEMPLATE);
});

test('gentle, formal and firm are three different Egyptian messages with every number filled', () => {
    const { api } = loadState();
    const rendered = {};
    for (const tone of ['gentle', 'formal', 'firm']) {
        assert.ok(api.setReminderTone(tone), tone);
        assert.equal(api.getReminderTone(), tone);
        rendered[tone] = api.renderReminderTemplate(api.getReminderMessageTemplate(), VALUES);
        assert.match(rendered[tone], /أحمد/);
        assert.match(rendered[tone], /1,250/);
        assert.match(rendered[tone], /3/);
        assert.match(rendered[tone], /سبتمبر، أكتوبر، نوفمبر/);
        assert.doesNotMatch(rendered[tone], /\{[a-z]+\}/i, 'no placeholder is left behind');
        assert.ok(rendered[tone].length <= 500, 'fits a WhatsApp preview');
    }
    assert.equal(new Set(Object.values(rendered)).size, 3);
    assert.match(rendered.gentle, /تسلم على ذوقك/);
    assert.match(rendered.firm, /لازم يتسدد/);
    assert.equal(api.REMINDER_TONES.gentle.label, 'لطيف');
    assert.equal(api.REMINDER_TONES.formal.label, 'رسمي');
    assert.equal(api.REMINDER_TONES.firm.label, 'حازم');
});

test('a custom message from Settings always wins over the tone', () => {
    const { api, storage } = loadState();
    api.setReminderTone('firm');
    storage.setItem('manzil:building-a:arrears-reminder-template', 'رسالتي {name}');
    assert.equal(api.getReminderMessageTemplate(), 'رسالتي {name}');
});

test('the tone is remembered per building and bad values fall back safely', () => {
    const { api, sandbox, storage } = loadState();
    api.setReminderTone('gentle');
    sandbox.activeBuildingId = 'building-b';
    assert.equal(api.getReminderTone(), 'formal');
    sandbox.activeBuildingId = 'building-a';
    assert.equal(api.getReminderTone(), 'gentle');
    assert.equal(api.setReminderTone('angry'), false);
    storage.setItem('manzil:building-a:arrears-reminder-tone', 'angry');
    assert.equal(api.getReminderTone(), 'formal');
});

test('the reminders modal has a tone picker that is disabled by a custom message', () => {
    const html = read('index.html');
    assert.match(html, /id="arrearsReminderTone"/);
    assert.match(noticesSource, /role="radiogroup" aria-label="نبرة الرسالة"/);
    assert.match(noticesSource, /data-reminder-tone=/);
    assert.match(noticesSource, /امسحها عشان تختار نبرة/);
});
