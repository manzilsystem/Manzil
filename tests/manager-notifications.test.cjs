const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('supabase/migrations/20261107090000_manager_expense_notifications.sql');
const supabase = read('js/supabase.js');
const access = read('js/access.js');
const render = read('js/render.js');
const html = read('index.html');
const css = read('css/style.css');

test('expense changes raise a building-scoped manager notification', () => {
    assert.match(migration, /AFTER INSERT ON public\.expenses/);
    assert.match(migration, /AFTER DELETE ON public\.expenses/);
    assert.match(migration, /AFTER UPDATE OF building_id, title, amount, month ON public\.expenses/);
    assert.ok(migration.includes("'expense'"));
    assert.ok(migration.includes("'#tab-expenses'"));
});

test('manager notifications reuse the generated scope and dedupe key', () => {
    const insertColumns = migration.match(/INSERT INTO public\.notifications \(([\s\S]*?)\)/)[1];
    assert.doesNotMatch(insertColumns, /target_scope/);
    assert.ok(migration.includes('ON CONFLICT (building_id, target_scope, dedupe_key)'));
    assert.ok(migration.includes("'expense:' || p_expense_id::text"));
    assert.match(migration, /REVOKE ALL ON FUNCTION private\.sync_manager_expense_notification\(uuid, uuid\)/);
});

test('removing an expense clears its manager notification', () => {
    assert.match(migration, /DELETE FROM public\.notifications/);
    assert.match(migration, /target_user_id IS NULL/);
    assert.match(migration, /target_resident_id IS NULL/);
});

test('the manager feed queries null-target rows and streams them in realtime', () => {
    assert.match(supabase, /managerNotifications/);
    assert.match(supabase, /\.is\('target_user_id', null\)/);
    assert.match(supabase, /function subscribeManagerNotificationsRealtime/);
    assert.match(supabase, /function stopManagerNotificationsRealtime/);
    assert.match(supabase, /managerNotifications: currentUserRole === 'manager'/);
});

test('the manager bell renders from state and resets with the session', () => {
    assert.match(access, /function renderManagerNotifications/);
    assert.match(access, /function bindManagerNotifications/);
    assert.match(access, /function toggleManagerNotifications/);
    assert.match(access, /function markAllManagerNotificationsRead/);
    assert.match(render, /renderManagerNotifications\(\)/);
});

test('the header exposes an accessible manager notifications bell', () => {
    assert.ok(html.includes('id="managerNotificationsControl"'));
    assert.ok(html.includes('id="managerNotificationsBtn"'));
    assert.ok(html.includes('id="managerNotificationsMenu"'));
    assert.ok(html.includes('aria-label="إشعارات المدير"'));
    assert.match(css, /\.manager-notifications-badge/);
});
