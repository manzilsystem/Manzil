const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function renderOwnerWithNotifications(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.renderOwnerPortal === 'function');
    await page.evaluate(() => {
        currentUserRole = 'owner';
        currentResidentId = 'r1';
        activeSession = { user: { id: 'u1' } };
        activeBuildingId = 'b1';
        document.body.classList.remove('session-locked', 'modal-open');
        document.body.classList.add('owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.residents = [{ id: 'r1', name: 'مالك', apartmentNumber: '3', floor: 1, monthlyAmount: 200, subscriptionRates: [], createdAt: new Date().toISOString() }];
        state.income = []; state.adjustments = []; state.notices = [];
        const now = new Date().toISOString();
        state.ownerNotifications = [
            { id: 'n1', title: 'أ', body: 'ب', createdAt: now, readAt: null },
            { id: 'n2', title: 'ج', body: 'د', createdAt: now, readAt: null }
        ];
        const chain = { eq() { return chain; }, is() { return Promise.resolve({ error: null }); } };
        supabaseClient.from = () => ({ update: () => chain });
        window.refreshNotificationsFromServer = () => {};
        window.renderAll();
        window.renderOwnerPortal();
    });
}

test('the bell menu marks everything read without deleting, and the badge clears', async ({ page }) => {
    await renderOwnerWithNotifications(page);
    const badge = page.locator('#ownerNotificationsBadge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('2');
    await page.locator('#ownerNotificationsBtn').click();
    await expect(page.locator('#ownerNotificationsMenu')).toBeVisible();
    await page.getByRole('button', { name: 'تحديد الكل كمقروء' }).click();
    await expect(badge).toBeHidden();
    expect(await page.evaluate(() => state.ownerNotifications.length)).toBe(2);
    expect(await page.evaluate(() => state.ownerNotifications.every(item => item.readAt))).toBe(true);
    await page.locator('#ownerNotificationsBtn').click();
    await expect(page.locator('#ownerNotificationsMenu')).toContainText('كل الإشعارات مقروءة');
    await expect(page.getByRole('button', { name: 'تحديد الكل كمقروء' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#ownerNotificationsMenu')).toBeHidden();
});
