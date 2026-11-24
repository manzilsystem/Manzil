// @ts-check
/**
 * Extended reports — Manzil
 * يضيف لوحة مركز التقارير وتقريرين جديدين (التدفق النقدي وأداء الشقق)
 * فوق الأساس المشترك في js/reports.js بدون تعديل منطق التقارير القائمة.
 * يُحمّل بعد js/reports.js حتى يرث كل الدوال المشتركة.
 */

const EXTENDED_RECENT_STORAGE_KEY = 'manzil_recent_reports';
const EXTENDED_RECENT_LIMIT = 4;
let reportGroupFilter = 'all';
let cashFlowSnapshot = null;
let cashFlowSignature = '';
let apartmentsSnapshot = null;
let apartmentsSignature = '';
const CASH_FLOW_SIGNATURE_PREFIX = 'cashed:';
const APARTMENTS_SIGNATURE_PREFIX = 'built:';

function extendedValue(id) {
    if (typeof document === 'undefined') return '';
    const element = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.getElementById(id));
    return String(element?.value || '');
}

function extendedSetActions(ids, enabled) {
    ids.forEach(id => {
        const button = /** @type {HTMLButtonElement | null} */ (document.getElementById(id));
        if (button) button.disabled = !enabled;
    });
}

function extendedClearPreview(previewId, message, buttonIds) {
    const preview = document.getElementById(previewId);
    if (preview) preview.innerHTML = '<p class="report-preview-empty">' + esc(message) + '</p>';
    extendedSetActions(buttonIds, false);
    markReportPreviewStale(previewId, true);
    if (typeof syncReportNavStatus === 'function') syncReportNavStatus();
}

function extendedDataFingerprint() {
    // تقارير مشتقة من السجلات كاملة؛ أي تعديل على حقل مؤثر (الشهر، الصندوق،
    // الغرض، التصنيف، المبلغ،rates...) يجب أن يُبطل المعاينة. المقارنة بالكائنات
    // نفسها بدل مجاميع مختصرة تتجنّب العيوب الناتجة عن تغيّرين متعاكسين.
    return JSON.stringify([
        state.buildingName || '',
        state.defaultSubscription ?? '',
        Array.isArray(state.residents) ? state.residents : [],
        Array.isArray(state.income) ? state.income : [],
        Array.isArray(state.expenses) ? state.expenses : [],
        Array.isArray(state.adjustments) ? state.adjustments : []
    ]);
}

function extendedCashAccountCodes() {
    if (typeof CASH_ACCOUNTS !== 'undefined' && CASH_ACCOUNTS) return Object.keys(CASH_ACCOUNTS);
    return ['main', 'development', 'emergency'];
}

function extendedMonthRange(fromMonth, toMonth) {
    const error = typeof getPeriodRangeError === 'function' ? getPeriodRangeError(fromMonth, toMonth) : '';
    if (error || typeof buildPeriodMonthKeys !== 'function') return null;
    return buildPeriodMonthKeys(fromMonth, toMonth);
}

function extendedRangeLabel(fromMonth, toMonth) {
    return fromMonth === toMonth ? fromMonth : `${fromMonth} – ${toMonth}`;
}

function extendedGroupSum(items, amountGetter) {
    const totals = new Map();
    items.forEach(item => {
        const key = String(amountGetter(item) || '').trim() || 'غير مصنف';
        totals.set(key, (totals.get(key) || 0) + toCents(item.amount));
    });
    return Array.from(totals.entries())
        .map(([label, cents]) => ({ label, cents }))
        .sort((a, b) => b.cents - a.cents);
}

/* ============================================================
   تقرير التدفق النقدي
   ============================================================ */

function buildCashFlowReport(fromMonth, toMonth, cashAccountFilter = '') {
    const keys = extendedMonthRange(fromMonth, toMonth);
    if (!keys) return null;
    const fund = normalizeReportCashAccountFilter(cashAccountFilter);
    const allIncome = [];
    const allExpenses = [];
    const months = keys.map(key => {
        const month = getStatementMonthLabel(key);
        const income = filterReportIncome(
            (Array.isArray(state.income) ? state.income : []).filter(item => item.month === month),
            '', fund, '', ''
        );
        const expenses = filterReportExpenses(
            (Array.isArray(state.expenses) ? state.expenses : []).filter(item => item.month === month),
            fund
        );
        allIncome.push(...income);
        allExpenses.push(...expenses);
        const incomeCents = income.reduce((sum, item) => sum + toCents(item.amount), 0);
        const expenseCents = expenses.reduce((sum, item) => sum + toCents(item.amount), 0);
        return {
            key,
            month,
            incomeCents,
            expenseCents,
            netCents: incomeCents - expenseCents,
            count: income.length + expenses.length
        };
    });
    const incomeCents = months.reduce((sum, item) => sum + item.incomeCents, 0);
    const expenseCents = months.reduce((sum, item) => sum + item.expenseCents, 0);
    const ranked = months.slice().sort((a, b) => b.netCents - a.netCents);
    const funds = extendedCashAccountCodes().map(code => {
        const income = allIncome.filter(item => reportCashAccountMatches(item, code));
        const expenses = allExpenses.filter(item => reportCashAccountMatches(item, code));
        return {
            code,
            label: reportCashAccountLabel(code),
            incomeCents: income.reduce((sum, item) => sum + toCents(item.amount), 0),
            expenseCents: expenses.reduce((sum, item) => sum + toCents(item.amount), 0),
            count: income.length + expenses.length
        };
    }).filter(item => !fund || item.code === fund)
        .sort((a, b) => b.incomeCents - a.incomeCents);
    return {
        fromMonth,
        toMonth,
        rangeLabel: extendedRangeLabel(fromMonth, toMonth),
        cashAccountFilter: fund,
        cashAccountLabel: reportCashAccountFilterLabel(fund),
        months,
        funds,
        purposes: extendedGroupSum(allIncome, item => reportPurposeLabel(
            String(item.purposeCode || '').trim() || 'subscription'
        )),
        categories: extendedGroupSum(allExpenses, item => item.category),
        totals: {
            incomeCents,
            expenseCents,
            netCents: incomeCents - expenseCents,
            monthCount: months.length,
            count: allIncome.length + allExpenses.length,
            averageIncomeCents: months.length ? Math.round(incomeCents / months.length) : 0,
            averageExpenseCents: months.length ? Math.round(expenseCents / months.length) : 0,
            bestMonth: ranked[0] || null,
            worstMonth: ranked[ranked.length - 1] || null
        }
    };
}

