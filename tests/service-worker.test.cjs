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
    assert.match(sw, /const CACHE_NAME = 'manzil-v122'/);
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
        'notices.js',
        'subscription-rates.js'
    ]) {
        const referencedByHtml = html.includes('<script src="js/' + module + '"></script>');
        const loadedDynamically = app.includes("script.src = 'js/" + module + "'");
        assert.ok(referencedByHtml || loadedDynamically, module + ' must be loaded by the application');
        assert.ok(shell[1].includes("'./js/" + module + "'"), module + ' must be in APP_SHELL');
    }
});

test('the shell reloads for worker updates but not for the first install', () => {
    assert.ok(html.includes('<script src="js/sw-register.js"></script>'), 'index.html must load the registration script');
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

test('the page re-checks for a new worker while it stays open', () => {
    assert.match(swRegister, /updateViaCache: 'none'/);
    assert.match(swRegister, /setInterval\(\(\) => \{[\s\S]*?refreshWorker\(\);[\s\S]*?\}, 15 \* 60 \* 1000\);/);
});

test('new deployments apply automatically once the user is idle, without a cache clear', () => {
    assert.match(swRegister, /let updatePending = false/);
    assert.match(swRegister, /const appIsBusy = \(\) =>/);
    assert.match(swRegister, /document\.querySelector\('\[role="dialog"\]:not\(\.hidden\)'\)/);
    assert.match(swRegister, /if \(appIsBusy\(\)\) \{ showUpdateBanner\(\); return; \}/);
    assert.match(swRegister, /updatePending = true;\s*applyPendingUpdate\(\);/);
    assert.match(swRegister, /setInterval\(\(\) => \{ if \(updatePending\) applyPendingUpdate\(\); \}, 5000\)/);
    assert.match(swRegister, /سيُطبّق تلقائيًا فور إنهاء النافذة أو الحقل المفتوح/);
});
