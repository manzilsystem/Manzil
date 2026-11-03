const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const backupUi = fs.readFileSync(path.join(__dirname, '..', 'js/backup.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('cached backup console data never enables backup or restore actions', () => {
    assert.match(backupUi, /restoreButton\.disabled = cached \|\| !backups\.length \|\| restorePending \|\| backupPending/);
    assert.match(backupUi, /createButton\.disabled = cached \|\| backupPending \|\| restorePending/);
});

test('backup actions remain disabled until a fresh server response is received', () => {
    assert.match(backupUi, /if \(restoreButton\) restoreButton\.disabled = true/);
    assert.match(backupUi, /if \(createButton\) createButton\.disabled = true/);
    assert.match(backupUi, /renderBackupConsole\(data, false\)/);
});

test('backup console exposes manual refresh and reports stale-cache/network failures', () => {
    assert.match(html, /onclick="loadBackupConsole\(\)"/);
    assert.match(html, /id="backupRefreshNotice"/);
    assert.match(backupUi, /المعروض سجل محفوظ محليًا وقد لا يعكس الحالة الحالية/);
    assert.match(backupUi, /فشل الاتصال بالخادم/);
});

test('backup console prevents overlapping list requests and retries failed refreshes', () => {
    assert.match(backupUi, /if \(backupConsoleLoadPromise\) return backupConsoleLoadPromise/);
    assert.match(backupUi, /scheduleBackupConsoleRefresh\(true\)/);
});


test('restore session refresh is required after successful database replacement', () => {
    assert.match(backupUi, /lockCurrentSession/);
    assert.match(backupUi, /اكتملت استعادة قاعدة البيانات/);
});
