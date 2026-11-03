const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const crud = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');
const notices = fs.readFileSync(path.join(__dirname, '..', 'js', 'notices.js'), 'utf8');
const supabase = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase.js'), 'utf8');

test('persistence exposes one operation-level success message', () => {
    assert.doesNotMatch(supabase, /تم الحفظ في Supabase/);
    assert.match(crud, /if \(!await saveWithRollback\(previousState\)\) return;/);
});

test('notification paths report copy, delete, and owner provisioning failures', () => {
    assert.match(crud, /let copied = false;/);
    assert.match(crud, /تعذر نسخ الرمز؛ حدده وانسخه يدويًا/);
    assert.match(notices, /toast\('تم حذف الإعلان', 'info'\)/);
    assert.match(crud, /Owner provisioning refresh failed/);
    assert.match(crud, /تم إنشاء الحساب لكن تعذر تحديث البيانات/);
});
