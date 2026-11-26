const { test, expect } = require('@playwright/test');

// While a saved session is restored the shell is hidden and the sign-in dialog
// is not shown yet. That window used to be a blank page.
test('a loading message shows while the session locks the shell without a dialog', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof window.setAuthModal === 'function');
    await page.evaluate(() => {
        window.setAuthModal(false);
        document.body.classList.add('session-locked');
    });
    const content = await page.evaluate(() => getComputedStyle(document.body, '::before').content);
    expect(content).toContain('جاري تحميل بياناتك');
    const spinner = await page.evaluate(() => getComputedStyle(document.body, '::after').content);
    expect(spinner).not.toBe('none');
});

test('the loading message is gone once the sign-in dialog or the app is up', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof window.setAuthModal === 'function');
    await page.evaluate(() => window.setAuthModal(true));
    expect(await page.evaluate(() => getComputedStyle(document.body, '::before').content)).toBe('none');
    await page.evaluate(() => window.setAuthModal(false));
    expect(await page.evaluate(() => getComputedStyle(document.body, '::before').content)).toBe('none');
});
