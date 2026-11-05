const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const state = read('js/state.js');
const crud = read('js/crud.js');
const notices = read('js/notices.js');
const render = read('js/render.js');
const access = read('js/access.js');

test('record deletions share one explicit Arabic confirmation helper', () => {
    assert.match(state, /function confirmRecordDeletion\(label\)/);
    assert.match(state, /نهائيًا من السجلات والتقارير/);
    assert.match(state, /لا يمكن التراجع عن هذا الإجراء/);
    for (const source of [crud, notices]) {
        assert.doesNotMatch(source, /confirm\('حذف /);
    }
    assert.match(crud, /confirmRecordDeletion\(`شقة \$\{r\.name\}/);
    assert.match(crud, /confirmRecordDeletion\('هذا التحصيل'\)/);
    assert.match(crud, /confirmRecordDeletion\('هذا المصروف'\)/);
    assert.match(notices, /confirmRecordDeletion\('هذا الإعلان'\)/);
});

test('deletion confirmations are reachable in the vm sandbox used by tests', () => {
    const sandbox = { confirm: () => true };
    const api = vm.runInNewContext(
        `${state}\n({ confirmRecordDeletion })`,
        sandbox,
        { filename: 'state-ux-test.js' }
    );
    assert.equal(api.confirmRecordDeletion('هذا التحصيل'), true);
});

test('financial list delete buttons expose accessible names', () => {
    assert.match(render, /deleteExpense\('\$\{e\.id\}'\)[^>]*aria-label="حذف المصروف/);
    assert.match(render, /deleteExpense\('\$\{e\.id\}'\)[^>]*aria-label="حذف المصروف \$\{esc\(e\.title\)\}"/);
    assert.match(render, /deleteNotice\('\$\{n\.id\}'\)[^>]*aria-label="حذف الإعلان"/);
    assert.match(render, /deleteIncome\('\$\{i\.id\}'\)[^>]*aria-label="حذف التحصيل/);
    assert.match(render, /deleteResident\('\$\{r\.id\}'\)[^>]*aria-label="حذف الشقة/);
});

test('owner portal notification actions keep a usable touch target', () => {
    assert.match(access, /markOwnerNotificationRead[\s\S]*?min-h-11/);
    assert.match(access, /markAllOwnerNotificationsRead[\s\S]*?min-h-11/);
});
