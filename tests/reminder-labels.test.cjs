const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/notices.js'), 'utf8');

test('late apartments count reads like speech', () => {
    const sandbox = { fmtNum: n => String(n) };
    const api = vm.runInNewContext(`${source}\n({ arrearsLateApartmentsLabel })`, sandbox);
    assert.equal(api.arrearsLateApartmentsLabel(1), 'شقة متأخرة');
    assert.equal(api.arrearsLateApartmentsLabel(2), 'شقتين متأخرتين');
    assert.equal(api.arrearsLateApartmentsLabel(3), '3 شقق متأخرة');
    assert.equal(api.arrearsLateApartmentsLabel(10), '10 شقق متأخرة');
    assert.equal(api.arrearsLateApartmentsLabel(11), '11 شقة متأخرة');
});

test('dashboard reminders card counts every late apartment and calls out missing phones', () => {
    const body = source.slice(source.indexOf('function renderDashboardRemindersCard'), source.indexOf('function toggleArrearsReminderPreview'));
    assert.match(body, /everyone\.length/);
    assert.match(body, /بلا رقم هاتف/);
});
