const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('service worker imports the push handlers and they cover push and notificationclick', () => {
    assert.match(read('sw.js'), /importScripts\('\.\/js\/push-sw\.js'\)/);
    const handlers = read('js/push-sw.js');
    assert.match(handlers, /addEventListener\('push'/);
    assert.match(handlers, /addEventListener\('notificationclick'/);
    // The visible app already shows the notification through realtime: no duplicate on screen.
    assert.match(handlers, /visibilityState === 'visible'/);
    // Same notification id reuses one tag so a repeat replaces instead of stacking.
    assert.match(handlers, /tag: data\.id/);
});

test('push client reports unconfigured until a VAPID public key exists and never holds a private key', () => {
    const source = read('js/push.js');
    assert.match(source, /const PUSH_VAPID_PUBLIC_KEY = '';/);
    assert.doesNotMatch(source, /VAPID_PRIVATE|PRIVATE KEY/i);
    const sandbox = {
        window: { PushManager: {} },
        navigator: { serviceWorker: { addEventListener() {} } },
        Notification: { permission: 'default' },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        currentUserRole: 'manager'
    };
    sandbox.window.Notification = sandbox.Notification;
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.__state = getPushState; this.__html = pushControlHtml;`, sandbox);
    assert.equal(sandbox.__state(), 'unconfigured');
    assert.equal(sandbox.__html(), '', 'no button is shown while the server side is not configured');
});

test('sign-in refreshes and sign-out releases the device subscription', () => {
    const source = read('js/supabase.js');
    assert.match(source, /syncPushSubscription\(\)/);
    assert.match(source, /async function signOutLocally\(\) {[\s\S]*?releasePushForSignOut/);
});

test('notification surfaces include the push control', () => {
    const access = read('js/access.js');
    assert.equal((access.match(/pushControlHtml\(\)/g) || []).length, 2);
});

test('push_subscriptions migration is owner-scoped, RLS-protected and https-only', () => {
    const sql = read('supabase/migrations/20261126003000_push_subscriptions.sql');
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /revoke all on public\.push_subscriptions from anon, authenticated/i);
    for (const op of ['select', 'insert', 'update', 'delete']) {
        assert.match(sql, new RegExp(`create policy push_subscriptions_${op}_own`));
    }
    assert.match(sql, /user_id = \(select auth\.uid\(\)\)/);
    assert.match(sql, /private\.is_building_member\(building_id\)/);
    assert.match(sql, /endpoint like 'https:\/\/%'/);
    assert.match(sql, /unique \(endpoint\)/);
});

test('send-push is secret-gated, never takes a JWT, and keeps VAPID keys in env only', () => {
    const fn = read('supabase/functions/send-push/index.ts');
    assert.match(fn, /x-push-secret/);
    assert.match(fn, /Deno\.env\.get\('PUSH_WEBHOOK_SECRET'\)/);
    assert.match(fn, /Deno\.env\.get\('VAPID_PRIVATE_KEY'\)/);
    assert.match(fn, /response\.status === 404 \|\| response\.status === 410/);
    assert.doesNotMatch(fn, /BEGIN PRIVATE KEY|VAPID_PRIVATE_KEY'\)\s*\|\|\s*'[^']+'/);
    // Not declared for Branching (that list is capped); it is deployed by hand with --no-verify-jwt.
    assert.doesNotMatch(read('supabase/config.toml'), /\[functions\.send-push\]/);
});
