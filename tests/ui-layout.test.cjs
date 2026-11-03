const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('css/style.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

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

test('mobile action bars and filters can wrap without horizontal overflow', () => {
    assert.match(html, /class="quick-actions-grid grid grid-cols-2 sm:grid-cols-4 gap-2"/);
    assert.ok((html.match(/class="section-toolbar /g) || []).length >= 3);
    assert.ok((html.match(/class="list-filters /g) || []).length >= 2);
    assert.match(css, /\.section-toolbar > button \{ flex-shrink: 0; white-space: nowrap; \}/);
    assert.match(css, /\.list-filters input \{ min-width: 10rem; flex: 1 1 12rem; \}/);
    assert.match(css, /\.list-filters input, \.list-filters select \{ width: 100%; min-width: 0; flex-basis: auto; \}/);
    assert.match(css, /\.resident-filters-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});


test('form controls expose accessible names for assistive technology', () => {
    const controlIds = [
        'filterIncomeMonth',
        'filterExpenseCategory',
        'filterExpenseMonth',
        'reportMonthSelect',
        'noticeInput',
        'residentNotes',
        'incomeNotes',
        'expenseCategory',
        'expenseNotes'
    ];
    for (const id of controlIds) {
        const control = html.match(new RegExp('<(?:input|select|textarea)[^>]*id="' + id + '"[^>]*>'));
        assert.ok(control, `expected control #${id} to exist`);
        assert.ok(control[0].includes('aria-label="'), `expected control #${id} to have an accessible name`);
    }
});
