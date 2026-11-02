const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migration = fs.readFileSync(
    path.join(__dirname, '..', 'supabase/migrations/20261102203000_move_notification_helpers_private.sql'),
    'utf8'
);

test('notification SECURITY DEFINER helpers live in private schema, not exposed public RPCs', () => {
    assert.match(migration, /create or replace function private\.can_read_notification/i);
    assert.match(migration, /grant execute on function private\.can_read_notification\(uuid, uuid, uuid\) to authenticated/i);
    assert.match(migration, /drop function public\.can_read_notification\(uuid, uuid, uuid\)/i);
    assert.match(migration, /drop function public\.is_building_manager\(uuid\)/i);
});

test('private SECURITY DEFINER membership helpers use a hardened search_path', () => {
    for (const signature of [
        'private.is_building_manager(target_building uuid)',
        'private.is_building_member(target_building uuid)',
        'private.owns_resident(target_resident uuid)',
    ]) {
        assert.ok(migration.includes(signature));
    }
    assert.equal((migration.match(/set search_path = pg_catalog, public/gi) || []).length >= 4, true);
});

test('notification policies call only private helpers and retain owner PIN gate', () => {
    assert.match(migration, /notifications_manager_delete[\s\S]*private\.is_building_manager/i);
    assert.match(migration, /notifications_manager_insert[\s\S]*private\.is_building_manager/i);
    assert.match(migration, /notifications_select_scoped[\s\S]*private\.can_read_notification/i);
    assert.match(migration, /notifications_update_read_state[\s\S]*private\.can_read_notification/i);
    assert.match(migration, /p_target_user_id = auth\.uid\(\)[\s\S]*private\.owner_pin_change_complete\(\)/i);
});
