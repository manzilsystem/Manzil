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
    assert.match(serviceWorker, /const CACHE_NAME = 'manzil-[0-9a-f]{10}';/);
});

test('dashboard KPI cards share one responsive row with the treasury balance', () => {
    const dashboard = html.slice(html.indexOf('id="tab-dashboard"'), html.indexOf('<!-- INCOME -->'));
    assert.match(dashboard, /class="dashboard-kpis grid grid-cols-2 lg:grid-cols-3[^"]*"[\s\S]*?id="totalIncomeDisplay"[\s\S]*?id="totalExpenseDisplay"[\s\S]*?class="[^"]*dashboard-balance[^"]*"[\s\S]*?id="netBalanceDisplay"/);
    assert.equal((dashboard.match(/لوحة إعلانات العمارة/g) || []).length, 1);
});

test('dashboard keeps key numbers first and folds long lists', () => {
    const dashboard = html.slice(html.indexOf('id="tab-dashboard"'), html.indexOf('<!-- INCOME -->'));
    const pos = id => dashboard.indexOf(id);
    assert.ok(pos('id="totalIncomeDisplay"') < pos('aria-labelledby="quickActionsTitle"'));
    assert.ok(pos('aria-labelledby="quickActionsTitle"') < pos('id="monthSummaryTitle"'));
    assert.match(dashboard, /<details[^>]*dashboard-arrears[^>]*>[\s\S]*?id="unpaidResidentsContainer"[\s\S]*?<\/details>/);
    assert.match(dashboard, /<details[\s\S]*?id="dashboardPeriodFilter"[\s\S]*?id="cashFlowChartContainer"/);
});

test('arrears warning triangle shows only when a late payer exists', () => {
    const tabs = fs.readFileSync(path.join(__dirname, '..', 'src/partials/main-tabs.html'), 'utf8');
    const render = fs.readFileSync(path.join(__dirname, '..', 'js/render.js'), 'utf8');
    assert.match(tabs, /<i id="unpaidResidentsWarning" class="hidden fa-solid fa-triangle-exclamation/);
    const fn = render.slice(render.indexOf('function renderUnpaidResidents()'), render.indexOf('function renderExpenseBreakdown'));
    assert.match(fn, /warning\.classList\.add\('hidden'\)/);
    assert.match(fn, /if \(warning && list\.length\) warning\.classList\.remove\('hidden'\)/);
});

test('empty dashboard shows a 3-step starter card that hides once apartments exist', () => {
    const tabs = fs.readFileSync(path.join(__dirname, '..', 'src/partials/main-tabs.html'), 'utf8');
    const render = fs.readFileSync(path.join(__dirname, '..', 'js/render.js'), 'utf8');
    const card = tabs.slice(tabs.indexOf('id="dashboardStarterCard"'), tabs.indexOf('</section>', tabs.indexOf('id="dashboardStarterCard"')));
    assert.match(card, /class="hidden /);
    for (const text of ['إعدادات المبنى', 'إضافة الشقق', 'تسجيل أول تحصيل', 'عم عبده']) assert.ok(card.includes(text), text);
    assert.equal((card.match(/<li/g) || []).length, 3);
    assert.match(render, /starterCard && starterCard\.classList\) starterCard\.classList\[state\.residents\.length > 0 \? 'add' : 'remove'\]\('hidden'\)/);
});
