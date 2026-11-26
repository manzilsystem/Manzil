const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function renderOwner(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.renderOwnerPortal === 'function');
    await page.evaluate(() => {
        localStorage.removeItem('manzil.installCardDismissedAt');
        window.currentUserRole = 'owner';
        window.currentResidentId = 'owner-install-test';
        document.body.classList.remove('session-locked', 'modal-open');
        document.body.classList.add('owner-mode');
        const pinLock = document.getElementById('pinLockModal');
        pinLock.classList.add('hidden');
        pinLock.classList.remove('flex');
        state.residents = [{ id: 'owner-install-test', name: 'مالك تجريبي', apartmentNumber: '12', floor: 1, monthlyAmount: 600, subscriptionRates: [], createdAt: '2025-01-01T00:00:00Z' }];
        state.income = []; state.adjustments = []; state.notices = []; state.ownerNotifications = [];
        window.renderAll();
        window.renderOwnerPortal();
    });
    await expect(page.locator('#ownerPortal')).toBeVisible();
}

test('no install card appears when the browser offers no install', async ({ page }) => {
    await renderOwner(page);
    await expect(page.locator('[data-install-card]')).toHaveCount(0);
});

test('the install card shows when the browser offers install, and installs on tap', async ({ page }) => {
    await renderOwner(page);
    await page.evaluate(() => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        window.__installPrompted = 0;
        event.prompt = async () => { window.__installPrompted += 1; };
        event.userChoice = Promise.resolve({ outcome: 'accepted' });
        window.dispatchEvent(event);
    });
    const card = page.locator('[data-install-card]');
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'تثبيت التطبيق' }).click();
    await expect.poll(() => page.evaluate(() => window.__installPrompted)).toBe(1);
    await expect(card).toHaveCount(0);
});

test('dismissing the install card hides it and remembers the choice', async ({ page }) => {
    await renderOwner(page);
    await page.evaluate(() => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.prompt = async () => {};
        event.userChoice = Promise.resolve({ outcome: 'dismissed' });
        window.dispatchEvent(event);
    });
    await page.locator('[data-install-card] [aria-label="إخفاء"]').click();
    await expect(page.locator('[data-install-card]')).toHaveCount(0);
    expect(await page.evaluate(() => Boolean(localStorage.getItem('manzil.installCardDismissedAt')))).toBe(true);
});

test('iPhone Safari gets the Share-sheet steps instead of a button', async ({ browser }) => {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        viewport: { width: 390, height: 844 }
    });
    const page = await context.newPage();
    await renderOwner(page);
    const card = page.locator('[data-install-card]');
    await expect(card).toContainText('إضافة إلى الشاشة الرئيسية');
    await expect(card.getByRole('button', { name: 'تثبيت التطبيق' })).toHaveCount(0);
    const box = await card.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await context.close();
});
