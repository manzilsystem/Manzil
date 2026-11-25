// @ts-check
/**
 * Insight reports — Manzil
 * تقارير تحليلية جديدة فوق الأساس المشترك في js/reports.js:
 * سلوك السداد لكل ساكن، انحراف المصروفات، وتوزيع طرق الدفع.
 * تُحمّل بعد js/reports.js وjs/reports/extended/reports-extended.js وتعتمد
 * فقط على دوال reports.js وstate.js حتى تعمل وحدها في اختبارات الوحدة.
 * كل الحسابات قراءة فقط من state، بالقرش، وبنفس عقود المحاسبة المعتمدة.
 */

const INSIGHTS_TABS = ['paymentBehavior', 'expenseVariance', 'paymentMethods'];

// تسجيل التقارير الجديدة في سجلات مركز التقارير دون تعديل js/reports.js:
// الأزرار واللوحات والفلاتر تُقرأ من هذه السجلات في التنقل والحالة.
if (typeof REPORT_TABS !== 'undefined' && Array.isArray(REPORT_TABS)) {
    INSIGHTS_TABS.forEach(tab => {
        if (!REPORT_TABS.includes(tab)) REPORT_TABS.push(tab);
    });
    Object.assign(REPORT_PANEL_IDS, {
        paymentBehavior: 'paymentBehaviorPanel',
        expenseVariance: 'expenseVariancePanel',
        paymentMethods: 'paymentMethodsPanel'
    });
    Object.assign(REPORT_OUTPUT_BUTTON_IDS, {
        paymentBehavior: 'paymentBehaviorPrintBtn',
        expenseVariance: 'expenseVariancePrintBtn',
        paymentMethods: 'paymentMethodsPrintBtn'
    });
    Object.assign(REPORT_FILTER_DESCRIPTORS, {
        paymentBehavior: [
            { id: 'paymentBehaviorResident', label: 'الشقة', text: reportResidentFilterLabel }
        ]
    });
}

/* ============================================================
   أدوات مشتركة للتقارير التحليلية (نسخة مستقلة عن reports-extended)
   ============================================================ */

function insightsValue(id) {
    if (typeof document === 'undefined') return '';
    const element = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.getElementById(id));
    return String(element?.value || '');
}

function insightsSetActions(ids, enabled) {
    ids.forEach(id => {
        const button = /** @type {HTMLButtonElement | null} */ (document.getElementById(id));
        if (button) button.disabled = !enabled;
    });
}

function insightsClearPreview(previewId, message, buttonIds) {
    const preview = document.getElementById(previewId);
    if (preview) preview.innerHTML = '<p class="report-preview-empty">' + esc(message) + '</p>';
    insightsSetActions(buttonIds, false);
    markReportPreviewStale(previewId, true);
    if (typeof syncReportNavStatus === 'function') syncReportNavStatus();
}

function insightsDataFingerprint() {
    // أي تعديل على سجل أو قاعدة مؤثرة (الاستحقاق أو السماح) يجب أن يبطل المعاينة.
    return JSON.stringify([
        state.buildingName || '',
        state.subscriptionDueDay ?? '',
        state.subscriptionGraceDays ?? '',
        state.defaultSubscription ?? '',
        Array.isArray(state.residents) ? state.residents : [],
        Array.isArray(state.income) ? state.income : [],
        Array.isArray(state.expenses) ? state.expenses : [],
        Array.isArray(state.adjustments) ? state.adjustments : []
    ]);
}

function insightsChartHasData(values) {
    return Array.isArray(values) && values.some(value => {
        const number = Number(value);
        return Number.isFinite(number) && number !== 0;
    });
}

function insightsChartColor(name) {
    return typeof REPORT_CHART_COLORS !== 'undefined' && REPORT_CHART_COLORS
        ? (REPORT_CHART_COLORS[name] || REPORT_CHART_COLORS.indigo || 'currentColor')
        : 'currentColor';
}

