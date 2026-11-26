// @ts-check
/**
 * تقرير الملخص السنوي — Manzil
 * صورة السنة كاملة لمجلس الإدارة: مستحق كل شهر ومحصّله ونسبته ومصروفاته
 * وصافيه وما تبقى منه، مع إجماليات السنة ومتوسط الالتزام.
 * يُحمّل بعد js/reports.js وjs/reports/extended/reports-insights.js ويعتمد
 * فقط على دوالهما ودوال state.js حتى يعمل وحده في اختبارات الوحدة.
 * كل الحسابات قراءة فقط من state، بالقرش، وبنفس عقود المحاسبة المعتمدة.
 */

/* تسجيل التقرير في سجلات مركز التقارير دون تعديل js/reports.js */
if (typeof REPORT_TABS !== 'undefined' && Array.isArray(REPORT_TABS) && !REPORT_TABS.includes('annualSummary')) {
    REPORT_TABS.push('annualSummary');
    Object.assign(REPORT_PANEL_IDS, { annualSummary: 'annualSummaryPanel' });
    Object.assign(REPORT_OUTPUT_BUTTON_IDS, { annualSummary: 'annualSummaryPrintBtn' });
    Object.assign(REPORT_FILTER_DESCRIPTORS, {
        annualSummary: [
            { id: 'annualSummaryYear', label: 'السنة' }
        ]
    });
}

const ANNUAL_SUMMARY_SIGNATURE_PREFIX = 'built:';
const ANNUAL_SUMMARY_ACTION_IDS = ['annualSummaryPrintBtn', 'annualSummaryPdfBtn', 'annualSummaryCsvBtn', 'annualSummaryExcelBtn'];

let annualSummarySnapshot = null;
let annualSummarySignature = '';

function annualSummaryValue(id) {
    if (typeof document === 'undefined') return '';
    const element = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.getElementById(id));
    return String(element?.value || '');
}

function getAnnualSummarySelection() {
    return { year: annualSummaryValue('annualSummaryYear') };
}

function getAnnualSummarySignature() {
    const selection = getAnnualSummarySelection();
    const fingerprint = typeof insightsDataFingerprint === 'function' ? insightsDataFingerprint() : '';
    return `${selection.year}/${fingerprint}`;
}

function setAnnualSummaryActions(enabled) {
    if (typeof insightsSetActions === 'function') insightsSetActions(ANNUAL_SUMMARY_ACTION_IDS, enabled);
}

function clearAnnualSummaryPreview(message) {
    if (typeof insightsClearPreview === 'function') {
        insightsClearPreview('annualSummaryPreview', message, ANNUAL_SUMMARY_ACTION_IDS);
    }
    if (typeof destroyChartsInContainer === 'function') destroyChartsInContainer('annualSummaryChartContainer');
}

function invalidateAnnualSummaryPreview() {
    if (!annualSummarySnapshot) return;
    annualSummarySnapshot = null;
    clearAnnualSummaryPreview('غيّرت الفلاتر المعاينة. اضغط «معاينة» لتحديث التقرير.');
}

function isAnnualSummaryCurrent() {
    return Boolean(annualSummarySnapshot) && annualSummarySignature === ANNUAL_SUMMARY_SIGNATURE_PREFIX + getAnnualSummarySignature();
}

function invalidateAnnualSummaryIfStale() {
    if (!annualSummarySnapshot) return;
    if (!isAnnualSummaryCurrent()) invalidateAnnualSummaryPreview();
}

/** مسح فلاتر الملخص السنوي دون المساس بالسجلات المالية. */
function clearAnnualSummaryFilters() {
    const element = /** @type {HTMLSelectElement | null} */ (document.getElementById('annualSummaryYear'));
    if (element) element.value = '';
    populateAnnualSummaryFilters();
    invalidateAnnualSummaryPreview();
    if (typeof syncReportNavStatus === 'function') syncReportNavStatus();
}

/** سنوات لها نشاط: من أشهر العمارة وسجلات التحصيل والمصروفات. */
function annualSummaryYears() {
    const years = new Set();
    (typeof getBuildingMonthOptions === 'function' ? getBuildingMonthOptions(24) : []).forEach(month => {
        const key = monthLabelToKey(month);
        if (key) years.add(key.slice(0, 4));
    });
    [...(Array.isArray(state.income) ? state.income : []), ...(Array.isArray(state.expenses) ? state.expenses : [])].forEach(record => {
        const key = monthLabelToKey(record.month);
        if (key) years.add(key.slice(0, 4));
    });
    years.add(String(new Date().getFullYear()));
    return Array.from(years).sort();
}

