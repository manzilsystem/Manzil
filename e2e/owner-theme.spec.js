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

async function openThemeMenu(page) {
    await page.locator('#ownerThemeBtn').click();
    await expect(page.locator('#ownerThemeMenu')).toBeVisible();
    await expect(page.locator('#ownerThemeMenu [data-owner-theme-option]')).toHaveCount(6);
}

test('the header theme button opens a menu of every theme and applies the choice', async ({ page }) => {
    await renderOwnerPortalWithTheme(page);

    await expect(page.locator('#ownerThemeMenu')).toBeHidden();
    await openThemeMenu(page);
    await expect(page.locator('#ownerThemeBtn')).toHaveAttribute('aria-expanded', 'true');

    const sand = page.locator('#ownerThemeMenu [data-owner-theme-option="sand"]');
    await expect(sand).toHaveAttribute('aria-pressed', 'false');
    await sand.click();

    await expect(page.locator('body')).toHaveAttribute('data-theme', 'sand');
    await expect(page.locator('#ownerThemeMenu')).toBeHidden();
    await expect(page.locator('#ownerThemeBtn')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#ownerThemeSwatch')).toHaveClass(/theme-preview-sand/);
    await expect(page.locator('#ownerThemeBtn')).toHaveAttribute('title', 'مظهرك الحالي: رملي');
    expect(await page.evaluate(() => window.__ownerThemeCalls)).toEqual(['sand']);
});

test('the theme picker no longer occupies a card inside the owner portal', async ({ page }) => {
    await renderOwnerPortalWithTheme(page);

    await expect(page.locator('#ownerPortal [data-owner-theme-option]')).toHaveCount(0);
    await expect(page.locator('#ownerThemeTitle')).toHaveCount(0);

    const buttonBox = await page.locator('#ownerThemeBtn').boundingBox();
    expect(buttonBox.width).toBeLessThan(120);
    expect(buttonBox.height).toBeLessThan(56);
});

test('a failed theme save restores the previous theme and shows an Arabic error', async ({ page }) => {
    await renderOwnerPortalWithTheme(page);
    await openThemeMenu(page);
    await page.evaluate(() => {
        window.persistOwnerTheme = async () => { throw new Error('offline'); };
    });

    await page.locator('#ownerThemeMenu [data-owner-theme-option="ocean"]').click();

    await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#ownerThemeMenu [data-owner-theme-option="dark"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#ownerThemeMenu [data-owner-theme-option="ocean"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#toastContainer')).toContainText('تعذر حفظ المظهر');
});

test('the theme menu closes on outside click and on Escape', async ({ page }) => {
    await renderOwnerPortalWithTheme(page);

    await openThemeMenu(page);
    const size = page.viewportSize();
    await page.mouse.click(size.width / 2, size.height - 140);
    await expect(page.locator('#ownerThemeMenu')).toBeHidden();

    await openThemeMenu(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#ownerThemeMenu')).toBeHidden();
});

test('the theme menu stays inside the viewport on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await renderOwnerPortalWithTheme(page);
    await openThemeMenu(page);

    const metrics = await page.evaluate(() => {
        const menu = document.getElementById('ownerThemeMenu').getBoundingClientRect();
        return {
            documentWidth: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
            menuRight: menu.right,
            menuLeft: menu.left,
            options: Array.from(document.querySelectorAll('[data-owner-theme-option]')).map(option => option.getBoundingClientRect().width)
        };
    });

    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.menuLeft).toBeGreaterThanOrEqual(0);
    expect(metrics.menuRight).toBeLessThanOrEqual(metrics.viewport + 1);
    for (const width of metrics.options) {
        expect(width).toBeGreaterThan(60);
    }
});
