const { test, expect } = require('@playwright/test');
const { loadShell, advanceIncomeStep } = require('./helpers');

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
function monthLabel(offset) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function monthStartIso(offset) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

async function seedManagerSession(page, seed = {}) {
    await loadShell(page);
    await page.waitForFunction(() => typeof handleIncomeSubmit === 'function' && typeof renderAll === 'function');
    await page.evaluate(options => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        // Keep the browser test offline while still applying the balance delta the real save performs.
        window.saveWithRollback = async () => {
            syncCashboxBalancesAfterSnapshot();
            return true;
        };
        state.buildingName = 'عمارة الاختبار';
        state.managerName = 'مدير الاختبار';
        state.startingBalance = 500;
        state.paymentAllocationPolicy = 'oldest_first';
        state.residents = options.residents;
        state.income = options.income || [];
        state.expenses = [];
        state.notices = [];
        state.auditLogs = [];
        state.cashTransfers = [];
        state.cashAccountBalances = options.balances || { main: 500, development: 0, emergency: 0 };
        initializeCashboxAccountingSnapshot();
        renderAll();
    }, seed);
}

function cashboxBalances(page) {
    return page.evaluate(() => ({
        main: getCashAccountBalance('main'),
        development: getCashAccountBalance('development'),
        emergency: getCashAccountBalance('emergency')
    }));
}

async function openIncomeWizard(page) {
    await page.evaluate(() => {
        switchTab('cashbox');
        openNewIncomeModal();
    });
    await expect(page.locator('#incomeModal')).toBeVisible();
}

test('a payment covering arrears settles the oldest months first and credits the cashbox once', async ({ page }) => {
    const resident = {
        id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100,
        createdAt: monthStartIso(-3)
    };
    await seedManagerSession(page, { residents: [resident] });
    const debtBefore = await page.evaluate(() => calculateCumulativeDebt('r1').totalDebt);
    expect(debtBefore).toBeGreaterThanOrEqual(300);

    await openIncomeWizard(page);
    await page.locator('#incomeResident').selectOption('r1');
    await advanceIncomeStep(page, 2);
    // The wizard pre-selects the oldest unpaid month.
    await expect(page.locator(`#incomeMonthsGrid input[data-income-month="${monthLabel(-3)}"]`)).toBeChecked();
    await page.locator('#incomeAmount').fill('250');
    await advanceIncomeStep(page, 3);
    await page.locator('#incomePaymentMethod').selectOption('cash');

    const rows = page.locator('#incomeAllocationRows');
    await expect(rows).toContainText(monthLabel(-3));
    await expect(rows).toContainText(monthLabel(-2));
    await expect(rows).toContainText(monthLabel(-1));

    await page.locator('#incomeSubmitButton').click();
    await expect(page.locator('#incomeModal')).toBeHidden();

    const collected = await page.evaluate(() => state.income
        .map(item => ({ month: item.month, amount: item.amount }))
        .sort((a, b) => (monthLabelToKey(a.month) || '').localeCompare(monthLabelToKey(b.month) || '')));
    expect(collected).toEqual([
        { month: monthLabel(-3), amount: 100 },
        { month: monthLabel(-2), amount: 100 },
        { month: monthLabel(-1), amount: 50 }
    ]);
    expect(await cashboxBalances(page)).toEqual({ main: 750, development: 0, emergency: 0 });

    const debtAfter = await page.evaluate(() => calculateCumulativeDebt('r1').totalDebt);
    expect(debtAfter).toBe(debtBefore - 250);
});

test('a partial payment leaves the remaining balance on the same month', async ({ page }) => {
    const resident = {
        id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100,
        createdAt: monthStartIso(-3)
    };
    await seedManagerSession(page, { residents: [resident] });

    await openIncomeWizard(page);
    await page.locator('#incomeResident').selectOption('r1');
    await advanceIncomeStep(page, 2);
    await page.locator(`#incomeMonthsGrid input[data-income-month="${monthLabel(-3)}"]`).check();
    await page.locator('#incomeAmount').fill('40');
    await advanceIncomeStep(page, 3);
    await page.locator('#incomePaymentMethod').selectOption('cash');
    await page.locator('#incomeSubmitButton').click();
    await expect(page.locator('#incomeModal')).toBeHidden();

    const collected = await page.evaluate(() => state.income.map(item => ({ month: item.month, amount: item.amount })));
    expect(collected).toEqual([{ month: monthLabel(-3), amount: 40 }]);
    const outstanding = await page.evaluate(month => getMonthOutstanding(state.residents[0], month), monthLabel(-3));
    expect(outstanding).toBe(60);
    expect(await cashboxBalances(page)).toEqual({ main: 540, development: 0, emergency: 0 });
});

