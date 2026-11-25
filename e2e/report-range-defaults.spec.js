const { test, expect } = require('@playwright/test');
const { loadShell } = require('./helpers');

// A re-render rebuilds the month selects. They must keep the user's range and, when empty, default to the last 6 months, never collapse to the oldest month.
test('report month ranges keep their selection and default to the last 6 months across re-renders', async ({ page }) => {
    await loadShell(page);
    await page.waitForFunction(() => typeof populatePeriodReportSelects === 'function');
    const result = await page.evaluate(() => {
        const months = ['يونيو 2025', 'يوليو 2025', 'أغسطس 2025', 'سبتمبر 2025', 'أكتوبر 2025', 'نوفمبر 2025', 'ديسمبر 2025', 'يناير 2026', 'فبراير 2026', 'مارس 2026'];
        const read = ids => ids.map(id => document.getElementById(id).value);
        const ids = ['periodReportFrom', 'periodReportTo', 'expensesReportFrom', 'expensesReportTo', 'adjustmentsReportFrom', 'adjustmentsReportTo'];
        ids.forEach(id => { document.getElementById(id).innerHTML = ''; });
        populatePeriodReportSelects(months, 'مارس 2026');
        populateExpensesReportFilters(months, 'مارس 2026');
        populateAdjustmentsReportFilters(months, 'مارس 2026');
        const fresh = read(ids);
        document.getElementById('periodReportFrom').value = 'أغسطس 2025';
        document.getElementById('expensesReportTo').value = 'يناير 2026';
        document.getElementById('adjustmentsReportFrom').value = 'أكتوبر 2025';
        populatePeriodReportSelects(months, 'مارس 2026');
        populateExpensesReportFilters(months, 'مارس 2026');
        populateAdjustmentsReportFilters(months, 'مارس 2026');
        return { fresh, again: read(ids) };
    });
    expect(result.fresh).toEqual(['أكتوبر 2025', 'مارس 2026', 'أكتوبر 2025', 'مارس 2026', 'أكتوبر 2025', 'مارس 2026']);
    expect(result.again).toEqual(['أغسطس 2025', 'مارس 2026', 'أكتوبر 2025', 'يناير 2026', 'أكتوبر 2025', 'مارس 2026']);
});
