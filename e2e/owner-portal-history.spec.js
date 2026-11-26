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
    { id: 'pay-bbb2', residentId: 'owner-history-test', amount: 300, month: '2026-10', date: '2026-10-05', paymentMethod: 'wallet' }
];

test('payments appear once, in the receipts, with their month on the closed line', async ({ page }) => {
    await renderOwner(page, payments);
    await expect(page.locator('#ownerPaymentHistoryTitle')).toHaveCount(0);
    const receipts = page.locator('#ownerReceiptsTitle').locator('xpath=ancestor::section').locator('details', { has: page.locator('summary strong', { hasText: 'إيصال رقم' }) });
    await expect(receipts).toHaveCount(2);
    await expect(receipts.nth(0)).toContainText('عن شهر 2026-10');
    await expect(receipts.nth(1)).toContainText('عن شهر 2026-09');
    await expect(receipts.nth(0)).toContainText('300');
});

test('a receipt that covers several months lists them on the closed line', async ({ page }) => {
    const split = [1, 2, 3, 4].map(n => ({
        id: 'pay-split' + n, residentId: 'owner-history-test', amount: 100, month: '2026-0' + n, date: '2026-10-05',
        paymentMethod: 'cash', notes: `دفعة موزعة ABC123 (${n}/4)`
    }));
    await renderOwner(page, split);
    const receipt = page.locator('#ownerReceiptsTitle').locator('xpath=ancestor::section').locator('details', { has: page.locator('summary strong', { hasText: 'إيصال رقم' }) });
    await expect(receipt).toHaveCount(1);
    await expect(receipt).toContainText('عن شهور 2026-01، 2026-02، 2026-03 +1');
});
