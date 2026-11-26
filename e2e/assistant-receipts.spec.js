const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

for (const width of [390, 360]) {
    test(`resident receipts answer fits a ${width}px phone`, async ({ page }, info) => {
        await page.clock.setFixedTime(new Date(2026, 10, 10, 12, 0, 0));
        await page.setViewportSize({ width, height: 800 });
        await loadShell(page);
        await page.waitForFunction(() => typeof window.openAssistantModal === 'function' && typeof renderAll === 'function');
        await page.evaluate(() => {
            window.currentUserRole = 'manager';
            document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
            document.getElementById('pinLockModal').classList.add('hidden');
            state.managerName = 'مدير الاختبار';
            state.residents = [{ id: 'r1', name: 'أحمد علي', apartmentNumber: '3', monthlyAmount: 150, billingStartMonth: '2026-09-01', createdAt: '2026-09-01T00:00:00.000Z' }];
            state.income = [
                { id: 'a', residentId: 'r1', month: 'سبتمبر 2026', amount: 150, purposeCode: 'subscription', cashAccountCode: 'main', paymentMethod: 'cash', date: '2026-09-05T10:00:00.000Z' },
                { id: 'b', residentId: 'r1', month: 'أكتوبر 2026', amount: 150, purposeCode: 'subscription', cashAccountCode: 'main', paymentMethod: 'instapay', date: '2026-10-04T10:00:00.000Z' },
                { id: 'c', residentId: 'r1', month: 'نوفمبر 2026', amount: 75, purposeCode: 'subscription', cashAccountCode: 'main', paymentMethod: 'cash', date: '2026-11-10T09:00:00.000Z' }
            ];
            state.expenses = []; state.adjustments = [];
            renderAll();
        });
        await page.locator('#assistantFab').click();
        await page.locator('#assistantInput').fill('ايصالات شقة 3');
        await page.locator('#assistantInput').press('Enter');
        const log = page.locator('#assistantLog');
        await expect(log).toContainText('عدد الإيصالات', { timeout: 8000 });
        await expect(log).toContainText('سبتمبر 2026');
        await expect(log).toContainText('أكتوبر 2026');
        await expect(log).toContainText('إجمالي المدفوع');
        const overflow = await page.evaluate(() => {
            const el = document.getElementById('assistantLog');
            return el.scrollWidth - el.clientWidth;
        });
        expect(overflow).toBeLessThanOrEqual(1);
        await page.screenshot({ path: info.outputPath(`resident-receipts-${width}.png`) });
        await page.screenshot({ path: `/tmp/resident-receipts-${width}.png` });
    });
}
