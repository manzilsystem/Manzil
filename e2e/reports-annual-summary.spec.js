const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function openReportsWithAnnualData(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.switchTab === 'function' && typeof renderAll === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.buildingName = 'عمارة الاختبار';
        state.managerName = 'مدير الاختبار';
        // شهور قريبة من تاريخ اليوم حتى لا تتراكم شهور قديمة على السيناريو
        state.residents = [
            { id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2026-08-01T00:00:00.000Z' },
            { id: 'r2', name: 'سارة', apartmentNumber: '5', monthlyAmount: 200, createdAt: '2026-08-01T00:00:00.000Z' }
        ];
        state.income = [
            // تحصيل مدفوع في 2025 حتى تظهر سنة ثانية في قائمة السنوات
            { id: 'i0', residentId: 'r1', month: 'ديسمبر 2025', amount: 100, purposeCode: 'subscription', date: '2025-12-10T12:00:00' },
            { id: 'i1', residentId: 'r1', month: 'سبتمبر 2026', amount: 100, purposeCode: 'subscription', date: '2026-09-08T12:00:00' },
            { id: 'i2', residentId: 'r2', month: 'سبتمبر 2026', amount: 200, purposeCode: 'subscription', date: '2026-09-12T12:00:00' },
            { id: 'i3', residentId: 'r1', month: 'أكتوبر 2026', amount: 100, purposeCode: 'subscription', date: '2026-10-09T12:00:00' }
        ];
        state.expenses = [
            { id: 'e1', month: 'سبتمبر 2026', amount: 80, category: 'نظافة', date: '2026-09-15T12:00:00' }
        ];
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

test('annual summary report: preview, totals and stale guard', async ({ page }) => {
    await openReportsWithAnnualData(page);
    await openReportPanel(page, 'annualSummary');
    await expect(page.locator('#annualSummaryPanel')).toBeVisible();
    await page.locator('#annualSummaryYear').selectOption('2026');
    await page.locator('#annualSummaryPanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    const preview = page.locator('#annualSummaryPreview');
    await expect(preview.locator('.sheet-table').first()).toBeVisible({ timeout: 15000 });
    await expect(preview).toContainText('الملخص السنوي 2026');
    await expect(preview).toContainText('إجمالي 2026');
    await expect(preview).toContainText('نسبة التحصيل');
    await expect(preview).toContainText('متوسط نسبة التحصيل');
    // سبتمبر: تحصيل كامل (300 من 300) وأكتوبر: سداد جزئي (100 من 300)
    await expect(preview).toContainText('100%');
    await expect(page.locator('#annualSummaryPrintBtn')).toBeEnabled();
    await expect(page.locator('#annualSummaryPdfBtn')).toBeEnabled();
    await expect(page.locator('#annualSummaryCsvBtn')).toBeEnabled();
    await expect(page.locator('#annualSummaryExcelBtn')).toBeEnabled();
    await expect(page.locator('[data-report-nav="annualSummary"]')).toHaveClass(/is-ready/);
    // تغيير الفلتر يعطل التصدير حتى معاينة جديدة
    await page.locator('#annualSummaryYear').selectOption('2025');
    await expect(page.locator('#annualSummaryPrintBtn')).toBeDisabled();
});

test('annual summary csv and excel exports download with a year filename', async ({ page }) => {
    await openReportsWithAnnualData(page);
    await openReportPanel(page, 'annualSummary');
    await page.locator('#annualSummaryYear').selectOption('2026');
    await page.locator('#annualSummaryPanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    await expect(page.locator('#annualSummaryCsvBtn')).toBeEnabled({ timeout: 15000 });
    const csvDownload = page.waitForEvent('download');
    await page.locator('#annualSummaryCsvBtn').click();
    expect((await csvDownload).suggestedFilename()).toMatch(/^manzil_annual_summary_2026\.csv$/);
    const excelDownload = page.waitForEvent('download');
    await page.locator('#annualSummaryExcelBtn').click();
    expect((await excelDownload).suggestedFilename()).toMatch(/^manzil_annual_summary_2026\.xlsx$/);
});

async function expectNoHorizontalOverflow(page) {
    const overflow = await page.evaluate(() => {
        const panel = document.querySelector('#tab-reports .report-panel:not(.hidden)');
        return panel ? panel.scrollWidth - panel.clientWidth : 0;
    });
    expect(overflow).toBeLessThanOrEqual(0);
}

test('annual summary report fits 360px phones without horizontal scroll or clipping', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openReportsWithAnnualData(page);
    await openReportPanel(page, 'annualSummary');
    await page.locator('#annualSummaryYear').selectOption('2026');
    await page.locator('#annualSummaryPanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    await expect(page.locator('#annualSummaryPreview .sheet-table').first()).toBeVisible({ timeout: 15000 });
    await expectNoHorizontalOverflow(page);
});
