const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

test('owner portal does not expose manager-only bottom navigation', () => {
    assert.match(html, /<nav aria-label="التنقل الرئيسي"/);
    assert.match(html, /<section id="ownerPortal"/);
    assert.match(css, /body\.owner-mode nav\[aria-label="التنقل الرئيسي"\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
});

test('owner mode removes unused mobile bottom padding after hiding manager navigation', () => {
    assert.match(css, /@media \(max-width: 640px\)[\s\S]*body\.owner-mode\s*\{\s*padding-bottom:\s*1rem;\s*\}/);
    assert.match(css, /body\.owner-mode #printableArea > #ownerPortal \{ display: block !important; \}/);
});
