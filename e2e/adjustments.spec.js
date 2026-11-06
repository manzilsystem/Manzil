const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function openAdjustments(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.openResidentProfile === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.buildingName = 'عمارة الاختبار';
        state.managerName = 'مدير الاختبار';
        state.residents = [{
            id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100,
            createdAt: '2024-01-01T00:00:00.000Z',
            subscriptionRates: [{ effectiveMonth: '2024-01-01', monthlyAmount: 100 }]
        }];
        state.income = [];
        state.expenses = [];
        state.adjustments = [];
        window.saveState = async () => true;
        window.confirm = () => true;
        renderAll();
        openResidentProfile('r1');
    });
    await expect(page.locator('#residentProfileModal')).toBeVisible();
    await page.locator('#residentProfileModal').getByRole('button', { name: /إعفاء أو تخفيض/ }).click();
    await expect(page.locator('#adjustmentModal')).toBeVisible();
}

test('manager adds, edits and deletes a waiver from the unit profile', async ({ page }) => {
    await openAdjustments(page);
    await expect(page.locator('#adjustmentDueHint')).toContainText('مستحق');

    await page.locator('#adjustmentAmount').fill('30');
    await page.locator('#adjustmentReason').fill('إعفاء لظرف صحي');
    await expect(page.locator('#adjustmentDueHint')).toContainText('ج.م');
    await page.locator('#adjustmentSaveButton').click();

    const row = page.locator('#adjustmentListBody tr').first();
    await expect(row).toContainText('إعفاء');
    await expect(row).toContainText('إعفاء لظرف صحي');
    expect(await page.evaluate(() => state.adjustments.map(item => item.amount))).toEqual([30]);

    await page.locator('#adjustmentModal').getByRole('button', { name: 'إغلاق نافذة الإعفاء والتخفيض' }).click();
    await page.evaluate(() => openResidentProfile('r1'));
    await expect(page.locator('#residentProfileContent')).toContainText('الإعفاءات والتخفيضات');
    await expect(page.locator('#residentProfileContent')).toContainText('إعفاء لظرف صحي');
    await page.locator('#residentProfileModal').getByRole('button', { name: /إعفاء أو تخفيض/ }).click();

    await page.getByRole('button', { name: /تعديل إعفاء/ }).click();
    await expect(page.locator('#adjustmentCancelEdit')).toBeVisible();
    await page.locator('#adjustmentAmount').fill('40');
    await page.locator('#adjustmentSaveButton').click();
    expect(await page.evaluate(() => state.adjustments.map(item => item.amount))).toEqual([40]);
    await expect(page.locator('#adjustmentListBody tr').first()).toContainText('إعفاء');

    await page.getByRole('button', { name: /حذف إعفاء/ }).click();
    await expect(page.locator('#adjustmentListBody')).toContainText('لا توجد إعفاءات أو تخفيضات مسجلة');
    expect(await page.evaluate(() => state.adjustments.length)).toBe(0);
});

test('an adjustment above the month entitlement is rejected before saving', async ({ page }) => {
    await openAdjustments(page);

    await page.locator('#adjustmentAmount').fill('150');
    await page.locator('#adjustmentReason').fill('إعفاء أكبر من المستحق');
    await page.locator('#adjustmentSaveButton').click();

    await expect(page.locator('#toastContainer')).toContainText('يتجاوز مستحق الشهر');
    await expect(page.locator('#adjustmentListBody')).toContainText('لا توجد إعفاءات أو تخفيضات مسجلة');
    expect(await page.evaluate(() => state.adjustments.length)).toBe(0);
});
