const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const modals = fs.readFileSync('src/partials/modals.html', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');

test('modal header close buttons have 44px tap targets', () => {
    assert.doesNotMatch(modals, /class="text-white\/80 hover:text-white"/);
    const n = (modals.match(/text-white\/80 hover:text-white inline-flex items-center justify-center min-w-\[2\.75rem\] min-h-\[2\.75rem\] -m-2/g) || []).length;
    assert.ok(n >= 10, 'expected all 10 close buttons, got ' + n);
});

test('resident rented checkbox row and report search are 44px tall', () => {
    assert.match(modals, /cursor-pointer min-h-\[2\.75rem\]">\s*<input type="checkbox" id="residentIsRented"/);
    assert.match(css, /\.report-index-search \{\s*display: flex; align-items: center; gap: var\(--space-55\); min-height: 2\.75rem;/);
});

test('resident card header lets long names shrink instead of pushing the actions off-screen', () => {
    const render = fs.readFileSync('js/render.js', 'utf8');
    assert.match(render, /<div class="flex items-center gap-2 min-w-0 flex-1">/);
    assert.match(render, /<div class="flex gap-1 shrink-0">/);
});
