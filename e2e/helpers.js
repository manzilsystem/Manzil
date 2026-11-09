const { expect } = require('@playwright/test');

// The shell reloads itself once when the service worker first takes control.
// Wait for that handshake so tests never evaluate inside a navigating document.
async function loadShell(page) {
    await page.goto('/index.html');
    await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 15_000 })
        .catch(() => {});
    await page.waitForLoadState('load');
}

// The new collection dialog is a three-step wizard. Advancing runs the same
// validation the "التالي" button performs, then asserts the target step shows.
async function advanceIncomeStep(page, step) {
    await page.locator('#incomeWizardNext').click();
    await expect(page.locator(`#incomeWizardStep${step}`)).toBeVisible();
}

module.exports = { loadShell, advanceIncomeStep };
