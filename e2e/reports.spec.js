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
        state.residents = [{ id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z' }];
        state.income = [
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' },
            { id: 'i2', residentId: 'r1', month: 'فبراير 2024', amount: 900, paymentMethod: 'cash' }
        ];
        state.expenses = [];
        renderAll();
        switchTab('reports');
    });
    await expect(page.locator('#tab-reports')).toBeVisible();
}

async function backToGrid(page) {
    await page.getByRole('button', { name: 'رجوع إلى شبكة التقارير' }).click();
    await expect(page.locator('#tab-reports')).toHaveAttribute('data-report-view', 'grid');
}

async function openReportPanel(page, name) {
    if (await page.locator('#tab-reports').getAttribute('data-report-view') === 'panel') await backToGrid(page);
    const item = page.locator(`[data-report-nav="${name}"]`);
    await expect(item).toBeVisible();
    await item.click();
    await expect(item).toHaveClass(/is-active/);
    await expect(page.locator('#tab-reports')).toHaveAttribute('data-report-view', 'panel');
}

async function reportViewCounts(page) {
    return page.evaluate(() => ({
        view: document.getElementById('tab-reports').dataset.reportView,
        visiblePanels: [...document.querySelectorAll('.report-panel')].filter(panel => !panel.classList.contains('hidden')).length,
        active: document.querySelectorAll('.report-nav-item.is-active').length,
        ariaCurrent: document.querySelectorAll('[data-report-nav][aria-current="page"]').length
    }));
}

async function previewMonth(page, month) {
    await openReportPanel(page, 'landlord');
    await page.locator('#reportMonthSelect').selectOption(month);
    await page.locator('#landlordReportPrint').getByRole('button', { name: 'معاينة', exact: true }).click();
}

async function previewPeriod(page, from, to) {
    await openReportPanel(page, 'period');
    await page.locator('#periodReportPreset').selectOption('custom');
    await page.locator('#periodReportFrom').selectOption(from);
    await page.locator('#periodReportTo').selectOption(to);
    await page.locator('#periodReportCard').getByRole('button', { name: 'معاينة', exact: true }).click();
}

async function previewStatement(page) {
    await openReportPanel(page, 'statement');
    await page.locator('#statementResidentSelect').selectOption('r1');
    await page.locator('#residentStatementCard').getByRole('button', { name: 'معاينة', exact: true }).click();
}

test('report output stays disabled until a fresh preview exists', async ({ page }) => {
    await openReports(page);
    const printButton = page.locator('#reportPrintBtn');
    const exportButton = page.locator('#reportExportBtn');

    await expect(printButton).toBeDisabled();
    await expect(exportButton).toBeDisabled();
    await expect(page.locator('[data-report-nav="landlord"]')).not.toHaveClass(/is-ready|is-stale/);

    await previewMonth(page, 'يناير 2024');
    await expect(page.locator('#landlordReportPreview')).toContainText('تقرير يناير 2024');
    await expect(page.locator('#landlordReportPreview')).toContainText('المستحق');
    await expect(printButton).toBeEnabled();
    await expect(exportButton).toBeEnabled();
    await expect(page.locator('[data-report-nav="landlord"]')).toHaveClass(/is-ready/);

    await page.locator('#reportMonthSelect').selectOption('فبراير 2024');
    await expect(page.locator('#landlordReportPreview')).toContainText('تغيّر الشهر أو البيانات');
    await expect(printButton).toBeDisabled();
    await expect(exportButton).toBeDisabled();
    await expect(page.locator('[data-report-nav="landlord"]')).toHaveClass(/is-stale/);
    await expect(page.locator('[data-report-nav="landlord"]')).not.toHaveClass(/is-ready/);
});