function getCashFlowSelection() {
    return {
        from: extendedValue('cashFlowFrom'),
        to: extendedValue('cashFlowTo'),
        cashAccount: normalizeReportCashAccountFilter(extendedValue('cashFlowCashAccount'))
    };
}

function getCashFlowSignature() {
    const selection = getCashFlowSelection();
    return `${selection.from}/${selection.to}/${selection.cashAccount}/${extendedDataFingerprint()}`;
}

function setCashFlowActions(enabled) {
    extendedSetActions(['cashFlowPrintBtn', 'cashFlowPdfBtn', 'cashFlowExportBtn', 'cashFlowExcelBtn'], enabled);
}

function clearCashFlowPreview(message) {
    extendedClearPreview('cashFlowPreview', message, ['cashFlowPrintBtn', 'cashFlowPdfBtn', 'cashFlowExportBtn', 'cashFlowExcelBtn']);
    destroyChartsInContainer('extendedCashFlowChartContainer');
}

function invalidateCashFlowPreview() {
    if (!cashFlowSnapshot) return;
    cashFlowSnapshot = null;
    clearCashFlowPreview('غيّرت الفلاتر المعاينة. اضغط «معاينة» لتحديث التقرير.');
}

function isCashFlowCurrent() {
    return Boolean(cashFlowSnapshot) && cashFlowSignature === CASH_FLOW_SIGNATURE_PREFIX + getCashFlowSignature();
}

function invalidateCashFlowIfStale() {
    if (!cashFlowSnapshot) return;
    if (!isCashFlowCurrent()) invalidateCashFlowPreview();
}

function onCashFlowRangeChange() {
    const preset = /** @type {HTMLSelectElement | null} */ (document.getElementById('cashFlowPreset'));
    if (preset) preset.value = 'custom';
    invalidateCashFlowPreview();
}

function applyExtendedPreset(presetId, fromId, toId, invalidate) {
    const preset = extendedValue(presetId);
    if (!preset || preset === 'custom') return;
    const currentKey = monthLabelToKey(getCurrentMonth());
    if (!currentKey) return;
    const count = preset === 'ytd'
        ? Math.max(1, Number(currentKey.slice(5, 7)) || 1)
        : Math.max(1, Number(preset) || 6);
    setPeriodReportMonthValue(fromId, shiftStatementMonthKey(currentKey, -(count - 1)));
    setPeriodReportMonthValue(toId, currentKey);
    invalidate();
}

function applyCashFlowPreset() {
    applyExtendedPreset('cashFlowPreset', 'cashFlowFrom', 'cashFlowTo', invalidateCashFlowPreview);
}

function cashFlowStatItems(report) {
    return [
        { label: 'إجمالي التحصيل', cents: report.totals.incomeCents, tone: 'emerald' },
        { label: 'إجمالي المصروفات', cents: report.totals.expenseCents, tone: 'rose' },
        { label: 'صافي التدفق', cents: report.totals.netCents, tone: report.totals.netCents >= 0 ? 'emerald' : 'rose' },
        { label: 'متوسط التحصيل الشهري', cents: report.totals.averageIncomeCents }
    ];
}

