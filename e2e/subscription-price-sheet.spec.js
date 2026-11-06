const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function seedManager(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof openSubscriptionPriceSheet === 'function' && typeof renderAll === 'function');
    return page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        window.saveWithRollback = async () => true;
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        state.buildingName = 'عمارة الاختبار';
        state.defaultSubscription = 100;
        state.residents = [
            {
                id: 'r10', name: 'سامي', apartmentNumber: '10', monthlyAmount: 100,
                createdAt: '2024-01-01T00:00:00.000Z',
                subscriptionRates: [{ effectiveMonth: month + '-01', monthlyAmount: 100 }]
            },
            {
                id: 'r2', name: 'منى', apartmentNumber: '2', monthlyAmount: 100,
                createdAt: '2024-01-01T00:00:00.000Z',
                subscriptionRates: [{ effectiveMonth: month + '-01', monthlyAmount: 100 }]
            }
        ];
        state.income = [];
        state.expenses = [];
        initializeCashboxAccountingSnapshot();
        renderAll();
        switchTab('residents');
        return month;
    });
}

test('the monthly price sheet updates every apartment through one save', async ({ page }) => {
    const month = await seedManager(page);

    await page.getByRole('button', { name: 'ورقة أسعار الاشتراك الشهرية' }).click();
    await expect(page.locator('#subscriptionPriceSheetModal')).toBeVisible();
    await expect(page.locator('#subscriptionPriceSheetMonth')).toHaveValue(month);

    const apartmentOrder = await page.locator('#subscriptionPriceSheetBody tr td:first-child').allTextContents();
    expect(apartmentOrder).toEqual(['شقة 2 · منى', 'شقة 10 · سامي']);
    await expect(page.locator('#subscriptionPriceSheetBody input').first()).toHaveValue('100');
    await expect(page.locator('#subscriptionPriceSheetSave')).toBeDisabled();

    await page.locator('#subscriptionPriceSheetUniform').fill('150');
    await page.getByRole('button', { name: 'تعبئة الكل' }).click();
    await expect(page.locator('#subscriptionPriceSheetSummary')).toContainText('سيتم تحديث 2 شقة');
    await expect(page.locator('#subscriptionPriceSheetSave')).toBeEnabled();

    await page.getByRole('button', { name: 'حفظ أسعار الشهر' }).click();
    await expect(page.locator('#subscriptionPriceSheetModal')).toBeHidden();
    await expect(page.locator('#toastContainer')).toContainText('تم حفظ أسعار');

    const saved = await page.evaluate(monthKey => state.residents.map(resident => {
        const rate = resident.subscriptionRates.find(item => item.effectiveMonth === monthKey + '-01');
        return { id: resident.id, rate: rate && rate.monthlyAmount, current: resident.monthlyAmount };
    }), month);
    expect(saved).toEqual([
        { id: 'r10', rate: 150, current: 150 },
        { id: 'r2', rate: 150, current: 150 }
    ]);
});
