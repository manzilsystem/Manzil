const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function seedManager(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof handleIncomeResidentChange === 'function' && typeof renderAll === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        window.saveWithRollback = async () => true;
        const now = new Date();
        const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 10);
        const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        state.buildingName = 'عمارة الاختبار';
        state.managerName = 'مدير الاختبار';
        state.defaultSubscription = 100;
        state.subscriptionDueDay = 28;
        state.subscriptionGraceDays = 10;
        state.paymentAllocationPolicy = 'oldest_first';
        state.residents = [
            {
                id: 'r10', name: 'سامي', apartmentNumber: '10', monthlyAmount: 100,
                createdAt: twoMonthsAgo.toISOString(),
                subscriptionRates: [{ effectiveMonth: `${twoMonthsAgo.getFullYear()}-${String(twoMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`, monthlyAmount: 100 }]
            },
            { id: 'r2', name: 'منى', apartmentNumber: '2', monthlyAmount: 100, createdAt: twoMonthsAgo.toISOString() },
            { id: 'r1', name: 'أحمد', apartmentNumber: '1', monthlyAmount: 100, createdAt: twoMonthsAgo.toISOString() }
        ];
        state.income = [{
            id: 'i1',
            residentId: 'r1',
            amount: 100,
            month: `${monthsNames[previous.getMonth()]} ${previous.getFullYear()}`,
            date: previous.toISOString(),
            paymentMethod: 'instapay',
            purposeCode: 'subscription',
            cashAccountCode: 'main',
            notes: 'سداد متأخرات · تحويل بنكي'
        }];
        state.expenses = [];
        state.cashTransfers = [];
        state.cashAccountBalances = { main: 0, development: 0, emergency: 0 };
        initializeCashboxAccountingSnapshot();
        renderAll();
        switchTab('income');
    });
}

async function monthNames(page) {
    return page.evaluate(() => {
        const now = new Date();
        const current = new Date(now.getFullYear(), now.getMonth(), 1);
        const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const twoMonthsBack = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const label = date => `${monthsNames[date.getMonth()]} ${date.getFullYear()}`;
        return {
            current: label(current),
            previous: label(previous),
            next: label(next),
            twoMonthsBack: label(twoMonthsBack)
        };
    });
}

