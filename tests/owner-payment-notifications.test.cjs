const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261103120000_owner_payment_notifications.sql'), 'utf8');
const supabase = fs.readFileSync(path.join(root, 'js/supabase.js'), 'utf8');
const access = fs.readFileSync(path.join(root, 'js/access.js'), 'utf8');
const crud = fs.readFileSync(path.join(root, 'js/crud.js'), 'utf8');

test('new income allocations create owner-scoped payment notifications', () => {
    assert.match(migration, /AFTER INSERT ON public\\.income/);
    assert.match(migration, /private\\.is_building_manager\\(NEW\\.building_id\\)/);
    assert.match(migration, /target_user_id, target_resident_id, target_scope/);
    assert.match(migration, /kind, dedupe_key, title, body, severity/);
    assert.match(migration, /ON CONFLICT \\(building_id, target_scope, dedupe_key\\)/);
});

test('split advance payments are grouped into one notification', () => {
    assert.match(crud, /slice\\(0, 12\\)\\.toUpperCase\\(\\)/);
    assert.ok(crud.includes('دفعة موزعة ${paymentReference}'));
    assert.match(migration, /substring\\([\\s\\S]*\\^دفعة موزعة \\(\\[A-F0-9\\]\\{12\\}\\)/);
    assert.match(migration, /sum\\(payment\\.amount\\)/);
});

test('owners can read their own notifications and only update read state', () => {
    assert.match(migration, /private\\.is_building_manager\\(OLD\\.building_id\\)/);
    assert.match(migration, /NEW\\.target_scope IS DISTINCT FROM OLD\\.target_scope/);
    assert.match(access, /markOwnerNotificationRead/);
    assert.match(access, /markAllOwnerNotificationsRead/);
    assert.match(supabase, /\\.eq\\('target_user_id', session\\.user\\.id\\)/);
});

test('owner notification list subscribes to realtime inserts and updates', () => {
    assert.match(supabase, /supabaseClient\\.channel\\(/);
    assert.match(supabase, /table: 'notifications'/);
    assert.match(supabase, /event: 'INSERT'/);
    assert.match(supabase, /event: 'UPDATE'/);
    assert.match(migration, /ALTER PUBLICATION supabase_realtime ADD TABLE public\\.notifications/);
});