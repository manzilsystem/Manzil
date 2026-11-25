const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

test('arrears period filters are month selects with an all-periods placeholder', async ({ page }, info) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await loadShell(page);
    await page.waitForFunction(() => typeof window.switchTab === 'function' && typeof renderAll === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.buildingName = 'عمارة النور'; state.managerName = 'محمد عادل';
        const names = ['أحمد سمير', 'سعيد علي', 'منى حسن', 'خالد يوسف', 'هبة مصطفى', 'عمر فتحي'];
        state.residents = names.map((n, i) => ({ id: 'r' + i, name: n, apartmentNumber: String(i + 1), monthlyAmount: 150, createdAt: '2024-01-01T00:00:00.000Z' }));
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
    await page.evaluate(() => switchTab('reports'));
    await page.locator('[data-report-nav="arrears"]').click();
    const from = page.locator('#arrearsFromMonth');
    const to = page.locator('#arrearsToMonth');
    await expect(from).toHaveJSProperty('tagName', 'SELECT');
    await expect(from.locator('option').first()).toHaveText('كل الفترات');
    await expect(to.locator('option').first()).toHaveText('كل الفترات');
    expect(await from.locator('option').count()).toBeGreaterThan(3);
    await expect(from.locator('option[value="2024-03"]')).toHaveText('مارس 2024');
    await from.selectOption('2024-03');
    await to.selectOption('2024-03');
    expect(await from.inputValue()).toBe('2024-03');
    if (process.env.SHOT) await page.locator('#arrearsPanel').screenshot({ path: process.env.SHOT });
    await page.locator('#arrearsApartmentFilter').selectOption('');
    expect(await page.evaluate(() => getArrearsReportFilters().fromMonth)).toBe('2024-03');
});
