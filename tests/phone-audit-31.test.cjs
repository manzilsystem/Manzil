const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const css = fs.readFileSync('css/style.css', 'utf8');
const render = fs.readFileSync('js/render.js', 'utf8');

test('settings overview children do not shrink inside the scrolling column on phone', () => {
    assert.match(css, /#settingsModal \.settings-overview > \* \{ flex-shrink: 0; \}/);
    assert.match(css, /#settingsModal \.settings-hero \{\s*flex: 0 0 auto;\s*flex-direction: column;/);
});

test('resident card action buttons keep 44px tap targets', () => {
    const lines = render.split('\n').filter((l) => /openResidentProfile|editResident\('|deleteResident\('/.test(l) && l.includes('<button'));
    assert.ok(lines.length >= 3);
    for (const l of lines) assert.match(l, /min-w-\[2\.75rem\] min-h-\[2\.75rem\]/);
    assert.match(render, /href="tel:\$\{esc\(r\.phone\)\}" class="text-xs text-indigo-400 hover:underline inline-block py-2 -my-2"/);
});
