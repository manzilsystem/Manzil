const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function renderOwner(page, income) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.renderOwnerPortal === 'function');
    await page.evaluate(rows => {
        window.currentUserRole = 'owner';
        window.currentResidentId = 'owner-history-test';
        document.body.classList.remove('session-locked', 'modal-open');
        document.body.classList.add('owner-mode');
        const pinLock = document.getElementById('pinLockModal');
        pinLock.classList.add('hidden');
        pinLock.classList.remove('flex');
        state.residents = [{ id: 'owner-history-test', name: 'مالك تجريبي', apartmentNumber: '12', floor: 1, monthlyAmount: 600, subscriptionRates: [], createdAt: '2025-01-01T00:00:00Z' }];
        state.income = rows;
        state.adjustments = []; state.notices = []; state.ownerNotifications = [];
        window.renderAll();
        window.renderOwnerPortal();
    }, income);
    await expect(page.locator('#ownerPortal')).toBeVisible();
}

const payments = [
    { id: 'pay-aaa1', residentId: 'owner-history-test', amount: 600, month: '2026-09', date: '2026-09-03', paymentMethod: 'cash' },
    { id: 'pay-bbb2', residentId: 'owner-history-test', amount: 300, month: '2026-10', date: '2026-10-05', paymentMethod: 'wallet', notes: 'دفعة جزئية محولة بمحفظة فودافون كاش برقم مرجعي طويل 9876543210' }
];

for (const width of [360, 390]) {
    test.describe(`owner receipts on a ${width}px phone`, () => {
        test.use({ viewport: { width, height: 800 } });

        test('the receipts list fits without horizontal overflow', async ({ page }) => {
            await renderOwner(page, payments);
            const receipts = page.locator('#ownerReceiptsTitle').locator('xpath=ancestor::section').locator('details', { has: page.locator('summary strong', { hasText: 'إيصال رقم' }) });
            await expect(receipts).toHaveCount(2);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow).toBeLessThanOrEqual(1);
            const sectionBox = await page.locator('section[aria-labelledby="ownerReceiptsTitle"]').boundingBox();
            expect(sectionBox.x).toBeGreaterThanOrEqual(0);
            expect(sectionBox.x + sectionBox.width).toBeLessThanOrEqual(width + 1);
        });

        test('a long wallet reference wraps inside the receipt instead of clipping', async ({ page }) => {
            await renderOwner(page, payments);
            const receipts = page.locator('#ownerReceiptsTitle').locator('xpath=ancestor::section').locator('details', { has: page.locator('summary strong', { hasText: 'إيصال رقم' }) });
            const summary = receipts.nth(0).locator('summary');
            await expect(summary).toBeVisible();
            const box = await summary.boundingBox();
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
            await summary.click();
            const body = receipts.nth(0).locator('div').last();
            const bodyBox = await body.boundingBox();
            expect(bodyBox.x + bodyBox.width).toBeLessThanOrEqual(width + 1);
        });
    });
}
