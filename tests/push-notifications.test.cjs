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

test('push client holds only the public VAPID key; a blank key reports unconfigured, a set key shows the control', () => {
    const source = read('js/push.js');
    const keyMatch = source.match(/const PUSH_VAPID_PUBLIC_KEY = '([A-Za-z0-9_-]*)';/);
    assert.ok(keyMatch, 'public key constant exists');
    // Uncompressed P-256 public point: 65 bytes = 87 base64url chars, starts with 0x04 (BA/BB/BC/BD..).
    assert.match(keyMatch[1], /^B[A-Za-z0-9_-]{86}$/);
    assert.doesNotMatch(source, /VAPID_PRIVATE|PRIVATE KEY/i);
    const run = code => {
        const sandbox = {
            window: { PushManager: {} },
            navigator: { serviceWorker: { addEventListener() {} } },
            Notification: { permission: 'default' },
            localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
            currentUserRole: 'manager'
        };
        sandbox.window.Notification = sandbox.Notification;
        vm.createContext(sandbox);
        vm.runInContext(`${code}\nthis.__state = getPushState; this.__html = pushControlHtml;`, sandbox);
        return sandbox;
    };
    const blank = run(source.replace(/const PUSH_VAPID_PUBLIC_KEY = '[^']*';/, "const PUSH_VAPID_PUBLIC_KEY = '';"));
    assert.equal(blank.__state(), 'unconfigured');
    assert.equal(blank.__html(), '', 'no button is shown while the key is blank');
    const configured = run(source);
    assert.equal(configured.__state(), 'disabled');
    assert.notEqual(configured.__html(), '');
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

test('notifications push trigger reads the secret from vault, is exception-safe and a no-op without a secret', () => {
    const sql = read('supabase/migrations/20261126053000_notifications_push_trigger.sql');
    assert.match(sql, /security definer/i);
    assert.match(sql, /set search_path = ''/i);
    assert.match(sql, /vault\.decrypted_secrets/);
    assert.match(sql, /name = 'push_webhook_secret'/);
    assert.match(sql, /v_secret is null or v_secret = ''[\s\S]*?return new/);
    assert.match(sql, /exception when others then\s+null;/i);
    assert.match(sql, /after insert on public\.notifications/i);
    assert.match(sql, /revoke all on function private\.notify_push\(\) from public, anon, authenticated/i);
    assert.doesNotMatch(sql, /x-push-secret'\s*,\s*'[^']+'/);
});
