const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

for (const width of [390, 360]) {
    test(`not-understood fallback offers three questions on a ${width}px phone`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 800 });
        await loadShell(page);
        await page.waitForFunction(() => typeof window.openAssistantModal === 'function' && typeof renderAll === 'function');
        await page.evaluate(() => {
            window.currentUserRole = 'manager';
            document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
            document.getElementById('pinLockModal').classList.add('hidden');
            state.managerName = 'مدير الاختبار';
            renderAll();
        });
        await page.locator('#assistantFab').click();
        await page.locator('#assistantInput').fill('ازرق');
        await page.locator('#assistantInput').press('Enter');
        const log = page.locator('#assistantLog');
        await expect(log).toContainText('ماوصلتش للمقصود', { timeout: 8000 });
        await expect(log.locator('.assistant-followups button')).toHaveCount(3);
        await page.screenshot({ path: info.outputPath(`persona-fallback-${width}.png`) });
        await page.screenshot({ path: `/tmp/persona-fallback-${width}.png` });
        await log.locator('.assistant-followups button').first().click();
        await expect(log.locator('.assistant-msg.is-user').last()).toBeVisible();
        await page.waitForTimeout(600);
        const overflow = await page.evaluate(() => {
            const el = document.getElementById('assistantLog');
            return el.scrollWidth - el.clientWidth;
        });
        expect(overflow).toBeLessThanOrEqual(1);
    });
}