function renderCashFlowHtml(report) {
    const stats = renderReportStatTiles(cashFlowStatItems(report), true);
    const monthRows = report.months.map(row => [
        '<tr>',
        '<td>' + esc(row.month) + '</td>',
        '<td class="text-emerald-400">' + fmtMoney(row.incomeCents / 100) + '</td>',
        '<td class="text-rose-400">' + fmtMoney(row.expenseCents / 100) + '</td>',
        '<td class="' + (row.netCents >= 0 ? 'text-emerald-400' : 'text-rose-400') + '">' + fmtMoney(row.netCents / 100) + '</td>',
        '<td>' + fmtNum(row.count) + '</td>',
        '</tr>'
    ].join('')).join('');
    const fundRows = report.funds.map(fund => [
        '<div class="report-list-row"><span>' + esc(fund.label) + '</span>',
        '<span><b class="report-amount text-emerald-400">' + fmtMoney(fund.incomeCents / 100) + '</b>',
        ' <span class="text-slate-400">دخل</span> · ',
        '<b class="report-amount text-rose-400">' + fmtMoney(fund.expenseCents / 100) + '</b>',
        ' <span class="text-slate-400">مصروف</span></span></div>'
    ].join('')).join('');
    const best = report.totals.bestMonth;
    const worst = report.totals.worstMonth;
    return [
        '<div class="report-preview-flow">',
        '<div class="report-preview-header">',
        '<p class="report-preview-title">تقرير التدفق النقدي</p>',
        '<p class="report-preview-meta">' + esc(report.rangeLabel) + ' · ' + esc(report.cashAccountLabel) +
            ' · ' + fmtNum(report.totals.monthCount) + ' شهرًا · ' + fmtNum(report.totals.count) + ' حركة</p>',
        '</div>',
        stats,
        '<div class="report-block">',
        '<h3 class="report-block-title">الحركة شهرًا بشهر <span class="report-block-count">' + fmtNum(report.months.length) + '</span></h3>',
        '<div class="report-table-wrap"><table class="statement-table"><thead><tr>',
        ['الشهر', 'التحصيل', 'المصروفات', 'الصافي', 'الحركات'].map(label => '<th>' + esc(label) + '</th>').join(''),
        '</tr></thead><tbody>', monthRows || '<tr><td colspan="5" class="report-preview-empty">لا توجد حركات في الفترة المحددة.</td></tr>', '</tbody></table></div>',
        '</div>',
        '<div class="report-block">',
        '<h3 class="report-block-title">حركة الصناديق <span class="report-block-count">' + fmtNum(report.funds.length) + '</span></h3>',
        '<div class="report-list">' + (fundRows || '<p class="report-preview-empty">لا توجد حركات في الصناديق.</p>') + '</div>',
        '</div>',
        best && worst ? '<p class="report-hint">أعلى صافي في ' + esc(best.month) + ': ' + fmtMoney(best.netCents / 100) +
            ' · أدنى صافي في ' + esc(worst.month) + ': ' + fmtMoney(worst.netCents / 100) + '.</p>' : '',
        report.purposes.length || report.categories.length
            ? '<div class="report-block"><h3 class="report-block-title">التوزيع حسب الغرض والتصنيف</h3><div class="report-list">' +
                report.purposes.map(item => '<div class="report-list-row"><span>' + esc(item.label) + '</span><b class="report-amount">' + fmtMoney(item.cents / 100) + '</b></div>').join('') +
                report.categories.map(item => '<div class="report-list-row"><span>' + esc(item.label) + '</span><b class="report-amount text-rose-400">' + fmtMoney(item.cents / 100) + '</b></div>').join('') +
                '</div></div>'
            : '',
        '</div>'
    ].join('');
}

function drawCashFlowChart(report) {
    if (!document.getElementById('extendedCashFlowChartContainer')) return;
    if (typeof createChartContainer !== 'function' || typeof renderLineSeries !== 'function') return;
    const canvas = createChartContainer('extendedCashFlowChartContainer', 'cashFlowChart', 220);
    if (canvas && typeof canvas.setAttribute === 'function') {
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'مخطط التدفق النقدي شهرًا بشهر؛ البيانات نفسها متاحة في الجدول أدناه');
    }
    renderLineSeries('cashFlowChart', report.months.map(row => row.month), [
        { label: 'تحصيل', values: report.months.map(row => row.incomeCents / 100), color: REPORT_CHART_COLORS.emerald },
        { label: 'مصروفات', values: report.months.map(row => row.expenseCents / 100), color: REPORT_CHART_COLORS.rose },
        { label: 'الصافي', values: report.months.map(row => row.netCents / 100), color: REPORT_CHART_COLORS.indigo }
    ], { maintainAspectRatio: false });
}

function generateCashFlowReport() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const selection = getCashFlowSelection();
    const error = typeof getPeriodRangeError === 'function' ? getPeriodRangeError(selection.from, selection.to) : '';
    if (error) {
        clearCashFlowPreview(error);
        if (typeof toast === 'function') toast(error, 'error');
        return;
    }
    const report = buildCashFlowReport(selection.from, selection.to, selection.cashAccount);
    if (!report) {
        clearCashFlowPreview('تعذر بناء التقرير للفترة المحددة.');
        return;
    }
    cashFlowSnapshot = report;
    cashFlowSignature = CASH_FLOW_SIGNATURE_PREFIX + getCashFlowSignature();
    const preview = document.getElementById('cashFlowPreview');
    if (preview) preview.innerHTML = renderCashFlowHtml(report);
    markReportPreviewStale('cashFlowPreview', false);
    setCashFlowActions(true);
    drawCashFlowChart(report);
    if (typeof syncReportNavStatus === 'function') syncReportNavStatus();
}

function getSelectedCashFlowSnapshot() {
    if (!isCashFlowCurrent()) {
        if (cashFlowSnapshot) invalidateCashFlowPreview();
        return null;
    }
    return cashFlowSnapshot;
}

function printExtendedReport(report, bodyClass, title, meta) {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const titleEl = document.getElementById('printBuildingTitle');
    const metaEl = document.getElementById('printBuildingMeta');
    const previousTitle = titleEl ? titleEl.textContent : '';
    const previousMeta = metaEl ? metaEl.textContent : '';
    if (titleEl) titleEl.textContent = title + ' - ' + (state.buildingName || 'Manzil');
    if (metaEl) metaEl.textContent = meta + ' · المدير: ' + (state.managerName || '—');
    ['print-landlord', 'print-statement', 'print-period', 'print-expenses', 'print-adjustments',
        'print-cashflow', 'print-apartments'].forEach(name => document.body.classList.remove(name));
    document.body.classList.add(bodyClass);
    const restore = () => {
        document.body.classList.remove(bodyClass);
        if (titleEl) titleEl.textContent = previousTitle;
        if (metaEl) metaEl.textContent = previousMeta;
    };
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
}

function printCashFlowReport() {
    const report = getSelectedCashFlowSnapshot();
    if (!report) return;
    printExtendedReport(report, 'print-cashflow', 'تقرير التدفق النقدي',
        'الفترة ' + report.rangeLabel + ' · ' + report.cashAccountLabel);
}

