const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const notices = read('js/notices.js');
const html = read('index.html');

function loadNotices(extra = {}) {
    const opened = [];
    const modals = [];
    let confirmed = 0;
    const sandbox = {
        state: { buildingName: 'عمارة النور', reminderMessageTemplate: undefined },
        getCurrentMonth: () => 'نوفمبر ٢٠٢٦',
        fmtNum: n => (Number(n) || 0).toLocaleString('en-US'),
        renderReminderTemplate: (template, values) => String(template || '').replace(/\{([a-z_]+)\}/gi, (match, key) =>
            Object.prototype.hasOwnProperty.call(values, key.toLowerCase()) ? String(values[key.toLowerCase()] ?? '') : ''),
        getReminderMessageTemplate: () => 'مرحباً {name}، متأخرات {amount} ج.م ({count} شهر) عن {months}.',
        formatOverdueDuration: days => (Number(days) > 0 ? `${Number(days)} يومًا` : ''),
        requireManager: () => true,
        toast: () => {},
        esc: v => String(v ?? ''),
        document: { getElementById: () => null },
        localStorage: { getItem: () => null, setItem: () => {} },
        openModal: id => { modals.push(id); },
        window: {
            confirm: () => { confirmed += 1; return true; },
            open: url => { opened.push(url); }
        },
        ...extra
    };
    const api = vm.runInNewContext(
        `${notices}\n({ buildArrearsReminderMessage, buildArrearsReminderMessages, sendBulkArrearsReminders, sendArrearsReminderFor, openArrearsRemindersList, cleanPhone })`,
        sandbox,
        { filename: 'arrears-reminder-test.js' }
    );
    return { api, opened, modals, confirmCalls: () => confirmed };
}

function report(residents) {
    return { residents };
}

test('buildArrearsReminderMessages builds encoded wa.me links and skips residents without a phone', () => {
    const { api } = loadNotices();
    const messages = api.buildArrearsReminderMessages(report([
        {
            resident: { id: 'r1', name: 'أحمد', apartmentNumber: '١', phone: '01027767039' },
            count: 2, totalDebt: 500, daysOverdue: 45,
            unpaidMonths: [{ month: 'نوفمبر ٢٠٢٦' }, { month: 'ديسمبر ٢٠٢٦' }]
        },
        {
            resident: { id: 'r2', name: 'بلا هاتف', apartmentNumber: '٢', phone: '' },
            count: 1, totalDebt: 250, daysOverdue: 10,
            unpaidMonths: [{ month: 'نوفمبر ٢٠٢٦' }]
        }
    ]));

    assert.equal(messages.length, 1, 'resident without a phone must be skipped');
    const [message] = messages;
    assert.equal(message.residentId, 'r1');
    assert.equal(message.phone, '201027767039', 'local 0-prefixed numbers become international 20-prefixed');
    assert.match(message.url, /^https:\/\/wa\.me\/201027767039\?text=/);
    const decoded = decodeURIComponent(message.url.split('?text=')[1]);
    assert.match(decoded, /أحمد/);
    assert.match(decoded, /500/);
    assert.match(decoded, /2 شهر/);
    assert.match(decoded, /نوفمبر ٢٠٢٦، ديسمبر ٢٠٢٦/, 'unpaid months are listed together');
    assert.doesNotMatch(message.url, /\s/, 'the message must be URL-encoded');
});

test('the bulk button opens the reminders list instead of opening every WhatsApp tab at once', () => {
    const lateReport = report([
        { resident: { id: 'r1', name: 'أحمد', apartmentNumber: '١', phone: '01027767039' }, count: 1, totalDebt: 100, daysOverdue: 5, unpaidMonths: [{ month: 'نوفمبر ٢٠٢٦' }] }
    ]);
    const { api, opened, modals } = loadNotices({ buildArrearsReport: () => lateReport, getArrearsReportFilters: () => ({}) });
    api.sendBulkArrearsReminders();
    assert.deepEqual(modals, ['arrearsRemindersModal']);
    assert.equal(opened.length, 0, 'nothing is opened until the manager taps send on a row');
});

