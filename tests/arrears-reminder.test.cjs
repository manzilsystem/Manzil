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
        window: {
            confirm: () => { confirmed += 1; return true; },
            open: url => { opened.push(url); }
        },
        ...extra
    };
    const api = vm.runInNewContext(
        `${notices}\n({ buildArrearsReminderMessage, buildArrearsReminderMessages, sendBulkArrearsReminders, cleanPhone })`,
        sandbox,
        { filename: 'arrears-reminder-test.js' }
    );
    return { api, opened, confirmCalls: () => confirmed };
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

test('sendBulkArrearsReminders confirms once then opens one WhatsApp tab per late resident', () => {
    const lateReport = report([
        { resident: { id: 'r1', name: 'أحمد', apartmentNumber: '١', phone: '01027767039' }, count: 1, totalDebt: 100, daysOverdue: 5, unpaidMonths: [{ month: 'نوفمبر ٢٠٢٦' }] },
        { resident: { id: 'r2', name: 'منى', apartmentNumber: '٣', phone: '01111111111' }, count: 2, totalDebt: 300, daysOverdue: 40, unpaidMonths: [{ month: 'نوفمبر ٢٠٢٦' }, { month: 'ديسمبر ٢٠٢٦' }] },
        { resident: { id: 'r3', name: 'بلا هاتف', apartmentNumber: '٤', phone: '' }, count: 1, totalDebt: 90, daysOverdue: 2, unpaidMonths: [{ month: 'نوفمبر ٢٠٢٦' }] }
    ]);
    const { api, opened, confirmCalls } = loadNotices({
        buildArrearsReport: () => lateReport,
        getArrearsReportFilters: () => ({})
    });

    api.sendBulkArrearsReminders();

    assert.equal(confirmCalls(), 1, 'the bulk send must ask for confirmation exactly once');
    assert.equal(opened.length, 2, 'only residents with a phone get a WhatsApp tab');
    assert.ok(opened.every(url => url.startsWith('https://wa.me/')), 'every opened tab is a wa.me link');
});

test('sendBulkArrearsReminders opens nothing when there are no late residents or no phones', () => {
    const empty = loadNotices({ buildArrearsReport: () => report([]), getArrearsReportFilters: () => ({}) });
    empty.api.sendBulkArrearsReminders();
    assert.equal(empty.opened.length, 0);
    assert.equal(empty.confirmCalls(), 0, 'no confirmation is asked when there is nothing to send');

    const noPhones = loadNotices({
        buildArrearsReport: () => report([
            { resident: { id: 'r1', name: 'أحمد', apartmentNumber: '١', phone: '' }, count: 1, totalDebt: 100, daysOverdue: 5, unpaidMonths: [{ month: 'نوفمبر ٢٠٢٦' }] }
        ]),
        getArrearsReportFilters: () => ({})
    });
    noPhones.api.sendBulkArrearsReminders();
    assert.equal(noPhones.opened.length, 0);
    assert.equal(noPhones.confirmCalls(), 0);
});

test('the bulk reminder reuses the editable reminder template', () => {
    assert.match(notices, /function sendBulkArrearsReminders\(\)/);
    assert.match(notices, /getReminderMessageTemplate\(\)/);
    assert.match(notices, /renderReminderTemplate\(/);
    assert.match(notices, /window\.confirm\(/);
    assert.match(notices, /requireManager\(\)/);
});

test('the arrears panel exposes a bulk WhatsApp reminder button next to the CSV export', () => {
    const panel = html.slice(html.indexOf('id="arrearsPanel"'), html.indexOf('id="auditLogPanel"'));
    assert.match(panel, /onclick="sendBulkArrearsReminders\(\)"/);
    assert.match(panel, /onclick="exportArrearsCSV\(\)"/);
});
