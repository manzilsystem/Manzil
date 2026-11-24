const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

const PENDING_KEY = 'manzil:cash-transfer-pending:building-1';
const PRIOR_PAYLOAD = {
    fromAccountCode: 'main',
    toAccountCode: 'development',
    amount: 10,
    notes: 'ملاحظة المدير السابق'
};

test('an uncertain transfer draft is discarded when the manager identity changes', async ({ page }) => {
    await page.route('**/rest/v1/rpc/transfer_cash_between_accounts', route => route.abort());
    await loadShell(page);
    await page.waitForFunction(() => typeof clearAuthenticatedState === 'function'
        && typeof submitCashTransfer === 'function');

    const afterSwitch = await page.evaluate(({ key, payload }) => {
        sessionStorage.setItem(key, JSON.stringify({ requestId: 'req-previous-manager', payload }));
        cashTransferPendingRequestId = 'req-previous-manager';
        cashTransferPendingPayload = payload;
        cashTransferPendingBuildingId = 'building-1';
        activeBuildingId = 'building-1';

        clearAuthenticatedState();

        return { stored: sessionStorage.getItem(key), requestId: cashTransferPendingRequestId };
    }, { key: PENDING_KEY, payload: PRIOR_PAYLOAD });

    expect(afterSwitch.stored).toBeNull();
    expect(afterSwitch.requestId).toBeNull();

    await page.evaluate(() => {
        currentUserRole = 'manager';
        activeBuildingId = 'building-1';
        document.body.classList.remove('session-locked', 'modal-open');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.cashAccountBalances = { main: 100, development: 0, emergency: 0 };
        renderAll();
        switchTab('cashbox');
    });

    await page.locator('#cashTransferFrom').selectOption('main');
    await page.locator('#cashTransferTo').selectOption('development');
    await page.locator('#cashTransferAmount').fill('20');
    await page.locator('#cashTransferNotes').fill('ملاحظة المدير الجديد');
    await page.evaluate(() => submitCashTransfer(new Event('submit')));

    await expect(page.locator('#cashTransferNotes')).toHaveValue('ملاحظة المدير الجديد');
    await expect(page.getByText('تمت استعادة بيانات تحويل سابق غير مؤكد.')).toHaveCount(0);
});
