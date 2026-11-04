const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'telemetry.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const migration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '20261104220000_client_error_reports.sql'),
    'utf8'
);

function makeStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        values
    };
}

function makeHarness({ hostname = 'manzilsystem.github.io', config = { url: 'https://example.supabase.co', key: 'anon' } } = {}) {
    const listeners = {};
    const requests = [];
    const storage = makeStorage();
    const sandbox = {
        window: {
            addEventListener: (name, handler) => { listeners[name] = handler; },
            manzilSupabaseConfig: config,
            currentUserRole: 'manager'
        },
        location: { hostname, pathname: '/Manzil/index.html' },
        localStorage: storage,
        fetch: (url, init) => {
            requests.push({ url, init });
            return Promise.resolve({ ok: true });
        },
        Date,
        JSON,
        console
    };
    vm.runInNewContext(source, sandbox, { filename: 'js/telemetry.js' });
    return { listeners, requests, storage };
}

function readEntries(storage) {
    return JSON.parse(storage.getItem('manzil-error-log') || '[]');
}

function dispatchError(listeners, message = 'boom') {
    listeners.error({
        message,
        filename: 'https://manzilsystem.github.io/Manzil/js/app.js',
        lineno: 12,
        colno: 4,
        error: { stack: 'Error: boom\n    at app.js:12:4' }
    });
}

test('telemetry captures errors, rejections and manual reports', () => {
    const { listeners, storage } = makeHarness();
    assert.equal(typeof listeners.error, 'function');
    assert.equal(typeof listeners.unhandledrejection, 'function');
    assert.equal(typeof listeners.load, 'function');

    dispatchError(listeners);
    listeners.unhandledrejection({ reason: { message: 'rejected' } });
    listeners.error({ message: '', target: {} });

    const entries = readEntries(storage);
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map(entry => entry.kind), ['error', 'rejection']);
});

test('reported fields are sanitized and contain no request payload data', () => {
    const { listeners, requests } = makeHarness();
    dispatchError(listeners, 'x'.repeat(600));

    const body = JSON.parse(requests[0].init.body);
    assert.deepEqual(Object.keys(body).sort(), [
        'column', 'created_at', 'kind', 'line', 'message', 'path', 'release', 'role', 'source', 'stack'
    ]);
    assert.equal(body.source, 'app.js');
    assert.equal(body.role, 'manager');
    assert.equal(body.line, 12);
    assert.equal(body.message.length, 300);
    assert.ok(body.stack.length <= 1200);
    assert.equal(requests[0].init.headers.Prefer, 'return=minimal');
});

test('identical messages are reported once per page load', () => {
    const { listeners, requests, storage } = makeHarness();
    dispatchError(listeners);
    dispatchError(listeners);

    assert.equal(requests.length, 1);
    assert.equal(readEntries(storage).length, 1);
});

test('local development keeps entries local instead of writing to production', () => {
    const { listeners, requests, storage } = makeHarness({ hostname: '127.0.0.1' });
    dispatchError(listeners);

    assert.equal(requests.length, 0);
    assert.equal(readEntries(storage).length, 1);
});

test('telemetry is loaded first and shares the service worker release', () => {
    assert.match(html, /<script src="js\/telemetry\.js"><\/script>\s*<script src="js\/state\.js">/);
    const release = source.match(/const RELEASE = '([^']+)'/)[1];
    assert.match(sw, new RegExp(`const CACHE_NAME = '${release}'`));
});

test('client_errors table is append-only for anonymous and authenticated clients', () => {
    assert.match(migration, /create table if not exists public\.client_errors/);
    assert.match(migration, /alter table public\.client_errors enable row level security/);
    assert.match(migration, /for insert to anon, authenticated/);
    assert.match(migration, /grant insert on public\.client_errors to anon, authenticated/);
    assert.match(migration, /revoke all on public\.client_errors from public, anon, authenticated/);
    assert.match(migration, /check \(char_length\(message\) between 1 and 300\)/);
    assert.match(migration, /raise exception 'client_errors_capacity_reached'/);
    assert.doesNotMatch(migration, /grant select/i);
    assert.doesNotMatch(migration, /grant update/i);
});
