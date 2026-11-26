// @ts-check
/**
 * تقرير توقعات الخزنة — Manzil
 * يجيب عن سؤال مجلس الإدارة: هل الخزنة تكفي الشهور الجاية؟
 * يبدأ من رصيد الخزنة الرئيسية الحالي، ويحسب متوسط نسبة التحصيل
 * ومتوسط المصروفات من آخر 6 أشهر مغلقة، ثم يعرض الرصيد المتوقع
 * لكل شهر قادم (3 أو 6 أشهر) مع أول شهر يظهر فيه عجز.
 * لا يخمن نسبة أبدًا: بلا أشهر مغلقة فيها مستحقات يظهر حالة فارغة صريحة.
 * يُحمّل بعد js/reports.js وjs/reports/extended/reports-insights.js ويعتمد
 * فقط على دوالهما ودوال state.js حتى يعمل وحده في اختبارات الوحدة.
 * كل الحسابات قراءة فقط من state، بالقرش، وبنفس عقود المحاسبة المعتمدة.
 */

/* تسجيل التقرير في سجلات مركز التقارير دون تعديل js/reports.js */
if (typeof REPORT_TABS !== 'undefined' && Array.isArray(REPORT_TABS) && !REPORT_TABS.includes('cashForecast')) {
    REPORT_TABS.push('cashForecast');
    Object.assign(REPORT_PANEL_IDS, { cashForecast: 'cashForecastPanel' });
    Object.assign(REPORT_OUTPUT_BUTTON_IDS, { cashForecast: 'cashForecastPrintBtn' });
    Object.assign(REPORT_FILTER_DESCRIPTORS, {
        cashForecast: [
            { id: 'cashForecastHorizon', label: 'أفق التوقع' }
        ]
    });
}

const CASH_FORECAST_SIGNATURE_PREFIX = 'built:';
const CASH_FORECAST_ACTION_IDS = ['cashForecastPrintBtn', 'cashForecastPdfBtn', 'cashForecastCsvBtn', 'cashForecastExcelBtn'];
const CASH_FORECAST_BASELINE_MONTHS = 6;

let cashForecastSnapshot = null;
let cashForecastSignature = '';

function cashForecastValue(id) {
    if (typeof document === 'undefined') return '';
    const element = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.getElementById(id));
    return String(element?.value || '');
}

function getCashForecastSelection() {
    return { horizon: cashForecastValue('cashForecastHorizon') };
}

function getCashForecastSignature() {
    const selection = getCashForecastSelection();
    const fingerprint = typeof insightsDataFingerprint === 'function' ? insightsDataFingerprint() : '';
    return `${selection.horizon}/${fingerprint}`;
}

function setCashForecastActions(enabled) {
    if (typeof insightsSetActions === 'function') insightsSetActions(CASH_FORECAST_ACTION_IDS, enabled);
}

function clearCashForecastPreview(message) {
    if (typeof insightsClearPreview === 'function') {
        insightsClearPreview('cashForecastPreview', message, CASH_FORECAST_ACTION_IDS);
    }
    if (typeof destroyChartsInContainer === 'function') destroyChartsInContainer('cashForecastChartContainer');
}

function invalidateCashForecastPreview() {
    if (!cashForecastSnapshot) return;
    cashForecastSnapshot = null;
    clearCashForecastPreview('غيّرت الفلاتر المعاينة. اضغط «معاينة» لتحديث التقرير.');
}

function isCashForecastCurrent() {
    return Boolean(cashForecastSnapshot) && cashForecastSignature === CASH_FORECAST_SIGNATURE_PREFIX + getCashForecastSignature();
}

function invalidateCashForecastIfStale() {
    if (!cashForecastSnapshot) return;
    if (!isCashForecastCurrent()) invalidateCashForecastPreview();
}

/** مسح فلاتر توقعات الخزنة دون المساس بالسجلات المالية. */
function clearCashForecastFilters() {
    const element = /** @type {HTMLSelectElement | null} */ (document.getElementById('cashForecastHorizon'));
    if (element) element.value = '3';
    invalidateCashForecastPreview();
    if (typeof syncReportNavStatus === 'function') syncReportNavStatus();
}

