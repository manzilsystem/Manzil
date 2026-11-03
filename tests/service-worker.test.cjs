const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('service worker is valid JavaScript and bumps the app cache', () => {
    assert.doesNotThrow(() => new vm.Script(sw, { filename: 'sw.js' }));
    assert.match(sw, /const CACHE_NAME = 'manzil-v36'/);
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
        const escapedModule = module.replace('.', '\\.');
        assert.match(html, new RegExp('<script src="js/' + escapedModule + '"></script>'));
        assert.match(shell[1], new RegExp("'\\./js/" + escapedModule + "'"));
    }
});
