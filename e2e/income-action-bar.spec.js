const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
function startIso(offset) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

async function seed(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof handleIncomeSubmit === 'function' && typeof renderAll === 'function');
    await page.evaluate(iso => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        window.saveWithRollback = async () => { syncCashboxBalancesAfterSnapshot(); return true; };
        try { localStorage.removeItem('manzil.lastIncomePaymentMethod'); localStorage.removeItem('manzil.lastExpenseCategory'); } catch (e) { /* none */ }
        state.buildingName = 'عمارة'; state.managerName = 'مدير'; state.startingBalance = 500;
        state.paymentAllocationPolicy = 'oldest_first';
        state.residents = [{ id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: iso }];
        state.income = []; state.expenses = []; state.notices = []; state.auditLogs = []; state.cashTransfers = [];
        state.cashAccountBalances = { main: 500, development: 0, emergency: 0 };
        initializeCashboxAccountingSnapshot();
        renderAll();
        switchTab('cashbox');
    }, startIso(-3));
}

async function insideViewport(page, selector) {
    const box = await page.locator(selector).boundingBox();
    const vp = page.viewportSize();
    expect(box, selector).not.toBeNull();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
}

for (const width of [360, 390]) {
    test(`income action bar stays visible and paying the oldest month in cash takes 5 taps at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 700 });
        await seed(page);
        await page.evaluate(() => openNewIncomeModal());
        let taps = 0;
        taps += 1; // opening the collection form
        await expect(page.locator('#incomeModal')).toBeVisible();
        await insideViewport(page, '#incomeWizardNext');
        await page.locator('#incomeResident').selectOption('r1'); taps += 1;
        await page.locator('#incomeWizardNext').click(); taps += 1;
        await insideViewport(page, '#incomeWizardNext');
        await page.locator('#incomeWizardNext').click(); taps += 1;
        await expect(page.locator('#incomePaymentMethod')).toHaveValue('cash');
        await insideViewport(page, '#incomeSubmitButton');
        await insideViewport(page, '#incomeWizardBack');
        await insideViewport(page, '#incomeWizardSummary');
        await page.locator('#incomeSubmitButton').click(); taps += 1;
        await expect(page.locator('#incomeModal')).toBeHidden();
        expect(taps).toBe(5);
        const rows = await page.evaluate(() => state.income.map(i => ({ amount: i.amount, method: i.paymentMethod, month: i.month })));
        expect(rows).toHaveLength(1);
        expect(rows[0].method).toBe('cash');
        expect(rows[0].amount).toBe(100);
        const oldest = await page.evaluate(iso => { const d = new Date(iso); return `${['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][d.getMonth()]} ${d.getFullYear()}`; }, startIso(-3));
        expect(rows[0].month).toBe(oldest);
    });

    test(`validation toast does not cover the wizard header or the focused field at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 700 });
        await seed(page);
        await page.evaluate(() => { openNewIncomeModal(); });
        await page.locator('#incomeWizardNext').click();
        await expect(page.locator('#toastContainer .toast').first()).toBeVisible();
        const toast = await page.locator('#toastContainer .toast').first().boundingBox();
        const header = await page.locator('#incomeWizardProgress').boundingBox();
        expect(toast.y + toast.height).toBeLessThanOrEqual(header.y);
        const field = await page.locator('#incomeResident').boundingBox();
        expect(toast.y + toast.height).toBeLessThanOrEqual(field.y);
    });
}

test('expense form has no default category, names the missing field, and remembers the last category', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 700 });
    await seed(page);
    await page.evaluate(() => { switchTab('expenses'); openExpenseModal(); });
    await expect(page.locator('#expenseCategory')).toHaveValue('');
    await insideViewport(page, '#expenseSubmitButton');
    await page.locator('#expenseTitle').fill('فاتورة');
    await page.locator('#expenseAmount').fill('30');
    await page.locator('#expenseSubmitButton').click();
    await expect(page.locator('#toastContainer')).toContainText('فئة');
    await expect(page.locator('#expenseCategory')).toBeFocused();
    expect(await page.evaluate(() => state.expenses.length)).toBe(0);
    await page.locator('#expenseCategory').selectOption('نظافة');
    await page.locator('#expenseSubmitButton').click();
    await expect(page.locator('#expenseModal')).toBeHidden();
    expect(await page.evaluate(() => state.expenses.length)).toBe(1);
    await page.evaluate(() => openExpenseModal());
    await expect(page.locator('#expenseCategory')).toHaveValue('نظافة');
});
