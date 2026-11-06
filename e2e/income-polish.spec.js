const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

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

test('month choices start at the apartment record and show payment status', async ({ page }) => {
    await seedManager(page);
    await page.evaluate(() => openNewIncomeModal());
    await page.locator('#incomeResident').selectOption('r1');

    const months = await page.locator('#incomeMonth option').allTextContents();
    expect(months.length).toBe(4);
    expect(months.at(-1)).toBe('شهر آخر…');
    expect(months.some(month => month.includes('2021'))).toBe(false);
    expect(months.at(-2)).toContain('مستحق 100 ج.م');
    expect(months[1]).toContain('مسدد');

    await page.locator('#incomeMonth').selectOption({ index: 0 });
    await expect(page.locator('#incomeAllocationModeWrap')).toBeVisible();
    await expect(page.locator('#incomeOutstandingHint')).toContainText('شهر متأخر');
});

test('a missing past month can be picked manually beyond the apartment history', async ({ page }) => {
    await seedManager(page);
    await page.evaluate(() => openNewIncomeModal());
    await page.locator('#incomeResident').selectOption('r1');

    await page.locator('#incomeMonth').selectOption('__custom__');
    await expect(page.locator('#incomeCustomMonthWrap')).toBeVisible();

    const target = new Date();
    target.setMonth(target.getMonth() - 6);
    const expected = `${arabicMonths[target.getMonth()]} ${target.getFullYear()}`;
    await page.locator('#incomeCustomMonthSelect').selectOption(String(target.getMonth()));
    await page.locator('#incomeCustomYearSelect').selectOption(String(target.getFullYear()));
    await page.getByRole('button', { name: 'اعتماد الشهر المختار' }).click();

    await expect(page.locator('#incomeMonth')).toHaveValue(expected);
    await expect(page.locator('#incomeCustomMonthWrap')).toBeHidden();
    await expect(page.locator('#incomeCustomMonthHint')).toContainText(expected);
    await expect(page.locator('#incomeOutstandingHint')).toContainText('شهر متأخر');
});

test('a late month can be settled first from the allocation mode', async ({ page }) => {
    await seedManager(page);
    await page.evaluate(() => openNewIncomeModal());
    await page.locator('#incomeResident').selectOption('r1');
    await page.locator('#incomeMonth').selectOption({ index: 0 });
    await page.locator('#incomeAmount').fill('100');
    await page.locator('#incomePaymentMethod').selectOption('cash');

    await expect(page.locator('#incomeAllocationSummary')).toContainText('أقدم شهر غير مسدد');
    await page.locator('#incomeAllocationMode').selectOption('selected');
    await expect(page.locator('#incomeAllocationSummary')).toContainText('بدءًا من الشهر المحدد');
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
