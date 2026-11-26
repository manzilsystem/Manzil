const { test, expect } = require('@playwright/test');
const { loadShell, advanceIncomeStep } = require('./helpers');

// A resident (100/month since Jan 2024) with an agreed settlement for February:
// 60 instead of the full 100. The suite pays it in parts through the income wizard.
async function seedManagerSession(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof handleIncomeSubmit === 'function' && typeof renderAll === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        // Keep the browser test offline while still applying the balance delta the real save performs.
        window.saveWithRollback = async () => {
            syncCashboxBalancesAfterSnapshot();
            return true;
        };
        state.buildingName = 'عمارة الاختبار';
        state.managerName = 'مدير الاختبار';
        state.startingBalance = 500;
        state.residents = [{
            id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100,
            createdAt: '2024-01-01T00:00:00.000Z',
            subscriptionRates: [{ effectiveMonth: '2024-01-01', monthlyAmount: 100 }]
        }];
        state.income = [];
        state.expenses = [];
        state.adjustments = [{
            id: 's1', residentId: 'r1', effectiveMonth: '2024-02-01',
            kind: 'settlement', amount: 60, reason: 'ظروف الساكن'
        }];
        state.notices = [];
        state.auditLogs = [];
        state.cashTransfers = [];
        state.cashAccountBalances = { main: 500, development: 0, emergency: 0 };
        initializeCashboxAccountingSnapshot();
        renderAll();
    });
}

async function openIncomeWizard(page) {
    // A successful submit leaves the receipt modal on top; dismiss it first.
    await page.evaluate(() => closeModal('incomeReceiptModal'));
    await expect(page.locator('#incomeReceiptModal')).toBeHidden();
    await page.evaluate(() => {
        switchTab('cashbox');
        openNewIncomeModal();
    });
    await expect(page.locator('#incomeModal')).toBeVisible();
    await page.locator('#incomeResident').selectOption('r1');
    await page.locator('#incomePurpose').selectOption('settlement');
}

async function paySettlement(page, amount) {
    await advanceIncomeStep(page, 2);
    await page.locator('#incomeAmount').fill(String(amount));
    await advanceIncomeStep(page, 3);
    await page.locator('#incomePaymentMethod').selectOption('cash');
    await page.locator('#incomeSubmitButton').click();
}

test('settlement payment locks the month and caps the amount at the remaining', async ({ page }) => {
    await seedManagerSession(page);
    await openIncomeWizard(page);

    await expect(page.locator('#incomeSettlementWrap')).toBeVisible();
    await expect(page.locator('#incomeSettlementSelect')).toHaveValue('s1');
    await expect(page.locator('#incomeSettlementHint')).toContainText('المتبقي: ٦٠٫٠٠');

    // First partial payment: 25 of 60.
    await page.locator('#incomeAmount').waitFor({ state: 'attached' });
    await paySettlement(page, 25);
    await expect(page.locator('#incomeModal')).toBeHidden();

    let rows = await page.evaluate(() => state.income.map(item => ({
        amount: item.amount, month: item.month, purposeCode: item.purposeCode,
        settlementAdjustmentId: item.settlementAdjustmentId || null
    })));
    expect(rows).toEqual([{
        amount: 25, month: 'فبراير 2024', purposeCode: 'settlement', settlementAdjustmentId: 's1'
    }]);
    expect(await page.evaluate(() => getCashAccountBalance('main'))).toBe(525);
    expect(await page.evaluate(() => getSettlementRemainingAmount(state.adjustments[0]))).toBe(35);

    // Reopen: the wizard offers only the remaining 35 and refuses more.
    await openIncomeWizard(page);
    await expect(page.locator('#incomeSettlementHint')).toContainText('المتبقي: ٣٥٫٠٠');
    await advanceIncomeStep(page, 2);
    await page.locator('#incomeAmount').fill('40');
    await advanceIncomeStep(page, 3);
    await page.locator('#incomePaymentMethod').selectOption('cash');
    // The preview blocks the over-payment: submit is disabled and the summary says why.
    await expect(page.locator('#incomeAllocationSummary')).toContainText('المبلغ أكبر من المتبقي في اتفاق التسوية');
    await expect(page.locator('#incomeSubmitButton')).toBeDisabled();
    expect(await page.evaluate(() => state.income.length)).toBe(1);

    // Pay the exact remaining 35: the settlement closes and leaves the wizard.
    // (Still on step 3 from the refused attempt; go back to step 2 to fix the amount.)
    await page.locator('#incomeWizardBack').click();
    await expect(page.locator('#incomeWizardStep2')).toBeVisible();
    await page.locator('#incomeAmount').fill('35');
    await advanceIncomeStep(page, 3);
    await page.locator('#incomeSubmitButton').click();
    await expect(page.locator('#incomeModal')).toBeHidden();
    rows = await page.evaluate(() => state.income.map(item => item.amount));
    expect(rows).toEqual([25, 35]);
    expect(await page.evaluate(() => getCashAccountBalance('main'))).toBe(560);
    expect(await page.evaluate(() => getSettlementRemainingAmount(state.adjustments[0]))).toBe(0);

    await openIncomeWizard(page);
    await expect(page.locator('#incomeSettlementSelect')).toBeDisabled();
    await expect(page.locator('#incomeSettlementSelect')).toHaveValue('');
    await expect(page.locator('#incomeSettlementHint')).toContainText('اختر اتفاق تسوية مفتوحًا');
    // Nothing can be submitted without an open settlement.
    await advanceIncomeStep(page, 2);
    await page.locator('#incomeAmount').fill('10');
    await advanceIncomeStep(page, 3);
    await expect(page.locator('#incomeAllocationSummary')).toContainText('اختر اتفاق تسوية مفتوحًا');
    await expect(page.locator('#incomeSubmitButton')).toBeDisabled();
    await page.evaluate(() => closeModal('incomeModal'));

    // The settled month shows the agreement (60) as fully paid in the resident statement,
    // while the unpaid January stays outstanding.
    const statement = await page.evaluate(() => {
        const s = buildResidentStatement('r1');
        return {
            months: s.months.map(row => ({
                month: row.month, due: row.dueCents, adjustment: row.adjustmentCents,
                netDue: row.netDueCents, paid: row.paidCents, remaining: row.remainingCents
            })),
            remaining: s.totals.remainingCents
        };
    });
    // February: gross 100, settled to 60 (shown as a 40 adjustment), fully paid by 25+35.
    const february = statement.months.find(row => row.month === 'فبراير 2024');
    expect(february).toEqual({ month: 'فبراير 2024', due: 10000, adjustment: 4000, netDue: 6000, paid: 6000, remaining: 0 });
    // Every other billed month is unpaid at the full 100.
    const others = statement.months.filter(row => row.month !== 'فبراير 2024');
    expect(others.length).toBeGreaterThan(0);
    expect(others.every(row => row.remaining === 10000)).toBe(true);
    expect(statement.remaining).toBe(others.length * 10000);
});
