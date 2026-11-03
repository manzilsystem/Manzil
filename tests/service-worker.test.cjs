const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const serviceWorker = fs.readFileSync('sw.js', 'utf8');
const cacheName = serviceWorker.match(/const CACHE_NAME = 'manzil-v(\d+)';/);

test('service worker uses a new shell cache for the current app release', () => {
    assert.ok(cacheName, 'service worker cache version is present');
    assert.equal(Number(cacheName[1]), 30, 'increase this expected version for future app-shell releases');
test('app shell caches the current PNG icons and never references the removed SVG', () => {
    assert.ok(serviceWorker.includes("'./icons/icon-192.png'"));
    assert.ok(serviceWorker.includes("'./icons/icon-512.png'"));
    assert.ok(!serviceWorker.includes('icons/icon.svg'));
});
});
