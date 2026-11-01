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
