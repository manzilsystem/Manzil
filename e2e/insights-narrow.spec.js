const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function openReports(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.switchTab === 'function' && typeof renderAll === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.buildingName = 'عمارة الاختبار';
        state.managerName = 'مدير الاختبار';
        state.subscriptionDueDay = 5;
        state.subscriptionGraceDays = 10;
        // شهور قريبة من تاريخ اليوم حتى لا تتراكم شهور التأخير القديمة على السيناريو
        state.residents = [
            { id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2026-08-01T00:00:00.000Z' },
            { id: 'r2', name: 'سارة', apartmentNumber: '5', monthlyAmount: 200, createdAt: '2026-08-01T00:00:00.000Z' }
        ];
        state.income = [
            // أحمد: ملتزم غالبًا مع تأخير واحد (متذبذب)
            { id: 'i1', residentId: 'r1', month: 'أغسطس 2026', amount: 100, purposeCode: 'subscription', date: '2026-08-10T12:00:00' },
            { id: 'i2', residentId: 'r1', month: 'سبتمبر 2026', amount: 100, purposeCode: 'subscription', date: '2026-09-05T12:00:00' },
            { id: 'i3', residentId: 'r1', month: 'أكتوبر 2026', amount: 100, purposeCode: 'subscription', date: '2026-10-25T12:00:00' },
            { id: 'i4', residentId: 'r1', month: 'نوفمبر 2026', amount: 100, purposeCode: 'subscription', date: '2026-11-03T12:00:00' },
            // سارة: متأخرة في كل الأشهر (متأخر مزمن)
            { id: 'i5', residentId: 'r2', month: 'أغسطس 2026', amount: 200, purposeCode: 'subscription', date: '2026-08-25T12:00:00' },
            { id: 'i6', residentId: 'r2', month: 'سبتمبر 2026', amount: 200, purposeCode: 'subscription', date: '2026-09-28T12:00:00' },
            { id: 'i7', residentId: 'r2', month: 'أكتوبر 2026', amount: 200, purposeCode: 'subscription', date: '2026-10-30T12:00:00' },
            { id: 'i8', residentId: 'r2', month: 'نوفمبر 2026', amount: 200, purposeCode: 'subscription', date: '2026-11-20T12:00:00' }
        ];
        state.expenses = ['أغسطس 2026','سبتمبر 2026','أكتوبر 2026','نوفمبر 2026'].flatMap((m,k)=>[{ id: 'x'+k+'a', month: m, title: 'كهرباء', amount: 100+k*40, category: 'مرافق', cashAccountCode: 'main' },{ id: 'x'+k+'b', month: m, title: 'صيانة', amount: 300-k*20, category: 'صيانة', cashAccountCode: 'main' }]); state.income.forEach((r,n)=>{ r.paymentMethod = n%3===0?'instapay':(n%3===1?'cash':'bank'); });
        renderAll();
        switchTab('reports');
    });
    await expect(page.locator('#tab-reports')).toBeVisible();
}

async function openReportPanel(page, name) {
    const item = page.locator(`[data-report-nav="${name}"]`);
    await expect(item).toBeVisible();
    await item.click();
    await expect(item).toHaveClass(/is-active/);
    await expect(page.locator('#tab-reports')).toHaveAttribute('data-report-view', 'panel');
}


for (const W of [360, 390]) {
    test(`insights report tables fit without clipping at ${W}px`, async ({ page }) => {
        test.setTimeout(120000);
        await page.setViewportSize({ width: W, height: 844 });
        await openReports(page);
        for (const [nav, panel] of [['paymentBehavior', 'paymentBehaviorPanel'], ['expenseVariance', 'expenseVariancePanel'], ['paymentMethods', 'paymentMethodsPanel']]) {
            await page.evaluate(() => { switchTab('reports'); if (typeof showReportIndex === 'function') showReportIndex(); });
            await page.locator(`[data-report-nav="${nav}"]`).click();
            const btn = page.locator(`#${panel}`).getByRole('button', { name: 'معاينة', exact: true });
            if (await btn.count()) await btn.first().click();
            // Wait for the rendered sheets, not a fixed delay.
            await page.waitForFunction(id => {
                const p = document.getElementById(id);
                return p && [...p.querySelectorAll('.sheet-wrap')].some(el => el.offsetParent && el.querySelector('thead th'));
            }, panel);
            await page.evaluate(id => document.getElementById(id).querySelectorAll('details').forEach(d => { d.open = true; }), panel);
            const clipped = await page.evaluate(id => [...document.getElementById(id).querySelectorAll('.sheet-wrap')]
                .filter(el => el.offsetParent && el.scrollWidth > el.clientWidth + 1)
                .map(el => [...el.querySelectorAll('thead th')].map(t => t.textContent.trim()).join('|')), panel);
            expect(clipped, `${nav} at ${W}px`).toEqual([]);
            if (process.env.SHOT_DIR) {
                await page.evaluate(() => { const n = document.querySelector('nav.fixed, #bottomNav, .bottom-nav'); if (n) n.style.display = 'none'; });
                await page.locator(`#${panel} [id$="Preview"]`).first().screenshot({ path: `${process.env.SHOT_DIR}/${nav}-${W}.png` });
            }
        }
    });
}
