const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

test('the doorman can be dragged on phones and tablets and his spot is remembered', async ({ page }, info) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 600, height: 900 });
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
    const fab = page.locator('#assistantFab');
    await expect(fab).toBeVisible();
    const box = await fab.boundingBox();
    // a tap still opens the chat (checked in assistant.spec.js); a drag only moves him
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 300, box.y + box.height / 2 - 220, { steps: 8 });
    await page.mouse.up();
    const moved = await fab.boundingBox();
    expect(Math.abs(moved.x - box.x)).toBeGreaterThan(80);
    expect(Math.abs(moved.y - box.y)).toBeGreaterThan(150);
    await expect(page.locator('#assistantModal')).toHaveClass(/hidden/);
    const saved = await page.evaluate(() => localStorage.getItem('manzilAssistantFabPos'));
    expect(saved).toBeTruthy();
    // the position survives a reload
    await page.reload();
    await page.waitForFunction(() => document.getElementById('assistantFab'));
    await page.waitForTimeout(300);
    const style = await page.locator('#assistantFab').getAttribute('style');
    expect(parseFloat(/left:\s*([\d.]+)px/.exec(style)[1])).toBeCloseTo(moved.x, -1);
    expect(parseFloat(/top:\s*([\d.]+)px/.exec(style)[1])).toBeCloseTo(moved.y, -1);
});