test('an advance payment beyond the current dues lands on future months once each', async ({ page }) => {
    const resident = {
        id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100,
        createdAt: monthStartIso(-3)
    };
    const settledIncome = [-3, -2, -1, 0].map(offset => ({
        id: `seed${offset}`, residentId: 'r1', month: monthLabel(offset), amount: 100,
        purposeCode: 'subscription', cashAccountCode: 'main', paymentMethod: 'cash',
        date: monthStartIso(offset), notes: ''
    }));
    await seedManagerSession(page, { residents: [resident], income: settledIncome });

    await openIncomeWizard(page);
    await page.locator('#incomeResident').selectOption('r1');
    await advanceIncomeStep(page, 2);
    await page.locator(`#incomeMonthsGrid input[data-income-month="${monthLabel(1)}"]`).check();
    await page.locator('#incomeAmount').fill('150');
    await advanceIncomeStep(page, 3);
    await page.locator('#incomePaymentMethod').selectOption('cash');

    const preview = page.locator('#incomeAllocationRows');
    await expect(preview).toContainText('دفعة مقدمة');

    await page.locator('#incomeSubmitButton').click();
    await expect(page.locator('#incomeModal')).toBeHidden();

    const newRows = await page.evaluate(() => state.income
        .filter(item => !String(item.id).startsWith('seed'))
        .map(item => ({ month: item.month, amount: item.amount })));
    expect(newRows).toEqual([
        { month: monthLabel(1), amount: 100 },
        { month: monthLabel(2), amount: 50 }
    ]);
    expect(await cashboxBalances(page)).toEqual({ main: 650, development: 0, emergency: 0 });
});

test('an expense above a fund balance is blocked, and a main-cashbox overdraft needs explicit confirmation', async ({ page }) => {
    await seedManagerSession(page, {
        residents: [],
        balances: { main: 500, development: 50, emergency: 0 }
    });

    await page.evaluate(() => {
        switchTab('expenses');
        openExpenseModal();
    });
    await expect(page.locator('#expenseModal')).toBeVisible();

    // A fund cannot spend more than it holds.
    await page.locator('#expenseTitle').fill('صيانة مصعد');
    await page.locator('#expenseAmount').fill('100');
    await page.locator('#expenseCashAccount').selectOption('development');
    await page.locator('#expenseSubmitButton').click();
    await expect(page.locator('#toastContainer')).toContainText('غير كاف');
    expect(await page.evaluate(() => state.expenses.length)).toBe(0);
    expect(await cashboxBalances(page)).toEqual({ main: 500, development: 50, emergency: 0 });

    // The main cashbox cannot go negative without the explicit checkbox.
    await page.locator('#expenseCashAccount').selectOption('main');
    await page.locator('#expenseAmount').fill('600');
    await page.locator('#expenseSubmitButton').click();
    await expect(page.locator('#toastContainer')).toContainText('تأكيدًا صريحًا');
    expect(await page.evaluate(() => state.expenses.length)).toBe(0);

    // With the checkbox the overdraft is recorded and audited.
    await page.locator('#expenseOverdraftConfirm').check();
    await page.locator('#expenseSubmitButton').click();
    await expect(page.locator('#expenseModal')).toBeHidden();
    expect(await page.evaluate(() => state.expenses.map(item => item.amount))).toEqual([600]);
    expect(await cashboxBalances(page)).toEqual({ main: -100, development: 50, emergency: 0 });
    expect(await page.evaluate(() => state.auditLogs.some(entry => entry.action === 'تجاوز رصيد الخزنة'))).toBe(true);
});

test('with selected-month-first policy a large payment charges the selected month once and rolls to the next month', async ({ page }) => {
    const resident = {
        id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100,
        createdAt: monthStartIso(-3)
    };
    const settledIncome = [-3, -2, -1].map(offset => ({
        id: `seed${offset}`, residentId: 'r1', month: monthLabel(offset), amount: 100,
        purposeCode: 'subscription', cashAccountCode: 'main', paymentMethod: 'cash',
        date: monthStartIso(offset), notes: ''
    }));
    await seedManagerSession(page, { residents: [resident], income: settledIncome });
    await page.evaluate(() => { state.paymentAllocationPolicy = 'selected_month_first'; });

    await openIncomeWizard(page);
    await page.locator('#incomeResident').selectOption('r1');
    await advanceIncomeStep(page, 2);
    // Only the current month is due; the wizard pre-selects it. Pay 250.
    await expect(page.locator(`#incomeMonthsGrid input[data-income-month="${monthLabel(0)}"]`)).toBeChecked();
    await page.locator('#incomeAmount').fill('250');
    await advanceIncomeStep(page, 3);
    await page.locator('#incomePaymentMethod').selectOption('cash');

    await page.locator('#incomeSubmitButton').click();
    await expect(page.locator('#incomeModal')).toBeHidden();

    const newRows = await page.evaluate(() => state.income
        .filter(item => !String(item.id).startsWith('seed'))
        .map(item => ({ month: item.month, amount: item.amount })));
    const perMonth = {};
    for (const row of newRows) perMonth[row.month] = (perMonth[row.month] || 0) + row.amount;
    expect(perMonth).toEqual({
        [monthLabel(0)]: 100,
        [monthLabel(1)]: 100,
        [monthLabel(2)]: 50
    });
    expect(newRows.filter(row => row.month === monthLabel(0)).length).toBe(1);
    expect(await cashboxBalances(page)).toEqual({ main: 750, development: 0, emergency: 0 });
});
