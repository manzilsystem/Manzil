const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

const REPORTS = ['landlord', 'period', 'cashflow', 'expenses', 'expenseVariance', 'paymentMethods', 'collectionCurve', 'annualSummary', 'cashForecast', 'statement', 'apartments', 'arrears', 'paymentBehavior', 'adjustments', 'monthlyClose', 'audit'];
const TABS = ['dashboard', 'income', 'cashbox', 'expenses', 'residents', 'reports'];

async function seed(page) {
    await loadShell(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => typeof window.switchTab === 'function' && typeof renderAll === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.buildingName = 'برج الهدى';
        state.managerName = 'مدير';
        state.residents = [1, 2, 3].map(i => ({ id: 'r' + i, name: 'ساكن رقم ' + i + ' بإسم طويل جدًا للاختبار', apartmentNumber: String(i), monthlyAmount: 150, phone: '0100000000' + i, createdAt: '2024-01-01T00:00:00.000Z' }));
        state.income = [{ id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 150, paymentMethod: 'cash' }];
        state.expenses = [{ id: 'e1', title: 'فاتورة كهرباء السلم والمصعد للعمارة', amount: 420, category: 'كهرباء', month: 'يناير 2024', date: '2024-01-05T00:00:00.000Z' }];
        renderAll();
    });
}

const overflow = page => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));

test.describe('390px: no horizontal overflow', () => {
    for (const tab of TABS) {
        test('tab ' + tab, async ({ page }) => {
            await seed(page);
            await page.evaluate(t => switchTab(t), tab);
            // No fixed sleep: wait until the tab is actually shown and webfonts settled
            // before measuring layout, so slow runners do not flake.
            await page.waitForFunction(t => {
                const panel = document.getElementById('tab-' + t);
                return Boolean(panel) && !panel.classList.contains('hidden');
            }, tab);
            await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
            const m = await overflow(page);
            expect(m.sw).toBe(m.cw);
            expect(m.bw).toBeLessThanOrEqual(m.cw);
        });
    }

    test('every report panel', async ({ page }) => {
        await seed(page);
        await page.evaluate(() => switchTab('reports'));
        for (const name of REPORTS) {
            const view = await page.locator('#tab-reports').getAttribute('data-report-view');
            if (view === 'panel') await page.getByRole('button', { name: 'رجوع إلى فهرس التقارير' }).click();
            const item = page.locator(`[data-report-nav="${name}"]`);
            await item.scrollIntoViewIfNeeded();
            await item.click();
            await expect(page.locator('#tab-reports')).toHaveAttribute('data-report-view', 'panel');
            const m = await overflow(page);
            expect(m.sw, 'report ' + name).toBe(m.cw);
        }
    });

    test('settings overview and every settings tab', async ({ page }) => {
        await seed(page);
        await page.evaluate(() => openSettingsModal());
        let m = await overflow(page);
        expect(m.sw).toBe(m.cw);
        for (const tab of ['building', 'payments', 'subscriptions', 'appearance', 'backup', 'receipts', 'reminders', 'account']) {
            await page.evaluate(t => switchSettingsTab(t), tab);
            m = await overflow(page);
            expect(m.sw, 'settings ' + tab).toBe(m.cw);
        }
    });
});
