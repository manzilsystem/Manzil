const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('dashboard keeps daily figures and actions visible', () => {
    const dashboard = html.slice(html.indexOf('id="tab-dashboard"'), html.indexOf('<!-- INCOME -->'));
    assert.match(dashboard, /aria-labelledby="quickActionsTitle"/);
    assert.match(dashboard, /id="netBalanceDisplay"/);
    assert.match(dashboard, /id="totalIncomeDisplay"/);
    assert.match(dashboard, /id="totalExpenseDisplay"/);
    assert.match(dashboard, /id="unpaidResidentsContainer"/);
});

test('dashboard announcements and secondary analytics are collapsible', () => {
    const dashboard = html.slice(html.indexOf('id="tab-dashboard"'), html.indexOf('<!-- INCOME -->'));
    assert.match(dashboard, /<details[^>]*>[\s\S]*?إعلانات العمارة[\s\S]*?id="noticeBoardContent"[\s\S]*?<\/details>/);
    assert.match(dashboard, /<details[^>]*>[\s\S]*?التحليلات والتفاصيل المالية[\s\S]*?id="cashFlowChartContainer"[\s\S]*?id="expenseCategoriesBreakdown"[\s\S]*?id="recentIncomeList"[\s\S]*?id="recentExpenseList"[\s\S]*?<\/details>/);
});

test('dashboard layout refreshes the installed app cache', () => {
    assert.match(serviceWorker, /const CACHE_NAME = 'manzil-v121';/);
});