function populateAnnualSummaryFilters() {
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('annualSummaryYear'));
    if (!select) return;
    const years = annualSummaryYears();
    const selected = select.value;
    const currentYear = String(new Date().getFullYear());
    select.innerHTML = years.map(year => '<option value="' + esc(year) + '">' + esc(year) + '</option>').join('');
    select.value = years.includes(selected) ? selected : (years.includes(currentYear) ? currentYear : years[years.length - 1]);
}

/**
 * يبني ملخص السنة شهرًا بشهر. الأشهر التي لم تحل بعد تظهر بشرطات
 * ولا تدخل المتوسطات ولا نسبة التحصيل.
 * @param {string} [year] السنة المطلوبة أو فارغة للسنة الحالية
 * @param {Date} [now] مرجع «اليوم» لقابلية الاختبار
 */
function buildAnnualSummaryReport(year = '', now = new Date()) {
    const targetYear = /^\d{4}$/.test(String(year).trim()) ? String(year).trim() : String(now.getFullYear());
    const currentKey = monthLabelToKey(getCurrentMonth());
    if (!currentKey) return null;
    const residents = Array.isArray(state.residents) ? state.residents : [];
    const income = Array.isArray(state.income) ? state.income : [];
    const expenses = Array.isArray(state.expenses) ? state.expenses : [];
    const rows = [];
    for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
        const key = `${targetYear}-${String(monthIndex).padStart(2, '0')}-01`;
        const future = key > currentKey;
        const monthLabel = monthKeyToLabel(key);
        if (future) {
            rows.push({ key, label: monthLabel, future: true, dueCents: 0, paidCents: 0, pct: null, expenseCents: 0, netCents: 0, outstandingCents: 0 });
            continue;
        }
        // المستحق والمحصّل والمتبقي يحسبان لكل مقيم على حدة بنفس قاعدة
        // كشف الحساب وتقرير الشقق: التحصيلات الموجبة فقط، ومدفوعات التسوية
        // تُنسب لشهر تسويتها، وزيادة مقيم لا تغطي متأخرات مقيم آخر.
        let dueCents = 0;
        let paidCents = 0;
        let outstandingCents = 0;
        residents.forEach(resident => {
            if (typeof isResidentActiveInMonth === 'function' && !isResidentActiveInMonth(resident, key)) return;
            const residentDueCents = toCents(getMonthlyDueAmountForMonth(resident, monthLabel));
            const residentPaidCents = typeof getMonthlyDuePaidAmount === 'function'
                ? toCents(getMonthlyDuePaidAmount(resident.id, monthLabel))
                : income
                    .filter(payment => payment.residentId === resident.id &&
                        monthLabelToKey(payment.month) === key &&
                        (typeof getIncomePurposeFormCode === 'function' ? getIncomePurposeFormCode(payment.purposeCode) : 'subscription') === 'subscription' &&
                        toCents(payment.amount) > 0)
                    .reduce((sum, payment) => sum + toCents(payment.amount), 0);
            dueCents += residentDueCents;
            paidCents += residentPaidCents;
            outstandingCents += Math.max(0, residentDueCents - residentPaidCents);
        });
        const expenseCents = expenses
            .filter(expense => monthLabelToKey(expense.month) === key)
            .reduce((sum, expense) => sum + toCents(expense.amount), 0);
        rows.push({
            key,
            label: monthLabel,
            future: false,
            dueCents,
            paidCents,
            pct: dueCents > 0 ? Math.min(100, Math.round((paidCents / dueCents) * 100)) : null,
            expenseCents,
            netCents: paidCents - expenseCents,
            outstandingCents
        });
    }
    const past = rows.filter(row => !row.future);
    const totals = past.reduce((acc, row) => {
        acc.dueCents += row.dueCents;
        acc.paidCents += row.paidCents;
        acc.expenseCents += row.expenseCents;
        acc.netCents += row.netCents;
        acc.outstandingCents += row.outstandingCents;
        return acc;
    }, { dueCents: 0, paidCents: 0, expenseCents: 0, netCents: 0, outstandingCents: 0 });
    const judged = past.filter(row => row.dueCents > 0);
    const avgPct = judged.length
        ? Math.round(judged.reduce((sum, row) => sum + (row.pct || 0), 0) / judged.length)
        : null;
    return { year: targetYear, rows, totals, avgPct, monthCount: past.length };
}

