const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

test('report index cards collapse into compact one-line rows on phones', () => {
    const start = css.indexOf('Phones: index cards become compact rows');
    assert.ok(start > 0);
    const block = css.slice(start, css.indexOf('.report-stage-home {', start));
    assert.match(block, /@media \(max-width: 639\.98px\)/);
    assert.match(block, /\.report-index-open, \.report-index-badge \{ display: none; \}/);
    assert.match(block, /grid-template-areas: "icon copy state"/);
});
