const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

test('the header status stays on one line at 360 wide and the portal still says read-only', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await loadShell(page);
    await page.waitForFunction(() => typeof window.renderOwnerPortal === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'owner';
        window.currentResidentId = 'owner-header-test';
        document.body.classList.remove('session-locked', 'modal-open');
        document.body.classList.add('owner-mode');
        const pinLock = document.getElementById('pinLockModal');
        pinLock.classList.add('hidden');
        pinLock.classList.remove('flex');
        state.residents = [{ id: 'owner-header-test', name: 'مالك تجريبي', apartmentNumber: '12', floor: 1, monthlyAmount: 600, subscriptionRates: [], createdAt: '2025-01-01T00:00:00Z' }];
        state.income = []; state.adjustments = []; state.notices = []; state.ownerNotifications = [];
        window.renderAll();
        window.renderOwnerPortal();
    });
    const status = page.locator('#syncStatus');
    await expect(status).toHaveText('وضع المالك');
    const box = await status.boundingBox();
    expect(box.height).toBeLessThan(24);
    await expect(page.locator('#ownerPortal')).toContainText('قراءة فقط');
});