function annualSummaryStatItems(report) {
    const money = cents => fmtMoney(cents / 100);
    return [
        { label: 'تحصيلات السنة', text: money(report.totals.paidCents) },
        { label: 'مصروفات السنة', text: money(report.totals.expenseCents) },
        { label: 'صافي السنة', text: money(report.totals.netCents), tone: report.totals.netCents < 0 ? 'rose' : 'emerald' },
        { label: 'متوسط نسبة التحصيل', text: report.avgPct === null ? '—' : fmtNum(report.avgPct) + '%', tone: 'amber' },
        { label: 'المتبقي من المستحق', text: money(report.totals.outstandingCents) }
    ];
}

function renderAnnualSummaryHtml(report) {
    const stats = renderReportStatTiles(annualSummaryStatItems(report), true);
    const money = cents => fmtMoney(cents / 100);
    const rows = report.rows.map(row => row.future
        ? [esc(row.label), '—', '—', '—', '—', '—', '—']
        : [
            esc(row.label),
            money(row.dueCents),
            money(row.paidCents),
            row.pct === null ? '—' : '<span class="sheet-amber">' + fmtNum(row.pct) + '%</span>',
            money(row.expenseCents),
            '<span class="' + (row.netCents < 0 ? 'sheet-negative' : 'sheet-positive') + '">' + money(row.netCents) + '</span>',
            money(row.outstandingCents)
        ]);
    const foot = ['إجمالي ' + esc(report.year), money(report.totals.dueCents), money(report.totals.paidCents),
        report.avgPct === null ? '—' : fmtNum(report.avgPct) + '%',
        money(report.totals.expenseCents), money(report.totals.netCents), money(report.totals.outstandingCents)];
    const hasChartData = report.rows.some(row => !row.future && row.paidCents > 0);
    return [
        '<div class="report-preview-flow" dir="rtl">',
        renderReportHeader('الملخص السنوي ' + esc(report.year) + ' · ' + (state.buildingName || 'العمارة'), [
            fmtNum(report.monthCount) + ' شهر محسوب • متوسط التحصيل ' + (report.avgPct === null ? '—' : fmtNum(report.avgPct) + '%')
        ]),
        stats,
        renderSheetBlock('السنة شهرًا بشهر', ['الشهر', 'المستحق', 'المحصّل', 'نسبة التحصيل', 'المصروفات', 'الصافي', 'المتبقي'], rows, {
            empty: 'لا توجد بيانات لهذه السنة.',
            numeric: [1, 2, 3, 4, 5, 6], tableClass: 'statement-table',
            foot
        }),
        renderChartFoldContainer('annualSummaryChartContainer', 'التصور البياني - التحصيل الشهري خلال السنة', {
            hasData: hasChartData,
            empty: 'لا توجد تحصيلات هذه السنة لعرض الرسم.',
            summary: hasChartData ? [
                { label: 'صافي السنة', cents: report.totals.netCents, tone: report.totals.netCents < 0 ? 'rose' : 'emerald' },
                { label: 'تحصيلات السنة', cents: report.totals.paidCents }
            ] : []
        }),
        renderReportNotes([
            '<p>المستحق من اشتراكات الشقق النشطة كل شهر، والمحصّل من التحصيلات الموجبة المسجلة على شهر الاستحقاق (اشتراكات وتسويات). المتبقي يجمع متأخرات كل شقة على حدة. الصافي = المحصّل − المصروفات. الأشهر التي لم تحل تظهر بشرطات ولا تدخل المتوسط.</p>'
        ])
    ].join('');
}

function drawAnnualSummaryChart(report) {
    if (!document.getElementById('annualSummaryChartContainer')) return;
    if (!report.rows.some(row => !row.future && row.paidCents > 0)) return;
    if (typeof createChartContainer !== 'function' || typeof renderBarValues !== 'function') return;
    const canvas = createChartContainer('annualSummaryChartContainer', 'annualSummaryChart', 220);
    if (canvas && typeof canvas.setAttribute === 'function') {
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'مخطط التحصيل الشهري خلال السنة؛ البيانات نفسها متاحة في الجدول أعلاه');
    }
    const color = typeof REPORT_CHART_COLORS !== 'undefined' && REPORT_CHART_COLORS
        ? (REPORT_CHART_COLORS.amber || REPORT_CHART_COLORS.indigo || 'currentColor')
        : 'currentColor';
    const past = report.rows.filter(row => !row.future);
    renderBarValues('annualSummaryChart',
        past.map(row => row.label.split(' ')[0]),
        past.map(row => row.paidCents / 100),
        color, 'التحصيل ج.م');
}

