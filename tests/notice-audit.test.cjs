const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');

function loadDeleteNotice() {
    const sandbox = {
        state: {
            notices: [{ id: 'notice-1', text: 'إعلان الصيانة' }],
            auditLogs: [],
        },
        requireManager: () => true,
        confirm: () => true,
        cloneStateSnapshot: () => JSON.parse(JSON.stringify(sandbox.state)),
        saveWithRollback: async () => true,
        renderNotices() {},
        toast() {},
        logAction(action, details) { sandbox.state.auditLogs.push({ action, details }); },
    };
    const app = vm.runInNewContext(`${source}\n({ deleteNotice })`, sandbox, {
        filename: 'js/crud.js',
    });
    return { app, sandbox };
}

test('deleting a notice records the deletion in the audit log', async () => {
    const { app, sandbox } = loadDeleteNotice();

    await app.deleteNotice('notice-1');

    assert.deepEqual(sandbox.state.notices, []);
    assert.deepEqual(sandbox.state.auditLogs, [{ action: 'حذف إعلان', details: 'إعلان الصيانة' }]);
});