function cashFlowCsvRows(report) {
    return [
        ['تقرير التدفق النقدي'],
        ['الفترة', report.rangeLabel],
        ['الصندوق', report.cashAccountLabel],
        [],
        ['الشهر', 'التحصيل', 'المصروفات', 'الصافي', 'عدد الحركات'],
        ...report.months.map(row => [row.month, (row.incomeCents / 100).toFixed(2), (row.expenseCents / 100).toFixed(2), (row.netCents / 100).toFixed(2), row.count]),
        [],
        ['الإجمالي', (report.totals.incomeCents / 100).toFixed(2), (report.totals.expenseCents / 100).toFixed(2), (report.totals.netCents / 100).toFixed(2), report.totals.count],
        [],
        ['الصندوق', 'تحصيل', 'مصروفات'],
        ...report.funds.map(fund => [fund.label, (fund.incomeCents / 100).toFixed(2), (fund.expenseCents / 100).toFixed(2)])
    ];
}

function exportCashFlowCsv() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const report = getSelectedCashFlowSnapshot();
    if (!report) return;
    const fromKey = monthLabelToKey(report.fromMonth) || String(Date.now());
    const toKey = monthLabelToKey(report.toMonth) || String(Date.now());
    const suffix = report.cashAccountFilter ? '_' + report.cashAccountFilter : '';
    downloadCsv('manzil_cashflow_' + fromKey.slice(0, 7) + '_' + toKey.slice(0, 7) + suffix + '.csv', cashFlowCsvRows(report));
}

function exportCashFlowExcel() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const report = getSelectedCashFlowSnapshot();
    if (!report) return;
    const fromKey = monthLabelToKey(report.fromMonth) || String(Date.now());
    const toKey = monthLabelToKey(report.toMonth) || String(Date.now());
    const suffix = report.cashAccountFilter ? '_' + report.cashAccountFilter : '';
    exportReportExcel('manzil_cashflow_' + fromKey.slice(0, 7) + '_' + toKey.slice(0, 7) + suffix, [
        { name: 'الشهور', rows: cashFlowCsvRows(report), options: { autoFilter: true, freezeHeader: true, columnWidths: [18, 16, 16, 16, 14] } },
        { name: 'الصناديق', rows: [['الصندوق', 'تحصيل', 'مصروفات', 'الحركات'], ...report.funds.map(fund => [fund.label, fund.incomeCents / 100, fund.expenseCents / 100, fund.count])] },
        { name: 'الملخص', rows: [['البند', 'القيمة'], ['التحصيل', report.totals.incomeCents / 100], ['المصروفات', report.totals.expenseCents / 100], ['الصافي', report.totals.netCents / 100], ['متوسط التحصيل', report.totals.averageIncomeCents / 100]] }
    ]);
}

function renderCashFlowPdfHtml(report) {
    const generatedLabel = formatDate(new Date().toISOString());
    const rows = report.months.map(row => [
        '<tr>',
        statementPdfHeadCell(esc(row.month)),
        statementPdfCell(fmtMoney(row.incomeCents / 100)),
        statementPdfCell(fmtMoney(row.expenseCents / 100)),
        statementPdfCell(fmtMoney(row.netCents / 100)),
        '</tr>'
    ].join('')).join('');
    return [
        reportPdfDocumentOpen(),
        reportPdfHeader(['تقرير التدفق النقدي'], [esc(report.rangeLabel), esc(report.cashAccountLabel)]),
        reportPdfSection('الملخص', reportPdfSummaryTable(cashFlowStatItems(report))),
        reportPdfSection('الحركة شهرًا بشهر', reportPdfTable(
            ['الشهر', 'التحصيل', 'المصروفات', 'الصافي'],
            rows || reportPdfEmptyRow(4, 'لا توجد حركات في الفترة المحددة.'),
            ['الإجمالي', fmtMoney(report.totals.incomeCents / 100), fmtMoney(report.totals.expenseCents / 100), fmtMoney(report.totals.netCents / 100)]
        )),
        reportPdfSection('حركة الصناديق', reportPdfTable(
            ['الصندوق', 'تحصيل', 'مصروفات'],
            report.funds.map(fund => '<tr>' + statementPdfHeadCell(esc(fund.label)) +
                statementPdfCell(fmtMoney(fund.incomeCents / 100)) +
                statementPdfCell(fmtMoney(fund.expenseCents / 100)) + '</tr>').join('')
        )),
        reportPdfFooter(generatedLabel),
        '</div>'
    ].join('');
}

async function exportCashFlowPdf() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const report = getSelectedCashFlowSnapshot();
    if (!report) return;
    const fromKey = monthLabelToKey(report.fromMonth) || String(Date.now());
    const toKey = monthLabelToKey(report.toMonth) || String(Date.now());
    const suffix = report.cashAccountFilter ? '_' + report.cashAccountFilter : '';
    await downloadStatementPdf(renderCashFlowPdfHtml(report),
        'manzil_cashflow_' + fromKey.slice(0, 7) + '_' + toKey.slice(0, 7) + suffix + '.pdf',
        'cashFlowPdfBtn', 'تم تنزيل تقرير التدفق النقدي', 'cashflow pdf',
        () => Boolean(cashFlowSnapshot));
}

/* ============================================================
   تقرير أداء الشقق
   ============================================================ */