test('the tab opens on the icon grid and a card opens its report full page', async ({ page }) => {
    await openReports(page);
    await expect(page.locator('.report-section-head')).toBeVisible();
    await expect(page.locator('#reportViewBar')).toBeHidden();
    expect(await reportViewCounts(page)).toEqual({ view: 'grid', visiblePanels: 0, active: 0, ariaCurrent: 0 });

    await openReportPanel(page, 'arrears');
    await expect(page.locator('#arrearsPanel')).toBeVisible();
    await expect(page.locator('.report-section-head')).toBeHidden();
    await expect(page.locator('#reportViewBar')).toBeVisible();
    await expect(page.locator('#reportViewTitle')).toHaveText('المتأخرات');
    await expect(page.locator('#reportViewMeta')).toHaveText('تصفية وتصدير CSV');
    expect(await reportViewCounts(page)).toEqual({ view: 'panel', visiblePanels: 1, active: 1, ariaCurrent: 1 });

    await backToGrid(page);
    await expect(page.locator('#arrearsPanel')).toBeHidden();
    await expect(page.locator('.report-section-head')).toBeVisible();
    expect(await reportViewCounts(page)).toEqual({ view: 'grid', visiblePanels: 0, active: 0, ariaCurrent: 0 });

    await openReportPanel(page, 'monthlyClose');
    await expect(page.locator('#monthlyClosePanel')).toBeVisible();
    await expect(page.locator('#monthlyCloseMonthSelect')).toBeVisible();
    await expect(page.locator('#reportViewTitle')).toHaveText('الإقفال الشهري');
    expect(await reportViewCounts(page)).toEqual({ view: 'panel', visiblePanels: 1, active: 1, ariaCurrent: 1 });
});

test('the back button and Escape return to the icon grid', async ({ page }) => {
    await openReports(page);
    await openReportPanel(page, 'landlord');
    await expect(page.locator('#landlordReportPrint')).toBeVisible();

    await backToGrid(page);
    await expect(page.locator('[data-report-nav="landlord"]')).toBeFocused();

    await openReportPanel(page, 'period');
    await expect(page.locator('#periodReportCard')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#tab-reports')).toHaveAttribute('data-report-view', 'grid');
    await expect(page.locator('#periodReportCard')).toBeHidden();
    await expect(page.locator('[data-report-nav="period"]')).toBeFocused();
});

test('re-entering the reports tab lands on the grid, printing keeps the open report', async ({ page }) => {
    await openReports(page);
    await openReportPanel(page, 'landlord');

    await page.evaluate(() => switchTab('dashboard'));
    await page.evaluate(() => switchTab('reports'));
    await expect(page.locator('#tab-reports')).toHaveAttribute('data-report-view', 'grid');
    await expect(page.locator('#landlordReportPrint')).toBeHidden();

    await openReportPanel(page, 'statement');
    await page.locator('#statementResidentSelect').selectOption('r1');
    await page.locator('#residentStatementCard').getByRole('button', { name: 'معاينة', exact: true }).click();
    await page.evaluate(() => { window.print = () => { window.__printCalls = (window.__printCalls || 0) + 1; }; });
    await page.locator('#statementPrintBtn').click();
    await expect(page.locator('#tab-reports')).toHaveAttribute('data-report-view', 'panel');
    await expect(page.locator('#residentStatementCard')).toBeVisible();
});

test('arrow keys move between cards and Enter opens the report', async ({ page }) => {
    await openReports(page);
    await page.locator('[data-report-nav="landlord"]').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-report-nav="period"]')).toBeFocused();
    await expect(page.locator('#tab-reports')).toHaveAttribute('data-report-view', 'grid');
    await page.keyboard.press('End');
    await expect(page.locator('[data-report-nav="audit"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#auditLogPanel')).toBeVisible();
    await expect(page.locator('#reportViewTitle')).toHaveText('سجل العمليات');
});

