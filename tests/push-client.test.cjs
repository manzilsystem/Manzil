// Device-side push flow (js/push.js): key conversion, state machine, save/delete payloads, enable/disable/sync.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPush({ permission = 'default', supported = true, subscription = null, session = true } = {}) {
    const toasts = [];
    const calls = { upsert: [], delete: [], subscribe: 0, unsubscribe: 0, requestPermission: 0 };
    const storage = new Map();
    const fakeSubscription = subscription === null ? null : {
        endpoint: subscription.endpoint || 'https://push.example.test/sub/1',
        toJSON() {
            return subscription.keys === undefined
                ? { endpoint: this.endpoint, keys: { p256dh: 'cDI1NmRoLWtleQ', auth: 'YXV0aC1rZXk' } }
                : { endpoint: this.endpoint, keys: subscription.keys };
        },
        unsubscribe: async () => { calls.unsubscribe += 1; return true; }
    };
    const builder = {
        upsert: (row, options) => { calls.upsert.push({ row, options }); return Promise.resolve({ error: null }); },
        delete: () => {
            const filters = [];
            const chain = { eq: (column, value) => { filters.push([column, value]); return chain; } };
            chain.then = resolve => resolve({ error: null, filters });
            calls.delete.push(filters);
            return chain;
        }
    };
    const sandbox = {
        window: supported ? { PushManager: function () {}, Notification: {} } : {},
        navigator: {
            userAgent: 'test-agent',
            ...(supported ? { serviceWorker: { addEventListener: () => {}, ready: Promise.resolve({ pushManager: {
                getSubscription: async () => fakeSubscription,
                subscribe: async options => { calls.subscribe += 1; calls.subscribeOptions = options; return fakeSubscription || { endpoint: 'https://push.example.test/sub/new', toJSON: () => ({ endpoint: 'https://push.example.test/sub/new', keys: { p256dh: 'cDI1NmRoLWtleQ', auth: 'YXV0aC1rZXk' } }), unsubscribe: async () => true }; }
            } }) } } : {})
        },
        Notification: {
            permission,
            requestPermission: async () => { calls.requestPermission += 1; return sandbox.Notification.permission; }
        },
        localStorage: {
            getItem: key => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: key => storage.delete(key)
        },
        supabaseClient: { from: table => { assert.equal(table, 'push_subscriptions'); return builder; } },
        activeSession: session ? { user: { id: 'user-1' } } : null,
        activeBuildingId: session ? 'building-1' : null,
        currentUserRole: 'manager',
        toast: (message, tone) => toasts.push({ message, tone }),
        refreshPushControls: () => {},
        console, atob, btoa, setTimeout, Promise, Date
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'push.js'), 'utf8'), sandbox);
    const run = code => vm.runInContext(code, sandbox);
    return { sandbox, run, toasts, calls, storage };
}

test('VAPID key conversion roundtrips and the shipped public key decodes to an uncompressed P-256 point', () => {
    const { run } = loadPush();
    const keyBytes = run('pushUrlBase64ToBytes(PUSH_VAPID_PUBLIC_KEY)');
    assert.equal(keyBytes.length, 65);
    assert.equal(keyBytes[0], 4, 'P-256 public keys start with the 0x04 uncompressed marker');
    const roundtrip = run(`pushBytesToBase64Url(pushUrlBase64ToBytes('${'SGVsbG8td29ybGQtMTIz'}'))`);
    assert.equal(roundtrip, 'SGVsbG8td29ybGQtMTIz');
});

test('getPushState walks unsupported, denied, disabled, enabled in order', () => {
    assert.equal(loadPush({ supported: false }).run('getPushState()'), 'unsupported');
    assert.equal(loadPush({ permission: 'denied' }).run('getPushState()'), 'denied');
    assert.equal(loadPush({ permission: 'granted' }).run('getPushState()'), 'disabled', 'granted but never toggled on this device');
    const enabled = loadPush({ permission: 'granted' });
    enabled.run(`setPushWanted(true)`);
    assert.equal(enabled.run('getPushState()'), 'enabled');
});

