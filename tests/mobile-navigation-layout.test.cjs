const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');

test('six bottom navigation items share the available mobile width', () => {
    const nav = html.match(/<nav aria-label="التنقل الرئيسي"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, 'main navigation must exist');
    for (const tab of ['dashboard', 'income', 'expenses', 'cashbox', 'residents', 'reports']) {
        assert.ok(nav.includes(`id="btn-${tab}"`), `missing ${tab} tab`);
    }

    assert.match(css, /nav\[aria-label="التنقل الرئيسي"\] \.tab-btn\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0;/);
    assert.match(css, /nav\[aria-label="التنقل الرئيسي"\] \.tab-btn span\s*\{[^}]*white-space:\s*nowrap;/);
    assert.match(css, /@media \(max-width: 360px\)[\s\S]*nav\[aria-label="التنقل الرئيسي"\] \.tab-btn\s*\{[^}]*min-width:\s*0;/);
});
