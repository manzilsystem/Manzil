const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const swRegister = fs.readFileSync(path.join(root, 'js', 'sw-register.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('service worker is valid JavaScript and bumps the app cache', () => {
    assert.doesNotThrow(() => new vm.Script(sw, { filename: 'sw.js' }));
    assert.match(sw, /const CACHE_NAME = 'manzil-[0-9a-f]{10}'/);
});

test('all runtime modules are pre-cached with the application shell', () => {
    const shell = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
    assert.ok(shell, 'APP_SHELL must exist');

    for (const module of [
        'sw-register.js',
        'telemetry.js',
        'cashbox.js',
        'monthly-close.js',
        'backup.js',
        'assistant.js',
        'notices.js',
        'subscription-rates.js'
    ]) {
        const referencedByHtml = html.includes('<script src="js/' + module + '?v=');
        const loadedDynamically = app.includes('js/' + module + '?v=');
        assert.ok(referencedByHtml || loadedDynamically, module + ' must be loaded by the application');
        assert.ok(shell[1].includes("'./js/" + module + "?v="), module + ' must be in APP_SHELL');
    }
});

test('shared-release shell entries carry the current release, never a stale stamp', () => {
    const cache = sw.match(/const CACHE_NAME = '(manzil-[0-9a-f]{10})'/);
    assert.ok(cache, 'CACHE_NAME must carry the derived release id');
    const shell = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/)[1];

    // telemetry.js and subscription-rates.js take the shared release id rather
    // than a per-file hash, so their shell stamp must track CACHE_NAME; a stale
    // token would mean the current release is never pre-cached.
    for (const module of ['telemetry.js', 'subscription-rates.js']) {
        const entry = shell.match(new RegExp(`'\\./js/${module.replace('.', '\\.')}\\?v=([^']+)'`));
        assert.ok(entry, module + ' must be in APP_SHELL with a version token');
        assert.equal(
            entry[1],
            cache[1],
            module + ' must be stamped with the shared release so the current build is pre-cached'
        );
    }
});

test('the shell reloads for worker updates but not for the first install', () => {
    assert.ok(html.includes('<script src="js/sw-register.js?v='), 'index.html must load the registration script');
    assert.match(swRegister, /const hadController = Boolean\(navigator\.serviceWorker\.controller\)/);
    assert.match(swRegister, /controllerChanges \+= 1;/);
    assert.match(swRegister, /if \(reloading \|\| \(!hadController && controllerChanges === 1\)\) return;/);
});

test('pre-caching tolerates a single missing asset instead of blocking the update', () => {
    assert.ok(!sw.includes('cache.addAll'), 'cache.addAll aborts the whole install on one 404');
    assert.match(sw, /APP_SHELL\.map\(url => fetch\(url, \{ cache: 'reload' \}\)/);
    assert.match(sw, /\.catch\(\(\) => undefined\)/);
});

test('navigations revalidate the shell so a release lands without clearing the cache', () => {
    assert.match(sw, /request\.mode === 'navigate'/);
    assert.match(sw, /fetch\(new Request\(request, \{ cache: 'no-cache' \}\)\)/);
});

test('content-hashed assets are cached immutably and served without revalidating', () => {
    assert.match(sw, /if \(url\.searchParams\.has\('v'\)\)/);
    assert.match(sw, /caches\.match\(request\)\.then\(cached => cached \|\| fetch\(request\)/);
});

test('the page re-checks for a new worker every thirty minutes while it stays open', () => {
    assert.match(swRegister, /updateViaCache: 'none'/);
    assert.match(swRegister, /setInterval\(\(\) => \{[\s\S]*?refreshWorker\(\);[\s\S]*?\}, 30 \* 60 \* 1000\);/);
});

test('a new deployment offers an in-app refresh instead of a manual cache clear', () => {
    assert.match(swRegister, /let updatePending = false/);
    assert.match(swRegister, /const appIsBusy = \(\) =>/);
    assert.match(swRegister, /document\.querySelector\('\[role="dialog"\]:not\(\.hidden\)'\)/);
    assert.match(swRegister, /if \(appIsBusy\(\)\) \{ showUpdateCard\(\); return; \}/);
    assert.match(swRegister, /updatePending = true;\s*showUpdateCard\(\);/);
    assert.match(swRegister, /applyButton\.textContent = 'تحديث الآن'/);
    assert.match(swRegister, /laterButton\.textContent = 'لاحقًا'/);
    assert.match(swRegister, /laterButton\.addEventListener\('click', \(\) => \{ updateDeferred = true; closeUpdateCard\(\); \}\)/);
    assert.match(swRegister, /setInterval\(\(\) => \{ if \(updatePending\) applyPendingUpdate\(\); \}, 5000\)/);
});
