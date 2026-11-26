const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function openReportsWithCurveData(page) {
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
        // شهور قريبة من تاريخ اليوم حتى لا تتراكم شهور قديمة على السيناريو
        state.residents = [
            { id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2026-08-01T00:00:00.000Z' },
            { id: 'r2', name: 'سارة', apartmentNumber: '5', monthlyAmount: 200, createdAt: '2026-08-01T00:00:00.000Z' }
        ];
        state.income = [
            // سبتمبر: سداد مبكر + سداد داخل السماح
            { id: 'i1', residentId: 'r1', month: 'سبتمبر 2026', amount: 100, purposeCode: 'subscription', date: '2026-08-30T12:00:00' },
            { id: 'i2', residentId: 'r2', month: 'سبتمبر 2026', amount: 200, purposeCode: 'subscription', date: '2026-09-12T12:00:00' },
            // أكتوبر: سداد متأخر جاء في نوفمبر + سداد داخل الشهر
            { id: 'i3', residentId: 'r1', month: 'أكتوبر 2026', amount: 100, purposeCode: 'subscription', date: '2026-11-04T12:00:00' },
            { id: 'i4', residentId: 'r2', month: 'أكتوبر 2026', amount: 200, purposeCode: 'subscription', date: '2026-10-20T12:00:00' }
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

test('collection curve report: preview, milestones and stale guard', async ({ page }) => {
    await openReportsWithCurveData(page);
    await openReportPanel(page, 'collectionCurve');
    await expect(page.locator('#collectionCurvePanel')).toBeVisible();
    await page.locator('#collectionCurveFromMonth').selectOption('سبتمبر 2026');
    await page.locator('#collectionCurveToMonth').selectOption('أكتوبر 2026');
    await page.locator('#collectionCurvePanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    const preview = page.locator('#collectionCurvePreview');
    await expect(preview.locator('.sheet-table').first()).toBeVisible({ timeout: 15000 });
    await expect(preview).toContainText('تقرير منحنى التحصيل');
    await expect(preview).toContainText('يوم الاستحقاق');
    await expect(preview).toContainText('نهاية السماح');
    await expect(preview).toContainText('المحصّل حتى الآن');
    // سبتمبر: الثلثان محصلان بنهاية السماح (100 مبكر + 200 يوم 12 من 300)
    await expect(preview).toContainText('100%');
    await expect(page.locator('#collectionCurvePrintBtn')).toBeEnabled();
    await expect(page.locator('#collectionCurvePdfBtn')).toBeEnabled();
    await expect(page.locator('#collectionCurveCsvBtn')).toBeEnabled();
    await expect(page.locator('#collectionCurveExcelBtn')).toBeEnabled();
    await expect(page.locator('[data-report-nav="collectionCurve"]')).toHaveClass(/is-ready/);
    // تغيير الفلتر يعطل التصدير حتى معاينة جديدة
    await page.locator('#collectionCurveToMonth').selectOption('نوفمبر 2026');
    await expect(page.locator('#collectionCurvePrintBtn')).toBeDisabled();
});

test('collection curve csv and excel exports download with a period filename', async ({ page }) => {
    await openReportsWithCurveData(page);
    await openReportPanel(page, 'collectionCurve');
    await page.locator('#collectionCurveFromMonth').selectOption('سبتمبر 2026');
    await page.locator('#collectionCurveToMonth').selectOption('أكتوبر 2026');
    await page.locator('#collectionCurvePanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    await expect(page.locator('#collectionCurveCsvBtn')).toBeEnabled({ timeout: 15000 });
    const csvDownload = page.waitForEvent('download');
    await page.locator('#collectionCurveCsvBtn').click();
    expect((await csvDownload).suggestedFilename()).toMatch(/^manzil_collection_curve_2026-09_2026-10\.csv$/);
    const excelDownload = page.waitForEvent('download');
    await page.locator('#collectionCurveExcelBtn').click();
    expect((await excelDownload).suggestedFilename()).toMatch(/^manzil_collection_curve_2026-09_2026-10\.xlsx$/);
});

async function expectNoHorizontalOverflow(page) {
    const overflow = await page.evaluate(() => {
        const panel = document.querySelector('#tab-reports .report-panel:not(.hidden)');
        return panel ? panel.scrollWidth - panel.clientWidth : 0;
    });
    expect(overflow).toBeLessThanOrEqual(0);
}

test('collection curve report fits 360px phones without horizontal scroll or clipping', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openReportsWithCurveData(page);
    await openReportPanel(page, 'collectionCurve');
    await page.locator('#collectionCurveFromMonth').selectOption('سبتمبر 2026');
    await page.locator('#collectionCurveToMonth').selectOption('أكتوبر 2026');
    await page.locator('#collectionCurvePanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    await expect(page.locator('#collectionCurvePreview .sheet-table').first()).toBeVisible({ timeout: 15000 });
    await expectNoHorizontalOverflow(page);
});
