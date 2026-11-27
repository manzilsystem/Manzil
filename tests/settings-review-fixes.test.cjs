const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const settings = read('js', 'settings.js');
const stateSrc = read('js', 'state.js');
const crud = read('js', 'crud.js');
const modals = read('src', 'partials', 'modals.html');

test('success toasts are never swallowed by the duplicate guard', () => {
    const start = stateSrc.indexOf('const recentToasts');
    const end = stateSrc.indexOf('function confirmRecordDeletion');
    const shown = [];
    const sandbox = {
        Date: { now: () => 1000 }, Map, setTimeout: () => 0,
        document: { createElement: () => ({ style: {}, remove() {} }), getElementById: () => ({ appendChild: el => shown.push(el.textContent) }) }
    };
    const toast = vm.runInNewContext(stateSrc.slice(start, end) + '\ntoast', sandbox);
    toast('saved', 'success'); toast('saved', 'success');
    assert.equal(shown.length, 2);
    toast('bad', 'error'); toast('bad', 'error');
    assert.equal(shown.length, 3);
});

test('owner access panel re-renders after provisioning and when opening the account tab', () => {
    assert.match(crud, /renderAll\(\);\s*if \(typeof renderSettingsOwnerAccess === 'function'\) renderSettingsOwnerAccess\(\);/);
    assert.match(settings, /if \(tab === 'account'\) renderSettingsOwnerAccess\(\);/);
});

test('restore-default buttons clear the textarea so null is saved', () => {
    assert.match(settings, /function resetReceiptTemplate\(\) \{[\s\S]*?input\.value = '';/);
    assert.match(settings, /function resetReminderTemplate\(\) \{[\s\S]*?input\.value = '';/);
});

test('reminder chips include {days} and the reminder strings use formal Arabic', () => {
    assert.match(modals, /insertReminderVariable\('\{days\}'\)/);
    assert.doesNotMatch(modals, /بيفتح قايمة|مفيش أي رسالة بتتبعت/);
    assert.doesNotMatch(settings, /لازم يكون رقم صحيح/);
});
