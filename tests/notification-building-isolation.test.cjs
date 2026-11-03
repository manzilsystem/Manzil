const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migration = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/20261103161000_notification_recipient_building_isolation.sql'),
    'utf8'
);

test('notification recipient access is scoped to a resident in the same building', () => {
    assert.match(migration, /r\.building_id\s*=\s*p_building_id/i);
    assert.match(migration, /r\.user_id\s*=\s*auth\.uid\(\)/i);
    assert.match(migration, /p_target_user_id\s*=\s*auth\.uid\(\)/i);
    assert.match(migration, /p_target_resident_id\s+IS\s+NULL\s+OR\s+r\.id\s*=\s*p_target_resident_id/i);
});

test('a user id alone cannot grant cross-building notification access', () => {
    assert.match(migration, /AND\s*\(p_target_user_id\s+IS\s+NULL\s+OR\s+p_target_user_id\s*=\s*auth\.uid\(\)\)/i);
    assert.match(migration, /AND\s+EXISTS\s*\([\s\S]*?FROM\s+public\.residents[\s\S]*?r\.building_id\s*=\s*p_building_id/i);
    assert.doesNotMatch(migration, /OR\s*\(\s*p_target_user_id\s*=\s*auth\.uid\(\)\s+AND\s+private\.owner_pin_change_complete\(\)\s*\)/i);
});

test('building managers retain access to their own building notifications', () => {
    assert.match(migration, /private\.is_building_manager\(p_building_id\)/i);
});