function printInsightsReport(bodyClass, title, meta) {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const titleEl = document.getElementById('printBuildingTitle');
    const metaEl = document.getElementById('printBuildingMeta');
    const previousTitle = titleEl ? titleEl.textContent : '';
    const previousMeta = metaEl ? metaEl.textContent : '';
    if (titleEl) titleEl.textContent = title + ' - ' + (state.buildingName || 'Manzil');
    if (metaEl) metaEl.textContent = meta + ' · المدير: ' + (state.managerName || '—');
    ['print-landlord', 'print-statement', 'print-period', 'print-expenses', 'print-adjustments',
        'print-cashflow', 'print-apartments', 'print-payment-behavior', 'print-expense-variance',
        'print-payment-methods'].forEach(name => document.body.classList.remove(name));
    document.body.classList.add(bodyClass);
    const restore = () => {
        document.body.classList.remove(bodyClass);
        if (titleEl) titleEl.textContent = previousTitle;
        if (metaEl) metaEl.textContent = previousMeta;
    };
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
}

/** مسح فلاتر تقارير التحليلات دون المساس بالسجلات المالية. */
function clearInsightsFilters(tab) {
    if (tab === 'paymentBehavior') {
        const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('paymentBehaviorResident'));
        if (select) select.value = '';
        invalidatePayerBehaviorPreview();
    } else {
        return false;
    }
    if (typeof renderReportFilterSummaries === 'function') renderReportFilterSummaries();
    return true;
}

/** يملأ قوائم تقارير التحليلات من بيانات المبنى الحالية. */
function populateInsightsReportFilters(months, current = getCurrentMonth()) {
    const residents = (Array.isArray(state.residents) ? state.residents : [])
        .slice()
        .sort((a, b) => String(a.apartmentNumber || '').localeCompare(String(b.apartmentNumber || ''), 'ar', { numeric: true }))
        .map(resident => '<option value="' + esc(resident.id) + '">' +
            esc(typeof formatApartmentLabel === 'function' ? formatApartmentLabel(resident.apartmentNumber) : 'شقة ' + String(resident.apartmentNumber || '')) +
            ' · ' + esc(resident.name || '') + '</option>').join('');
    const residentSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('paymentBehaviorResident'));
    if (residentSelect) {
        const selected = residentSelect.value;
        residentSelect.innerHTML = '<option value="">كل الشقق</option>' + residents;
        residentSelect.value = (Array.isArray(state.residents) ? state.residents : []).some(resident => resident.id === selected) ? selected : '';
    }
}

function initInsightsReportsUI() {
    populateInsightsReportFilters();
}

function invalidateInsightsReportsIfStale() {
    invalidatePayerBehaviorIfStale();
}

/* ============================================================
   تقرير سلوك السداد لكل ساكن
   الالتزام يُقاس من تاريخ التحصيل الفعلي (income.paid_at) مقابل
   يوم الاستحقاق + فترة السماح، بنفس قاعدة getSubscriptionOverdueDays.
   ============================================================ */

let paymentBehaviorSnapshot = null;
let paymentBehaviorSignature = '';
const PAYMENT_BEHAVIOR_SIGNATURE_PREFIX = 'built:';
const PAYER_BEHAVIOR_ACTION_IDS = ['paymentBehaviorPrintBtn', 'paymentBehaviorPdfBtn', 'paymentBehaviorCsvBtn', 'paymentBehaviorExcelBtn'];

// قاعدة «متأخر مزمن»: ثلاثة أشهر تأخير على الأقل ونصف الأشهر المحسوبة أو أكثر.
const PAYER_CHRONIC_MIN_LATE_MONTHS = 3;
const PAYER_CHRONIC_MIN_LATE_RATIO = 0.5;

function insightsSubscriptionRule() {
    return {
        dueDay: Math.min(28, Math.max(1, Number(state.subscriptionDueDay) || 1)),
        graceDays: Math.min(31, Math.max(0, Number(state.subscriptionGraceDays) || 0))
    };
}

/**
 * يبني نموذج سلوك السداد لكل ساكن من سجل التحصيلات.
 * @param {string} residentFilter معرّف ساكن محدد أو فارغ للكل
 * @param {Date} [now] مرجع «اليوم» لقابلية الاختبار
 */