function populateCashForecastFilters() {
    const element = /** @type {HTMLSelectElement | null} */ (document.getElementById('cashForecastHorizon'));
    if (element && !element.value) element.value = '3';
}

/** رصيد الخزنة الرئيسية الحالي كما تحسبه الخزنة نفسها. */
function cashForecastStartBalanceCents() {
    const balance = typeof getCashAccountBalance === 'function'
        ? getCashAccountBalance('main')
        : Number(state.cashAccountBalances?.main) || 0;
    return toCents(balance);
}

function cashForecastShiftKey(key, offset) {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7)) - 1 + offset;
    const date = new Date(Date.UTC(year, month, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * يبني توقع الخزنة. خط الأساس: آخر 6 أشهر مغلقة قبل الشهر الحالي؛
 * نسبة التحصيل لكل شهر فيه مستحق = المحصّل ÷ المستحق (بحد أقصى 100%)،
 * والمتوسط على الأشهر ذات المستحق فقط. متوسط المصروفات على الأشهر الستة كلها.
 * بلا شهر مغلق واحد فيه مستحق، يرجع baselineMonths = 0 ولا يخمن نسبة.
 * @param {string|number} [horizon] عدد الشهور القادمة (3 أو 6)
 * @param {Date} [now] مرجع «اليوم» لقابلية الاختبار
 */
function buildCashboxForecastReport(horizon = 3, now = new Date()) {
    const months = Number(horizon) === 6 ? 6 : 3;
    const currentKey = monthLabelToKey(getCurrentMonth());
    if (!currentKey) return null;
    const residents = Array.isArray(state.residents) ? state.residents : [];
    const income = Array.isArray(state.income) ? state.income : [];
    const expenses = Array.isArray(state.expenses) ? state.expenses : [];
    const dueForKey = key => residents.reduce((sum, resident) => {
        if (typeof isResidentActiveInMonth === 'function' && !isResidentActiveInMonth(resident, key)) return sum;
        return sum + toCents(getMonthlyDueAmountForMonth(resident, monthKeyToLabel(key)));
    }, 0);
    const paidForKey = key => income
        .filter(payment => monthLabelToKey(payment.month) === key &&
            (typeof getIncomePurposeFormCode === 'function' ? getIncomePurposeFormCode(payment.purposeCode) : 'subscription') === 'subscription')
        .reduce((sum, payment) => sum + toCents(payment.amount), 0);
    const expenseForKey = key => expenses
        .filter(expense => monthLabelToKey(expense.month) === key)
        .reduce((sum, expense) => sum + toCents(expense.amount), 0);
    const baseline = [];
    for (let offset = -CASH_FORECAST_BASELINE_MONTHS; offset < 0; offset += 1) {
        const key = cashForecastShiftKey(currentKey, offset);
        const dueCents = dueForKey(key);
        const paidCents = paidForKey(key);
        baseline.push({
            key,
            label: monthKeyToLabel(key),
            dueCents,
            paidCents,
            expenseCents: expenseForKey(key),
            rate: dueCents > 0 ? Math.min(1, paidCents / dueCents) : null
        });
    }
    const judged = baseline.filter(row => row.rate !== null);
    const avgRate = judged.length
        ? judged.reduce((sum, row) => sum + (row.rate || 0), 0) / judged.length
        : null;
    const avgExpenseCents = Math.round(baseline.reduce((sum, row) => sum + row.expenseCents, 0) / baseline.length);
    const startBalanceCents = cashForecastStartBalanceCents();
    const projections = [];
    let balanceCents = startBalanceCents;
    let firstDeficitLabel = null;
    for (let index = 1; index <= months; index += 1) {
        const key = cashForecastShiftKey(currentKey, index);
        const dueCents = dueForKey(key);
        const expectedPaidCents = avgRate === null ? 0 : Math.round(dueCents * avgRate);
        const expectedExpenseCents = avgExpenseCents;
        balanceCents += expectedPaidCents - expectedExpenseCents;
        if (firstDeficitLabel === null && balanceCents < 0) firstDeficitLabel = monthKeyToLabel(key);
        projections.push({
            key,
            label: monthKeyToLabel(key),
            dueCents,
            expectedPaidCents,
            expectedExpenseCents,
            netCents: expectedPaidCents - expectedExpenseCents,
            balanceCents
        });
    }
    return {
        horizon: months,
        baseline,
        baselineMonths: judged.length,
        avgRate,
        avgExpenseCents,
        startBalanceCents,
        projections,
        endBalanceCents: balanceCents,
        firstDeficitLabel
    };
}

function cashForecastStatItems(report) {
    const money = cents => fmtMoney(cents / 100);
    return [
        { label: 'رصيد الخزنة الآن', text: money(report.startBalanceCents), tone: report.startBalanceCents < 0 ? 'rose' : 'emerald' },
        { label: 'متوسط نسبة التحصيل', text: report.avgRate === null ? '—' : fmtNum(Math.round(report.avgRate * 100)) + '%', tone: 'amber' },
        { label: 'متوسط المصروفات الشهرية', text: money(report.avgExpenseCents) },
        { label: 'الرصيد المتوقع بعد ' + fmtNum(report.horizon) + ' أشهر', text: money(report.endBalanceCents), tone: report.endBalanceCents < 0 ? 'rose' : 'emerald' },
        { label: 'أول شهر عجز', text: report.firstDeficitLabel || 'لا عجز متوقع', tone: report.firstDeficitLabel ? 'rose' : 'emerald' }
    ];
}

function renderCashboxForecastHtml(report) {
    const stats = renderReportStatTiles(cashForecastStatItems(report), true);
    const money = cents => fmtMoney(cents / 100);
    const rows = report.projections.map(row => [
        esc(row.label),
        money(row.dueCents),
        money(row.expectedPaidCents),
        money(row.expectedExpenseCents),
        '<span class="' + (row.netCents < 0 ? 'sheet-negative' : 'sheet-positive') + '">' + money(row.netCents) + '</span>',
        '<span class="' + (row.balanceCents < 0 ? 'sheet-negative' : 'sheet-positive') + '">' + money(row.balanceCents) + '</span>'
    ]);
    const baselineRows = report.baseline.map(row => [
        esc(row.label),
        money(row.dueCents),
        money(row.paidCents),
        row.rate === null ? '—' : fmtNum(Math.round(row.rate * 100)) + '%',
        money(row.expenseCents)
    ]);
    const hasChartData = report.projections.length > 0;
    return [
        '<div class="report-preview-flow" dir="rtl">',
        renderReportHeader('توقعات الخزنة · ' + (state.buildingName || 'العمارة'), [
            'أفق ' + fmtNum(report.horizon) + ' أشهر • خط الأساس ' + fmtNum(report.baselineMonths) + ' من ' + fmtNum(CASH_FORECAST_BASELINE_MONTHS) + ' أشهر مغلقة'
        ]),
        report.firstDeficitLabel
            ? '<div class="report-note report-note-warning" role="alert">تنبيه: الخزنة تدخل في عجز متوقع ابتداءً من ' + esc(report.firstDeficitLabel) + ' إذا استمر التحصيل والصرف عند المتوسط الحالي.</div>'
            : '',
        stats,
        renderSheetBlock('الرصيد المتوقع شهرًا بشهر', ['الشهر', 'المستحق المتوقع', 'التحصيل المتوقع', 'المصروفات المتوقعة', 'الصافي', 'الرصيد المتوقع'], rows, {
            empty: 'لا توجد أشهر قادمة للتوقع.',
            numeric: [1, 2, 3, 4, 5], tableClass: 'statement-table'
        }),
        renderChartFoldContainer('cashForecastChartContainer', 'التصور البياني - الرصيد المتوقع', {
            hasData: hasChartData,
            empty: 'لا توجد بيانات لعرض الرسم.',
            summary: [
                { label: 'الرصيد المتوقع بعد ' + fmtNum(report.horizon) + ' أشهر', cents: report.endBalanceCents, tone: report.endBalanceCents < 0 ? 'rose' : 'emerald' },
                { label: 'رصيد الخزنة الآن', cents: report.startBalanceCents }
            ]
        }),
        renderSheetBlock('خط الأساس - آخر ' + fmtNum(CASH_FORECAST_BASELINE_MONTHS) + ' أشهر مغلقة', ['الشهر', 'المستحق', 'المحصّل', 'نسبة التحصيل', 'المصروفات'], baselineRows, {
            empty: 'لا توجد أشهر مغلقة بعد.',
            numeric: [1, 2, 3, 4], tableClass: 'statement-table'
        }),
        renderReportNotes([
            '<p>التوقع تقدير مبني على المتوسطات: يبدأ من رصيد الخزنة الرئيسية الحالي، ويفترض أن التحصيل القادم يسير عند متوسط نسبة التحصيل في الأشهر المغلقة، وأن المصروفات تسير عند متوسطها الشهري. كلما زادت الأشهر المغلقة ذات المستحقات كان التوقع أدق.</p>'
        ])
    ].join('');
}

/** الحالة الفارغة: لا أشهر مغلقة فيها مستحقات، فلا نسبة ولا توقع. */
function renderCashboxForecastEmptyHtml(report) {
    return [
        '<div class="report-preview-flow" dir="rtl">',
        renderReportHeader('توقعات الخزنة · ' + (state.buildingName || 'العمارة'), ['لا توجد قاعدة بيانات كافية']),
        '<div class="report-empty-state">لا توجد أشهر مغلقة فيها مستحقات خلال آخر ' + fmtNum(CASH_FORECAST_BASELINE_MONTHS) + ' أشهر، فلا يمكن حساب متوسط نسبة التحصيل. سجّل الاشتراكات والتحصيلات أولًا، ثم أعد المعاينة — التقرير لا يخمن نسبة من عنده.</div>',
        renderSheetBlock('خط الأساس - آخر ' + fmtNum(CASH_FORECAST_BASELINE_MONTHS) + ' أشهر مغلقة', ['الشهر', 'المستحق', 'المحصّل', 'نسبة التحصيل', 'المصروفات'],
            report.baseline.map(row => [
                esc(row.label),
                fmtMoney(row.dueCents / 100),
                fmtMoney(row.paidCents / 100),
                row.rate === null ? '—' : fmtNum(Math.round(row.rate * 100)) + '%',
                fmtMoney(row.expenseCents / 100)
            ]), {
                empty: 'لا توجد أشهر مغلقة بعد.',
                numeric: [1, 2, 3, 4], tableClass: 'statement-table'
            })
    ].join('');
}

function drawCashForecastChart(report) {
    if (!document.getElementById('cashForecastChartContainer')) return;
    if (!report.projections.length) return;
    if (typeof createChartContainer !== 'function' || typeof renderBarValues !== 'function') return;
    const canvas = createChartContainer('cashForecastChartContainer', 'cashForecastChart', 220);
    if (canvas && typeof canvas.setAttribute === 'function') {
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'مخطط الرصيد المتوقع للخزنة؛ البيانات نفسها متاحة في الجدول أعلاه');
    }
    const color = typeof REPORT_CHART_COLORS !== 'undefined' && REPORT_CHART_COLORS
        ? (REPORT_CHART_COLORS.rose || REPORT_CHART_COLORS.indigo || 'currentColor')
        : 'currentColor';
    renderBarValues('cashForecastChart',
        report.projections.map(row => row.label.split(' ')[0]),
        report.projections.map(row => row.balanceCents / 100),
        color, 'الرصيد المتوقع ج.م');
}

function generateCashForecastReport() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const selection = getCashForecastSelection();
    const report = buildCashboxForecastReport(selection.horizon);
    if (!report) {
        clearCashForecastPreview('تعذر بناء التقرير: تعذر تحديد الشهر الحالي.');
        return;
    }
    const preview = document.getElementById('cashForecastPreview');
    if (report.baselineMonths === 0) {
        if (preview) preview.innerHTML = renderCashboxForecastEmptyHtml(report);
        markReportPreviewStale('cashForecastPreview', false);
        setCashForecastActions(false);
        if (typeof syncReportNavStatus === 'function') syncReportNavStatus();
        return;
    }
    cashForecastSnapshot = report;
    cashForecastSignature = CASH_FORECAST_SIGNATURE_PREFIX + getCashForecastSignature();
    if (preview) preview.innerHTML = renderCashboxForecastHtml(report);
    markReportPreviewStale('cashForecastPreview', false);
    setCashForecastActions(true);
    drawCashForecastChart(report);
    if (typeof syncReportNavStatus === 'function') syncReportNavStatus();
}

