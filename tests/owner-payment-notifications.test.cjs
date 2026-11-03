const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261103070519_owner_payment_notifications.sql'), 'utf8');
const fixMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20261103110732_fix_owner_payment_notification_generated_scope.sql'), 'utf8');
const grantsMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20261103105856_restrict_notification_update_columns.sql'), 'utf8');
const readStateMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20261103143759_allow_owner_notification_read_state_updates.sql'), 'utf8');
const supabase = fs.readFileSync(path.join(root, 'js/supabase.js'), 'utf8');
const access = fs.readFileSync(path.join(root, 'js/access.js'), 'utf8');
const crud = fs.readFileSync(path.join(root, 'js/crud.js'), 'utf8');

test('new income allocations create owner-scoped payment notifications without writing generated columns', () => {
    assert.ok(migration.includes('AFTER INSERT ON public.income'));
    assert.ok(fixMigration.includes('private.is_building_manager(NEW.building_id)'));

    const insertColumns = fixMigration.match(/INSERT INTO public\.notifications\s*\(([\s\S]*?)\)\s*VALUES/i)?.[1] || '';
    assert.ok(insertColumns, 'notification INSERT column list must exist');
    assert.match(insertColumns, /target_user_id, target_resident_id/);
    assert.doesNotMatch(insertColumns, /target_scope/);
    assert.ok(fixMigration.includes('ON CONFLICT (building_id, target_scope, dedupe_key)'));
    assert.ok(fixMigration.includes('REVOKE ALL ON FUNCTION private.notify_owner_on_income_insert()'));
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
    assert.match(grantsMigration, /REVOKE UPDATE ON TABLE public\.notifications FROM authenticated/i);
    assert.match(grantsMigration, /GRANT UPDATE \(read_at\) ON TABLE public\.notifications TO authenticated/i);
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

test('PostgreSQL notification fixture models target_scope as a generated column', () => {
    const fixture = fs.readFileSync(path.join(root, 'tests/atomic-persistence.fixture.sql'), 'utf8');
    assert.match(fixture, /target_scope uuid GENERATED ALWAYS AS \(COALESCE\(target_user_id,/);
});

test('owner read-state updates do not compare the generated target_scope column', () => {
    assert.match(readStateMigration, /NEW\.target_user_id IS DISTINCT FROM OLD\.target_user_id/);
    assert.doesNotMatch(readStateMigration, /NEW\.target_scope/);
    assert.match(readStateMigration, /NEW\.created_at IS DISTINCT FROM OLD\.created_at/);
});


test('owner payment notifications stay in sync after income updates and deletions', () => {
    const syncMigration = fs.readFileSync(
        path.join(root, 'supabase/migrations/20261103180000_sync_owner_payment_notifications.sql'),
        'utf8'
    );
    assert.match(syncMigration, /AFTER DELETE ON public\\.income/);
    assert.match(syncMigration, /AFTER UPDATE OF building_id, resident_id, amount, month, notes ON public\\.income/);
    assert.match(syncMigration, /income-batch:/);
    assert.match(syncMigration, /DELETE FROM public\\.notifications/);
    assert.match(syncMigration, /ON CONFLICT \\(building_id, target_scope, dedupe_key\\)/);
});
