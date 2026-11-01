const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('css/style.css', 'utf8');

test('narrow mobile header keeps its content inside the available width', () => {
    assert.match(css, /@media \(max-width: 360px\)/);
    assert.match(css, /header \.container > div:first-child \{ min-width: 0; flex: 1 1 auto;/);
    assert.match(css, /header \.container > div:last-child \{ flex-shrink: 0;/);
    assert.match(css, /header \.container > div:last-child button \{ min-width: 40px; min-height: 40px;/);
    assert.match(css, /#headerBuildingTitle \{ max-width: 28vw; \}/);
});

test('modal cards and controls stay usable on small screens', () => {
    assert.match(css, /\[role="dialog"\] > \.app-card,/);
    assert.match(css, /max-height: calc\(100dvh - 2rem\);/);
    assert.match(css, /\[role="dialog"\] button \{ min-height: 44px; \}/);
    assert.match(css, /\[role="dialog"\] \.grid\.grid-cols-2 \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    assert.match(css, /\[role="dialog"\] \.flex\.gap-2 > button \{ min-width: 0; \}/);
});
