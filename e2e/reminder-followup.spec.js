const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

for (const width of [390, 360]) {
    test(`reminder follow-up list fits a ${width}px phone`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 800 });
        await loadShell(page);
        await page.waitForFunction(() => typeof window.openArrearsRemindersList === 'function' && typeof renderAll === 'function');
        await page.evaluate(() => {
            window.currentUserRole = 'manager';
            document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
            document.getElementById('pinLockModal').classList.add('hidden');
            state.buildingName = 'عمارة النور'; state.reminderMessageTemplate = null;
            try { localStorage.clear(); } catch { /* ignore */ }
            state.residents = ['أحمد سمير', 'سعيد علي', 'منى حسن'].map((name, i) => ({ id: 'r' + i, name, apartmentNumber: String(i + 1), monthlyAmount: 150, phone: '0101000000' + i, billingStartMonth: '2024-01-01', createdAt: '2024-01-01T00:00:00.000Z' }));
            state.income = []; state.expenses = []; state.adjustments = [];
            const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
            localStorage.setItem(getArrearsReminderSentKey(), JSON.stringify({ r0: day(5), r1: day(0) }));
            renderAll();
            openArrearsRemindersList('');
        });
        const modal = page.locator('#arrearsRemindersModal');
        await expect(modal).toBeVisible();
        await expect(modal.locator('[data-reminder-filter]')).toHaveCount(3);
        await expect(modal).toContainText('اتذكّر من 5 أيام ولسه ما دفعش');
        await expect(modal.locator('button', { hasText: 'تذكير تاني' })).toHaveCount(1);
        await modal.locator('[data-reminder-filter="followup"]').click();
        await expect(modal.locator('button', { hasText: 'تذكير تاني' })).toHaveCount(1);
        await expect(modal).not.toContainText('منى حسن');
        await modal.locator('[data-reminder-filter="new"]').click();
        await expect(modal).toContainText('منى حسن');
        await expect(modal).not.toContainText('أحمد سمير');
        await modal.locator('[data-reminder-filter="all"]').click();
        const overflow = await page.evaluate(() => {
            const card = document.querySelector('#arrearsRemindersModal > div');
            return card.scrollWidth - card.clientWidth;
        });
        expect(overflow).toBeLessThanOrEqual(1);
        await page.screenshot({ path: `/tmp/reminder-followup-${width}.png` });
    });
}
