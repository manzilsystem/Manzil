const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('service worker is valid JavaScript and bumps the app cache', () => {
    assert.doesNotThrow(() => new vm.Script(sw, { filename: 'sw.js' }));
    assert.match(sw, /const CACHE_NAME = 'manzil-v103'/);
});

test('all runtime modules are pre-cached with the application shell', () => {
    const shell = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
    assert.ok(shell, 'APP_SHELL must exist');

    for (const module of [
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
    assert.match(html, /const hadController = Boolean\(navigator\.serviceWorker\.controller\)/);
    assert.match(html, /controllerChanges \+= 1;/);
    assert.match(html, /if \(reloading \|\| \(!hadController && controllerChanges === 1\)\) return;/);
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
    assert.match(html, /updateViaCache: 'none'/);
    assert.match(html, /setInterval\(\(\) => \{[\s\S]*?refreshWorker\(\);[\s\S]*?\}, 15 \* 60 \* 1000\);/);
});
