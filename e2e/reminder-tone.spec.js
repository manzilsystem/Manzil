const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

for (const width of [390, 360]) {
    test(`reminder tone picker fits a ${width}px phone and changes the message`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 800 });
        await loadShell(page);
        await page.waitForFunction(() => typeof window.openArrearsRemindersList === 'function' && typeof renderAll === 'function');
        await page.evaluate(() => {
            window.currentUserRole = 'manager';
            document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
            document.getElementById('pinLockModal').classList.add('hidden');
            state.buildingName = 'عمارة النور'; state.reminderMessageTemplate = null;
            try { localStorage.clear(); } catch { /* ignore */ }
            state.residents = ['أحمد سمير', 'سعيد علي'].map((name, i) => ({ id: 'r' + i, name, apartmentNumber: String(i + 1), monthlyAmount: 150, phone: '01010000000'.slice(0, 10) + i, billingStartMonth: '2024-01-01', createdAt: '2024-01-01T00:00:00.000Z' }));
            state.income = []; state.expenses = []; state.adjustments = [];
            renderAll();
            openArrearsRemindersList('');
        });
        const modal = page.locator('#arrearsRemindersModal');
        await expect(modal).toBeVisible();
        const picker = modal.locator('#arrearsReminderTone');
        await expect(picker.locator('[data-reminder-tone]')).toHaveCount(3);
        await expect(picker.locator('[data-reminder-tone="formal"]')).toHaveAttribute('aria-checked', 'true');
        await picker.locator('[data-reminder-tone="firm"]').click();
        await expect(picker.locator('[data-reminder-tone="firm"]')).toHaveAttribute('aria-checked', 'true');
        await modal.locator('button[aria-label="عرض نص الرسالة"]').first().click();
        await expect(modal.locator('.arrears-reminder-text').first()).toContainText('لازم يتسدد');
        const overflow = await page.evaluate(() => {
            const card = document.querySelector('#arrearsRemindersModal > div');
            return card.scrollWidth - card.clientWidth;
        });
        expect(overflow).toBeLessThanOrEqual(1);
        await page.screenshot({ path: info.outputPath(`reminder-tone-${width}.png`) });
        await page.screenshot({ path: `/tmp/reminder-tone-${width}.png` });
    });
}
