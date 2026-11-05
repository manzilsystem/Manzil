const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function seedManagerSession(page, income = []) {
    await loadShell(page);
    await page.waitForFunction(() => typeof handleIncomeSubmit === 'function' && typeof renderAll === 'function');
    await page.evaluate(seededIncome => {
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
        state.residents = [{
            id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100,
            createdAt: '2024-01-01T00:00:00.000Z'
        }];
        state.income = seededIncome;
        state.expenses = [];
        state.notices = [];
        state.auditLogs = [];
        state.cashTransfers = [];
        state.cashAccountBalances = { main: 500, development: 0, emergency: 0 };
        initializeCashboxAccountingSnapshot();
        renderAll();
    }, income);
}

function cashboxBalances(page) {
    return page.evaluate(() => ({
        main: getCashAccountBalance('main'),
        development: getCashAccountBalance('development'),
        emergency: getCashAccountBalance('emergency')
    }));
}

test('collecting into a fund box routes the money there instead of the main box', async ({ page }) => {
    await seedManagerSession(page);
    await page.evaluate(() => {
        switchTab('cashbox');
        openNewIncomeModal();
    });
    await expect(page.locator('#incomeModal')).toBeVisible();
    await expect(page.locator('#incomeCashAccount')).toHaveValue('main');
    await expect(page.locator('#incomeCashAccount')).toBeDisabled();

    await page.locator('#incomeResident').selectOption('r1');
    await page.locator('#incomePaymentMethod').selectOption('cash');
    await page.locator('#incomeAmount').fill('100');
    await page.locator('#incomePurpose').selectOption('development');
    await expect(page.locator('#incomeCashAccount')).toHaveValue('development');
    await expect(page.locator('#incomeCashAccount')).toBeDisabled();

    const preview = page.locator('#incomeAllocationRows');
    await expect(preview).toContainText('الصندوق المستلم');
    await expect(preview.locator('.cash-account-tag')).toHaveText('صندوق التطوير');

    await page.locator('#incomeSubmitButton').click();
    await expect(page.locator('#incomeModal')).toBeHidden();

    const collected = await page.evaluate(() => state.income.map(item => ({
        amount: item.amount,
        cashAccountCode: item.cashAccountCode,
        purposeCode: item.purposeCode
    })));
    expect(collected.length).toBeGreaterThan(0);
    expect(collected.every(item => item.cashAccountCode === 'development')).toBe(true);
    expect(collected.every(item => item.purposeCode === 'development')).toBe(true);
    expect(collected.reduce((sum, item) => sum + item.amount, 0)).toBe(100);
    expect(await cashboxBalances(page)).toEqual({ main: 500, development: 100, emergency: 0 });
    await expect(page.locator('#cashBalance-development')).toContainText('100');
    await expect(page.locator('#cashBalance-main')).toContainText('500');

    const auditDetail = await page.evaluate(() => state.auditLogs[0]?.details || '');
    expect(auditDetail).toContain('صندوق التطوير');

    await page.evaluate(() => switchTab('income'));
    await expect(page.locator('#tab-income .cash-account-tag').nth(0)).toHaveText('تطوير');
    await expect(page.locator('#tab-income .cash-account-tag').nth(1)).toHaveText('صندوق التطوير');
});

test('non-subscription collections are not split across subscription months', async ({ page }) => {
    await seedManagerSession(page);
    const month = await page.evaluate(() => getCurrentMonth());
    await page.evaluate(() => openNewIncomeModal());

    await page.locator('#incomeResident').selectOption('r1');
    await page.locator('#incomePaymentMethod').selectOption('cash');
    await page.locator('#incomeAmount').fill('75');
    await page.locator('#incomePurpose').selectOption('services');
    await expect(page.locator('#incomeCashAccount')).toHaveValue('main');
    await expect(page.locator('#incomeCashAccount')).toBeEnabled();
    await expect(page.locator('#incomeMonthLabel')).toHaveText('شهر تسجيل التحصيل');

    await page.locator('#incomeSubmitButton').click();
    await expect(page.locator('#incomeModal')).toBeHidden();

    const saved = await page.evaluate(() => state.income.map(item => ({
        amount: item.amount,
        month: item.month,
        purposeCode: item.purposeCode,
        cashAccountCode: item.cashAccountCode
    })));
    expect(saved).toEqual([{ amount: 75, month, purposeCode: 'services', cashAccountCode: 'main' }]);
    expect(await page.evaluate(currentMonth => getMonthOutstanding(state.residents[0], currentMonth), month)).toBe(100);
    expect(await cashboxBalances(page)).toEqual({ main: 575, development: 0, emergency: 0 });
    expect(await page.evaluate(() => state.auditLogs[0]?.action || '')).toBe('تحصيل خدمات ونظافة');
});

