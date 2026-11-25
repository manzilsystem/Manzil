const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function openSettings(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.openSettingsModal === 'function' && typeof window.openModal === 'function');
    // Keep saves offline: any RPC that validation lets through fails fast.
    await page.route('**/rest/v1/rpc/**', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"offline e2e"}' }));
    await page.evaluate(() => {
        window.callBackupConsole = async () => ({ backups: [], restoreRequests: [], backupRequests: [] });
        window.currentUserRole = 'manager';
        // Baseline: cash only, so each test enables exactly the method it checks.
        state.paymentSettings = normalizePaymentSettings({
            cash: { enabled: true },
            wallet: { enabled: false },
            instapay: { enabled: false },
            bank_transfer: { enabled: false }
        });
        window.openSettingsModal();
    });
    await expect(page.locator('#settingsModal')).toBeVisible();
}

test('invalid subscription due day marks the field, opens its tab, and focuses it', async ({ page }) => {
    await openSettings(page);

    await page.locator('#settings-tab-subscriptions').click();
    await page.locator('#settingsSubscriptionDueDay').fill('40');
    await page.locator('#settingsSaveButton').click();

    const field = page.locator('#settingsSubscriptionDueDay');
    await expect(field).toHaveClass(/is-field-error/);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toBeFocused();
    await expect(page.locator('#settings-panel-subscriptions')).toBeVisible();
    await expect(page.locator('#toastContainer')).toContainText('يوم الاستحقاق يجب أن يكون');

    await field.fill('5');
    await expect(field).not.toHaveClass(/is-field-error/);
});

test('junk manager phone is rejected; Egyptian and +20 forms pass validation', async ({ page }) => {
    await openSettings(page);

    await page.locator('#settings-tab-building').click();
    await page.locator('#settingsManagerPhone').fill('123');
    await page.locator('#settingsSaveButton').click();

    const field = page.locator('#settingsManagerPhone');
    await expect(field).toHaveClass(/is-field-error/);
    await expect(field).toBeFocused();
    await expect(page.locator('#settings-panel-building')).toBeVisible();
    await expect(page.locator('#toastContainer')).toContainText('رقم هاتف المدير غير صحيح');

    for (const valid of ['01012345678', '+201012345678', '+44 7911 123456']) {
        await field.fill(valid);
        await expect(field).not.toHaveClass(/is-field-error/);
        await page.locator('#settingsSaveButton').click();
        // Validation passes; saving then fails fast at the stubbed offline RPC,
        // which proves the phone check did not block the save.
        await expect(page.locator('#toastContainer')).toContainText('تعذر حفظ إعدادات الأدوار والشقق');
        await expect(field).not.toHaveClass(/is-field-error/);
    }
});

function paymentCard(page, fieldId) {
    return page.locator('.settings-payment-card', { has: page.locator('#' + fieldId) });
}

async function unfoldCard(card) {
    if ((await card.getAttribute('class') || '').includes('is-folded')) {
        await card.locator('.settings-method-head').click();
        await expect(card).not.toHaveClass(/is-folded/);
    }
}

test('enabling wallet without its number is blocked with a clear message', async ({ page }) => {
    await openSettings(page);

    await page.locator('#settings-tab-payments').click();
    await unfoldCard(paymentCard(page, 'settingsPaymentWalletEnabled'));
    const walletToggle = page.locator('#settingsPaymentWalletEnabled');
    if (!(await walletToggle.isChecked())) await walletToggle.check();
    await page.locator('#settingsWalletNumber').fill('');
    await page.locator('#settingsSaveButton').click();

    const field = page.locator('#settingsWalletNumber');
    await expect(field).toHaveClass(/is-field-error/);
    await expect(field).toBeFocused();
    await expect(page.locator('#settings-panel-payments')).toBeVisible();
    await expect(page.locator('#toastContainer')).toContainText('أدخل رقم المحفظة الإلكترونية أو أوقفها');
});

test('enabling bank transfer without account or IBAN is blocked', async ({ page }) => {
    await openSettings(page);

    await page.locator('#settings-tab-payments').click();
    await unfoldCard(paymentCard(page, 'settingsPaymentBankEnabled'));
    const bankToggle = page.locator('#settingsPaymentBankEnabled');
    if (!(await bankToggle.isChecked())) await bankToggle.check();
    await page.locator('#settingsBankAccountNumber').fill('');
    await page.locator('#settingsBankIban').fill('');
    await page.locator('#settingsSaveButton').click();

    await expect(page.locator('#settingsBankAccountNumber')).toHaveClass(/is-field-error/);
    await expect(page.locator('#toastContainer')).toContainText('رقم الحساب أو رقم IBAN');

    await page.locator('#settingsBankIban').fill('EG380019000500000000263180002');
    await page.locator('#settingsSaveButton').click();
    await expect(page.locator('#toastContainer')).toContainText('تعذر حفظ إعدادات الأدوار والشقق');
    await expect(page.locator('#settingsBankAccountNumber')).not.toHaveClass(/is-field-error/);
});

test('mobile: a flagged field inside a folded card unfolds it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'accordion folds on phones only');
    await openSettings(page);

    await page.locator('#settings-tab-payments').click();
    const walletCard = paymentCard(page, 'settingsPaymentWalletEnabled');
    await expect(walletCard).toHaveClass(/is-folded/);

    await unfoldCard(walletCard);
    const walletToggle = page.locator('#settingsPaymentWalletEnabled');
    if (!(await walletToggle.isChecked())) await walletToggle.check();
    await page.locator('#settingsWalletNumber').fill('');
    await walletCard.locator('.settings-method-head').click();
    await expect(walletCard).toHaveClass(/is-folded/, 'card folds again before saving');
    await page.locator('#settingsSaveButton').click();

    await expect(walletCard).not.toHaveClass(/is-folded/, 'error opens the folded wallet card');
    await expect(page.locator('#settingsWalletNumber')).toHaveClass(/is-field-error/);
    await expect(page.locator('#settingsWalletNumber')).toBeFocused();
});