test('pushSaveSubscription upserts the endpoint keys scoped to the signed-in user and building', async () => {
    const { run, calls } = loadPush({ subscription: {} });
    const saved = await run(`pushSaveSubscription({
        endpoint: 'https://push.example.test/sub/1',
        toJSON: () => ({ endpoint: 'https://push.example.test/sub/1', keys: { p256dh: 'KEYP', auth: 'KEYA' } })
    })`);
    assert.equal(saved, true);
    assert.equal(calls.upsert.length, 1);
    const { row, options } = calls.upsert[0];
    assert.equal(row.endpoint, 'https://push.example.test/sub/1');
    assert.equal(row.p256dh, 'KEYP');
    assert.equal(row.auth, 'KEYA');
    assert.equal(row.user_id, 'user-1');
    assert.equal(row.building_id, 'building-1');
    assert.equal(JSON.stringify(options), JSON.stringify({ onConflict: 'endpoint' }));
});

test('pushSaveSubscription refuses to write without a session or without subscription keys', async () => {
    const noSession = loadPush({ subscription: {}, session: false });
    assert.equal(await noSession.run(`pushSaveSubscription({ toJSON: () => ({ endpoint: 'e', keys: { p256dh: 'p', auth: 'a' } }) })`), false);
    assert.equal(noSession.calls.upsert.length, 0);
    const noKeys = loadPush({ subscription: { keys: {} } });
    assert.equal(await noKeys.run(`pushSaveSubscription({ endpoint: 'e', toJSON: () => ({ endpoint: 'e', keys: {} }) })`), false);
    assert.equal(noKeys.calls.upsert.length, 0);
});

test('enablePush subscribes with userVisibleOnly and the decoded key, then saves and flags the device', async () => {
    const { run, calls, toasts, storage } = loadPush({ permission: 'granted' });
    const ok = await run('enablePush()');
    assert.equal(ok, true);
    assert.equal(calls.subscribe, 1);
    assert.equal(calls.subscribeOptions.userVisibleOnly, true);
    assert.equal(calls.subscribeOptions.applicationServerKey.length, 65);
    assert.equal(calls.subscribeOptions.applicationServerKey[0], 4);
    assert.equal(calls.upsert.length, 1);
    assert.equal(storage.get('manzil_push_enabled'), '1');
    assert.equal(toasts.at(-1).tone, 'success');
});

test('enablePush stops at a denied permission: no subscribe, no save, Arabic error toast', async () => {
    const { run, calls, toasts, storage } = loadPush({ permission: 'denied' });
    const ok = await run('enablePush()');
    assert.equal(ok, false);
    assert.equal(calls.requestPermission, 1);
    assert.equal(calls.subscribe, 0);
    assert.equal(calls.upsert.length, 0);
    assert.equal(storage.has('manzil_push_enabled'), false);
    assert.equal(toasts.at(-1).tone, 'error');
    assert.match(toasts.at(-1).message, /لم يتم السماح/);
});

test('disablePush deletes the server row for this endpoint before unsubscribing locally', async () => {
    const { run, calls, storage } = loadPush({ permission: 'granted', subscription: { endpoint: 'https://push.example.test/sub/9' } });
    storage.set('manzil_push_enabled', '1');
    await run('disablePush()');
    assert.equal(storage.has('manzil_push_enabled'), false);
    assert.equal(JSON.stringify(calls.delete[0]), JSON.stringify([['endpoint', 'https://push.example.test/sub/9'], ['user_id', 'user-1']]));
    assert.equal(calls.unsubscribe, 1);
});

test('syncPushSubscription clears the wanted flag when the browser dropped the subscription', async () => {
    const { run, storage, calls } = loadPush({ permission: 'granted', subscription: null });
    storage.set('manzil_push_enabled', '1');
    await run('syncPushSubscription()');
    assert.equal(storage.has('manzil_push_enabled'), false, 'a vanished browser subscription means the device is no longer armed');
    assert.equal(calls.upsert.length, 0);
});

test('releasePushForSignOut deletes the server row but keeps the browser subscription', async () => {
    const { run, calls, storage } = loadPush({ permission: 'granted', subscription: { endpoint: 'https://push.example.test/sub/7' } });
    storage.set('manzil_push_enabled', '1');
    await run('releasePushForSignOut()');
    assert.equal(JSON.stringify(calls.delete[0]), JSON.stringify([['endpoint', 'https://push.example.test/sub/7'], ['user_id', 'user-1']]));
    assert.equal(calls.unsubscribe, 0, 'permission stays so the next sign-in re-registers silently');
});