test('editing a collection moves its amount between cash boxes', async ({ page }) => {
    await seedManagerSession(page);
    const current = await page.evaluate(() => getCurrentMonth());

    await page.evaluate(month => {
        state.income = [{
            id: 'i1', residentId: 'r1', amount: 60, month, paymentMethod: 'cash',
            cashAccountCode: 'main', date: new Date().toISOString()
        }];
        syncCashboxBalancesAfterSnapshot();
        renderAll();
    }, current);
    expect(await cashboxBalances(page)).toEqual({ main: 560, development: 0, emergency: 0 });

    await page.evaluate(() => openIncomeEditModal('i1'));
    await expect(page.locator('#incomeEditModal')).toBeVisible();
    await expect(page.locator('#incomeEditCashAccount')).toHaveValue('main');

    await page.locator('#incomeEditCashAccount').selectOption('emergency');
    await page.locator('#incomeEditSubmitButton').click();
    await expect(page.locator('#incomeEditModal')).toBeHidden();

    const stored = await page.evaluate(() => state.income.map(item => ({
        amount: item.amount, cashAccountCode: item.cashAccountCode
    })));
    expect(stored).toEqual([{ amount: 60, cashAccountCode: 'emergency' }]);
    expect(await cashboxBalances(page)).toEqual({ main: 500, development: 0, emergency: 60 });
    expect(await page.evaluate(() => state.auditLogs[0]?.details || '')).toContain('صندوق الصيانة الطارئة');
});

test('cashbox monthly summary separates collections, spending and internal transfers', async ({ page }) => {
    await seedManagerSession(page);
    const month = await page.evaluate(() => getCurrentMonth());

    await page.evaluate(currentMonth => {
        state.income = [{
            id: 'i1', residentId: 'r1', amount: 120, month: currentMonth, paymentMethod: 'cash',
            cashAccountCode: 'development', date: new Date().toISOString()
        }];
        state.expenses = [{
            id: 'e1', title: 'كهرباء', amount: 30, category: 'كهرباء', month: currentMonth,
            cashAccountCode: 'development', date: new Date().toISOString()
        }];
        state.cashTransfers = [{
            id: 't1', fromAccountCode: 'main', toAccountCode: 'development',
            amount: 50, notes: '', transferredAt: new Date().toISOString()
        }];
        syncCashboxBalancesAfterSnapshot();
        switchTab('cashbox');
        renderAll();
    }, month);

    await expect(page.locator('#cashboxSummaryMonth')).toHaveValue(month);
    const rows = page.locator('#cashboxSummaryRows article');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('الخزنة الرئيسية');
    await expect(rows.nth(0)).toContainText('صافي صادر');
    await expect(rows.nth(1)).toContainText('صندوق التطوير');
    await expect(rows.nth(1)).toContainText('صافي وارد');
    await expect(rows.nth(2)).toContainText('صندوق الصيانة الطارئة');
    const developmentNet = await page.evaluate(() => {
        const select = document.getElementById('cashboxSummaryMonth');
        select.value = getCurrentMonth();
        const totals = calculateFundMovement(select.value);
        const bucket = totals.development;
        return bucket.income + bucket.transfersIn - bucket.expenses - bucket.transfersOut;
    });
    expect(developmentNet).toBe(14000);
});
