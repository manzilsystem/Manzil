const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'render.js'), 'utf8');
const start = source.indexOf('function renderDashboard() {');
const end = source.indexOf('\nfunction renderCashFlowChart(', start);
if (start < 0 || end < 0) throw new Error('renderDashboard function not found');
const dashboardSource = source.slice(start, end);

test('dashboard collection rate uses the effective subscription rate for the current month', () => {
    const elements = new Map();
    const document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, {
                textContent: '',
                className: '',
                style: {},
                parentElement: { setAttribute() {} },
                setAttribute() {}
            });
            return elements.get(id);
        }
    };
    const currentMonth = 'نوفمبر 2026';
    const sandbox = {
        state: {
            residents: [
                { id: 'r1', monthlyAmount: 100, subscriptionRates: [{ effectiveMonth: '2026-11-01', monthlyAmount: 150 }] }
            ],
            income: [{ residentId: 'r1', month: currentMonth, amount: 75 }],
            expenses: [],
            startingBalance: 0,
            defaultSubscription: 100
        },
        document,
        getDashboardPeriod: () => 'current',
        getDashboardPeriodLabel: () => currentMonth,
        getDashboardPeriodMonths: () => [currentMonth],
        matchesDashboardPeriod: record => record.month === currentMonth,
        getCurrentMonth: () => currentMonth,
        getSubscriptionAmountForMonth: (_resident, month) => month === currentMonth ? 150 : 100,
        getPaidAmountForMonth: () => 75,
        fmtNum: value => String(value),
        renderCashFlowChart() {},
        renderUnpaidResidents() {},
        renderExpenseBreakdown() {},
        renderRecent() {}
    };
    vm.runInNewContext(dashboardSource + '\nrenderDashboard();', sandbox, { filename: 'js/render.js' });

    assert.equal(elements.get('collectionRateDisplay').textContent, '50%');
    assert.equal(elements.get('currentMonthPaidDisplay').textContent, '75 ج.م');
    assert.equal(elements.get('collectionRateBar').style.width, '50%');
});