test('period report gates print and csv on the previewed range', async ({ page }) => {
    await openReports(page);
    const printButton = page.locator('#periodReportPrintBtn');
    const exportButton = page.locator('#periodReportExportBtn');
    const preview = page.locator('#periodReportPreview');

    await expect(printButton).toBeDisabled();
    await expect(exportButton).toBeDisabled();

    await previewPeriod(page, 'يناير 2024', 'فبراير 2024');
    await expect(preview).toContainText('تقرير الفترة يناير 2024 – فبراير 2024');
    await expect(preview).toContainText('الإجمالي');
    await expect(preview.locator('.statement-table tbody tr')).toHaveCount(2);
    await expect(preview.locator('.report-block-title')).toContainText('التحصيل حسب الطريقة');
    await expect(preview.locator('.report-list-row')).toHaveCount(1);
    await expect(preview.locator('.report-list-row').first()).toContainText('نقدًا');
    await expect(preview.locator('.report-list-row').first()).toContainText('· 2 حركة · 100%');
    await expect(printButton).toBeEnabled();
    await expect(exportButton).toBeEnabled();

    await page.locator('#periodReportTo').selectOption('مارس 2024');
    await expect(preview).toContainText('تغيّرت الفترة أو البيانات');
    await expect(printButton).toBeDisabled();
    await expect(exportButton).toBeDisabled();

    await previewPeriod(page, 'يناير 2024', 'فبراير 2024');
    await expect(printButton).toBeEnabled();

    await page.evaluate(() => {
        state.expenses.push({ id: 'e3', month: 'فبراير 2024', title: 'سباك', amount: 120, category: 'صيانة' });
        renderAll();
    });
    await expect(preview).toContainText('تغيّرت البيانات');
    await expect(printButton).toBeDisabled();
});

test('printing a period report isolates its card', async ({ page }) => {
    await openReports(page);
    await previewPeriod(page, 'يناير 2024', 'فبراير 2024');
    await page.evaluate(() => { window.print = () => { window.__printCalls = (window.__printCalls || 0) + 1; }; });

    await page.locator('#periodReportPrintBtn').click();
    const printed = await page.evaluate(() => ({
        calls: window.__printCalls,
        scoped: document.body.classList.contains('print-period'),
        title: document.getElementById('printBuildingTitle').textContent,
        meta: document.getElementById('printBuildingMeta').textContent
    }));
    expect(printed.calls).toBe(1);
    expect(printed.scoped).toBe(true);
    expect(printed.title).toContain('تقرير الفترة');
    expect(printed.meta).toContain('يناير 2024 – فبراير 2024');

    await page.emulateMedia({ media: 'print' });
    const scopedStyles = await page.evaluate(() => ({
        period: getComputedStyle(document.getElementById('periodReportCard')).display,
        landlord: getComputedStyle(document.getElementById('landlordReportPrint')).display,
        statement: getComputedStyle(document.getElementById('residentStatementCard')).display,
        monthlyClose: getComputedStyle(document.getElementById('monthlyClosePanel')).display
    }));
    expect(scopedStyles.period).not.toBe('none');
    await expect(page.locator('#periodReportPreview .report-block').first()).toBeVisible();
    expect(scopedStyles.landlord).toBe('none');
    expect(scopedStyles.statement).toBe('none');
    expect(scopedStyles.monthlyClose).toBe('none');
});

test('period report CSV downloads the range with a totals row', async ({ page }) => {
    await openReports(page);
    await previewPeriod(page, 'يناير 2024', 'فبراير 2024');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#periodReportExportBtn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('manzil_period_2024-01_2024-02.csv');

    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8');
    expect(csv).toContain('"يناير 2024","100","100","0","100","0","100"');
    expect(csv).toContain('"الإجمالي","200","1000","0","500","0","1000"');
    expect(csv).toContain('"طريقة التحصيل","عدد الحركات","المبلغ","نسبته من المحصّل %"');
    expect(csv).toContain('"نقدًا","2","1000","100"');
});