function buildPayerBehaviorReport(residentFilter = '', now = new Date()) {
    const currentKey = monthLabelToKey(getCurrentMonth());
    if (!currentKey) return null;
    const income = Array.isArray(state.income) ? state.income : [];
    const rule = insightsSubscriptionRule();
    const residents = (Array.isArray(state.residents) ? state.residents : [])
        .filter(resident => !residentFilter || resident.id === residentFilter)
        .slice()
        .sort((a, b) => String(a.apartmentNumber || '').localeCompare(String(b.apartmentNumber || ''), 'ar', { numeric: true }));
    const buildingMonths = typeof getBuildingMonthOptions === 'function' ? getBuildingMonthOptions(24) : [];
    const rows = residents.map(resident => {
        const monthSet = new Set(buildingMonths);
        income.forEach(payment => {
            if (payment.residentId === resident.id && payment.month) monthSet.add(payment.month);
        });
        const months = [];
        monthSet.forEach(month => {
            const key = monthLabelToKey(month);
            if (!key || key > currentKey) return;
            if (!isResidentActiveInMonth(resident, key)) return;
            const dueCents = toCents(getMonthlyDueAmountForMonth(resident, month));
            if (dueCents <= 0) return;
            const payments = income.filter(payment =>
                payment.residentId === resident.id &&
                payment.month === month &&
                (typeof getIncomePurposeFormCode === 'function' ? getIncomePurposeFormCode(payment.purposeCode) : 'subscription') === 'subscription'
            );
            const paidCents = payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
            const fullyPaid = paidCents >= dueCents;
            const lastPaidAt = payments.reduce((latest, payment) => {
                const value = String(payment.date || '').trim();
                return value && value > latest ? value : latest;
            }, '');
            const overdueNow = typeof isSubscriptionMonthOverdue === 'function'
                ? isSubscriptionMonthOverdue(month, now)
                : false;
            if (!fullyPaid && !overdueNow) {
                // شهر لم يحل موعده بعد ولم يُسدد كاملًا: لا يدخل في الحكم.
                months.push({ month, key, status: 'pending', dueCents, paidCents, delayDays: 0, outstandingCents: 0 });
                return;
            }
            if (fullyPaid && !lastPaidAt) {
                // سداد كامل بلا تاريخ موثق: لا يمكن قياس موعده.
                months.push({ month, key, status: 'unknown', dueCents, paidCents, delayDays: 0, outstandingCents: 0 });
                return;
            }
            const delayDays = fullyPaid
                ? (typeof getSubscriptionOverdueDays === 'function' ? getSubscriptionOverdueDays(month, new Date(lastPaidAt)) : 0)
                : (typeof getSubscriptionOverdueDays === 'function' ? getSubscriptionOverdueDays(month, now) : 0);
            months.push({
                month,
                key,
                status: delayDays > 0 ? 'late' : 'onTime',
                dueCents,
                paidCents,
                delayDays,
                outstandingCents: Math.max(0, dueCents - paidCents)
            });
        });
        months.sort((a, b) => a.key.localeCompare(b.key));
        const judged = months.filter(item => item.status === 'onTime' || item.status === 'late');
        const late = judged.filter(item => item.status === 'late');
        const onTimeCount = judged.length - late.length;
        const totalDelayDays = late.reduce((sum, item) => sum + item.delayDays, 0);
        const lateRatio = judged.length ? late.length / judged.length : 0;
        return {
            resident,
            label: (typeof formatApartmentLabel === 'function' ? formatApartmentLabel(resident.apartmentNumber) : 'شقة ' + String(resident.apartmentNumber || '')) + ' · ' + (resident.name || '—'),
            months,
            judgedCount: judged.length,
            onTimeCount,
            lateCount: late.length,
            pendingCount: months.filter(item => item.status === 'pending').length,
            unknownCount: months.filter(item => item.status === 'unknown').length,
            onTimePct: judged.length ? Math.round((onTimeCount / judged.length) * 100) : null,
            avgDelayDays: late.length ? Math.round(totalDelayDays / late.length) : 0,
            maxDelayDays: late.reduce((max, item) => Math.max(max, item.delayDays), 0),
            outstandingCents: months.reduce((sum, item) => sum + item.outstandingCents, 0),
            chronic: late.length >= PAYER_CHRONIC_MIN_LATE_MONTHS && lateRatio >= PAYER_CHRONIC_MIN_LATE_RATIO
        };
    });
    rows.sort((a, b) => {
        if (a.onTimePct === null && b.onTimePct === null) return 0;
        if (a.onTimePct === null) return 1;
        if (b.onTimePct === null) return -1;
        return a.onTimePct - b.onTimePct || b.lateCount - a.lateCount;
    });
    const judged = rows.reduce((sum, row) => sum + row.judgedCount, 0);
    const onTime = rows.reduce((sum, row) => sum + row.onTimeCount, 0);
    const late = rows.reduce((sum, row) => sum + row.lateCount, 0);
    const totalDelayDays = rows.reduce((sum, row) => sum + (row.avgDelayDays * row.lateCount), 0);
    return {
        residentFilter,
        dueDay: rule.dueDay,
        graceDays: rule.graceDays,
        rows,
        totals: {
            unitCount: rows.length,
            judgedCount: judged,
            onTimeCount: onTime,
            lateCount: late,
            onTimePct: judged ? Math.round((onTime / judged) * 100) : null,
            avgDelayDays: late ? Math.round(totalDelayDays / late) : 0,
            maxDelayDays: rows.reduce((max, row) => Math.max(max, row.maxDelayDays), 0),
            chronicCount: rows.filter(row => row.chronic).length,
            outstandingCents: rows.reduce((sum, row) => sum + row.outstandingCents, 0),
            unknownCount: rows.reduce((sum, row) => sum + row.unknownCount, 0)
        }
    };
}

