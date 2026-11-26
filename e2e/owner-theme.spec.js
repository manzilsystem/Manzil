const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function renderOwnerPortalWithTheme(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.renderOwnerPortal === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'owner';
        window.currentResidentId = 'owner-theme-test';
        document.body.classList.remove('session-locked', 'modal-open');
        document.body.classList.add('owner-mode');
        const pinLock = document.getElementById('pinLockModal');
        pinLock.classList.add('hidden');
        pinLock.classList.remove('flex');
        pinLock.setAttribute('aria-hidden', 'true');
        state.residents = [{ id: 'owner-theme-test', name: 'مالك تجريبي', apartmentNumber: '12', floor: 1, monthlyAmount: 600, subscriptionRates: [], createdAt: new Date().toISOString() }];
        state.income = [];
        state.adjustments = [];
        state.notices = [];
        state.ownerNotifications = [];
        state.buildingName = 'عمارة الاختبار';
        state.currentTheme = 'dark';
        window.__ownerThemeCalls = [];
        window.persistOwnerTheme = async theme => { window.__ownerThemeCalls.push(theme); };
        window.renderAll();
        window.renderOwnerPortal();
        applyThemeToDocument('dark');
    });
    await expect(page.locator('#ownerPortal')).toBeVisible();
}

test('owners get the sun/moon button and it flips day and night and saves per account', async ({ page }) => {
    await renderOwnerPortalWithTheme(page);
    const button = page.locator('#quickThemeBtn');
    await expect(button).toBeVisible();
    await expect(page.locator('#ownerThemeBtn')).toHaveCount(0);
    await expect(button).toHaveAttribute('data-mode', 'dark');
    await expect(button).toHaveAttribute('aria-label', 'الوضع الليلي / النهاري');
    await expect(page.locator('#quickThemeIcon')).toHaveClass(/fa-sun/);
    await expect(page.locator('header #quickThemeBtn')).toHaveCount(1);

    await button.click();
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
    await expect(button).toHaveAttribute('data-mode', 'light');
    await expect(page.locator('#quickThemeIcon')).toHaveClass(/fa-moon/);
    await button.click();
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => window.__ownerThemeCalls)).toEqual(['light', 'dark']);

    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);
});

test('a failed theme save restores the previous theme and shows an Arabic error', async ({ page }) => {
    await renderOwnerPortalWithTheme(page);
    await page.evaluate(() => { window.persistOwnerTheme = async () => { throw new Error('offline'); }; });
    await page.locator('#quickThemeBtn').click();
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#quickThemeBtn')).toHaveAttribute('data-mode', 'dark');
    await expect(page.locator('#toastContainer')).toContainText('تعذر حفظ المظهر');
});
