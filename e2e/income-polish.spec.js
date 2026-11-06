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

test('month choices cover the recent year and show payment status', async ({ page }) => {
    await seedManager(page);
    await page.evaluate(() => openNewIncomeModal());
    await page.locator('#incomeResident').selectOption('r1');

    const months = await page.locator('#incomeMonth option').allTextContents();
    expect(months.length).toBe(12);
    expect(months.some(month => month.includes('شهر آخر'))).toBe(false);
    expect(months.some(month => month.includes('2021'))).toBe(false);
    expect(months.at(-1)).toContain('100 ج.م');
    expect(months.at(-2)).toContain('مسدد');

    await page.locator('#incomeMonth').selectOption({ index: months.length - 3 });
    await expect(page.locator('#incomeAllocationModeWrap')).toBeVisible();
    await expect(page.locator('#incomeAllocationMode')).toHaveValue('selected');
    await expect(page.locator('#incomeOutstandingHint')).toContainText('شهر متأخر');
});

test('a past month is offered directly and settled first without extra choices', async ({ page }) => {
    await seedManager(page);
    await page.evaluate(() => openNewIncomeModal());
    await page.locator('#incomeResident').selectOption('r2');

    const target = await page.evaluate(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return `${monthsNames[d.getMonth()]} ${d.getFullYear()}`;
    });
    await page.locator('#incomeMonth').selectOption(target);
    await expect(page.locator('#incomeAllocationMode')).toHaveValue('selected');
    await expect(page.locator('#incomeMonth option:checked')).toContainText(target);

    await page.locator('#incomeAmount').fill('100');
    await page.locator('#incomePaymentMethod').selectOption('cash');
    await expect(page.locator('#incomeAllocationSummary')).toContainText('بدءًا من الشهر المحدد');
    await expect(page.locator('#incomeAllocationRows')).toContainText(target);

    await page.locator('#incomeSubmitButton').click();
    await expect(page.locator('#incomeModal')).toBeHidden();
    const savedMonths = await page.evaluate(() => state.income.map(item => item.month));
    expect(savedMonths).toContain(target);
});

test('the allocation mode can still return to the building policy', async ({ page }) => {
    await seedManager(page);
    await page.evaluate(() => openNewIncomeModal());
    await page.locator('#incomeResident').selectOption('r2');

    const target = await page.evaluate(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return `${monthsNames[d.getMonth()]} ${d.getFullYear()}`;
    });
    await page.locator('#incomeMonth').selectOption(target);
    await page.locator('#incomeAmount').fill('100');
    await page.locator('#incomePaymentMethod').selectOption('cash');

    await expect(page.locator('#incomeAllocationSummary')).toContainText('بدءًا من الشهر المحدد');
    await page.locator('#incomeAllocationMode').selectOption('policy');
    await expect(page.locator('#incomeAllocationSummary')).toContainText('أقدم شهر غير مسدد');
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
