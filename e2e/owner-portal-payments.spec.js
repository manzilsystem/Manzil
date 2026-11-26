const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function renderOwner(page, paymentSettings) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.renderOwnerPortal === 'function');
    await page.evaluate(settings => {
        window.currentUserRole = 'owner';
        window.currentResidentId = 'owner-pay-test';
        document.body.classList.remove('session-locked', 'modal-open');
        document.body.classList.add('owner-mode');
        const pinLock = document.getElementById('pinLockModal');
        pinLock.classList.add('hidden');
        pinLock.classList.remove('flex');
        state.residents = [{ id: 'owner-pay-test', name: 'مالك تجريبي', apartmentNumber: '12', floor: 1, monthlyAmount: 600, subscriptionRates: [], createdAt: '2025-01-01T00:00:00Z' }];
        state.income = [];
        state.adjustments = [];
        state.notices = [];
        state.ownerNotifications = [];
        state.paymentSettings = settings;
        window.renderAll();
        window.renderOwnerPortal();
    }, paymentSettings);
    await expect(page.locator('#ownerPortal')).toBeVisible();
}

test('owner payment methods list only methods that have details', async ({ page }) => {
    await renderOwner(page, { cash: { enabled: true } });
    const section = page.locator('#ownerPaymentMethodsTitle').locator('xpath=ancestor::section');
    await expect(section.getByText('نقدًا')).toBeVisible();
    await expect(section.getByText('يرجى التواصل مع المدير للحصول على بيانات الاستلام.')).toHaveCount(0);
    await expect(section.getByText('InstaPay')).toHaveCount(0);
    await expect(section.getByText('تحويل بنكي')).toHaveCount(0);
});

test('owner payment methods show filled-in wallet details', async ({ page }) => {
    await renderOwner(page, { cash: { enabled: false }, wallet: { enabled: true, provider: 'فودافون كاش', number: '01001234567' } });
    const section = page.locator('#ownerPaymentMethodsTitle').locator('xpath=ancestor::section');
    await expect(section.getByText('رقم المحفظة: 01001234567')).toBeVisible();
    await expect(section.getByText('نقدًا')).toHaveCount(0);
});

test('owner sees a helpful line when no payment method has details', async ({ page }) => {
    await renderOwner(page, { cash: { enabled: false }, wallet: { enabled: false }, instapay: { enabled: false }, bank_transfer: { enabled: false } });
    await expect(page.getByText('لم تُسجَّل بيانات السداد بعد')).toBeVisible();
});

test('the arrears total stays on one line at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await renderOwner(page, { cash: { enabled: true } });
    const box = await page.locator('#ownerPortal section[aria-label="ملخص حساب الشقة"] > div.app-input strong').boundingBox();
    expect(box.height).toBeLessThan(26);
});
