const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const snap = value => JSON.parse(JSON.stringify(value));

function loadPushSw({ clients = [] } = {}) {
    const listeners = {};
    const notifications = [];
    const opened = [];
    const messages = [];
    const makeClient = visibilityState => ({
        visibilityState,
        focused: false,
        focus() { this.focused = true; return Promise.resolve(this); },
        postMessage(message) { messages.push({ client: this, message }); }
    });
    const sandbox = {
        self: null,
        URL,
        console
    };
    sandbox.self = {
        addEventListener: (type, handler) => { listeners[type] = handler; },
        registration: { showNotification: (title, options) => { notifications.push({ title, options }); return Promise.resolve(); } },
        clients: {
            matchAll: () => Promise.resolve(clients),
            openWindow: target => {
                opened.push(target);
                const client = makeClient('visible');
                client.openedWindow = true;
                return Promise.resolve(client);
            }
        }
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'push-sw.js'), 'utf8');
    vm.runInContext(source, sandbox);
    return { listeners, notifications, opened, messages, makeClient };
}

function pushEvent(data) {
    return {
        data: data === undefined ? undefined : { json: () => (data instanceof Error ? (() => { throw data; })() : data) },
        waitUntil(promise) { this.promise = promise; }
    };
}

function clickEvent(data) {
    return {
        notification: { data, closed: false, close() { this.closed = true; } },
        waitUntil(promise) { this.promise = promise; }
    };
}

test('clicking a notification focuses the open app and hands it the action path', async () => {
    const existing = { visibilityState: 'hidden', focused: false, focus() { this.focused = true; return Promise.resolve(this); }, received: [], postMessage(m) { this.received.push(m); } };
    const { listeners, opened } = loadPushSw({ clients: [existing] });
    const event = clickEvent({ path: '/#arrears', id: 'n1' });
    listeners.notificationclick(event);
    await event.promise;
    assert.equal(event.notification.closed, true);
    assert.equal(existing.focused, true);
    assert.deepEqual(snap(existing.received), [{ type: 'manzil-push-open', path: '/#arrears' }], );
    assert.deepEqual(snap(opened), [],  'an open app window means no new window');
});

test('clicking a notification with no open app opens one and hands it the action path', async () => {
    const { listeners, opened, messages } = loadPushSw({ clients: [] });
    const event = clickEvent({ path: '/#owner', id: 'n2' });
    listeners.notificationclick(event);
    await event.promise;
    assert.deepEqual(snap(opened), ['./'],  'opens the app root, never an external URL');
    assert.equal(messages.length, 1);
    assert.deepEqual(snap(messages[0].message), { type: 'manzil-push-open', path: '/#owner' }, );
});

test('a push with a visible app window refreshes the list instead of showing a system notification', async () => {
    const visible = { visibilityState: 'visible', received: [], postMessage(m) { this.received.push(m); } };
    const hidden = { visibilityState: 'hidden', received: [], postMessage(m) { this.received.push(m); } };
    const { listeners, notifications } = loadPushSw({ clients: [visible, hidden] });
    const event = pushEvent({ id: 'abc', title: 'تنبيه', body: 'وصل', path: '/#arrears' });
    listeners.push(event);
    await event.promise;
    assert.deepEqual(snap(notifications), [],  'no popup on top of the visible app');
    assert.deepEqual(snap(visible.received), [{ type: 'manzil-push-received', id: 'abc' }], );
    assert.deepEqual(snap(hidden.received), [{ type: 'manzil-push-received', id: 'abc' }],  'every open window refetches');
});

test('a push with no visible window shows one notification tagged by id so repeats replace', async () => {
    const { listeners, notifications } = loadPushSw({ clients: [] });
    const event = pushEvent({ id: 'abc', title: 'متأخرات جديدة', body: '3 شقق', path: '/#arrears' });
    listeners.push(event);
    await event.promise;
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].title, 'متأخرات جديدة');
    assert.equal(notifications[0].options.tag, 'manzil-abc');
    assert.equal(notifications[0].options.dir, 'rtl');
    assert.deepEqual(snap(notifications[0].options.data), { path: '/#arrears', id: 'abc' }, );
});

test('a malformed push payload still resolves with the default title and no crash', async () => {
    const { listeners, notifications } = loadPushSw({ clients: [] });
    const event = pushEvent(new SyntaxError('bad json'));
    listeners.push(event);
    await event.promise;
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].title, 'منزل');
    assert.equal(notifications[0].options.tag, undefined);
    assert.deepEqual(snap(notifications[0].options.data), { path: '', id: '' }, );
});