function getSelectedCashForecastSnapshot() {
    if (!isCashForecastCurrent()) {
        if (cashForecastSnapshot) invalidateCashForecastPreview();
        return null;
    }
    return cashForecastSnapshot;
}

function printCashForecastReport() {
    const report = getSelectedCashForecastSnapshot();
    if (!report) return;
    if (typeof printInsightsReport === 'function') {
        printInsightsReport('print-cash-forecast', 'توقعات الخزنة',
            'أفق ' + fmtNum(report.horizon) + ' أشهر • خط الأساس ' + fmtNum(report.baselineMonths) + ' أشهر');
    }
}

function cashForecastCsvRows(report) {
    const money = cents => (cents / 100).toFixed(2);
    const rows = [['الشهر', 'المستحق المتوقع', 'التحصيل المتوقع', 'المصروفات المتوقعة', 'الصافي', 'الرصيد المتوقع']];
    report.projections.forEach(row => {
        rows.push([
            row.label,
            money(row.dueCents),
            money(row.expectedPaidCents),
            money(row.expectedExpenseCents),
            money(row.netCents),
            money(row.balanceCents)
        ]);
    });
    rows.push([]);
    rows.push(['خط الأساس', 'المستحق', 'المحصل', 'نسبة التحصيل %', 'المصروفات']);
    report.baseline.forEach(row => {
        rows.push([
            row.label,
            money(row.dueCents),
            money(row.paidCents),
            row.rate === null ? '' : String(Math.round(row.rate * 100)),
            money(row.expenseCents)
        ]);
    });
    rows.push(['رصيد البداية', money(report.startBalanceCents)]);
    rows.push(['متوسط نسبة التحصيل %', report.avgRate === null ? '' : String(Math.round(report.avgRate * 100))]);
    rows.push(['متوسط المصروفات الشهرية', money(report.avgExpenseCents)]);
    rows.push(['أول شهر عجز متوقع', report.firstDeficitLabel || 'لا عجز متوقع']);
    return rows;
}

