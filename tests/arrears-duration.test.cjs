const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'UTC';
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');
const fixedNow = new Date('2024-05-15T12:00:00.000Z');
class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow.getTime(); }
}
function load() {
    return vm.runInNewContext(
        `${source}\n({ state, getSubscriptionOverdueDays, formatOverdueDuration, calculateCumulativeDebt, buildArrearsReport })`,
        { Date: FixedDate },
        { filename: 'js/state.js' }
    );
}

// The plan pins overdue days to the month label plus the due day plus the grace
// period, never to the payment date, so every screen shows one identical figure.
test('overdue days count from the month label, the due day and the grace period', () => {
    const app = load();
    assert.equal(app.getSubscriptionOverdueDays('مايو 2024', new Date('2024-05-01T23:00:00.000Z')), 0);
    assert.equal(app.getSubscriptionOverdueDays('مايو 2024', new Date('2024-05-02T00:00:00.000Z')), 1);
    assert.equal(app.getSubscriptionOverdueDays('مايو 2024', new Date('2024-05-15T12:00:00.000Z')), 14);
    assert.equal(app.getSubscriptionOverdueDays('فبراير 2024', new Date('2024-05-15T12:00:00.000Z')), 104);
});

test('grace days push the overdue deadline back without changing the amount', () => {
    const app = load();
    app.state.subscriptionGraceDays = 5;
    assert.equal(app.getSubscriptionOverdueDays('مايو 2024', new Date('2024-05-06T12:00:00.000Z')), 0);
    assert.equal(app.getSubscriptionOverdueDays('مايو 2024', new Date('2024-05-07T00:00:00.000Z')), 1);
});

test('unknown month labels never report an overdue duration', () => {
    const app = load();
    assert.equal(app.getSubscriptionOverdueDays('', fixedNow), 0);
    assert.equal(app.getSubscriptionOverdueDays('ليس شهرًا', fixedNow), 0);
});

test('formatOverdueDuration uses natural Arabic number forms', () => {
    const app = load();
    assert.equal(app.formatOverdueDuration(0), '');
    assert.equal(app.formatOverdueDuration(''), '');
    assert.equal(app.formatOverdueDuration(-3), '');
    assert.equal(app.formatOverdueDuration(1), 'يوم واحد');
    assert.equal(app.formatOverdueDuration(2), 'يومان');
    assert.equal(app.formatOverdueDuration(5), '5 أيام');
    assert.equal(app.formatOverdueDuration(14), '14 يومًا');
});

test('arrears reports expose the exact overdue duration per month and resident', () => {
    const app = load();
    app.state.residents = [{ id: 'r1', createdAt: '2024-01-01T00:00:00.000Z', monthlyAmount: 100 }];
    app.state.income = [];
    const report = app.buildArrearsReport();
    assert.equal(report.residents.length, 1);
    const resident = report.residents[0];
    assert.ok(resident.unpaidMonths.length > 1);
    resident.unpaidMonths.forEach(month => {
        assert.equal(month.daysOverdue, app.getSubscriptionOverdueDays(month.month));
    });
    assert.equal(resident.daysOverdue, app.getSubscriptionOverdueDays('يناير 2024'));
    assert.equal(resident.daysOverdue, Math.max(...resident.unpaidMonths.map(month => month.daysOverdue)));
});

test('a fully settled resident reports zero overdue days', () => {
    const app = load();
    app.state.residents = [{ id: 'r1', createdAt: '2024-01-01T00:00:00.000Z', monthlyAmount: 100 }];
    app.state.income = ['يناير 2024', 'فبراير 2024', 'مارس 2024', 'أبريل 2024', 'مايو 2024']
        .map((month, index) => ({ id: `i${index}`, residentId: 'r1', month, amount: 100 }));
    const debt = app.calculateCumulativeDebt('r1');
    assert.equal(debt.count, 0);
    assert.equal(debt.daysOverdue, 0);
    assert.equal(debt.oldestMonth, null);
});

test('the reminder modal exposes the {duration} variable and passes the overdue days', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const notices = fs.readFileSync(path.join(__dirname, '..', 'js', 'notices.js'), 'utf8');
    assert.ok(html.includes("insertReminderVariable('{duration}')"));
    assert.ok(html.includes('<code>{duration}</code>'));
    assert.match(notices, /formatOverdueDuration\(debt\.daysOverdue\)/);
});
