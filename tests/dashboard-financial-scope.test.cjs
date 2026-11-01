const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');

test('dashboard clarifies lifetime scope for income, expenses, and cash balance', () => {
    assert.match(html, /id="totalIncomeDisplay"[\s\S]*?<\/h3>\s*<p[^>]*>إجمالي التحصيلات المسجلة منذ بدء التسجيل<\/p>/);
    assert.match(html, /id="totalExpenseDisplay"[\s\S]*?<\/h3>\s*<p[^>]*>إجمالي المصروفات المسجلة منذ بدء التسجيل<\/p>/);
    assert.match(html, /الرصيد الحالي بالخزنة[\s\S]*?id="netBalanceDisplay"[\s\S]*?<\/h3>\s*<p[^>]*>الرصيد الافتتاحي \+ التحصيلات − المصروفات المسجلة منذ بدء التسجيل<\/p>/);
});

test('the separate current-month summary remains available and explicitly labeled', () => {
    assert.match(html, /id="monthSummaryTitle"[^>]*>[\s\S]*?ملخص الشهر الحالي/);
    assert.match(html, /aria-label="نسبة تحصيل الشهر الحالي"/);
});