function payerBehaviorStatusLabel(row) {
    if (row.chronic) return { text: 'متأخر مزمن', tone: 'rose' };
    if (row.lateCount > 0) return { text: 'متذبذب', tone: 'amber' };
    if (row.judgedCount === 0) return { text: 'لا يوجد حكم', tone: '' };
    return { text: 'ملتزم', tone: 'emerald' };
}

function getPayerBehaviorSelection() {
    return { resident: insightsValue('paymentBehaviorResident') };
}

function getPayerBehaviorSignature() {
    const selection = getPayerBehaviorSelection();
    return `${selection.resident}/${insightsDataFingerprint()}`;
}

function setPayerBehaviorActions(enabled) {
    insightsSetActions(PAYER_BEHAVIOR_ACTION_IDS, enabled);
}

function clearPayerBehaviorPreview(message) {
    insightsClearPreview('paymentBehaviorPreview', message, PAYER_BEHAVIOR_ACTION_IDS);
    if (typeof destroyChartsInContainer === 'function') destroyChartsInContainer('insightsPaymentBehaviorChartContainer');
}

function invalidatePayerBehaviorPreview() {
    if (!paymentBehaviorSnapshot) return;
    paymentBehaviorSnapshot = null;
    clearPayerBehaviorPreview('غيّرت الفلاتر المعاينة. اضغط «معاينة» لتحديث التقرير.');
}

function isPayerBehaviorCurrent() {
    return Boolean(paymentBehaviorSnapshot) && paymentBehaviorSignature === PAYMENT_BEHAVIOR_SIGNATURE_PREFIX + getPayerBehaviorSignature();
}

function invalidatePayerBehaviorIfStale() {
    if (!paymentBehaviorSnapshot) return;
    if (!isPayerBehaviorCurrent()) invalidatePayerBehaviorPreview();
}

function payerBehaviorStatItems(report) {
    return [
        { label: 'عدد الشقق', text: fmtNum(report.totals.unitCount) },
        { label: 'نسبة الالتزام', text: report.totals.onTimePct === null ? '—' : fmtNum(report.totals.onTimePct) + '%', tone: 'emerald' },
        { label: 'متوسط التأخير', text: report.totals.lateCount ? fmtNum(report.totals.avgDelayDays) + ' يوم' : '—', tone: report.totals.lateCount ? 'amber' : 'emerald' },
        { label: 'متأخر مزمن', text: fmtNum(report.totals.chronicCount), tone: report.totals.chronicCount ? 'rose' : 'emerald' }
    ];
}

function payerBehaviorChartRows(report) {
    return report.rows.filter(row => row.onTimePct !== null).slice(0, 12);
}

