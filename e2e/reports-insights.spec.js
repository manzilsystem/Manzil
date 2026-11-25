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
        state.expenses = [];
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

test('payer behavior report: index card, preview, judgment states and stale guard', async ({ page }) => {
    await openReports(page);
    await openReportPanel(page, 'paymentBehavior');
    await expect(page.locator('#paymentBehaviorPanel')).toBeVisible();
    await page.locator('#paymentBehaviorPanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    const preview = page.locator('#paymentBehaviorPreview');
    await expect(preview.locator('.sheet-table').first()).toBeVisible({ timeout: 15000 });
    await expect(preview).toContainText('سلوك كل مالك');
    // سارة متأخرة في الأشهر الثلاثة: متأخر مزمن
    await expect(preview).toContainText('متأخر مزمن');
    // أحمد في الموعد في يناير ومتأخر في فبراير ومارس
    await expect(preview).toContainText('متذبذب');
    await expect(preview).toContainText('نسبة الالتزام');
    await expect(page.locator('#paymentBehaviorPrintBtn')).toBeEnabled();
    await expect(page.locator('#paymentBehaviorPdfBtn')).toBeEnabled();
    await expect(page.locator('#paymentBehaviorCsvBtn')).toBeEnabled();
    await expect(page.locator('#paymentBehaviorExcelBtn')).toBeEnabled();
    await expect(page.locator('[data-report-nav="paymentBehavior"]')).toHaveClass(/is-ready/);
    // تغيير الفلتر يعطل التصدير حتى معاينة جديدة
    await page.locator('#paymentBehaviorResident').selectOption('r1');
    await expect(page.locator('#paymentBehaviorPrintBtn')).toBeDisabled();
    await page.locator('#paymentBehaviorPanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    await expect(preview).toContainText('أحمد');
    await expect(preview).not.toContainText('سارة');
});

test('payer behavior csv and excel exports download for the previewed filter', async ({ page }) => {
    await openReports(page);
    await openReportPanel(page, 'paymentBehavior');
    await page.locator('#paymentBehaviorPanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    await expect(page.locator('#paymentBehaviorCsvBtn')).toBeEnabled({ timeout: 15000 });
    const csvDownload = page.waitForEvent('download');
    await page.locator('#paymentBehaviorCsvBtn').click();
    expect((await csvDownload).suggestedFilename()).toMatch(/^manzil_payment_behavior_\d+\.csv$/);
    const excelDownload = page.waitForEvent('download');
    await page.locator('#paymentBehaviorExcelBtn').click();
    expect((await excelDownload).suggestedFilename()).toMatch(/^manzil_payment_behavior_\d+\.xlsx$/);
});