function buildApartmentPerformanceReport(fromMonth, toMonth, residentFilter = '') {
    const keys = extendedMonthRange(fromMonth, toMonth);
    if (!keys) return null;
    const residents = (Array.isArray(state.residents) ? state.residents : [])
        .filter(resident => !residentFilter || resident.id === residentFilter)
        .slice()
        .sort((a, b) => String(a.apartmentNumber || '').localeCompare(String(b.apartmentNumber || ''), 'ar', { numeric: true }));
    const rows = residents.map(resident => {
        const months = [];
        let otherIncomeCents = 0;
        let lastPaymentDate = '';
        (Array.isArray(state.income) ? state.income : []).forEach(payment => {
            if (payment.residentId !== resident.id) return;
            const paymentKey = monthLabelToKey(payment.month);
            if (!paymentKey || paymentKey < keys[0] || paymentKey > keys[keys.length - 1]) return;
            const date = String(payment.date || payment.createdAt || '');
            if (date && date > lastPaymentDate) lastPaymentDate = date;
            const purpose = typeof getIncomePurposeFormCode === 'function'
                ? getIncomePurposeFormCode(payment.purposeCode)
                : (String(payment.purposeCode || '').trim() || 'subscription');
            if (purpose !== 'subscription') otherIncomeCents += toCents(payment.amount);
        });
        keys.forEach(key => {
            const month = getStatementMonthLabel(key);
            if (!isResidentActiveInMonth(resident, key)) return;
            const dueCents = toCents(getMonthlyDueAmountForMonth(resident, month));
            const paidCents = filterReportIncome(
                (Array.isArray(state.income) ? state.income : []).filter(item => item.residentId === resident.id && item.month === month),
                'subscription', '', '', resident.id
            ).reduce((sum, item) => sum + toCents(item.amount), 0);
            months.push({
                key,
                month,
                dueCents,
                paidCents,
                remainingCents: Math.max(0, dueCents - paidCents),
                rate: dueCents > 0 ? Math.round((paidCents / dueCents) * 100) : null
            });
        });
        const dueCents = months.reduce((sum, item) => sum + item.dueCents, 0);
        const paidCents = months.reduce((sum, item) => sum + item.paidCents, 0);
        return {
            resident,
            label: (typeof formatApartmentLabel === 'function' ? formatApartmentLabel(resident.apartmentNumber) : 'شقة ' + String(resident.apartmentNumber || '')) + ' · ' + (resident.name || '—'),
            months,
            dueCents,
            paidCents,
            otherIncomeCents,
            remainingCents: Math.max(0, dueCents - paidCents),
            rate: dueCents > 0 ? Math.round((paidCents / dueCents) * 100) : null,
            lastPaymentDate
        };
    });
    const totals = rows.reduce((sum, row) => ({
        dueCents: sum.dueCents + row.dueCents,
        paidCents: sum.paidCents + row.paidCents,
        remainingCents: sum.remainingCents + row.remainingCents,
        otherIncomeCents: sum.otherIncomeCents + row.otherIncomeCents
    }), { dueCents: 0, paidCents: 0, remainingCents: 0, otherIncomeCents: 0 });
    return {
        fromMonth,
        toMonth,
        rangeLabel: extendedRangeLabel(fromMonth, toMonth),
        residentFilter,
        rows,
        totals: {
            ...totals,
            unitCount: rows.length,
            activeUnitCount: rows.filter(row => row.months.length > 0).length,
            monthCount: keys.length,
            rate: getPeriodCollectionRate(totals.dueCents, totals.paidCents)
        }
    };
}

function getApartmentsSelection() {
    return {
        from: extendedValue('apartmentsReportFrom'),
        to: extendedValue('apartmentsReportTo'),
        resident: extendedValue('apartmentsReportResident')
    };
}

function getApartmentsSignature() {
    const selection = getApartmentsSelection();
    return `${selection.from}/${selection.to}/${selection.resident}/${extendedDataFingerprint()}`;
}

function setApartmentsActions(enabled) {
    extendedSetActions(['apartmentsPrintBtn', 'apartmentsPdfBtn', 'apartmentsExportBtn', 'apartmentsExcelBtn'], enabled);
}

function clearApartmentsPreview(message) {
    extendedClearPreview('apartmentsReportPreview', message, ['apartmentsPrintBtn', 'apartmentsPdfBtn', 'apartmentsExportBtn', 'apartmentsExcelBtn']);
    destroyChartsInContainer('extendedApartmentsChartContainer');
}

function invalidateApartmentsPreview() {
    if (!apartmentsSnapshot) return;
    apartmentsSnapshot = null;
    clearApartmentsPreview('غيّرت الفلاتر المعاينة. اضغط «معاينة» لتحديث التقرير.');
}

function isApartmentsCurrent() {
    return Boolean(apartmentsSnapshot) && apartmentsSignature === APARTMENTS_SIGNATURE_PREFIX + getApartmentsSignature();
}

function invalidateApartmentsIfStale() {
    if (!apartmentsSnapshot) return;
    if (!isApartmentsCurrent()) invalidateApartmentsPreview();
}

function onApartmentsRangeChange() {
    const preset = /** @type {HTMLSelectElement | null} */ (document.getElementById('apartmentsReportPreset'));
    if (preset) preset.value = 'custom';
    invalidateApartmentsPreview();
}

function applyApartmentsPreset() {
    applyExtendedPreset('apartmentsReportPreset', 'apartmentsReportFrom', 'apartmentsReportTo', invalidateApartmentsPreview);
}

function apartmentsStatItems(report) {
    return [
        { label: 'عدد الشقق', text: fmtNum(report.totals.unitCount) },
        { label: 'المستحق', cents: report.totals.dueCents },
        { label: 'المحصّل', cents: report.totals.paidCents, tone: 'emerald' },
        { label: 'المتبقٍ', cents: report.totals.remainingCents, tone: 'rose' }
    ];
}

