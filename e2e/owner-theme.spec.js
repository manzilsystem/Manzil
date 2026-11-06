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
        state.residents = [{
            id: 'owner-theme-test',
            name: 'مالك تجريبي',
            apartmentNumber: '12',
            floor: 1,
            monthlyAmount: 600,
            subscriptionRates: [],
            createdAt: new Date().toISOString()
        }];
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
    });
    await expect(page.locator('#ownerPortal')).toBeVisible();
}

test('owner portal renders the theme picker and applies the chosen theme', async ({ page }) => {
    await renderOwnerPortalWithTheme(page);

    const card = page.locator('#ownerPortal section[aria-labelledby="ownerThemeTitle"]');
    await expect(card).toBeVisible();
    await expect(card.locator('[data-owner-theme-option]')).toHaveCount(6);

    const sand = card.locator('[data-owner-theme-option="sand"]');
    await expect(sand).toHaveAttribute('aria-pressed', 'false');
    await sand.click();

    await expect(page.locator('body')).toHaveAttribute('data-theme', 'sand');
    await expect(sand).toHaveAttribute('aria-pressed', 'true');
    await expect(card.locator('[data-owner-theme-option="dark"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#ownerThemeCurrent')).toHaveText('رملي');
    expect(await page.evaluate(() => window.__ownerThemeCalls)).toEqual(['sand']);
});

test('a failed theme save restores the previous theme and shows an Arabic error', async ({ page }) => {
    await renderOwnerPortalWithTheme(page);
    await page.evaluate(() => {
        window.persistOwnerTheme = async () => { throw new Error('offline'); };
    });

    await page.locator('[data-owner-theme-option="ocean"]').click();

    await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('[data-owner-theme-option="dark"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-owner-theme-option="ocean"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#toastContainer')).toContainText('تعذر حفظ المظهر');
});

test('theme errors stay inside the owner portal width on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await renderOwnerPortalWithTheme(page);

    const metrics = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        options: Array.from(document.querySelectorAll('[data-owner-theme-option]')).map(option => option.getBoundingClientRect().width)
    }));

    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport + 1);
    for (const width of metrics.options) {
        expect(width).toBeGreaterThan(80);
    }
});