function renderPayerBehaviorHtml(report) {
    const stats = renderReportStatTiles(payerBehaviorStatItems(report), true);
    const rows = report.rows.map(row => {
        const status = payerBehaviorStatusLabel(row);
        return [
            esc(row.label),
            fmtNum(row.judgedCount),
            '<span class="sheet-positive">' + fmtNum(row.onTimeCount) + '</span>',
            row.lateCount ? '<span class="sheet-negative">' + fmtNum(row.lateCount) + '</span>' : fmtNum(0),
            row.onTimePct === null ? '—' : fmtNum(row.onTimePct) + '%',
            row.lateCount ? fmtNum(row.avgDelayDays) + ' يوم' : '—',
            row.lateCount ? fmtNum(row.maxDelayDays) + ' يوم' : '—',
            '<span class="sheet-' + (status.tone || 'muted') + '">' + esc(status.text) + '</span>'
        ];
    });
    const chartRows = payerBehaviorChartRows(report);
    const hasChartData = chartRows.length > 0;
    const money = cents => fmtMoney(cents / 100);
    return [
        '<div class="report-preview-flow" dir="rtl">',
        renderReportHeader('تقرير سلوك السداد · ' + (state.buildingName || 'العمارة'), [
            'الاستحقاق يوم ' + fmtNum(report.dueDay) + ' + سماح ' + fmtNum(report.graceDays) + ' يوم • ' +
            fmtNum(report.totals.unitCount) + ' شقة • ' + fmtNum(report.totals.judgedCount) + ' شهر محسوب'
        ]),
        stats,
        renderSheetBlock('سلوك كل مالك', ['الشقة', 'أشهر محسوبة', 'في الموعد', 'متأخر', 'الالتزام', 'متوسط التأخير', 'أطول تأخير', 'الحالة'], rows, {
            empty: 'لا توجد شقق مطابقة للفلاتر.',
            numeric: [1, 2, 3, 4, 5, 6], tableClass: 'statement-table',
            foot: ['الإجمالي', fmtNum(report.totals.judgedCount),
                '<span class="sheet-positive">' + fmtNum(report.totals.onTimeCount) + '</span>',
                '<span class="sheet-negative">' + fmtNum(report.totals.lateCount) + '</span>',
                report.totals.onTimePct === null ? '—' : fmtNum(report.totals.onTimePct) + '%',
                report.totals.lateCount ? fmtNum(report.totals.avgDelayDays) + ' يوم' : '—',
                report.totals.lateCount ? fmtNum(report.totals.maxDelayDays) + ' يوم' : '—', '—']
        }),
        renderChartFoldContainer('insightsPaymentBehaviorChartContainer', 'التصور البياني - نسبة الالتزام لكل شقة (الأدنى أولًا)', {
            hasData: hasChartData,
            empty: 'لا توجد أشهر محسوبة كافية لعرض الرسم.',
            summary: hasChartData ? [
                { label: 'نسبة الالتزام', text: report.totals.onTimePct === null ? '—' : fmtNum(report.totals.onTimePct) + '%', tone: 'emerald' },
                { label: 'متأخر مزمن', text: fmtNum(report.totals.chronicCount), tone: report.totals.chronicCount ? 'rose' : 'emerald' },
                { label: 'متأخرات قائمة', cents: report.totals.outstandingCents, tone: report.totals.outstandingCents ? 'rose' : 'emerald' }
            ] : []
        }),
        renderReportNotes([
            '<p>الموعد النهائي للسداد: يوم ' + fmtNum(report.dueDay) + ' من الشهر + ' + fmtNum(report.graceDays) +
                ' يوم سماح. من سدد كامل مستحقه قبل نهاية السماح يُحسب «في الموعد»، وإلا حُسبت أيام التأخير من نهاية السماح حتى تاريخ السداد (أو حتى اليوم إن لم يسدد بعد).</p>',
            '<p>«متأخر مزمن»: ' + fmtNum(PAYER_CHRONIC_MIN_LATE_MONTHS) + ' أشهر تأخير على الأقل ونصف الأشهر المحسوبة أو أكثر.</p>',
            report.totals.unknownCount ? '<p>' + fmtNum(report.totals.unknownCount) + ' شهر مسدد بلا تاريخ موثق لم يدخل في حساب المواعيد.</p>' : '',
            report.totals.outstandingCents ? '<p>متأخرات قائمة ضمن الأشهر المحسوبة: ' + money(report.totals.outstandingCents) + '.</p>' : ''
        ])
    ].join('');
}