function renderApartmentsHtml(report) {
    const stats = renderReportStatTiles(apartmentsStatItems(report), true);
    const rows = report.rows.map(row => [
        '<tr>',
        '<td>' + esc(row.label) + '</td>',
        '<td>' + fmtMoney(row.dueCents / 100) + '</td>',
        '<td class="text-emerald-400">' + fmtMoney(row.paidCents / 100) + '</td>',
        '<td class="' + (row.remainingCents ? 'text-rose-400' : '') + '">' + fmtMoney(row.remainingCents / 100) + '</td>',
        '<td>' + (row.rate === null ? '—' : fmtNum(row.rate) + '%') + '</td>',
        '<td>' + esc(row.lastPaymentDate ? formatDate(row.lastPaymentDate) : '—') + '</td>',
        '</tr>'
    ].join('')).join('');
    return [
        '<div class="report-preview-flow">',
        '<div class="report-preview-header">',
        '<p class="report-preview-title">تقرير أداء الشقق</p>',
        '<p class="report-preview-meta">' + esc(report.rangeLabel) + ' · ' + fmtNum(report.totals.unitCount) + ' شقة · ' +
            fmtNum(report.totals.monthCount) + ' شهرًا · نسبة التحصيل ' +
            (report.totals.rate === null ? '—' : fmtNum(report.totals.rate) + '%') + '</p>',
        '</div>',
        stats,
        '<div class="report-block">',
        '<h3 class="report-block-title">تفاصيل كل شقة <span class="report-block-count">' + fmtNum(report.rows.length) + '</span></h3>',
        '<div class="report-table-wrap"><table class="statement-table"><thead><tr>',
        ['الشقة', 'المستحق', 'المحصّل', 'المتبقٍ', 'النسبة', 'آخر تحصيل'].map(label => '<th>' + esc(label) + '</th>').join(''),
        '</tr></thead><tbody>', rows || '<tr><td colspan="6" class="report-preview-empty">لا توجد شقق مطابقة للفلاتر.</td></tr>', '</tbody></table></div>',
        '</div>',
        report.totals.otherIncomeCents ? '<p class="report-hint">تحصيلات أخرى غير الاشتراك في الفترة: ' + fmtMoney(report.totals.otherIncomeCents / 100) + ' (لا تُخصم من المستحق).</p>' : '',
        '</div>'
    ].join('');
}

function drawApartmentsChart(report) {
    if (!document.getElementById('extendedApartmentsChartContainer')) return;
    if (typeof createChartContainer !== 'function' || typeof renderBarValues !== 'function') return;
    const canvas = createChartContainer('extendedApartmentsChartContainer', 'apartmentsChart', 220);
    if (canvas && typeof canvas.setAttribute === 'function') {
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'مخطط المتبقي للأشهر العشرة الأعلى؛ البيانات نفسها متاحة في الجدول أدناه');
    }
    const top = report.rows.slice().sort((a, b) => b.remainingCents - a.remainingCents).slice(0, 10);
    renderBarValues('apartmentsChart', top.map(row => row.label),
        top.map(row => row.remainingCents / 100), REPORT_CHART_COLORS.amber, 'المتبقي', { maintainAspectRatio: false });
}

function generateApartmentsReport() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const selection = getApartmentsSelection();
    const error = typeof getPeriodRangeError === 'function' ? getPeriodRangeError(selection.from, selection.to) : '';
    if (error) {
        clearApartmentsPreview(error);
        if (typeof toast === 'function') toast(error, 'error');
        return;
    }
    const report = buildApartmentPerformanceReport(selection.from, selection.to, selection.resident);
    if (!report) {
        clearApartmentsPreview('تعذر بناء التقرير للفترة المحددة.');
        return;
    }
    apartmentsSnapshot = report;
    apartmentsSignature = APARTMENTS_SIGNATURE_PREFIX + getApartmentsSignature();
    const preview = document.getElementById('apartmentsReportPreview');
    if (preview) preview.innerHTML = renderApartmentsHtml(report);
    markReportPreviewStale('apartmentsReportPreview', false);
    setApartmentsActions(true);
    drawApartmentsChart(report);
    if (typeof syncReportNavStatus === 'function') syncReportNavStatus();
}

function getSelectedApartmentsSnapshot() {
    if (!isApartmentsCurrent()) {
        if (apartmentsSnapshot) invalidateApartmentsPreview();
        return null;
    }
    return apartmentsSnapshot;
}

function printApartmentsReport() {
    const report = getSelectedApartmentsSnapshot();
    if (!report) return;
    printExtendedReport(report, 'print-apartments', 'تقرير أداء الشقق', 'الفترة ' + report.rangeLabel);
}

function apartmentsCsvRows(report) {
    return [
        ['تقرير أداء الشقق'],
        ['الفترة', report.rangeLabel],
        [],
        ['الشقة', 'المستحق', 'المحصّل', 'المتبقٍ', 'نسبة التحصيل', 'آخر تحصيل'],
        ...report.rows.map(row => [row.label, (row.dueCents / 100).toFixed(2), (row.paidCents / 100).toFixed(2),
            (row.remainingCents / 100).toFixed(2), row.rate === null ? '' : row.rate + '%', row.lastPaymentDate]),
        [],
        ['الإجمالي', (report.totals.dueCents / 100).toFixed(2), (report.totals.paidCents / 100).toFixed(2),
            (report.totals.remainingCents / 100).toFixed(2),
            report.totals.rate === null ? '' : report.totals.rate + '%', '']
    ];
}

function exportApartmentsCsv() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const report = getSelectedApartmentsSnapshot();
    if (!report) return;
    const fromKey = monthLabelToKey(report.fromMonth) || String(Date.now());
    const toKey = monthLabelToKey(report.toMonth) || String(Date.now());
    const suffix = report.residentFilter ? '_' + report.residentFilter : '';
    downloadCsv('manzil_apartments_' + fromKey.slice(0, 7) + '_' + toKey.slice(0, 7) + suffix + '.csv', apartmentsCsvRows(report));
}

