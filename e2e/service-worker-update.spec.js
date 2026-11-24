const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

// The card is created by js/sw-register.js when a new worker claims the page.
// A real release fires `controllerchange` on the service worker container, so
// the tests dispatch the same event to exercise the flow without a deploy.
const CARD_TEXT = 'يتوفر تحديث جديد للتطبيق.';

test('a new deployment offers an in-app refresh card instead of a cache clear', async ({ page }) => {
    await loadShell(page);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    // The PIN lock screen keeps the app busy at load, which is exactly when the
    // card must appear instead of an automatic reload.
    await expect(page.locator('#pinLockModal')).toBeVisible();

    await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));

    const card = page.getByRole('status').filter({ hasText: CARD_TEXT });
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: 'تحديث الآن' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'لاحقًا' })).toBeVisible();
});

test('choosing "لاحقًا" dismisses the card and keeps the session running', async ({ page }) => {
    await loadShell(page);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    await page.evaluate(() => {
        window.__manzilDeferredMarker = true;
        navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
    });

    const card = page.getByRole('status').filter({ hasText: CARD_TEXT });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'لاحقًا' }).click();
    await expect(card).toHaveCount(0);
    // Deferring must not reload the page: the current session keeps its state.
    expect(await page.evaluate(() => window.__manzilDeferredMarker)).toBe(true);
});

test('choosing "تحديث الآن" reloads the app onto the new release', async ({ page }) => {
    await loadShell(page);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    await page.evaluate(() => {
        window.__manzilBeforeUpdate = true;
        navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
    });

    await page.getByRole('button', { name: 'تحديث الآن' }).click();
    await page.waitForFunction(() => window.__manzilBeforeUpdate === undefined);
    await expect(page.locator('#pinLockModal')).toBeVisible();
});

test('an unsaved inline field blocks the automatic update reload', async ({ page }) => {
    await loadShell(page);
    await page.waitForFunction(() => typeof switchTab === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        switchTab('cashbox');
        window.__manzilUnsavedMarker = true;
    });

    // The amount is filled but focus moved to the still-empty notes field.
    await page.locator('#cashTransferAmount').fill('123');
    await page.locator('#cashTransferNotes').focus();
    await expect(page.locator('#cashTransferAmount')).toHaveValue('123');

    await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
    const card = page.getByRole('status').filter({ hasText: CARD_TEXT });
    await expect(card).toBeVisible();

    // The 5-second retry in sw-register.js must not discard the unsaved amount.
    await page.waitForTimeout(6000);
    expect(await page.evaluate(() => window.__manzilUnsavedMarker)).toBe(true);
    await expect(page.locator('#cashTransferAmount')).toHaveValue('123');
});
