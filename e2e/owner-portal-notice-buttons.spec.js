const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

test('owner notification buttons use the same small text as the rest of the card', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await loadShell(page);
    await page.waitForFunction(() => typeof window.renderOwnerPortal === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'owner';
        window.currentResidentId = 'owner-notice-test';
        document.body.classList.remove('session-locked', 'modal-open');
        document.body.classList.add('owner-mode');
        const pinLock = document.getElementById('pinLockModal');
        pinLock.classList.add('hidden');
        pinLock.classList.remove('flex');
        state.residents = [{ id: 'owner-notice-test', name: 'مالك تجريبي', apartmentNumber: '12', floor: 1, monthlyAmount: 600, subscriptionRates: [], createdAt: '2025-01-01T00:00:00Z' }];
        state.income = []; state.adjustments = []; state.notices = [];
        state.ownerNotifications = [{ id: 'n1', title: 'دفعة', body: 'تم الاستلام', createdAt: '2026-11-21T10:00:00Z', readAt: null }];
        window.renderAll();
        window.renderOwnerPortal();
    });
    const sizes = await page.evaluate(() => ['markAllOwnerNotificationsRead', 'markOwnerNotificationRead'].map(name => {
        const button = document.querySelector(`#ownerPortal button[onclick^="${name}"]`);
        const reference = document.querySelector('#ownerNotificationsTitle + p');
        return { button: parseFloat(getComputedStyle(button).fontSize), reference: parseFloat(getComputedStyle(reference).fontSize), height: button.getBoundingClientRect().height };
    }));
    for (const size of sizes) {
        expect(size.button).toBeLessThanOrEqual(size.reference + 1.5);
        expect(size.height).toBeGreaterThanOrEqual(44);
    }
});