function exportApartmentsExcel() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const report = getSelectedApartmentsSnapshot();
    if (!report) return;
    const fromKey = monthLabelToKey(report.fromMonth) || String(Date.now());
    const toKey = monthLabelToKey(report.toMonth) || String(Date.now());
    const suffix = report.residentFilter ? '_' + report.residentFilter : '';
    exportReportExcel('manzil_apartments_' + fromKey.slice(0, 7) + '_' + toKey.slice(0, 7) + suffix, [
        { name: 'الشقق', rows: apartmentsCsvRows(report), options: { autoFilter: true, freezeHeader: true, columnWidths: [26, 16, 16, 16, 14, 18] } },
        { name: 'الملخص', rows: [['البند', 'القيمة'], ['عدد الشقق', report.totals.unitCount], ['المستحق', report.totals.dueCents / 100], ['المحصّل', report.totals.paidCents / 100], ['المتبقٍ', report.totals.remainingCents / 100], ['نسبة التحصيل', report.totals.rate]] }
    ]);
}

function renderApartmentsPdfHtml(report) {
    const generatedLabel = formatDate(new Date().toISOString());
    const rows = report.rows.map(row => [
        '<tr>',
        statementPdfHeadCell(esc(row.label)),
        statementPdfCell(fmtMoney(row.dueCents / 100)),
        statementPdfCell(fmtMoney(row.paidCents / 100)),
        statementPdfCell(fmtMoney(row.remainingCents / 100)),
        statementPdfCell(row.rate === null ? '—' : fmtNum(row.rate) + '%'),
        '</tr>'
    ].join('')).join('');
    return [
        reportPdfDocumentOpen(),
        reportPdfHeader(['تقرير أداء الشقق'], [esc(report.rangeLabel)]),
        reportPdfSection('الملخص', reportPdfSummaryTable(apartmentsStatItems(report))),
        reportPdfSection('تفاصيل الشقق', reportPdfTable(
            ['الشقة', 'المستحق', 'المحصّل', 'المتبقٍ', 'النسبة'],
            rows || reportPdfEmptyRow(5, 'لا توجد شقق مطابقة للفلاتر.'),
            ['الإجمالي', fmtMoney(report.totals.dueCents / 100), fmtMoney(report.totals.paidCents / 100), fmtMoney(report.totals.remainingCents / 100), '']
        )),
        reportPdfFooter(generatedLabel),
        '</div>'
    ].join('');
}

async function exportApartmentsPdf() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const report = getSelectedApartmentsSnapshot();
    if (!report) return;
    const fromKey = monthLabelToKey(report.fromMonth) || String(Date.now());
    const toKey = monthLabelToKey(report.toMonth) || String(Date.now());
    const suffix = report.residentFilter ? '_' + report.residentFilter : '';
    await downloadStatementPdf(renderApartmentsPdfHtml(report),
        'manzil_apartments_' + fromKey.slice(0, 7) + '_' + toKey.slice(0, 7) + suffix + '.pdf',
        'apartmentsPdfBtn', 'تم تنزيل تقرير أداء الشقق', 'apartments pdf',
        () => Boolean(apartmentsSnapshot));
}

/* ============================================================
   مركز التقارير: بطاقات ملخص، بحث، تصنيف، وتقارير recently used
   ============================================================ */

