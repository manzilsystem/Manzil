const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const crud = fs.readFileSync(path.join(__dirname, '..', 'js/crud.js'), 'utf8');

test('owner provisioning exposes actionable messages for compensation and uncertain Auth outcomes', () => {
    for (const code of [
        'membership_snapshot_failed',
        'profile_snapshot_failed',
        'account_has_conflicting_role',
        'provisioning_compensation_failed',
        'audit_log_save_failed',
        'auth_update_status_unknown'
    ]) {
        assert.match(crud, new RegExp(code + ':'));
    }
    assert.match(crud, /أوقف إعادة المحاولة وراجع حالة الحساب والشقة/);
    assert.match(crud, /أعد إصدار الرمز من نفس الشقة/);
});