function drawPayerBehaviorChart(report) {
    if (!document.getElementById('insightsPaymentBehaviorChartContainer')) return;
    const chartRows = payerBehaviorChartRows(report);
    if (!chartRows.length) return;
    if (typeof createChartContainer !== 'function' || typeof renderBarValues !== 'function') return;
    const canvas = createChartContainer('insightsPaymentBehaviorChartContainer', 'paymentBehaviorChart', 220);
    if (canvas && typeof canvas.setAttribute === 'function') {
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'مخطط نسبة الالتزام بالسداد لكل شقة؛ البيانات نفسها متاحة في الجدول أعلاه');
    }
    renderBarValues('paymentBehaviorChart',
        chartRows.map(row => row.label),
        chartRows.map(row => row.onTimePct),
        insightsChartColor('emerald'), 'نسبة الالتزام %');
}

function generatePayerBehaviorReport() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const selection = getPayerBehaviorSelection();
    const report = buildPayerBehaviorReport(selection.resident);
    if (!report) {
        clearPayerBehaviorPreview('تعذر بناء التقرير من البيانات الحالية.');
        return;
    }
    paymentBehaviorSnapshot = report;
    paymentBehaviorSignature = PAYMENT_BEHAVIOR_SIGNATURE_PREFIX + getPayerBehaviorSignature();
    const preview = document.getElementById('paymentBehaviorPreview');
    if (preview) preview.innerHTML = renderPayerBehaviorHtml(report);
    markReportPreviewStale('paymentBehaviorPreview', false);
    setPayerBehaviorActions(true);
    drawPayerBehaviorChart(report);
    if (typeof syncReportNavStatus === 'function') syncReportNavStatus();
}

function getSelectedPayerBehaviorSnapshot() {
    if (!isPayerBehaviorCurrent()) {
        if (paymentBehaviorSnapshot) invalidatePayerBehaviorPreview();
        return null;
    }
    return paymentBehaviorSnapshot;
}

function printPayerBehaviorReport() {
    const report = getSelectedPayerBehaviorSnapshot();
    if (!report) return;
    printInsightsReport('print-payment-behavior', 'تقرير سلوك السداد',
        'الاستحقاق يوم ' + fmtNum(report.dueDay) + ' + سماح ' + fmtNum(report.graceDays) + ' يوم');
}

function payerBehaviorCsvRows(report) {
    return [
        ['تقرير سلوك السداد'],
        ['الاستحقاق', 'يوم ' + report.dueDay, 'السماح', report.graceDays + ' يوم'],
        [],
        ['الشقة', 'أشهر محسوبة', 'في الموعد', 'متأخر', 'الالتزام %', 'متوسط التأخير (يوم)', 'أطول تأخير (يوم)', 'الحالة'],
        ...report.rows.map(row => [
            row.label,
            row.judgedCount,
            row.onTimeCount,
            row.lateCount,
            row.onTimePct === null ? '' : row.onTimePct,
            row.lateCount ? row.avgDelayDays : '',
            row.lateCount ? row.maxDelayDays : '',
            payerBehaviorStatusLabel(row).text
        ]),
        [],
        ['الإجمالي', report.totals.judgedCount, report.totals.onTimeCount, report.totals.lateCount,
            report.totals.onTimePct === null ? '' : report.totals.onTimePct,
            report.totals.lateCount ? report.totals.avgDelayDays : '',
            report.totals.lateCount ? report.totals.maxDelayDays : '', '']
    ];
}

function exportPayerBehaviorCsv() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const report = getSelectedPayerBehaviorSnapshot();
    if (!report) return;
    const suffix = report.residentFilter ? '_' + (typeof reportResidentFileSlug === 'function' ? reportResidentFileSlug(report.residentFilter) : report.residentFilter) : '';
    downloadCsv('manzil_payment_behavior_' + Date.now() + suffix + '.csv', payerBehaviorCsvRows(report));
}

