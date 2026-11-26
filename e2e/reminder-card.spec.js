const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

for (const width of [390, 360]) {
    test(`dashboard reminders card matches the list at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await loadShell(page);
        await page.waitForFunction(() => typeof window.openArrearsRemindersList === 'function' && typeof renderAll === 'function');
        await page.evaluate(() => {
            window.currentUserRole = 'manager';
            document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
            document.getElementById('pinLockModal').classList.add('hidden');
            state.buildingName = 'عمارة النور'; state.reminderMessageTemplate = null;
            try { localStorage.clear(); } catch { /* ignore */ }
            const mk = (id, name, apt, phone) => ({ id, name, apartmentNumber: apt, monthlyAmount: 150, phone, billingStartMonth: '2025-01-01', createdAt: '2025-01-01T00:00:00.000Z' });
            state.residents = [mk('r0', 'أحمد سمير', '1', '01010000001'), mk('r1', 'سعيد علي', '2', ''), mk('r2', 'منى حسن', '3', '01010000003')];
            state.income = []; state.expenses = []; state.adjustments = [];
            switchTab('dashboard');
            renderAll();
        });
        const text = page.locator('#dashboardRemindersText');
        await expect(text).toContainText('3 شقق متأخرة');
        await expect(text).toContainText('1 بلا رقم هاتف');
        await page.locator('#dashboardRemindersCard').getByRole('button', { name: 'افتح القائمة' }).click();
        await expect(page.locator('#arrearsRemindersSummary')).toContainText('3 شقق متأخرة');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
        await page.screenshot({ path: `/tmp/reminder-card-${width}.png` });
    });
}