test('apartment choices are sorted, labelled and summarized before collecting', async ({ page }) => {
    await seedManager(page);
    await page.evaluate(() => openNewIncomeModal());

    const options = await page.locator('#incomeResident option').allTextContents();
    expect(options).toEqual(['اختر الشقة', 'شقة 1 · أحمد', 'شقة 2 · منى', 'شقة 10 · سامي']);

    await page.locator('#incomeResident').selectOption('r1');
    const summary = page.locator('#incomeResidentSummary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('شقة 1 · أحمد');
    await expect(summary).toContainText('الاشتراك الحالي');
    await expect(summary).toContainText('المتأخرات');
});

test('the month grid shows payment status and preselects the oldest unpaid month', async ({ page }) => {
    await seedManager(page);
    const months = await monthNames(page);
    await page.evaluate(() => openNewIncomeModal());
    await page.locator('#incomeResident').selectOption('r1');

    const grid = page.locator('#incomeMonthsGrid');
    await expect(grid.locator('input[data-income-month]').first()).toBeVisible();
    await expect(grid.locator(`input[data-income-month="${months.previous}"]`)).not.toBeChecked();
    await expect(grid.locator('.income-month-row').filter({ hasText: months.previous })).toContainText('مسدد');

    const oldestUnpaid = grid.locator('input[data-income-month]:checked');
    await expect(oldestUnpaid).toHaveCount(1);
    await expect(oldestUnpaid).toHaveValue(/./);
    const selectedMonth = await oldestUnpaid.getAttribute('data-income-month');
    expect(selectedMonth).not.toBe(months.previous);
    await expect(page.locator('#incomeAmount')).toHaveValue('100');
    await expect(page.locator('#incomeMonthsSummary')).toContainText('شهر');
    await expect(page.locator('#incomeOutstandingHint')).toContainText('متأخرات');
});

test('quick month actions select arrears, the current month, two or three months, and clear', async ({ page }) => {
    await seedManager(page);
    const months = await monthNames(page);
    await page.evaluate(() => openNewIncomeModal());
    await page.locator('#incomeResident').selectOption('r2');

    await page.getByRole('button', { name: 'المتأخرات' }).click();
    await expect(page.locator('#incomeMonthsGrid input[data-income-month]:checked')).toHaveCount(2);
    await expect(page.locator('#incomeAmount')).toHaveValue('200');

    await page.getByRole('button', { name: 'الشهر الحالي' }).click();
    await expect(page.locator('#incomeMonthsGrid input[data-income-month]:checked')).toHaveCount(1);
    await expect(page.locator(`#incomeMonthsGrid input[data-income-month="${months.current}"]`)).toBeChecked();
    await expect(page.locator('#incomeAmount')).toHaveValue('100');

    await page.getByRole('button', { name: '3 أشهر' }).click();
    await expect(page.locator('#incomeMonthsGrid input[data-income-month]:checked')).toHaveCount(3);
    await expect(page.locator('#incomeAmount')).toHaveValue('300');

    await page.getByRole('button', { name: 'شهرين' }).click();
    await expect(page.locator('#incomeMonthsGrid input[data-income-month]:checked')).toHaveCount(2);
    await expect(page.locator(`#incomeMonthsGrid input[data-income-month="${months.twoMonthsBack}"]`)).toBeChecked();
    await expect(page.locator(`#incomeMonthsGrid input[data-income-month="${months.current}"]`)).not.toBeChecked();
    await expect(page.locator('#incomeAmount')).toHaveValue('200');

    await page.getByRole('button', { name: 'مسح' }).click();
    await expect(page.locator('#incomeMonthsGrid input[data-income-month]:checked')).toHaveCount(0);
    await expect(page.locator('#incomeAmount')).toHaveValue('');
    await expect(page.locator('#incomeAllocationPreview')).toBeHidden();
});

test('paying last month and the current month records both months', async ({ page }) => {
    await seedManager(page);
    const months = await monthNames(page);
    await page.evaluate(() => openNewIncomeModal());
    await page.locator('#incomeResident').selectOption('r2');

    await page.getByRole('button', { name: 'مسح' }).click();
    await page.locator(`#incomeMonthsGrid input[data-income-month="${months.previous}"]`).check();
    await page.locator(`#incomeMonthsGrid input[data-income-month="${months.current}"]`).check();

    await expect(page.locator('#incomeAmount')).toHaveValue('200');
    await expect(page.locator('#incomeAllocationSummary')).toContainText('2 شهر');
    await expect(page.locator('#incomeAllocationRows')).toContainText(months.previous);
    await expect(page.locator('#incomeAllocationRows')).toContainText(months.current);

    await page.locator('#incomePaymentMethod').selectOption('cash');
    await page.locator('#incomeSubmitButton').click();
    await expect(page.locator('#incomeModal')).toBeHidden();

    const saved = await page.evaluate(() => state.income
        .filter(item => item.residentId === 'r2')
        .map(item => ({ month: item.month, amount: item.amount })));
    expect(saved).toHaveLength(2);
    expect(new Set(saved.map(item => item.month))).toEqual(new Set([months.previous, months.current]));
    expect(saved.every(item => item.amount === 100)).toBe(true);
});

test('a late month can be settled alone and is marked as overdue in the preview', async ({ page }) => {
    await seedManager(page);
    const months = await monthNames(page);
    await page.evaluate(() => openNewIncomeModal());
    await page.locator('#incomeResident').selectOption('r2');

    await page.getByRole('button', { name: 'مسح' }).click();
    await page.locator(`#incomeMonthsGrid input[data-income-month="${months.previous}"]`).check();

    await expect(page.locator('#incomeAmount')).toHaveValue('100');
    await expect(page.locator('#incomeAllocationSummary')).toContainText('شهورًا متأخرة');
    await expect(page.locator('#incomeAllocationRows')).toContainText('متأخر');

    await page.locator('#incomePaymentMethod').selectOption('cash');
    await page.locator('#incomeSubmitButton').click();
    await expect(page.locator('#incomeModal')).toBeHidden();
    expect(await page.evaluate(() => state.income
        .filter(item => item.residentId === 'r2')
        .map(item => item.month))).toEqual([months.previous]);
});

test('payment notes can be picked quickly and appear in the manager receipt', async ({ page }) => {
    await seedManager(page);

    await page.evaluate(() => openNewIncomeModal());
    await page.getByRole('button', { name: 'سداد متأخرات' }).click();
    await expect(page.locator('#incomeNotes')).toHaveValue('سداد متأخرات');
    await page.getByRole('button', { name: 'تسوية حساب' }).click();
    await expect(page.locator('#incomeNotes')).toHaveValue('سداد متأخرات · تسوية حساب');

    await page.evaluate(() => closeModal('incomeModal'));
    await page.getByTitle('عرض الإيصال وطباعته').first().click();
    const modal = page.locator('#incomeReceiptModal');
    await expect(modal).toBeVisible();
    await expect(page.locator('#incomeReceiptContent')).toContainText('ملاحظات الدفع');
    await expect(page.locator('#incomeReceiptContent')).toContainText('سداد متأخرات');
    await expect(page.locator('#incomeReceiptContent')).toContainText('إجمالي المبلغ المستلم');
    await expect(page.locator('#incomeReceiptContent')).toContainText('شقة 1');
});