function exportPayerBehaviorExcel() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const report = getSelectedPayerBehaviorSnapshot();
    if (!report) return;
    const suffix = report.residentFilter ? '_' + (typeof reportResidentFileSlug === 'function' ? reportResidentFileSlug(report.residentFilter) : report.residentFilter) : '';
    exportReportExcel('manzil_payment_behavior_' + Date.now() + suffix, [
        { name: 'سلوك السداد', rows: payerBehaviorCsvRows(report), options: { autoFilter: true, freezeHeader: true, columnWidths: [26, 12, 10, 10, 10, 16, 16, 14] } },
        { name: 'الملخص', rows: [['البند', 'القيمة'],
            ['عدد الشقق', report.totals.unitCount],
            ['نسبة الالتزام %', report.totals.onTimePct === null ? '' : report.totals.onTimePct],
            ['متوسط التأخير (يوم)', report.totals.lateCount ? report.totals.avgDelayDays : 0],
            ['متأخر مزمن', report.totals.chronicCount],
            ['متأخرات قائمة', report.totals.outstandingCents / 100]] }
    ]);
}

function renderPayerBehaviorPdfHtml(report) {
    const generatedLabel = formatDate(new Date().toISOString());
    const rows = report.rows.map(row => {
        const status = payerBehaviorStatusLabel(row);
        return [
            '<tr>',
            statementPdfHeadCell(esc(row.label)),
            statementPdfCell(fmtNum(row.judgedCount)),
            statementPdfCell(fmtNum(row.onTimeCount)),
            statementPdfCell(fmtNum(row.lateCount)),
            statementPdfCell(row.onTimePct === null ? '—' : fmtNum(row.onTimePct) + '%'),
            statementPdfCell(row.lateCount ? fmtNum(row.avgDelayDays) + ' يوم' : '—'),
            statementPdfCell(esc(status.text)),
            '</tr>'
        ].join('');
    }).join('');
    return [
        reportPdfDocumentOpen(),
        reportPdfHeader(['تقرير سلوك السداد'], [
            'الاستحقاق يوم ' + fmtNum(report.dueDay) + ' + سماح ' + fmtNum(report.graceDays) + ' يوم',
            fmtNum(report.totals.unitCount) + ' شقة • ' + fmtNum(report.totals.judgedCount) + ' شهر محسوب'
        ]),
        reportPdfSection('الملخص', reportPdfSummaryTable(payerBehaviorStatItems(report))),
        reportPdfSection('سلوك كل مالك', reportPdfTable(
            ['الشقة', 'أشهر محسوبة', 'في الموعد', 'متأخر', 'الالتزام', 'متوسط التأخير', 'الحالة'],
            rows || reportPdfEmptyRow(7, 'لا توجد شقق مطابقة للفلاتر.'),
            ['الإجمالي', fmtNum(report.totals.judgedCount), fmtNum(report.totals.onTimeCount), fmtNum(report.totals.lateCount),
                report.totals.onTimePct === null ? '—' : fmtNum(report.totals.onTimePct) + '%',
                report.totals.lateCount ? fmtNum(report.totals.avgDelayDays) + ' يوم' : '—', '—']
        )),
        reportPdfFooter(generatedLabel),
        '</div>'
    ].join('');
}

async function exportPayerBehaviorPdf() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const report = getSelectedPayerBehaviorSnapshot();
    if (!report) return;
    await downloadStatementPdf(renderPayerBehaviorPdfHtml(report),
        'manzil_payment_behavior_' + Date.now() + '.pdf',
        'paymentBehaviorPdfBtn', 'تم تنزيل تقرير سلوك السداد', 'payment behavior pdf',
        () => Boolean(paymentBehaviorSnapshot));
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', initInsightsReportsUI);
}

/* ============================================================
   تقرير انحراف المصروفات: مقارنة الشهر المحدد بمتوسط 6 أشهر سابقة
   ============================================================ */

const EXPENSE_VARIANCE_BASELINE_MONTHS = 6;
// حد الانحراف المؤثر: 50% صعودًا أو هبوطًا عن المتوسط.
const EXPENSE_VARIANCE_FLAG_PCT = 50;

