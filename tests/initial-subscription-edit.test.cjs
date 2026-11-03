const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const crudSource = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function loadSubscriptionEditHelpers() {
    const sandbox = { state: { defaultSubscription: 0 }, Date };
    return vm.runInNewContext(
        crudSource + '\n({ canEditInitialSubscriptionInline, getCurrentSubscriptionAmount })',
        sandbox,
        { filename: 'js/crud.js' }
    );
}

test('an apartment with no active subscription can receive its first amount inline', () => {
    const app = loadSubscriptionEditHelpers();
    assert.equal(app.canEditInitialSubscriptionInline({ monthlyAmount: 0, subscriptionRates: [] }), true);
    assert.equal(app.canEditInitialSubscriptionInline({
        monthlyAmount: 0,
        subscriptionRates: [{ effectiveMonth: '2026-01-01', monthlyAmount: 0 }]
    }), true);
});

test('an existing or future-dated subscription must use the rate history workflow', () => {
    const app = loadSubscriptionEditHelpers();
    assert.equal(app.canEditInitialSubscriptionInline({ monthlyAmount: 100, subscriptionRates: [] }), false);
    const nextMonthDate = new Date();
    nextMonthDate.setDate(1);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;
    assert.equal(app.canEditInitialSubscriptionInline({
        monthlyAmount: 0,
        subscriptionRates: [{ effectiveMonth: nextMonth + '-01', monthlyAmount: 100 }]
    }), false);
});

test('first-time inline amount is recorded as an effective-dated rate, not a direct overwrite', () => {
    assert.match(crudSource, /if \(subscriptionChanged\) \{[\s\S]*?const effectiveMonth = getLocalMonthKey\(\);[\s\S]*?r\.subscriptionRates\.push\(\{ effectiveMonth: effectiveDate, monthlyAmount \}\)/);
    assert.match(crudSource, /logAction\('تحديد الاشتراك لأول مرة'/);
    assert.match(crudSource, /subscriptionChanged && \(previousAmount > 0 \|\| monthlyAmount <= 0 \|\| !canEditInitialSubscriptionInline\(r\)\)/);
});

test('edit form exposes first-time entry and keeps historical rate management available', () => {
    assert.match(html, /id="residentAmountHelp"/);
    assert.match(html, /id="manageSubscriptionRatesBtn" onclick="openSubscriptionRateModal\(editingResidentId\)"/);
    assert.match(crudSource, /amountInput\.readOnly = !canSetInitialSubscription/);
});
