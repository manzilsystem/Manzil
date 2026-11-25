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

async function openReportsWithExpenses(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.switchTab === 'function' && typeof renderAll === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.buildingName = 'عمارة الاختبار';
        state.managerName = 'مدير الاختبار';
        state.residents = [
            { id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2026-05-01T00:00:00.000Z' }
        ];
        state.income = [];
        const baseline = ['مايو 2026', 'يونيو 2026', 'يوليو 2026', 'أغسطس 2026', 'سبتمبر 2026', 'أكتوبر 2026'];
        state.expenses = [
            ...baseline.flatMap((month, index) => ([
                { id: `m${index}`, month, category: 'صيانة', amount: 100 },
                { id: `c${index}`, month, category: 'نظافة', amount: 50 }
            ])),
            { id: 'n1', month: 'نوفمبر 2026', category: 'صيانة', amount: 300 },
            { id: 'n2', month: 'نوفمبر 2026', category: 'نظافة', amount: 50 },
            { id: 'n3', month: 'نوفمبر 2026', category: 'كهرباء', amount: 80 }
        ];
        renderAll();
        switchTab('reports');
    });
    await expect(page.locator('#tab-reports')).toBeVisible();
}

test('expense variance report: preview, flags per category and stale guard', async ({ page }) => {
    await openReportsWithExpenses(page);
    await openReportPanel(page, 'expenseVariance');
    await expect(page.locator('#expenseVariancePanel')).toBeVisible();
    await page.locator('#expenseVariancePanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    const preview = page.locator('#expenseVariancePreview');
    await expect(preview.locator('.sheet-table').first()).toBeVisible({ timeout: 15000 });
    await expect(preview).toContainText('الانحراف لكل تصنيف');
    await expect(preview).toContainText('صيانة');
    await expect(preview).toContainText('ارتفاع 200%');
    await expect(preview).toContainText('تصنيف جديد');
    await expect(preview).toContainText('ضمن المتوسط');
    await expect(page.locator('#expenseVariancePrintBtn')).toBeEnabled();
    await expect(page.locator('#expenseVarianceCsvBtn')).toBeEnabled();
    await expect(page.locator('[data-report-nav="expenseVariance"]')).toHaveClass(/is-ready/);
    // تغيير الشهر يعطل التصدير حتى معاينة جديدة
    await page.locator('#expenseVarianceMonth').selectOption('أكتوبر 2026');
    await expect(page.locator('#expenseVariancePrintBtn')).toBeDisabled();
    await page.locator('#expenseVariancePanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    await expect(preview).toContainText('ضمن المتوسط');
});

test('expense variance csv downloads with a month-based filename', async ({ page }) => {
    await openReportsWithExpenses(page);
    await openReportPanel(page, 'expenseVariance');
    await page.locator('#expenseVariancePanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    await expect(page.locator('#expenseVarianceCsvBtn')).toBeEnabled({ timeout: 15000 });
    const csvDownload = page.waitForEvent('download');
    await page.locator('#expenseVarianceCsvBtn').click();
    expect((await csvDownload).suggestedFilename()).toBe('manzil_expense_variance_2026-11.csv');
});

async function openReportsWithPayments(page) {
    await loadShell(page);
    await page.waitForFunction(() => typeof window.switchTab === 'function' && typeof renderAll === 'function');
    await page.evaluate(() => {
        window.currentUserRole = 'manager';
        document.body.classList.remove('session-locked', 'modal-open', 'owner-mode');
        document.getElementById('pinLockModal').classList.add('hidden');
        state.buildingName = 'عمارة الاختبار';
        state.managerName = 'مدير الاختبار';
        state.residents = [
            { id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2026-05-01T00:00:00.000Z' }
        ];
        state.income = [
            { id: 'p1', residentId: 'r1', month: 'أكتوبر 2026', amount: 100, purposeCode: 'subscription', paymentMethod: 'cash', date: '2026-10-05T12:00:00' },
            { id: 'p2', residentId: 'r1', month: 'أكتوبر 2026', amount: 200, purposeCode: 'subscription', paymentMethod: 'instapay', date: '2026-10-06T12:00:00' },
            { id: 'p3', residentId: 'r1', month: 'نوفمبر 2026', amount: 100, purposeCode: 'subscription', paymentMethod: 'cash', date: '2026-11-05T12:00:00' },
            { id: 'p4', residentId: 'r1', month: 'نوفمبر 2026', amount: 600, purposeCode: 'services', paymentMethod: 'wallet', date: '2026-11-07T12:00:00' }
        ];
        state.expenses = [];
        renderAll();
        switchTab('reports');
    });
    await expect(page.locator('#tab-reports')).toBeVisible();
}

test('payment methods report: preview, shares, monthly split and stale guard', async ({ page }) => {
    await openReportsWithPayments(page);
    await openReportPanel(page, 'paymentMethods');
    await expect(page.locator('#paymentMethodsPanel')).toBeVisible();
    await page.locator('#paymentMethodsPanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    const preview = page.locator('#paymentMethodsPreview');
    await expect(preview.locator('.sheet-table').first()).toBeVisible({ timeout: 15000 });
    await expect(preview).toContainText('حصة كل طريقة');
    await expect(preview).toContainText('محفظة إلكترونية');
    await expect(preview).toContainText('60%');
    await expect(preview).toContainText('التوزيع الشهري');
    await expect(page.locator('#paymentMethodsPrintBtn')).toBeEnabled();
    await expect(page.locator('#paymentMethodsCsvBtn')).toBeEnabled();
    await expect(page.locator('[data-report-nav="paymentMethods"]')).toHaveClass(/is-ready/);
    // تغيير طريقة الدفع يعطل التصدير حتى معاينة جديدة
    await page.locator('#paymentMethodsMethod').selectOption('cash');
    await expect(page.locator('#paymentMethodsPrintBtn')).toBeDisabled();
    await page.locator('#paymentMethodsPanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    await expect(preview).toContainText('نقدًا');
    await expect(preview).not.toContainText('محفظة إلكترونية');
});

test('payment methods csv downloads with a period-based filename', async ({ page }) => {
    await openReportsWithPayments(page);
    await openReportPanel(page, 'paymentMethods');
    await page.locator('#paymentMethodsPanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    await expect(page.locator('#paymentMethodsCsvBtn')).toBeEnabled({ timeout: 15000 });
    const csvDownload = page.waitForEvent('download');
    await page.locator('#paymentMethodsCsvBtn').click();
    expect((await csvDownload).suggestedFilename()).toBe('manzil_payment_methods_2026-06_2026-11.csv');
});

async function expectNoHorizontalOverflow(page) {
    const overflow = await page.evaluate(() => {
        const offenders = [];
        document.querySelectorAll('#tab-reports .sheet-wrap, #tab-reports .report-stats').forEach(el => {
            if (el.scrollWidth > el.clientWidth + 1) offenders.push(el.className);
        });
        return { doc: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, offenders };
    });
    expect(overflow).toEqual({ doc: false, offenders: [] });
}

test('insights reports fit 360px phones without horizontal scroll or clipping', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openReports(page);
    await openReportPanel(page, 'paymentBehavior');
    await page.locator('#paymentBehaviorPanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    await expect(page.locator('#paymentBehaviorPreview .sheet-table').first()).toBeVisible({ timeout: 15000 });
    await expectNoHorizontalOverflow(page);

    await openReportsWithExpenses(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await openReportPanel(page, 'expenseVariance');
    await page.locator('#expenseVariancePanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    await expect(page.locator('#expenseVariancePreview .sheet-table').first()).toBeVisible({ timeout: 15000 });
    await expectNoHorizontalOverflow(page);

    await openReportsWithPayments(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await openReportPanel(page, 'paymentMethods');
    await page.locator('#paymentMethodsPanel').getByRole('button', { name: 'معاينة', exact: true }).click();
    await expect(page.locator('#paymentMethodsPreview .sheet-table').first()).toBeVisible({ timeout: 15000 });
    await expectNoHorizontalOverflow(page);
});
