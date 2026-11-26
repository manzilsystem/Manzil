const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const noticesSource = read('js/notices.js');

const NOW = new Date('2026-11-20T10:00:00.000Z');

function load(sent = {}, income = []) {
    const store = { 'manzil:default:arrears-reminders-sent': JSON.stringify(sent) };
    const sandbox = {
        state: { buildingName: 'عمارة النور', income },
        localStorage: { getItem: key => (key in store ? store[key] : null), setItem: (key, value) => { store[key] = value; } },
        getCurrentMonth: () => 'نوفمبر 2026',
        fmtNum: n => (Number(n) || 0).toLocaleString('en-US'),
        renderReminderTemplate: (template, values) => String(template).replace(/\{([a-z_]+)\}/gi, (m, key) => String(values[key.toLowerCase()] ?? '')),
        getReminderMessageTemplate: () => 'مرحباً {name}، متأخرات {amount} ج.م.',
        esc: v => String(v ?? ''),
        requireManager: () => true,
        toast: () => {},
        document: { getElementById: () => null },
        window: { open: () => {} }
    };
    const api = vm.runInNewContext(`${noticesSource}\n({ getArrearsReminderStatus, getArrearsFollowUps, arrearsReminderDaysLabel, buildArrearsReminderMessage, markArrearsReminderSent, readArrearsReminderSent })`, sandbox);
    return { api, store };
}

const item = (id, debt = 300) => ({ resident: { id, name: 'م ' + id, apartmentNumber: '1', phone: '01010000000' }, totalDebt: debt, count: 2, unpaidMonths: [{ month: 'نوفمبر 2026' }] });

test('a reminder is waiting for 2 days, then needs a follow-up when nothing was paid', () => {
    const { api } = load({ never: '', today: '2026-11-20', two: '2026-11-18', three: '2026-11-17', ten: '2026-11-10' });
    assert.equal(api.getArrearsReminderStatus('nobody', NOW).kind, 'none');
    assert.equal(api.getArrearsReminderStatus('today', NOW).kind, 'waiting');
    assert.equal(api.getArrearsReminderStatus('two', NOW).kind, 'waiting');
    const three = api.getArrearsReminderStatus('three', NOW);
    assert.equal(three.kind, 'followup');
    assert.equal(three.days, 3);
    assert.equal(api.getArrearsReminderStatus('ten', NOW).days, 10);
});

test('a payment after the reminder moves the apartment to partial, an earlier one does not', () => {
    const income = [
        { id: 'a', residentId: 'late', date: '2026-11-15T09:00:00.000Z', amount: 50 },
        { id: 'b', residentId: 'paid', date: '2026-11-16T09:00:00.000Z', amount: 50 },
        { id: 'c', residentId: 'sameday', date: '2026-11-12T09:00:00.000Z', amount: 50 }
    ];
    const { api } = load({ late: '2026-11-12', paid: '2026-11-12', sameday: '2026-11-12' }, income);
    assert.equal(api.getArrearsReminderStatus('paid', NOW).kind, 'partial');
    assert.equal(api.getArrearsReminderStatus('late', NOW).kind, 'partial');
    assert.equal(api.getArrearsReminderStatus('sameday', NOW).kind, 'followup', 'a payment on the reminder day itself is not counted as after it');
});

test('follow-ups list only the right apartments, longest wait first', () => {
    const { api } = load({ r1: '2026-11-10', r2: '2026-11-19', r3: '2026-11-15' });
    const list = api.getArrearsFollowUps({ residents: [item('r1'), item('r2'), item('r3'), item('r4')] }, NOW);
    assert.deepEqual(Array.from(list, entry => entry.item.resident.id), ['r1', 'r3']);
});

test('days read like Egyptian speech', () => {
    const { api } = load();
    assert.equal(api.arrearsReminderDaysLabel(0), 'النهارده');
    assert.equal(api.arrearsReminderDaysLabel(1), 'من يوم');
    assert.equal(api.arrearsReminderDaysLabel(2), 'من يومين');
    assert.equal(api.arrearsReminderDaysLabel(5), 'من 5 أيام');
});

test('the message for a follow-up starts with a second-reminder line, a first reminder does not', () => {
    const today = new Date().toISOString().slice(0, 10);
    const old = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    const { api } = load({ late: old, fresh: today });
    const second = api.buildArrearsReminderMessage(item('late'));
    assert.match(second.message, /^تذكير تاني بعد رسالتنا من 5 أيام\./);
    assert.equal(second.followUp, true);
    assert.match(decodeURIComponent(second.url), /تذكير تاني/);
    const first = api.buildArrearsReminderMessage(item('fresh'));
    assert.equal(first.followUp, false);
    assert.doesNotMatch(first.message, /تذكير تاني/);
    const never = api.buildArrearsReminderMessage(item('new'));
    assert.doesNotMatch(never.message, /تذكير تاني/);
});

test('reminders list wires the filter chips and the follow-up button', () => {
    const html = read('index.html');
    assert.match(html, /id="arrearsReminderFilters"/);
    assert.match(noticesSource, /data-reminder-filter=/);
    assert.match(noticesSource, /تذكير تاني/);
    assert.match(noticesSource, /ولسه ما دفعش/);
    assert.match(noticesSource, /محتاجين متابعة/);
});
