const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const access = read('js/access.js');

function loadApi() {
    const sandbox = {
        fmtNum: value => String(value ?? 0),
        getIncomePurposeLabel: () => 'اشتراك شهري',
        document: { addEventListener() {} }
    };
    return vm.runInNewContext(
        access + String.fromCharCode(10) + '({ ownerCountLabel, ownerReceiptMonthsLabel })',
        sandbox,
        { filename: 'js/access.js' }
    );
}

test('owner count wording follows Arabic number agreement', () => {
    const { ownerCountLabel } = loadApi();
    const receipts = { zero: 'لا توجد إيصالات بعد', one: 'إيصال واحد مسجل لحساب شقتك', two: 'إيصالان مسجلان لحساب شقتك', few: 'إيصالات مسجلة لحساب شقتك', many: 'إيصال مسجل لحساب شقتك' };
    assert.equal(ownerCountLabel(0, receipts), 'لا توجد إيصالات بعد');
    assert.equal(ownerCountLabel(1, receipts), 'إيصال واحد مسجل لحساب شقتك');
    assert.equal(ownerCountLabel(2, receipts), 'إيصالان مسجلان لحساب شقتك');
    assert.equal(ownerCountLabel(3, receipts), '3 إيصالات مسجلة لحساب شقتك');
    assert.equal(ownerCountLabel(10, receipts), '10 إيصالات مسجلة لحساب شقتك');
    assert.equal(ownerCountLabel(21, receipts), '21 إيصال مسجل لحساب شقتك');
});

test('owner arrears count wording covers dual, plural and tanwin forms', () => {
    const { ownerCountLabel } = loadApi();
    const months = { one: 'شهر واحد', two: 'شهران', few: 'شهور', many: 'شهرًا' };
    assert.equal(ownerCountLabel(0, months), '');
    assert.equal(ownerCountLabel(1, months), 'شهر واحد');
    assert.equal(ownerCountLabel(2, months), 'شهران');
    assert.equal(ownerCountLabel(5, months), '5 شهور');
    assert.equal(ownerCountLabel(23, months), '23 شهرًا');
});

test('owner unread-notification wording uses the dual form and an all-read state', () => {
    assert.match(access, /two: 'إشعاران غير مقروءان'/);
    assert.match(access, /zero: ownerNotifications\.length \? 'كل الإشعارات مقروءة' : 'لا توجد إشعارات بعد'/);
    assert.match(access, /few: 'إشعارات غير مقروءة'/);
    assert.doesNotMatch(access, /\$\{unreadNotifications\.length\} إشعار غير مقروء/);
});

test('a receipt covering several months reads "عن شهور"', () => {
    const { ownerReceiptMonthsLabel } = loadApi();
    const receipt = { payments: [{ month: 'سبتمبر 2026' }, { month: 'أكتوبر 2026' }] };
    assert.match(ownerReceiptMonthsLabel(receipt), /^عن شهور سبتمبر 2026، أكتوبر 2026$/);
    assert.match(ownerReceiptMonthsLabel({ payments: [{ month: 'سبتمبر 2026' }] }), /^عن شهر سبتمبر 2026$/);
});