function cashForecastFileBase(report) {
    const last = report.projections[report.projections.length - 1];
    return 'manzil_cashbox_forecast_' + (last ? last.key.slice(0, 7) : 'next');
}

function exportCashForecastCsv() {
    const report = getSelectedCashForecastSnapshot();
    if (!report) return;
    downloadCsv(cashForecastFileBase(report) + '.csv', cashForecastCsvRows(report));
}

function exportCashForecastExcel() {
    const report = getSelectedCashForecastSnapshot();
    if (!report) return;
    exportReportExcel(cashForecastFileBase(report), [
        { name: 'توقعات الخزنة', rows: cashForecastCsvRows(report) }
    ]);
}

function renderCashForecastPdfHtml(report) {
    return renderCashboxForecastHtml(report);
}

async function exportCashForecastPdf() {
    const report = getSelectedCashForecastSnapshot();
    if (!report) return;
    await downloadStatementPdf(renderCashForecastPdfHtml(report),
        cashForecastFileBase(report) + '.pdf',
        'cashForecastPdfBtn', 'تم تنزيل توقعات الخزنة', 'cashbox forecast pdf',
        () => Boolean(cashForecastSnapshot));
}

const CASH_FORECAST_REPORT_API = {
    buildCashboxForecastReport,
    renderCashboxForecastHtml,
    renderCashboxForecastEmptyHtml,
    renderCashForecastPdfHtml,
    cashForecastCsvRows,
    cashForecastStatItems,
    getCashForecastSignature,
    generateCashForecastReport,
    getSelectedCashForecastSnapshot,
    invalidateCashForecastPreview,
    invalidateCashForecastIfStale,
    populateCashForecastFilters,
    clearCashForecastFilters,
    printCashForecastReport,
    exportCashForecastCsv,
    exportCashForecastExcel,
    exportCashForecastPdf
};

if (typeof window !== 'undefined') window.MANZIL_CASH_FORECAST_REPORT = CASH_FORECAST_REPORT_API;
