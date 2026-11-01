const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const renderSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'render.js'), 'utf8');
const monthsNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function monthLabel(date) {
    return `${monthsNames[date.getMonth()]} ${date.getFullYear()}`;
}

function makeDashboard(period) {
    const elements = new Map();
    const getElement = id => {
        if (!elements.has(id)) elements.set(id, {
            id, value: '', textContent: '', className: '', innerHTML: '', attributes: {}, style: {},
            setAttribute(name, value) { this.attributes[name] = value; },
        });
        return elements.get(id);
    };
    getElement('dashboardPeriodFilter').value = period;
    const now = new Date();
    const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const olderDate = new Date(now.getFullYear(), now.getMonth() - 7, 1);
    const current = monthLabel(now);
    const previous = monthLabel(previousDate);
    const older = monthLabel(olderDate);
    const state = {
        income: [
            { month: current, amount: 40 },
            { month: previous, amount: 5 },
            { month: older, amount: 1000 },
        ],
        expenses: [
            { month: current, amount: 10, category: 'صيانة' },
            { month: previous, amount: 2, category: 'نظافة' },
            { month: older, amount: 500, category: 'ترميم' },
        ],
        residents: [], defaultSubscription: 0, startingBalance: 100,
    };
    const app = vm.runInNewContext(
        `${renderSource}\nrenderCashFlowChart = period => { document.getElementById('cashFlowPeriodLabel').textContent = period; }; renderUnpaidResidents = () => {}; renderRecent = () => {};\n({ renderDashboard, getDashboardPeriodLabel })`,
        {
            state, monthsNames,
            document: { getElementById: getElement },
            getCurrentMonth: () => current,
            getActiveBuildingMonths: () => [older, previous, current],
            getPaidAmountForMonth: () => 0,
            fmtNum: value => String(value),
            esc: value => String(value),
        },
        { filename: 'js/render.js' }
    );
    return { app, elements, current };
}

test('dashboard exposes a unified period filter and states the range of affected visuals', () => {
    assert.match(html, /id="dashboardPeriodFilter" onchange="renderDashboard\(\)"/);
    assert.match(html, /<option value="all">كل السجل<\/option>/);
    assert.match(html, /<option value="current">الشهر الحالي<\/option>/);
    assert.match(html, /<option value="last6">آخر 6 أشهر<\/option>/);
    assert.match(html, /id="cashFlowPeriodLabel"/);
    assert.match(html, /id="expenseBreakdownPeriodLabel"/);
});

test('current-month filter updates income, expenses and category breakdown but leaves cash balance lifetime', () => {
    const { app, elements, current } = makeDashboard('current');
    app.renderDashboard();
    assert.equal(elements.get('totalIncomeDisplay').textContent, '40 ج.م');
    assert.equal(elements.get('totalExpenseDisplay').textContent, '10 ج.م');
    assert.match(elements.get('incomePeriodLabel').textContent, new RegExp(current));
    assert.match(elements.get('expensePeriodLabel').textContent, new RegExp(current));
    assert.equal(elements.get('netBalanceDisplay').textContent, '633 ج.م');
    assert.match(elements.get('expenseCategoriesBreakdown').innerHTML, /صيانة/);
    assert.doesNotMatch(elements.get('expenseCategoriesBreakdown').innerHTML, /نظافة|ترميم/);
});

test('all-records filter preserves lifetime totals', () => {
    const { app, elements } = makeDashboard('all');
    app.renderDashboard();
    assert.equal(elements.get('totalIncomeDisplay').textContent, '1045 ج.م');
    assert.equal(elements.get('totalExpenseDisplay').textContent, '512 ج.م');
    assert.equal(elements.get('netBalanceDisplay').textContent, '633 ج.م');
});

test('last-six-month filter excludes older transactions while keeping the lifetime cash balance', () => {
    const { app, elements, current } = makeDashboard('last6');
    app.renderDashboard();
    assert.equal(elements.get('totalIncomeDisplay').textContent, '45 ج.م');
    assert.equal(elements.get('totalExpenseDisplay').textContent, '12 ج.م');
    assert.equal(elements.get('netBalanceDisplay').textContent, '633 ج.م');
    assert.equal(elements.get('cashFlowPeriodLabel').textContent, 'last6');
    assert.equal(app.getDashboardPeriodLabel('last6').split(' – ').at(-1), current);
    assert.match(elements.get('expenseBreakdownPeriodLabel').textContent, / – /);
});
