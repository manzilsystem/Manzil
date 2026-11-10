const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('dashboard informational text keeps a 12px reading floor', () => {
    const dashboard = read('src/partials/main-tabs.html');
    assert.doesNotMatch(
        dashboard,
        /text-\[(9|10)px\]/,
        'dashboard informational labels must not fall below the 12px reading floor (use text-xs)'
    );
});

test('financial list and card rows keep a 12px reading floor', () => {
    const lists = read('js/render.js');
    assert.doesNotMatch(
        lists,
        /text-\[(9|10)px\]/,
        'list/card informational text in js/render.js must not fall below the 12px reading floor (use text-xs)'
    );
});

test('cashbox and header informational text keeps a 12px reading floor', () => {
    for (const file of ['js/cashbox.js', 'src/partials/header.html']) {
        assert.doesNotMatch(
            read(file),
            /text-\[(9|10)px\]/,
            `informational text in ${file} must not fall below the 12px reading floor (use text-xs)`
        );
    }
});

test('owner access portal informational text keeps a 12px reading floor', () => {
    assert.doesNotMatch(
        read('js/access.js'),
        /text-\[(9|10)px\]/,
        'informational text in js/access.js must not fall below the 12px reading floor (use text-xs)'
    );
});

test('built index.html ships the dashboard reading floor', () => {
    const built = read('index.html');
    assert.match(built, /id="incomePeriodLabel" class="text-xs text-slate-500 mt-1"/);
    assert.match(built, /id="expensePeriodLabel" class="text-xs text-slate-500 mt-1"/);
    assert.match(built, /id="currentMonthSummaryLabel" class="text-xs text-slate-500"/);
    assert.match(built, /class="flex justify-center gap-4 text-xs text-slate-400 pt-1"/);
    assert.match(built, /id="appCopyright" class="text-center text-xs text-slate-500/);
    assert.match(built, /<p class="text-xs text-slate-400 flex items-center gap-1">/);
});
