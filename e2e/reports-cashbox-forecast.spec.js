const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

async function openReportsWithForecastData(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.switchTab === 'function' && typeof renderAll === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.buildingName = 'عمارة الاختبار';
        state.managerName = 'مدير الاختبار';
        state.cashAccountBalances = { main: 500, development: 0, emergency: 0 };
        // ملاك نشطون من مايو حتى تكتمل أشهر خط الأساس الستة المغلقة
        state.residents = [
            { id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2026-05-01T00:00:00.000Z' },
            { id: 'r2', name: 'سارة', apartmentNumber: '5', monthlyAmount: 200, createdAt: '2026-05-01T00:00:00.000Z' }
        ];
        state.income = [
            { id: 'i1', residentId: 'r1', month: 'مايو 2026', amount: 100, purposeCode: 'subscription', date: '2026-05-08T12:00:00' },
            { id: 'i2', residentId: 'r2', month: 'مايو 2026', amount: 200, purposeCode: 'subscription', date: '2026-05-10T12:00:00' },
            { id: 'i3', residentId: 'r1', month: 'يونيو 2026', amount: 100, purposeCode: 'subscription', date: '2026-06-08T12:00:00' },
            { id: 'i4', residentId: 'r2', month: 'يونيو 2026', amount: 200, purposeCode: 'subscription', date: '2026-06-10T12:00:00' },
            { id: 'i5', residentId: 'r1', month: 'يوليو 2026', amount: 100, purposeCode: 'subscription', date: '2026-07-08T12:00:00' },
            { id: 'i6', residentId: 'r2', month: 'يوليو 2026', amount: 200, purposeCode: 'subscription', date: '2026-07-10T12:00:00' },
            { id: 'i7', residentId: 'r1', month: 'أغسطس 2026', amount: 100, purposeCode: 'subscription', date: '2026-08-08T12:00:00' },
            { id: 'i8', residentId: 'r1', month: 'سبتمبر 2026', amount: 100, purposeCode: 'subscription', date: '2026-09-08T12:00:00' },
            { id: 'i9', residentId: 'r2', month: 'سبتمبر 2026', amount: 200, purposeCode: 'subscription', date: '2026-09-10T12:00:00' },
            { id: 'i10', residentId: 'r1', month: 'أكتوبر 2026', amount: 100, purposeCode: 'subscription', date: '2026-10-08T12:00:00' }
        ];
        state.expenses = [
            { id: 'e1', month: 'يونيو 2026', amount: 90, category: 'نظافة', date: '2026-06-15T12:00:00' },
            { id: 'e2', month: 'سبتمبر 2026', amount: 120, category: 'صيانة', date: '2026-09-15T12:00:00' }
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

test('cashbox forecast report: preview, baseline and stale guard', async ({ page }) => {
    await openReportsWithForecastData(page);
    await openReportPanel(page, 'cashForecast');
    await expect(page.locator('#cashForecastPanel')).toBeVisible();
    await page.locator('#cashForecastPanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    const preview = page.locator('#cashForecastPreview');
    await expect(preview.locator('.sheet-table').first()).toBeVisible({ timeout: 15000 });
    await expect(preview).toContainText('توقعات الخزنة');
    await expect(preview).toContainText('الرصيد المتوقع شهرًا بشهر');
    await expect(preview).toContainText('خط الأساس');
    await expect(preview).toContainText('متوسط نسبة التحصيل');
    await expect(preview).toContainText('لا عجز متوقع');
    await expect(page.locator('#cashForecastPrintBtn')).toBeEnabled();
    await expect(page.locator('#cashForecastPdfBtn')).toBeEnabled();
    await expect(page.locator('#cashForecastCsvBtn')).toBeEnabled();
    await expect(page.locator('#cashForecastExcelBtn')).toBeEnabled();
    await expect(page.locator('[data-report-nav="cashForecast"]')).toHaveClass(/is-ready/);
    // تغيير الأفق يعطل التصدير حتى معاينة جديدة
    await page.locator('#cashForecastHorizon').selectOption('6');
    await expect(page.locator('#cashForecastPrintBtn')).toBeDisabled();
});

test('cashbox forecast csv and excel exports download with a forecast filename', async ({ page }) => {
    await openReportsWithForecastData(page);
    await openReportPanel(page, 'cashForecast');
    await page.locator('#cashForecastPanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    await expect(page.locator('#cashForecastCsvBtn')).toBeEnabled({ timeout: 15000 });
    const csvDownload = page.waitForEvent('download');
    await page.locator('#cashForecastCsvBtn').click();
    expect((await csvDownload).suggestedFilename()).toMatch(/^manzil_cashbox_forecast_\d{4}-\d{2}\.csv$/);
    const excelDownload = page.waitForEvent('download');
    await page.locator('#cashForecastExcelBtn').click();
    expect((await excelDownload).suggestedFilename()).toMatch(/^manzil_cashbox_forecast_\d{4}-\d{2}\.xlsx$/);
});

async function expectNoHorizontalOverflow(page) {
    const overflow = await page.evaluate(() => {
        const panel = document.querySelector('#tab-reports .report-panel:not(.hidden)');
        return panel ? panel.scrollWidth - panel.clientWidth : 0;
    });
    expect(overflow).toBeLessThanOrEqual(0);
}

test('cashbox forecast report fits 360px phones without horizontal scroll or clipping', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openReportsWithForecastData(page);
    await openReportPanel(page, 'cashForecast');
    await page.locator('#cashForecastPanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    await expect(page.locator('#cashForecastPreview .sheet-table').first()).toBeVisible({ timeout: 15000 });
    await expectNoHorizontalOverflow(page);
});
