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
    assert.ok(migration.includes('AFTER INSERT ON public.income'));
    assert.ok(migration.includes('private.is_building_manager(NEW.building_id)'));
    assert.ok(migration.includes('target_user_id, target_resident_id, target_scope'));
    assert.ok(migration.includes('kind, dedupe_key, title, body, severity'));
    assert.ok(migration.includes('ON CONFLICT (building_id, target_scope, dedupe_key)'));
});

test('split advance payments are grouped into one notification', () => {
    assert.ok(crud.includes('slice(0, 12).toUpperCase()'));
    assert.ok(crud.includes('دفعة موزعة ${paymentReference}'));
    assert.ok(migration.includes('^دفعة موزعة ([A-F0-9]{12})'));
    assert.ok(migration.includes('sum(payment.amount)'));
});

test('owners can read their own notifications and only update read state', () => {
    assert.ok(migration.includes('private.is_building_manager(OLD.building_id)'));
    assert.ok(migration.includes('NEW.target_scope IS DISTINCT FROM OLD.target_scope'));
    assert.ok(access.includes('markOwnerNotificationRead'));
    assert.ok(access.includes('markAllOwnerNotificationsRead'));
    assert.ok(supabase.includes(".eq('target_user_id', session.user.id)"));
});

test('owner notification list subscribes to realtime inserts and updates', () => {
    assert.ok(supabase.includes('.channel('));
    assert.ok(supabase.includes("table: 'notifications'"));
    assert.ok(supabase.includes("event: 'INSERT'"));
    assert.ok(supabase.includes("event: 'UPDATE'"));
    assert.ok(migration.includes('ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications'));
});
