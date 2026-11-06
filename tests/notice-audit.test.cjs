const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'notices.js'), 'utf8');
const crudSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

function loadDeleteNotice() {
    const sandbox = {
        state: {
            notices: [{ id: 'notice-1', text: 'إعلان الصيانة' }],
            auditLogs: [],
        },
        requireManager: () => true,
        confirmRecordDeletion: () => true,
        cloneStateSnapshot: () => JSON.parse(JSON.stringify(sandbox.state)),
        saveWithRollback: async () => true,
        renderNotices() {},
        toast() {},
        logAction(action, details) { sandbox.state.auditLogs.push({ action, details }); },
    };
    const app = vm.runInNewContext(`${source}\n({ deleteNotice })`, sandbox, {
        filename: 'js/notices.js',
    });
    return { app, sandbox };
}

test('deleting a notice records the deletion in the audit log', async () => {
    const { app, sandbox } = loadDeleteNotice();

    await app.deleteNotice('notice-1');

    assert.deepEqual(sandbox.state.notices, []);
    assert.deepEqual(sandbox.state.auditLogs, [{ action: 'حذف إعلان', details: 'إعلان الصيانة' }]);
});


test('notice and WhatsApp handlers are loaded as a dedicated cached module', () => {
    for (const name of ['openNoticeModal', 'applyNoticeTemplate', 'handleNoticeSubmit', 'deleteNotice', 'shareNoticeToWhatsApp', 'copyNoticeToClipboard', 'cleanPhone', 'sendWhatsAppReminder', 'sendIncomeReceiptOnWhatsApp']) {
        assert.ok(source.includes('function ' + name + '(') || source.includes('async function ' + name + '('), name + ' must be in notices.js');
        assert.ok(!crudSource.includes('function ' + name + '(') && !crudSource.includes('async function ' + name + '('), name + ' must be removed from crud.js');
    }
    assert.ok(html.indexOf('js/crud.js') < html.indexOf('js/notices.js'));
    assert.ok(sw.includes("CACHE_NAME = 'manzil-v124'"));
    assert.ok(sw.includes("'./js/notices.js'"));
});
