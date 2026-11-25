const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

test('arrears reminders list and Amm Abdo command', async ({ page }, info) => {
    test.setTimeout(240_000);
    await loadShell(page);
    await page.waitForFunction(() => typeof window.switchTab === 'function' && typeof renderAll === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.buildingName = 'عمارة النور'; state.managerName = 'محمد عادل';
        const names = ['أحمد سمير', 'سعيد علي', 'منى حسن', 'خالد يوسف', 'هبة مصطفى', 'عمر فتحي'];
        state.residents = names.map((n, i) => ({ id: 'r' + i, name: n, apartmentNumber: String(i + 1), monthlyAmount: 150, phone: i === 2 ? '' : '010' + (10000000 + i * 1111111), createdAt: '2024-01-01T00:00:00.000Z' }));
        const months = ['يناير 2024', 'فبراير 2024', 'مارس 2024', 'أبريل 2024'];
        state.income = []; let k = 0;
        state.residents.forEach((r, i) => months.forEach((m, j) => { if ((i + j) % 3 !== 0) state.income.push({ id: 'i' + (k++), residentId: r.id, month: m, amount: 150, paymentMethod: j % 2 ? 'cash' : 'instapay' }); }));
        state.expenses = [
            { id: 'e1', month: 'يناير 2024', title: 'كهرباء السلالم', amount: 220, category: 'مرافق', cashAccountCode: 'main' },
            { id: 'e2', month: 'فبراير 2024', title: 'صيانة الأسانسير', amount: 600, category: 'صيانة', cashAccountCode: 'main' },
            { id: 'e3', month: 'مارس 2024', title: 'دهان المدخل', amount: 900, category: 'تطوير', cashAccountCode: 'development' },
            { id: 'e4', month: 'أبريل 2024', title: 'نظافة', amount: 300, category: 'نظافة', cashAccountCode: 'main' }
        ];
        state.adjustments = [{ id: 'a1', residentId: 'r1', kind: 'waiver', effectiveMonth: '2024-02-01', amount: 100, reason: 'حالة وفاة' }];
        renderAll();
    });
    await page.evaluate(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; });
    await page.evaluate(() => openArrearsRemindersList(''));
    const modal = page.locator('#arrearsRemindersModal');
    await expect(modal).toBeVisible();
    const rows = modal.locator('[data-reminder-row]');
    expect(await rows.count()).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    await rows.first().locator('button[aria-label="عرض نص الرسالة"]').click();
    await expect(rows.first().locator('.arrears-reminder-text')).toBeVisible();
    const send = modal.locator('[data-reminder-send]').first();
    await send.click();
    const opened = await page.evaluate(() => window.__opened);
    expect(opened.length).toBe(1);
    expect(opened[0]).toContain('https://wa.me/20');
    await expect(modal.locator('text=أُرسل اليوم').first()).toBeVisible();
    await page.evaluate(() => closeModal('arrearsRemindersModal'));
    // Amm Abdo
    await page.evaluate(() => { document.getElementById('assistantModal') && openModal('assistantModal'); });
    await page.locator('#assistantInput').fill('ذكّر المتأخرين');
    await page.locator('#assistantInput').press('Enter');
    await expect(modal).toBeVisible({ timeout: 8000 });
    expect((await page.evaluate(() => window.__opened)).length).toBe(1);
    const nov = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(nov).toBe(false);
});
