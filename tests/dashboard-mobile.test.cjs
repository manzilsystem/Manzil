const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');

test('current-month KPIs use two readable columns on phones and three columns on wider screens', () => {
    assert.match(html, /class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center"/);
    assert.match(html, /<div class="app-input border rounded-2xl p-2 col-span-2 sm:col-span-1"><p class="text-\[10px\] text-slate-500">دفع جزئي<\/p><p id="partialPaymentsDisplay"/);
    assert.match(html, /id="collectionRateDisplay"/);
    assert.match(html, /id="currentMonthPaidDisplay"/);
});
