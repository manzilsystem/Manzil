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
    assert.match(sw, /const CACHE_NAME = 'manzil-v32'/);
});

test('monthly close module is pre-cached with the application shell', () => {
    assert.match(html, /<script src="js\/monthly-close\.js"><\/script>/);
    const shell = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
    assert.ok(shell, 'APP_SHELL must exist');
    assert.match(shell[1], /'\.\/js\/monthly-close\.js'/);
});
