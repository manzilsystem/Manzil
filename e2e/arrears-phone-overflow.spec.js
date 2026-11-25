const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

test('arrears report fits the phone width and the doorman launcher steps aside', async ({ page }, info) => {
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
    const preview = page.locator('#arrearsPanel button:visible', { hasText: /معاينة|عرض|تحديث/ }).first();
    if (await preview.count()) await preview.click();
    await page.waitForTimeout(500);
    const res = await page.evaluate(() => {
        const root = document.getElementById('arrearsPanel');
        const vw = document.documentElement.clientWidth;
        const escaped = [];
        root.querySelectorAll('*').forEach(el => {
            if (!el.offsetParent) return;
            const r = el.getBoundingClientRect();
            if (!r.width || (r.right <= vw + 1 && r.left >= -1)) return;
            // Content inside a deliberate scroller (the section rail) or a visually hidden header is not an overflow.
            for (let p = el; p && p !== root; p = p.parentElement) {
                const cs = getComputedStyle(p);
                if (cs.overflowX !== 'visible' && p !== el) return;
                if (cs.position === 'absolute' && p.getBoundingClientRect().width <= 1) return;
            }
            escaped.push(el.tagName + '.' + String(el.className).slice(0, 40));
        });
        return { doc: document.documentElement.scrollWidth, vw, escaped };
    });
    await expect(page.locator('#assistantFab')).toBeHidden();
    await page.getByRole('button', { name: 'رجوع إلى فهرس التقارير' }).first().click();
    await expect(page.locator('#assistantFab')).toBeVisible();
    expect(res.doc).toBe(res.vw);
    expect(res.escaped).toEqual([]);
});
