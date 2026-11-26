const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

for (const width of [390, 360]) {
    test(`upcoming dues answer fits a ${width}px phone`, async ({ page }, info) => {
        await page.clock.setFixedTime(new Date(2026, 10, 10, 12, 0, 0));
        await page.setViewportSize({ width, height: 800 });
        await loadShell(page);
        await page.waitForFunction(() => typeof window.openAssistantModal === 'function' && typeof renderAll === 'function');
        await page.evaluate(() => {
            window.currentUserRole = 'manager';
            document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
            document.getElementById('pinLockModal').classList.add('hidden');
            const now = new Date();
            const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            state.subscriptionDueDay = 13;
            state.subscriptionGraceDays = 3;
            state.managerName = 'مدير الاختبار';
            state.residents = ['أحمد علي', 'سارة حسن', 'منى فتحي'].map((name, i) => ({ id: 'r' + i, name, apartmentNumber: String(i + 1), monthlyAmount: 150 + i * 50, billingStartMonth: start, createdAt: `${start}T00:00:00.000Z` }));
            state.income = []; state.expenses = []; state.adjustments = [];
            renderAll();
        });
        await page.locator('#assistantFab').click();
        await page.locator('#assistantInput').fill('مين هيستحق الأسبوع الجاي؟');
        await page.locator('#assistantInput').press('Enter');
        const log = page.locator('#assistantLog');
        await expect(log).toContainText('الاستحقاقات القادمة', { timeout: 8000 });
        await expect(log).toContainText('يستحق بعد');
        const overflow = await page.evaluate(() => {
            const el = document.getElementById('assistantLog');
            return el.scrollWidth - el.clientWidth;
        });
        expect(overflow).toBeLessThanOrEqual(1);
        await page.screenshot({ path: info.outputPath(`upcoming-dues-${width}.png`) });
        await page.screenshot({ path: `/tmp/upcoming-dues-${width}.png` });
    });
}
