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