function getRecentReportKeys() {
    try {
        const raw = localStorage.getItem(EXTENDED_RECENT_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        // لا نثق بالقيمة المخزّنة؛ قد تكون قديمة أو معدّلة. فقط مفاتيح التقارير
        // المعروفة تصل إلى معالج onclick، مما يمنع إدخال سكربت أو زرًا ميتًا.
        const known = typeof REPORT_PANEL_IDS !== 'undefined' ? REPORT_PANEL_IDS : {};
        return Array.isArray(parsed)
            ? parsed.filter(key => typeof key === 'string' && Object.prototype.hasOwnProperty.call(known, key))
                .slice(0, EXTENDED_RECENT_LIMIT)
            : [];
    } catch (error) {
        return [];
    }
}

function recordRecentReport(tab) {
    if (!tab || typeof REPORT_PANEL_IDS === 'undefined' || !REPORT_PANEL_IDS[tab]) return;
    try {
        const keys = [tab, ...getRecentReportKeys().filter(key => key !== tab)].slice(0, EXTENDED_RECENT_LIMIT);
        localStorage.setItem(EXTENDED_RECENT_STORAGE_KEY, JSON.stringify(keys));
        const container = document.getElementById('reportHubRecent');
        if (container) renderRecentReports(container);
    } catch (error) {
        // التخزين المحلي اختياري؛ لا يوقف فتح التقرير عند تعطله.
    }
}

function renderRecentReports(container) {
    const keys = getRecentReportKeys();
    if (!keys.length) {
        container.innerHTML = '<span class="report-hub-recent-label">ابدأ بفتح أي تقرير ليظهر هنا للوصول السريع.</span>';
        return;
    }
    container.innerHTML = '<span class="report-hub-recent-label">آخر التقارير:</span>' + keys.map(key => {
        const item = document.querySelector('[data-report-nav="' + key + '"]');
        const label = item?.querySelector('.report-nav-copy b')?.textContent || key;
        return '<button type="button" class="report-recent-chip" data-report-recent="' + esc(key) + '" ' +
            'onclick="switchReportTab(\'' + key + '\')">' +
            '<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>' + esc(label) + '</button>';
    }).join('');
}

function renderReportHub() {
    const stats = document.getElementById('reportHubStats');
    if (stats) {
        const month = getCurrentMonth();
        const monthKey = monthLabelToKey(month);
        const income = (Array.isArray(state.income) ? state.income : [])
            .filter(item => item.month === month)
            .reduce((sum, item) => sum + toCents(item.amount), 0);
        const expenses = (Array.isArray(state.expenses) ? state.expenses : [])
            .filter(item => item.month === month)
            .reduce((sum, item) => sum + toCents(item.amount), 0);
        const outstanding = (Array.isArray(state.residents) ? state.residents : [])
            .filter(resident => !monthKey || isResidentActiveInMonth(resident, monthKey))
            .reduce((sum, resident) => sum + toCents(getMonthOutstanding(resident, month)), 0);
        const tile = (label, cents, tone = '') =>
            '<div class="hub-stat"><span class="hub-stat-label">' + esc(label) + '</span>' +
            '<b class="hub-stat-value' + (tone ? ' is-' + tone : '') + '">' + fmtMoney(cents / 100) + '</b>' +
            '<span class="hub-stat-note">' + esc(month) + '</span></div>';
        stats.innerHTML = tile('تحصيل الشهر', income, 'positive') +
            tile('مصروف الشهر', expenses, 'negative') +
            tile('صافي الشهر', income - expenses, income - expenses >= 0 ? 'positive' : 'negative') +
            tile('متأخرات الشهر', outstanding);
    }
    const recent = document.getElementById('reportHubRecent');
    if (recent) renderRecentReports(recent);
    filterReportNav();
}

function setReportGroup(group) {
    const requested = ['all', 'financial', 'units', 'review'].includes(group) ? group : 'all';
    reportGroupFilter = requested;
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    document.querySelectorAll('[data-report-group].report-group-chip').forEach(chip => {
        const active = chip.getAttribute('data-report-group') === requested;
        chip.classList.toggle('is-active', active);
        chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    filterReportNav();
}

function filterReportNav() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    const query = extendedValue('reportHubSearch').trim().toLocaleLowerCase('ar');
    let visible = 0;
    document.querySelectorAll('[data-report-nav]').forEach(rawItem => {
        const item = /** @type {HTMLElement} */ (rawItem);
        const haystack = [item.textContent || '', item.dataset.reportKeywords || ''].join(' ').toLocaleLowerCase('ar');
        const matchesGroup = reportGroupFilter === 'all' || item.dataset.reportGroup === reportGroupFilter;
        const matchesQuery = !query || haystack.includes(query);
        const show = matchesGroup && matchesQuery;
        item.classList.toggle('is-filtered-out', !show);
        if (show) visible += 1;
    });
    const empty = document.getElementById('reportHubEmpty');
    if (empty) empty.classList.toggle('hidden', visible > 0);
    if (typeof syncReportNavTabIndex === 'function') syncReportNavTabIndex();
}

function invalidateExtendedReportsIfStale() {
    invalidateCashFlowIfStale();
    invalidateApartmentsIfStale();
}

function initExtendedReportsUI() {
    populateExtendedReportFilters();
    renderReportHub();
    if (document.addEventListener) {
        document.addEventListener('click', event => {
            const target = /** @type {Element | null} */ (event.target);
            const nav = /** @type {HTMLElement | null} */ (target?.closest?.('[data-report-nav], [data-report-recent]'));
            if (nav) recordRecentReport(nav.dataset.reportNav || nav.dataset.reportRecent);
        });
    }
}

function populateExtendedReportFilters(months, current = getCurrentMonth()) {
    const options = Array.isArray(months) && months.length ? months
        : (typeof getBuildingMonthOptions === 'function' ? getBuildingMonthOptions(12) : [current]);
    const currentKey = monthLabelToKey(current);
    const defaultFrom = currentKey ? getStatementMonthLabel(shiftStatementMonthKey(currentKey, -5)) : current;
    [['cashFlowFrom', defaultFrom || current], ['cashFlowTo', current],
        ['apartmentsReportFrom', defaultFrom || current], ['apartmentsReportTo', current]].forEach(([id, fallback]) => {
        const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
        if (!select) return;
        const selected = select.value || fallback;
        select.innerHTML = options.map(month => '<option value="' + esc(month) + '">' + esc(month) + '</option>').join('');
        select.value = options.includes(selected) ? selected : fallback;
    });
    const fundSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('cashFlowCashAccount'));
    if (fundSelect) {
        const selected = normalizeReportCashAccountFilter(fundSelect.value);
        const accounts = extendedCashAccountCodes();
        fundSelect.innerHTML = '<option value="">كل الصناديق</option>' + accounts.map(code =>
            '<option value="' + esc(code) + '">' + esc(reportCashAccountLabel(code)) + '</option>').join('');
        fundSelect.value = selected;
    }
    const residentSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('apartmentsReportResident'));
    if (residentSelect) {
        const selected = residentSelect.value;
        const residents = (Array.isArray(state.residents) ? state.residents : [])
            .slice()
            .sort((a, b) => String(a.apartmentNumber || '').localeCompare(String(b.apartmentNumber || ''), 'ar', { numeric: true }))
            .map(resident => '<option value="' + esc(resident.id) + '">' +
                esc(typeof formatApartmentLabel === 'function' ? formatApartmentLabel(resident.apartmentNumber) : 'شقة ' + String(resident.apartmentNumber || '')) +
                ' · ' + esc(resident.name || '') + '</option>').join('');
        residentSelect.innerHTML = '<option value="">كل الشقق</option>' + residents;
        residentSelect.value = (Array.isArray(state.residents) ? state.residents : []).some(resident => resident.id === selected) ? selected : '';
    }
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', initExtendedReportsUI);
}

const EXTENDED_REPORT_API = {
    buildCashFlowReport,
    buildApartmentPerformanceReport,
    getCashFlowSignature,
    getApartmentsSignature,
    renderCashFlowHtml,
    renderApartmentsHtml,
    renderReportHub,
    filterReportNav,
    setReportGroup,
    invalidateExtendedReportsIfStale,
    populateExtendedReportFilters
};

if (typeof window !== 'undefined') window.MANZIL_EXTENDED_REPORTS = EXTENDED_REPORT_API;
