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

test('all themes keep the picker readable and usable at 200% zoom', async ({ page }) => {
    // A 1440x900 desktop at 200% browser zoom has a 720x450 CSS viewport.
    await page.setViewportSize({ width: 720, height: 450 });
    await renderOwnerPortalWithTheme(page);
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });

    const themes = await page.evaluate(() => MANZIL_THEME_LIST);
    expect(themes).toHaveLength(6);

    for (const theme of themes) {
        await page.evaluate(theme => {
            state.currentTheme = theme;
            applyThemeToDocument(theme);
            updateThemeSelection();
        }, theme);
        await openThemeMenu(page);

        const metrics = await page.evaluate(() => {
            const rgb = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
            const luminance = value => {
                const channels = rgb(value).map(channel => {
                    const normalized = channel / 255;
                    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
                });
                return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
            };
            const contrast = (foreground, background) => {
                const light = Math.max(luminance(foreground), luminance(background));
                const dark = Math.min(luminance(foreground), luminance(background));
                return (light + 0.05) / (dark + 0.05);
            };
            const rect = element => {
                const box = element.getBoundingClientRect();
                return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
            };
            const menu = document.getElementById('ownerThemeMenu');
            const options = Array.from(menu.querySelectorAll('[data-owner-theme-option]'));
            const button = document.getElementById('ownerThemeBtn');
            return {
                viewport: window.innerWidth,
                documentWidth: document.documentElement.scrollWidth,
                menu: rect(menu),
                button: rect(button),
                options: options.map(option => ({
                    theme: option.dataset.ownerThemeOption,
                    ...rect(option),
                    contrast: contrast(getComputedStyle(option).color, getComputedStyle(option).backgroundColor)
                })),
                buttonContrast: contrast(getComputedStyle(button).color, getComputedStyle(button).backgroundColor),
                pageContrast: contrast(getComputedStyle(document.body).color, getComputedStyle(document.body).backgroundColor)
            };
        });

        expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport + 1);
        expect(metrics.menu.left).toBeGreaterThanOrEqual(0);
        expect(metrics.menu.right).toBeLessThanOrEqual(metrics.viewport + 1);
        expect(metrics.button.width).toBeGreaterThanOrEqual(40);
        expect(metrics.button.height).toBeGreaterThanOrEqual(40);
        expect(metrics.pageContrast).toBeGreaterThanOrEqual(4.5);
        expect(metrics.buttonContrast).toBeGreaterThanOrEqual(4.5);
        for (const option of metrics.options) {
            expect(option.left).toBeGreaterThanOrEqual(0);
            expect(option.right).toBeLessThanOrEqual(metrics.viewport + 1);
            expect(option.width).toBeGreaterThanOrEqual(60);
            expect(option.height).toBeGreaterThanOrEqual(40);
            expect(option.contrast).toBeGreaterThanOrEqual(4.5);
        }
        expect(metrics.options.map(option => option.theme)).toEqual(themes);

        await page.locator(`#ownerThemeMenu [data-owner-theme-option="${theme}"]`).click();
        await expect(page.locator('body')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('#ownerThemeMenu')).toBeHidden();
    }

    // Text-only 200% scaling must also keep the picker inside the viewport.
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    await openThemeMenu(page);
    const textZoom = await page.evaluate(() => {
        const menu = document.getElementById('ownerThemeMenu').getBoundingClientRect();
        const options = Array.from(document.querySelectorAll('#ownerThemeMenu [data-owner-theme-option]'));
        return {
            viewport: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            menuLeft: menu.left,
            menuRight: menu.right,
            optionWidths: options.map(option => option.getBoundingClientRect().width)
        };
    });
    expect(textZoom.documentWidth).toBeLessThanOrEqual(textZoom.viewport + 1);
    expect(textZoom.menuLeft).toBeGreaterThanOrEqual(0);
    expect(textZoom.menuRight).toBeLessThanOrEqual(textZoom.viewport + 1);
    for (const width of textZoom.optionWidths) {
        expect(width).toBeGreaterThanOrEqual(60);
    }
    await page.locator('#ownerThemeMenu [data-owner-theme-option="light"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
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
