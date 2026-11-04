const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

const IGNORED = [
    // The Tailwind Play CDN prints an advisory warning on every load.
    /cdn\.tailwindcss\.com should not be used in production/
];

function collectErrors(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() !== 'error') return;
        if (IGNORED.some(pattern => pattern.test(message.text()))) return;
        errors.push(`console: ${message.text()}`);
    });
    return errors;
}

test('app shell loads without runtime or CSP errors', async ({ page }) => {
    const errors = collectErrors(page);
    await loadShell(page);

    await expect(page).toHaveTitle(/Manzil/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
    await expect(page.locator('#pinLockModal')).toBeVisible();
    await expect(page.locator('#authIdentifier')).toBeVisible();
    await expect(page.locator('#loginModeManager')).toBeVisible();

    expect(errors).toEqual([]);
});

test('error collector is active and stores sanitized entries locally', async ({ page }) => {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.manzilReportError === 'function');

    const entry = await page.evaluate(() => {
        window.manzilReportError({ message: 'e2e-check', stack: 'x'.repeat(2000) });
        const stored = JSON.parse(localStorage.getItem('manzil-error-log') || '[]');
        return stored[stored.length - 1];
    });

    expect(entry.kind).toBe('manual');
    expect(entry.message).toBe('e2e-check');
    expect(entry.stack.length).toBeLessThanOrEqual(1200);
    expect(Object.keys(entry).sort()).toEqual([
        'column', 'created_at', 'kind', 'line', 'message', 'path', 'release', 'role', 'source', 'stack'
    ]);
});

test('service worker takes control of the page shell', async ({ page }) => {
    await loadShell(page);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    const script = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL);
    expect(script).toContain('/sw.js');
});

test('the layout never scrolls horizontally', async ({ page }) => {
    await loadShell(page);
    await expect(page.locator('#pinLockModal')).toBeVisible();

    const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
});
