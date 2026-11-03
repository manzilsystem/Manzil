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
    assert.match(sw, /const CACHE_NAME = 'manzil-v50'/);
});

test('all runtime modules are pre-cached with the application shell', () => {
    const shell = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
    assert.ok(shell, 'APP_SHELL must exist');

    for (const module of [
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