function insightsShiftMonthKey(key, offset) {
    const match = /^(\d{4})-(\d{2})/.exec(String(key || ''));
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * يبني نموذج انحراف المصروفات لكل تصنيف مقابل متوسط الأشهر الستة السابقة.
 * @param {string} monthLabel شهر الهدف (مثل «نوفمبر 2026»)، فارغًا يعني الشهر الحالي
 * @param {string} categoryFilter تصنيف محدد أو فارغ للكل
 * @returns {object|null}
 */
function buildExpenseVarianceReport(monthLabel = '', categoryFilter = '') {
    const targetLabel = String(monthLabel || '').trim() || getCurrentMonth();
    const targetKey = monthLabelToKey(targetLabel);
    if (!targetKey) return null;
    const expenses = Array.isArray(state.expenses) ? state.expenses : [];
    const current = new Map();
    const baseline = new Map();
    expenses.forEach(expense => {
        const key = monthLabelToKey(expense.month);
        if (!key) return;
        const category = String(expense.category || '').trim() || 'غير مصنف';
        if (categoryFilter && category !== categoryFilter) return;
        const cents = toCents(expense.amount);
        if (key === targetKey) {
            const entry = current.get(category) || { count: 0, cents: 0 };
            entry.count += 1;
            entry.cents += cents;
            current.set(category, entry);
        } else if (key < targetKey && key >= insightsShiftMonthKey(targetKey, -EXPENSE_VARIANCE_BASELINE_MONTHS)) {
            const entry = baseline.get(category) || { count: 0, cents: 0 };
            entry.count += 1;
            entry.cents += cents;
            baseline.set(category, entry);
        }
    });
    const categories = new Set([...current.keys(), ...baseline.keys()]);
    const rows = Array.from(categories).map(category => {
        const currentCents = current.get(category)?.cents || 0;
        const currentCount = current.get(category)?.count || 0;
        const baselineTotalCents = baseline.get(category)?.cents || 0;
        const baselineAvgCents = Math.round(baselineTotalCents / EXPENSE_VARIANCE_BASELINE_MONTHS);
        const varianceCents = currentCents - baselineAvgCents;
        const variancePct = baselineAvgCents > 0 ? Math.round((varianceCents / baselineAvgCents) * 100) : null;
        let flag = 'ok';
        if (baselineAvgCents === 0 && currentCents > 0) flag = 'new';
        else if (variancePct !== null && variancePct >= EXPENSE_VARIANCE_FLAG_PCT) flag = 'up';
        else if (variancePct !== null && variancePct <= -EXPENSE_VARIANCE_FLAG_PCT) flag = 'down';
        return { category, currentCents, currentCount, baselineTotalCents, baselineAvgCents, varianceCents, variancePct, flag };
    });
    rows.sort((a, b) => Math.abs(b.varianceCents) - Math.abs(a.varianceCents) || a.category.localeCompare(b.category, 'ar'));
    return {
        month: targetLabel,
        monthKey: targetKey,
        baselineMonths: EXPENSE_VARIANCE_BASELINE_MONTHS,
        categoryFilter,
        rows,
        flaggedCount: rows.filter(row => row.flag !== 'ok').length,
        totals: {
            currentCents: rows.reduce((sum, row) => sum + row.currentCents, 0),
            baselineAvgCents: rows.reduce((sum, row) => sum + row.baselineAvgCents, 0)
        }
    };
}

const INSIGHTS_REPORT_API = {
    buildPayerBehaviorReport,
    buildExpenseVarianceReport,
    getPayerBehaviorSignature,
    generatePayerBehaviorReport,
    getSelectedPayerBehaviorSnapshot,
    renderPayerBehaviorHtml,
    renderPayerBehaviorPdfHtml,
    payerBehaviorCsvRows,
    invalidatePayerBehaviorPreview,
    invalidatePayerBehaviorIfStale,
    invalidateInsightsReportsIfStale,
    populateInsightsReportFilters,
    clearInsightsFilters
};

if (typeof window !== 'undefined') window.MANZIL_INSIGHTS_REPORTS = INSIGHTS_REPORT_API;