test('period channel split matches between preview and csv', async ({ page }) => {
    await openReports(page);
    await page.evaluate(() => {
        state.income.push({ id: 'i4', residentId: 'r1', month: 'فبراير 2024', amount: 100, paymentMethod: 'instapay' });
        renderAll();
    });
    await previewPeriod(page, 'يناير 2024', 'فبراير 2024');

    const block = page.locator('#periodReportPreview .report-block', { hasText: 'التحصيل حسب الطريقة' });
    const rows = block.locator('.report-list-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('نقدًا');
    await expect(rows.nth(0)).toContainText('· 2 حركة · 91%');
    await expect(rows.nth(1)).toContainText('InstaPay');
    await expect(rows.nth(1)).toContainText('· 1 حركة · 9%');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#periodReportExportBtn').click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8');
    expect(csv).toContain('"نقدًا","2","1000","91"');
    expect(csv).toContain('"InstaPay","1","100","9"');
});

test('period quick preset fills both month selects', async ({ page }) => {
    await openReports(page);
    await openReportPanel(page, 'period');
    await page.locator('#periodReportPreset').selectOption('3');
    const range = await page.evaluate(() => ({
        from: document.getElementById('periodReportFrom').value,
        to: document.getElementById('periodReportTo').value,
        current: getCurrentMonth()
    }));
    expect(range.to).toBe(range.current);
    expect(range.from).toBeTruthy();
});

test('editing report data invalidates the generated preview', async ({ page }) => {
    await openReports(page);
    await previewMonth(page, 'يناير 2024');
    await expect(page.locator('#reportExportBtn')).toBeEnabled();

    await page.evaluate(() => {
        state.income.push({ id: 'i3', residentId: 'r1', month: 'يناير 2024', amount: 50, paymentMethod: 'cash' });
        renderAll();
    });

    await expect(page.locator('#landlordReportPreview')).toContainText('تغيّرت البيانات');
    await expect(page.locator('#reportPrintBtn')).toBeDisabled();
    await expect(page.locator('#reportExportBtn')).toBeDisabled();
});

test('editing a subscription invalidates the generated preview', async ({ page }) => {
    await openReports(page);
    await previewMonth(page, 'يناير 2024');
    await expect(page.locator('#reportExportBtn')).toBeEnabled();

    await page.evaluate(() => {
        state.residents[0].monthlyAmount = 150;
        renderAll();
    });

    await expect(page.locator('#landlordReportPreview')).toContainText('تغيّرت البيانات');
    await expect(page.locator('#reportPrintBtn')).toBeDisabled();
    await expect(page.locator('#reportExportBtn')).toBeDisabled();
});

test('CSV export downloads only the previewed month', async ({ page }) => {
    await openReports(page);
    await previewMonth(page, 'يناير 2024');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#reportExportBtn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('manzil_report_2024-01.csv');

    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8');
    expect(csv).toContain('يناير 2024');
    expect(csv).not.toContain('فبراير 2024');
});

test('printing a report hides every other reports card', async ({ page }) => {
    await openReports(page);
    await previewMonth(page, 'يناير 2024');
    await page.evaluate(() => { window.print = () => { window.__printCalls = (window.__printCalls || 0) + 1; }; });

    await page.locator('#reportPrintBtn').click();
    const printed = await page.evaluate(() => ({
        calls: window.__printCalls,
        scoped: document.body.classList.contains('print-landlord'),
        title: document.getElementById('printBuildingTitle').textContent,
        meta: document.getElementById('printBuildingMeta').textContent
    }));
    expect(printed.calls).toBe(1);
    expect(printed.scoped).toBe(true);
    expect(printed.title).toContain('تقرير الملاك');
    expect(printed.meta).toContain('يناير 2024');

    await page.emulateMedia({ media: 'print' });
    const scopedStyles = await page.evaluate(() => ({
        preview: getComputedStyle(document.getElementById('landlordReportPrint')).display,
        monthlyClose: getComputedStyle(document.getElementById('monthlyClosePanel')).display,
        controls: getComputedStyle(document.querySelector('#landlordReportPrint .no-print')).display,
        previewHeader: getComputedStyle(document.querySelector('#landlordReportPreview .report-preview-header')).display
    }));
    expect(scopedStyles.preview).not.toBe('none');
    expect(scopedStyles.monthlyClose).toBe('none');
    expect(scopedStyles.controls).toBe('none');
    expect(scopedStyles.previewHeader).not.toBe('none');

    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    const restored = await page.evaluate(() => ({
        scoped: document.body.classList.contains('print-landlord'),
        title: document.getElementById('printBuildingTitle').textContent
    }));
    expect(restored.scoped).toBe(false);
    expect(restored.title).toContain('كشف حساب مالي');
});

test('resident statement previews one resident and invalidates on data changes', async ({ page }) => {
    await openReports(page);
    await expect(page.locator('#statementPrintBtn')).toBeDisabled();

    await previewStatement(page);

    const preview = page.locator('#residentStatementPreview');
    await expect(preview).toContainText('كشف حساب ساكن');
    await expect(preview).toContainText('إجمالي المستحق');
    await expect(preview).toContainText('أحمد');
    await expect(page.locator('#statementPrintBtn')).toBeEnabled();
    await expect(page.locator('#statementCsvBtn')).toBeEnabled();
    await expect(page.locator('#unitReportPdfBtn')).toBeEnabled();

    await page.evaluate(() => {
        state.income.push({ id: 'i9', residentId: 'r1', month: 'يناير 2024', amount: 10, paymentMethod: 'cash' });
        renderAll();
    });
    await expect(preview).toContainText('تغيّرت البيانات');
    await expect(page.locator('#statementPrintBtn')).toBeDisabled();
    await expect(page.locator('#unitReportPdfBtn')).toBeDisabled();
});

test('resident statement CSV downloads a single-resident ledger', async ({ page }) => {
    await openReports(page);
    await previewStatement(page);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#statementCsvBtn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^manzil_statement_3_\d{4}-\d{2}\.csv$/);

    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8');
    expect(csv).toContain('"يناير 2024","100","100","0","مسدد"');
    expect(csv).toContain('"الحركات"');
    expect(csv).not.toContain('سارة');
});

test('printing a resident statement isolates its card', async ({ page }) => {
    await openReports(page);
    await previewStatement(page);
    await page.evaluate(() => { window.print = () => { window.__printCalls = (window.__printCalls || 0) + 1; }; });

    await page.locator('#statementPrintBtn').click();
    const printed = await page.evaluate(() => ({
        calls: window.__printCalls,
        scoped: document.body.classList.contains('print-statement'),
        title: document.getElementById('printBuildingTitle').textContent,
        meta: document.getElementById('printBuildingMeta').textContent
    }));
    expect(printed.calls).toBe(1);
    expect(printed.scoped).toBe(true);
    expect(printed.title).toContain('كشف حساب ساكن');
    expect(printed.meta).toContain('أحمد');

    await page.emulateMedia({ media: 'print' });
    const scopedStyles = await page.evaluate(() => ({
        statement: getComputedStyle(document.getElementById('residentStatementCard')).display,
        landlord: getComputedStyle(document.getElementById('landlordReportPrint')).display,
        monthlyClose: getComputedStyle(document.getElementById('monthlyClosePanel')).display
    }));
    expect(scopedStyles.statement).not.toBe('none');
    expect(scopedStyles.landlord).toBe('none');
    expect(scopedStyles.monthlyClose).toBe('none');
});

test('unit report PDF downloads a per-unit file from a fresh preview', async ({ page }) => {
    await openReports(page);
    await previewStatement(page);
    await expect(page.locator('#unitReportPdfBtn')).toBeEnabled();

    await page.evaluate(() => {
        window.html2pdf = () => ({
            set() { return this; },
            from() { return this; },
            outputPdf() { return Promise.resolve(new Blob([new Uint8Array(200)], { type: 'application/pdf' })); }
        });
    });

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#unitReportPdfBtn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^manzil_unit_3_\d{4}-\d{2}\.pdf$/);
});

test('resident profile opens the statement for the same resident', async ({ page }) => {
    await openReports(page);
    await page.evaluate(() => openResidentProfile('r1'));
    await expect(page.locator('#residentProfileModal')).toBeVisible();

    await page.locator('#residentProfileModal').getByRole('button', { name: /كشف حساب/ }).click();
    await expect(page.locator('#tab-reports')).toBeVisible();
    await expect(page.locator('#statementResidentSelect')).toHaveValue('r1');
    await expect(page.locator('#residentStatementPreview')).toContainText('كشف حساب ساكن');
    await expect(page.locator('#residentStatementPreview')).toContainText('أحمد');
});

test('audit log reports the visible count and loads more entries', async ({ page }) => {
    await openReports(page);
    await openReportPanel(page, 'audit');
    await page.evaluate(() => {
        state.auditLogs = Array.from({ length: 60 }, (_, index) => ({
            id: `audit-${index}`,
            action: 'إضافة تحصيل',
            details: `عملية ${index}`,
            actorName: 'المدير',
            date: new Date().toISOString()
        }));
        renderAuditLog();
    });

    const container = page.locator('#auditLogContainer');
    await expect(container).toContainText('عرض 50 من 60');
    await container.getByRole('button', { name: /عرض المزيد/ }).click();
    await expect(container).toContainText('عرض 60 من 60');
    await expect(container.getByRole('button', { name: /عرض المزيد/ })).toHaveCount(0);
});
