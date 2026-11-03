const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const backupUi = fs.readFileSync(path.join(__dirname, '..', 'js/backup.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('restore console keeps a clear in-progress message while a restore is active', () => {
    assert.match(backupUi, /جاري استبدال قاعدة البيانات/);
    assert.match(backupUi, /تم تسجيل طلب الاستعادة، وفي انتظار بدء التنفيذ/);
});

test('restore console presents the final successful or failed outcome after polling stops', () => {
    assert.match(backupUi, /latestRestore\?\.status === 'succeeded'/);
    assert.match(backupUi, /اكتملت الاستعادة بنجاح/);
    assert.match(backupUi, /latestRestore\?\.status === 'failed'/);
    assert.match(backupUi, /فشلت الاستعادة/);
});

test('restore interface warns that production database data will be replaced', () => {
    assert.match(html, /الاستعادة تستبدل بيانات قاعدة الإنتاج بالكامل/);
    assert.match(html, /لا يمكن التراجع عنها من الواجهة/);
});