test('sendArrearsReminderFor opens one WhatsApp chat for the chosen apartment only', () => {
    const lateReport = report([
        { resident: { id: 'r1', name: 'أحمد', apartmentNumber: '١', phone: '01027767039' }, count: 1, totalDebt: 100, daysOverdue: 5, unpaidMonths: [{ month: 'نوفمبر ٢٠٢٦' }] },
        { resident: { id: 'r2', name: 'منى', apartmentNumber: '٣', phone: '01111111111' }, count: 2, totalDebt: 300, daysOverdue: 40, unpaidMonths: [{ month: 'نوفمبر ٢٠٢٦' }] }
    ]);
    const { api, opened } = loadNotices({ buildArrearsReport: () => lateReport, getArrearsReportFilters: () => ({}) });
    api.sendArrearsReminderFor('r2');
    assert.equal(opened.length, 1);
    assert.ok(opened[0].startsWith('https://wa.me/201111111111?text='));
});

test('sendArrearsReminderFor opens nothing for an apartment without a phone or arrears', () => {
    const noPhone = loadNotices({
        buildArrearsReport: () => report([
            { resident: { id: 'r1', name: 'أحمد', apartmentNumber: '١', phone: '' }, count: 1, totalDebt: 100, daysOverdue: 5, unpaidMonths: [{ month: 'نوفمبر ٢٠٢٦' }] }
        ]),
        getArrearsReportFilters: () => ({})
    });
    noPhone.api.sendArrearsReminderFor('r1');
    noPhone.api.sendArrearsReminderFor('missing');
    assert.equal(noPhone.opened.length, 0);
});

test('the reminders list reuses the editable template, marks sent rows and caps the list', () => {
    assert.match(notices, /function openArrearsRemindersList\(/);
    assert.match(notices, /getReminderMessageTemplate\(\)/);
    assert.match(notices, /renderReminderTemplate\(/);
    assert.match(notices, /requireManager\(\)/);
    assert.match(notices, /markArrearsReminderSent/);
    assert.match(notices, /ARREARS_REMINDER_PAGE_SIZE/);
    assert.doesNotMatch(notices, /items?\.forEach\(item => window\.open/, 'never open many tabs at once');
});

test('Amm Abdo understands a reminder command and opens the list without sending anything', () => {
    const assistant = read('js/assistant.js');
    assert.match(assistant, /function parseAssistantReminderCommand\(/);
    assert.match(assistant, /reminder-open-request/);
    assert.match(assistant, /openArrearsRemindersList\(/);
});

test('the arrears panel exposes a bulk WhatsApp reminder button next to the CSV export', () => {
    const panel = html.slice(html.indexOf('id="arrearsPanel"'), html.indexOf('id="auditLogPanel"'));
    assert.match(panel, /onclick="sendBulkArrearsReminders\(\)"/);
    assert.match(panel, /onclick="exportArrearsCSV\(\)"/);
});

test('Amm Abdo has a once-a-day morning brief and a "ملخص اليوم" command', () => {
    const assistant = read('js/assistant.js');
    assert.match(assistant, /function buildAssistantMorningBriefAnswer\(/);
    assert.match(assistant, /function maybeAppendAssistantMorningBrief\(/);
    assert.match(assistant, /return 'morning_brief'/);
    assert.match(assistant, /assistantMorningBriefDay === day/, 'the brief shows once per day');
    assert.match(assistant, /if \(!assistantCanWrite\(\)\) return false;/, 'manager only');
});

test('cleanPhone accepts Egyptian and international numbers and rejects junk', () => {
    const { api } = loadNotices();
    const cases = [
        ['01012345678', '201012345678'],
        ['010 1234-5678', '201012345678'],
        ['+20 101 234 5678', '201012345678'],
        ['+44 7911 123456', '447911123456'],
        ['0044 7911 123456', '447911123456'],
        ['+1 (415) 555-2671', '14155552671'],
        ['٠١٠١٢٣٤٥٦٧٨', '201012345678'],
        ['abc', ''],
        ['123', ''],
        ['+1234567890123456', ''],
        ['', '']
    ];
    for (const [input, expected] of cases) assert.equal(api.cleanPhone(input), expected, input);
});
