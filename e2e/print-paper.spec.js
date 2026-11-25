const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

test('print paper size follows the A4/A5 picker and the period report starts on page one', async ({ page }, info) => {
    test.setTimeout(240_000);
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
    await page.locator('[data-report-nav="period"]').click();
    await page.locator('#periodReportFrom').selectOption('يناير 2024');
    await page.locator('#periodReportTo').selectOption('أبريل 2024');
    await page.evaluate(() => generatePeriodReport());
    await page.evaluate(() => document.body.classList.add('print-period'));
    await page.emulateMedia({ media: 'print' });
    const pageBox = async () => {
        const pdf = await page.pdf({ preferCSSPageSize: true });
        const text = pdf.toString('latin1');
        const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
        return { w: Math.round(+box[1]), h: Math.round(+box[2]), pages: (text.match(/\/Type\s*\/Page[^s]/g) || []).length };
    };
    const a4 = await pageBox();
    expect([a4.w, a4.h]).toEqual([595, 842]);
    await page.evaluate(() => setPrintPaper('A5'));
    const a5 = await pageBox();
    expect([a5.w, a5.h]).toEqual([420, 595]);
    expect(await page.evaluate(() => getPrintPaper())).toBe('A5');
    // a long report flows across pages instead of leaving the first page empty
    const card = await page.evaluate(() => getComputedStyle(document.querySelector('#periodReportPreview')).breakInside);
    expect(card).not.toBe('avoid');
});