function generateAnnualSummaryReport() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const selection = getAnnualSummarySelection();
    const report = buildAnnualSummaryReport(selection.year);
    if (!report) {
        clearAnnualSummaryPreview('تعذر بناء التقرير: اختر سنة صحيحة.');
        return;
    }
    annualSummarySnapshot = report;
    annualSummarySignature = ANNUAL_SUMMARY_SIGNATURE_PREFIX + getAnnualSummarySignature();
    const preview = document.getElementById('annualSummaryPreview');
    if (preview) preview.innerHTML = renderAnnualSummaryHtml(report);
    markReportPreviewStale('annualSummaryPreview', false);
    setAnnualSummaryActions(true);
    drawAnnualSummaryChart(report);
    if (typeof syncReportNavStatus === 'function') syncReportNavStatus();
}

function getSelectedAnnualSummarySnapshot() {
    if (!isAnnualSummaryCurrent()) {
        if (annualSummarySnapshot) invalidateAnnualSummaryPreview();
        return null;
    }
    return annualSummarySnapshot;
}

function printAnnualSummaryReport() {
    const report = getSelectedAnnualSummarySnapshot();
    if (!report) return;
    if (typeof printInsightsReport === 'function') {
        printInsightsReport('print-annual-summary', 'الملخص السنوي ' + report.year,
            'سنة ' + report.year + ' • ' + fmtNum(report.monthCount) + ' شهر محسوب');
    }
}

function annualSummaryCsvRows(report) {
    const rows = [['الشهر', 'المستحق', 'المحصل', 'نسبة التحصيل %', 'المصروفات', 'الصافي', 'المتبقي']];
    const money = cents => (cents / 100).toFixed(2);
    report.rows.forEach(row => {
        if (row.future) {
            rows.push([row.label, '', '', '', '', '', '']);
            return;
        }
        rows.push([
            row.label,
            money(row.dueCents),
            money(row.paidCents),
            row.pct === null ? '' : String(row.pct),
            money(row.expenseCents),
            money(row.netCents),
            money(row.outstandingCents)
        ]);
    });
    rows.push(['إجمالي ' + report.year, money(report.totals.dueCents), money(report.totals.paidCents),
        report.avgPct === null ? '' : String(report.avgPct),
        money(report.totals.expenseCents), money(report.totals.netCents), money(report.totals.outstandingCents)]);
    return rows;
}

function exportAnnualSummaryCsv() {
    const report = getSelectedAnnualSummarySnapshot();
    if (!report) return;
    downloadCsv('manzil_annual_summary_' + report.year + '.csv', annualSummaryCsvRows(report));
}

function exportAnnualSummaryExcel() {
    const report = getSelectedAnnualSummarySnapshot();
    if (!report) return;
    exportReportExcel('manzil_annual_summary_' + report.year, [
        { name: 'الملخص السنوي ' + report.year, rows: annualSummaryCsvRows(report) }
    ]);
}

function renderAnnualSummaryPdfHtml(report) {
    return renderAnnualSummaryHtml(report);
}

async function exportAnnualSummaryPdf() {
    const report = getSelectedAnnualSummarySnapshot();
    if (!report) return;
    await downloadStatementPdf(renderAnnualSummaryPdfHtml(report),
        'manzil_annual_summary_' + report.year + '.pdf',
        'annualSummaryPdfBtn', 'تم تنزيل الملخص السنوي', 'annual summary pdf',
        () => Boolean(annualSummarySnapshot));
}

const ANNUAL_SUMMARY_REPORT_API = {
    buildAnnualSummaryReport,
    renderAnnualSummaryHtml,
    renderAnnualSummaryPdfHtml,
    annualSummaryCsvRows,
    annualSummaryStatItems,
    annualSummaryYears,
    getAnnualSummarySignature,
    generateAnnualSummaryReport,
    getSelectedAnnualSummarySnapshot,
    invalidateAnnualSummaryPreview,
    invalidateAnnualSummaryIfStale,
    populateAnnualSummaryFilters,
    clearAnnualSummaryFilters,
    printAnnualSummaryReport,
    exportAnnualSummaryCsv,
    exportAnnualSummaryExcel,
    exportAnnualSummaryPdf
};

if (typeof window !== 'undefined') window.MANZIL_ANNUAL_SUMMARY_REPORT = ANNUAL_SUMMARY_REPORT_API;
