const { test, expect } = require('@playwright/test');

for (const width of [360, 390]) {
    test(`intro splash shows the mark without Latin text, fits ${width}px and leaves the DOM quickly`, async ({ page }) => {
        await page.setViewportSize({ width, height: 740 });
        await page.goto('/index.html', { waitUntil: 'commit' });
        const splash = page.locator('#appSplash');
        await expect(splash).toBeAttached();
        await expect(splash.locator('.app-splash-name')).toHaveCount(0);
        const box = await splash.locator('.app-splash-logo').boundingBox();
        expect(box.width).toBeGreaterThan(100);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        await expect(splash).toHaveCount(0, { timeout: 4000 });
    });
}

test('reduced motion removes the splash animations', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 360, height: 740 } });
    const page = await context.newPage();
    await page.goto('/index.html', { waitUntil: 'commit' });
    const name = await page.locator('#appSplash .app-splash-logo').evaluate(el => getComputedStyle(el).animationName);
    expect(name).toBe('none');
    await expect(page.locator('#appSplash')).toHaveCount(0, { timeout: 4000 });
    await context.close();
});
