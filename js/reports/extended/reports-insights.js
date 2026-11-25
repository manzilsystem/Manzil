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
        ],
        expenseVariance: [
            { id: 'expenseVarianceMonth', label: 'الشهر' },
            { id: 'expenseVarianceCategory', label: 'التصنيف' }
        ],
        paymentMethods: [
            { id: 'paymentMethodsFromMonth', label: 'من شهر' },
            { id: 'paymentMethodsToMonth', label: 'إلى شهر' },
            { id: 'paymentMethodsMethod', label: 'طريقة الدفع' }
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
    } else if (tab === 'expenseVariance') {
        const monthSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('expenseVarianceMonth'));
        if (monthSelect && monthSelect.options && monthSelect.options.length) monthSelect.value = monthSelect.options[monthSelect.options.length - 1].value;
        const categorySelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('expenseVarianceCategory'));
        if (categorySelect) categorySelect.value = '';
        invalidateExpenseVariancePreview();
    } else if (tab === 'paymentMethods') {
        const fromSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('paymentMethodsFromMonth'));
        const toSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('paymentMethodsToMonth'));
        if (fromSelect && fromSelect.options && fromSelect.options.length) {
            const count = fromSelect.options.length;
            fromSelect.value = fromSelect.options[Math.max(0, count - PAYMENT_METHOD_SPLIT_DEFAULT_MONTHS)].value;
            toSelect.value = toSelect.options[count - 1].value;
        }
        const methodSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('paymentMethodsMethod'));
        if (methodSelect) methodSelect.value = '';
        invalidatePaymentMethodsPreview();
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
    const monthSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('expenseVarianceMonth'));
    if (monthSelect && Array.isArray(months) && months.length) {
        const selectedMonth = monthSelect.value;
        monthSelect.innerHTML = months.map(month => '<option value="' + esc(month) + '">' + esc(month) + '</option>').join('');
        monthSelect.value = months.includes(selectedMonth) ? selectedMonth : (months.includes(current) ? current : months[months.length - 1]);
    }
    const categorySelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('expenseVarianceCategory'));
    if (categorySelect) {
        const categories = Array.from(new Set((Array.isArray(state.expenses) ? state.expenses : [])
            .map(expense => String(expense.category || '').trim() || 'غير مصنف')))
            .sort((a, b) => a.localeCompare(b, 'ar'));
        const selectedCategory = categorySelect.value;
        categorySelect.innerHTML = '<option value="">كل التصنيفات</option>' +
            categories.map(category => '<option value="' + esc(category) + '">' + esc(category) + '</option>').join('');
        categorySelect.value = categories.includes(selectedCategory) ? selectedCategory : '';
    }
    const fromSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('paymentMethodsFromMonth'));
    const toSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('paymentMethodsToMonth'));
    if (fromSelect && toSelect && Array.isArray(months) && months.length) {
        const selectedFrom = fromSelect.value;
        const selectedTo = toSelect.value;
        const options = months.map(month => '<option value="' + esc(month) + '">' + esc(month) + '</option>').join('');
        fromSelect.innerHTML = options;
        toSelect.innerHTML = options;
        const fallbackFrom = months[Math.max(0, months.length - PAYMENT_METHOD_SPLIT_DEFAULT_MONTHS)];
        fromSelect.value = months.includes(selectedFrom) ? selectedFrom : fallbackFrom;
        toSelect.value = months.includes(selectedTo) ? selectedTo : (months.includes(current) ? current : months[months.length - 1]);
    }
    const methodSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('paymentMethodsMethod'));
    if (methodSelect) {
        const methods = Array.from(new Set((Array.isArray(state.income) ? state.income : [])
            .map(payment => String(payment.paymentMethod || '').trim())))
            .sort();
        const selectedMethod = methodSelect.value;
        methodSelect.innerHTML = '<option value="">كل الطرق</option>' +
            methods.map(code => '<option value="' + esc(code) + '">' +
                esc(typeof getIncomePaymentMethodLabel === 'function' ? getIncomePaymentMethodLabel(code) : (code || 'غير محدد')) + '</option>').join('');
        methodSelect.value = methods.includes(selectedMethod) ? selectedMethod : '';
    }
}

function initInsightsReportsUI() {
    populateInsightsReportFilters();
}

function invalidateInsightsReportsIfStale() {
    invalidatePayerBehaviorIfStale();
    invalidateExpenseVarianceIfStale();
    invalidatePaymentMethodsIfStale();
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

let expenseVarianceSnapshot = null;
let expenseVarianceSignature = '';
const EXPENSE_VARIANCE_SIGNATURE_PREFIX = 'built:';
const EXPENSE_VARIANCE_ACTION_IDS = ['expenseVariancePrintBtn', 'expenseVariancePdfBtn', 'expenseVarianceCsvBtn', 'expenseVarianceExcelBtn'];

function expenseVarianceFlagLabel(row) {
    if (row.flag === 'up') return { text: 'ارتفاع ' + fmtNum(row.variancePct) + '%', tone: 'rose' };
    if (row.flag === 'down') return { text: 'انخفاض ' + fmtNum(Math.abs(row.variancePct)) + '%', tone: 'emerald' };
    if (row.flag === 'new') return { text: 'تصنيف جديد', tone: 'amber' };
    return { text: 'ضمن المتوسط', tone: '' };
}

function getExpenseVarianceSelection() {
    return {
        month: insightsValue('expenseVarianceMonth'),
        category: insightsValue('expenseVarianceCategory')
    };
}

function getExpenseVarianceSignature() {
    const selection = getExpenseVarianceSelection();
    return `${selection.month}/${selection.category}/${insightsDataFingerprint()}`;
}

function setExpenseVarianceActions(enabled) {
    insightsSetActions(EXPENSE_VARIANCE_ACTION_IDS, enabled);
}

function clearExpenseVariancePreview(message) {
    insightsClearPreview('expenseVariancePreview', message, EXPENSE_VARIANCE_ACTION_IDS);
    if (typeof destroyChartsInContainer === 'function') destroyChartsInContainer('insightsExpenseVarianceChartContainer');
}

function invalidateExpenseVariancePreview() {
    if (!expenseVarianceSnapshot) return;
    expenseVarianceSnapshot = null;
    clearExpenseVariancePreview('غيّرت الفلاتر المعاينة. اضغط «معاينة» لتحديث التقرير.');
}

function isExpenseVarianceCurrent() {
    return Boolean(expenseVarianceSnapshot) && expenseVarianceSignature === EXPENSE_VARIANCE_SIGNATURE_PREFIX + getExpenseVarianceSignature();
}

function invalidateExpenseVarianceIfStale() {
    if (!expenseVarianceSnapshot) return;
    if (!isExpenseVarianceCurrent()) invalidateExpenseVariancePreview();
}

function expenseVarianceStatItems(report) {
    const money = cents => fmtMoney(cents / 100);
    return [
        { label: 'مصروفات ' + report.month, text: money(report.totals.currentCents) },
        { label: 'متوسط 6 أشهر', text: money(report.totals.baselineAvgCents) },
        { label: 'صافي الانحراف', text: money(report.totals.currentCents - report.totals.baselineAvgCents),
            tone: report.totals.currentCents > report.totals.baselineAvgCents ? 'rose' : 'emerald' },
        { label: 'تصنيفات منحرفة', text: fmtNum(report.flaggedCount), tone: report.flaggedCount ? 'amber' : 'emerald' }
    ];
}

function expenseVarianceChartRows(report) {
    return report.rows.filter(row => row.varianceCents !== 0).slice(0, 12);
}

function renderExpenseVarianceHtml(report) {
    const stats = renderReportStatTiles(expenseVarianceStatItems(report), true);
    const money = cents => fmtMoney(cents / 100);
    const rows = report.rows.map(row => {
        const flag = expenseVarianceFlagLabel(row);
        return [
            esc(row.category),
            fmtNum(row.currentCount),
            money(row.currentCents),
            money(row.baselineAvgCents),
            row.varianceCents > 0
                ? '<span class="sheet-negative">+' + money(row.varianceCents) + '</span>'
                : (row.varianceCents < 0 ? '<span class="sheet-positive">' + money(row.varianceCents) + '</span>' : money(0)),
            row.variancePct === null ? '—' : (row.variancePct > 0 ? '+' : '') + fmtNum(row.variancePct) + '%',
            '<span class="sheet-' + (flag.tone || 'muted') + '">' + esc(flag.text) + '</span>'
        ];
    });
    const chartRows = expenseVarianceChartRows(report);
    const hasChartData = chartRows.length > 0;
    return [
        '<div class="report-preview-flow" dir="rtl">',
        renderReportHeader('تقرير انحراف المصروفات · ' + (state.buildingName || 'العمارة'), [
            'شهر ' + esc(report.month) + ' مقابل متوسط ' + fmtNum(report.baselineMonths) + ' أشهر سابقة • ' +
            fmtNum(report.rows.length) + ' تصنيف • ' + fmtNum(report.flaggedCount) + ' منحرف'
        ]),
        stats,
        renderSheetBlock('الانحراف لكل تصنيف', ['التصنيف', 'قيود الشهر', 'مصروف الشهر', 'متوسط 6 أشهر', 'الانحراف', 'النسبة', 'الحالة'], rows, {
            empty: 'لا توجد مصروفات مطابقة للفلاتر.',
            numeric: [1, 2, 3, 4, 5], tableClass: 'statement-table',
            foot: ['الإجمالي', '',
                money(report.totals.currentCents),
                money(report.totals.baselineAvgCents),
                money(report.totals.currentCents - report.totals.baselineAvgCents),
                '—', '—']
        }),
        renderChartFoldContainer('insightsExpenseVarianceChartContainer', 'التصور البياني - الانحراف بالجنيه لكل تصنيف (الأكبر أولًا)', {
            hasData: hasChartData,
            empty: 'لا توجد انحرافات لعرض الرسم.',
            summary: hasChartData ? [
                { label: 'تصنيفات منحرفة', text: fmtNum(report.flaggedCount), tone: report.flaggedCount ? 'amber' : 'emerald' },
                { label: 'صافي الانحراف', cents: report.totals.currentCents - report.totals.baselineAvgCents,
                    tone: report.totals.currentCents > report.totals.baselineAvgCents ? 'rose' : 'emerald' }
            ] : []
        }),
        renderReportNotes([
            '<p>المتوسط من المصروفات المسجلة في الأشهر الستة السابقة للشهر المحدد مقسومة على ' + fmtNum(report.baselineMonths) +
                '؛ شهر بلا مصروفات يُحسب صفرًا. «منحرف» يعني تغيّرًا ' + fmtNum(EXPENSE_VARIANCE_FLAG_PCT) + '% أو أكثر عن المتوسط، و«تصنيف جديد» تصنيفًا بلا متوسط سابق.</p>'
        ])
    ].join('');
}

function drawExpenseVarianceChart(report) {
    if (!document.getElementById('insightsExpenseVarianceChartContainer')) return;
    const chartRows = expenseVarianceChartRows(report);
    if (!chartRows.length) return;
    if (typeof createChartContainer !== 'function' || typeof renderBarValues !== 'function') return;
    const canvas = createChartContainer('insightsExpenseVarianceChartContainer', 'expenseVarianceChart', 220);
    if (canvas && typeof canvas.setAttribute === 'function') {
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'مخطط انحراف المصروفات بالجنيه لكل تصنيف؛ البيانات نفسها متاحة في الجدول أعلاه');
    }
    renderBarValues('expenseVarianceChart',
        chartRows.map(row => row.category),
        chartRows.map(row => Math.round(row.varianceCents / 100)),
        insightsChartColor('amber'), 'الانحراف (ج.م)');
}

function generateExpenseVarianceReport() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const selection = getExpenseVarianceSelection();
    const report = buildExpenseVarianceReport(selection.month, selection.category);
    if (!report) {
        clearExpenseVariancePreview('تعذر بناء التقرير من البيانات الحالية.');
        return;
    }
    expenseVarianceSnapshot = report;
    expenseVarianceSignature = EXPENSE_VARIANCE_SIGNATURE_PREFIX + getExpenseVarianceSignature();
    const preview = document.getElementById('expenseVariancePreview');
    if (preview) preview.innerHTML = renderExpenseVarianceHtml(report);
    markReportPreviewStale('expenseVariancePreview', false);
    setExpenseVarianceActions(true);
    drawExpenseVarianceChart(report);
    if (typeof syncReportNavStatus === 'function') syncReportNavStatus();
}

function getSelectedExpenseVarianceSnapshot() {
    if (!isExpenseVarianceCurrent()) {
        if (expenseVarianceSnapshot) invalidateExpenseVariancePreview();
        return null;
    }
    return expenseVarianceSnapshot;
}

function printExpenseVarianceReport() {
    const report = getSelectedExpenseVarianceSnapshot();
    if (!report) return;
    printInsightsReport('print-expense-variance', 'تقرير انحراف المصروفات',
        'شهر ' + report.month + ' مقابل متوسط ' + fmtNum(report.baselineMonths) + ' أشهر');
}

function expenseVarianceCsvRows(report) {
    const money = cents => (cents / 100);
    return [
        ['تقرير انحراف المصروفات'],
        ['الشهر', report.month, 'المقارنة', 'متوسط ' + report.baselineMonths + ' أشهر سابقة'],
        [],
        ['التصنيف', 'قيود الشهر', 'مصروف الشهر', 'متوسط 6 أشهر', 'الانحراف', 'النسبة %', 'الحالة'],
        ...report.rows.map(row => [
            row.category,
            row.currentCount,
            money(row.currentCents),
            money(row.baselineAvgCents),
            money(row.varianceCents),
            row.variancePct === null ? '' : row.variancePct,
            expenseVarianceFlagLabel(row).text
        ]),
        [],
        ['الإجمالي', '', money(report.totals.currentCents), money(report.totals.baselineAvgCents),
            money(report.totals.currentCents - report.totals.baselineAvgCents), '', '']
    ];
}

function exportExpenseVarianceCsv() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const report = getSelectedExpenseVarianceSnapshot();
    if (!report) return;
    downloadCsv('manzil_expense_variance_' + report.monthKey.slice(0, 7) + '.csv', expenseVarianceCsvRows(report));
}

function exportExpenseVarianceExcel() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const report = getSelectedExpenseVarianceSnapshot();
    if (!report) return;
    exportReportExcel('manzil_expense_variance_' + report.monthKey.slice(0, 7), [
        { name: 'انحراف المصروفات', rows: expenseVarianceCsvRows(report), options: { autoFilter: true, freezeHeader: true, columnWidths: [22, 12, 14, 14, 14, 10, 16] } },
        { name: 'الملخص', rows: [['البند', 'القيمة'],
            ['الشهر', report.month],
            ['مصروف الشهر', report.totals.currentCents / 100],
            ['متوسط 6 أشهر', report.totals.baselineAvgCents / 100],
            ['صافي الانحراف', (report.totals.currentCents - report.totals.baselineAvgCents) / 100],
            ['تصنيفات منحرفة', report.flaggedCount]] }
    ]);
}

function renderExpenseVariancePdfHtml(report) {
    const generatedLabel = formatDate(new Date().toISOString());
    const money = cents => fmtMoney(cents / 100);
    const rows = report.rows.map(row => {
        const flag = expenseVarianceFlagLabel(row);
        return [
            '<tr>',
            statementPdfHeadCell(esc(row.category)),
            statementPdfCell(money(row.currentCents)),
            statementPdfCell(money(row.baselineAvgCents)),
            statementPdfCell((row.varianceCents > 0 ? '+' : '') + money(row.varianceCents)),
            statementPdfCell(row.variancePct === null ? '—' : (row.variancePct > 0 ? '+' : '') + fmtNum(row.variancePct) + '%'),
            statementPdfCell(esc(flag.text)),
            '</tr>'
        ].join('');
    }).join('');
    return [
        reportPdfDocumentOpen(),
        reportPdfHeader(['تقرير انحراف المصروفات'], [
            'شهر ' + esc(report.month) + ' مقابل متوسط ' + fmtNum(report.baselineMonths) + ' أشهر سابقة',
            fmtNum(report.rows.length) + ' تصنيف • ' + fmtNum(report.flaggedCount) + ' منحرف'
        ]),
        reportPdfSection('الملخص', reportPdfSummaryTable(expenseVarianceStatItems(report))),
        reportPdfSection('الانحراف لكل تصنيف', reportPdfTable(
            ['التصنيف', 'مصروف الشهر', 'متوسط 6 أشهر', 'الانحراف', 'النسبة', 'الحالة'],
            rows || reportPdfEmptyRow(6, 'لا توجد مصروفات مطابقة للفلاتر.'),
            ['الإجمالي', money(report.totals.currentCents), money(report.totals.baselineAvgCents),
                (report.totals.currentCents > report.totals.baselineAvgCents ? '+' : '') +
                money(report.totals.currentCents - report.totals.baselineAvgCents), '—', '—']
        )),
        reportPdfFooter(generatedLabel),
        '</div>'
    ].join('');
}

async function exportExpenseVariancePdf() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const report = getSelectedExpenseVarianceSnapshot();
    if (!report) return;
    await downloadStatementPdf(renderExpenseVariancePdfHtml(report),
        'manzil_expense_variance_' + report.monthKey.slice(0, 7) + '.pdf',
        'expenseVariancePdfBtn', 'تم تنزيل تقرير انحراف المصروفات', 'expense variance pdf',
        () => Boolean(expenseVarianceSnapshot));
}

/* ============================================================
   تقرير توزيع طرق الدفع: حصة كل طريقة من التحصيلات خلال فترة
   ============================================================ */

const PAYMENT_METHOD_SPLIT_DEFAULT_MONTHS = 6;

/**
 * يبني نموذج توزيع طرق الدفع من سجل التحصيلات خلال فترة شهرية.
 * @param {string} fromMonth أول شهر (فارغًا: 6 أشهر حتى الشهر الحالي)
 * @param {string} toMonth آخر شهر (فارغًا: الشهر الحالي)
 * @param {string} methodFilter رمز طريقة محددة أو فارغ للكل
 */
function buildPaymentMethodsReport(fromMonth = '', toMonth = '', methodFilter = '') {
    const currentKey = monthLabelToKey(getCurrentMonth());
    if (!currentKey) return null;
    const toKey = monthLabelToKey(toMonth) || currentKey;
    const fromKey = monthLabelToKey(fromMonth) || insightsShiftMonthKey(toKey, -(PAYMENT_METHOD_SPLIT_DEFAULT_MONTHS - 1));
    if (!fromKey || !toKey || fromKey > toKey) return null;
    const income = (Array.isArray(state.income) ? state.income : []).filter(payment => {
        const key = monthLabelToKey(payment.month);
        return key && key >= fromKey && key <= toKey;
    });
    const methodCode = payment => String(payment.paymentMethod || '').trim();
    const filtered = methodFilter ? income.filter(payment => methodCode(payment) === methodFilter) : income;
    const methodTotals = new Map();
    const monthly = new Map();
    filtered.forEach(payment => {
        const code = methodCode(payment);
        const label = typeof getIncomePaymentMethodLabel === 'function' ? getIncomePaymentMethodLabel(payment.paymentMethod) : (code || 'غير محدد');
        const cents = toCents(payment.amount);
        const entry = methodTotals.get(code) || { code, label, count: 0, cents: 0 };
        entry.count += 1;
        entry.cents += cents;
        methodTotals.set(code, entry);
        const monthKey = monthLabelToKey(payment.month);
        const monthRow = monthly.get(monthKey) || { key: monthKey, count: 0, cents: 0, byMethod: new Map() };
        monthRow.count += 1;
        monthRow.cents += cents;
        monthRow.byMethod.set(code, (monthRow.byMethod.get(code) || 0) + cents);
        monthly.set(monthKey, monthRow);
    });
    const totalCents = Array.from(methodTotals.values()).reduce((sum, entry) => sum + entry.cents, 0);
    const rows = Array.from(methodTotals.values())
        .map(entry => ({
            ...entry,
            pct: totalCents ? Math.round((entry.cents / totalCents) * 100) : 0
        }))
        .sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label, 'ar'));
    const methodKeys = rows.map(row => row.code);
    const months = Array.from(monthly.values())
        .sort((a, b) => a.key.localeCompare(b.key))
        .map(row => ({
            key: row.key,
            label: typeof getStatementMonthLabel === 'function' ? getStatementMonthLabel(row.key) : row.key,
            count: row.count,
            cents: row.cents,
            byMethod: Object.fromEntries(methodKeys.map(code => [code, row.byMethod.get(code) || 0]))
        }));
    return {
        fromKey,
        toKey,
        fromLabel: typeof getStatementMonthLabel === 'function' ? getStatementMonthLabel(fromKey) : fromKey,
        toLabel: typeof getStatementMonthLabel === 'function' ? getStatementMonthLabel(toKey) : toKey,
        methodFilter,
        rows,
        methodKeys,
        months,
        totals: {
            count: rows.reduce((sum, row) => sum + row.count, 0),
            cents: totalCents,
            methodCount: rows.length,
            topMethod: rows.length ? rows[0].label : '—',
            topPct: rows.length ? rows[0].pct : 0
        }
    };
}

let paymentMethodsSnapshot = null;
let paymentMethodsSignature = '';
const PAYMENT_METHODS_SIGNATURE_PREFIX = 'built:';
const PAYMENT_METHODS_ACTION_IDS = ['paymentMethodsPrintBtn', 'paymentMethodsPdfBtn', 'paymentMethodsCsvBtn', 'paymentMethodsExcelBtn'];

function getPaymentMethodsSelection() {
    return {
        from: insightsValue('paymentMethodsFromMonth'),
        to: insightsValue('paymentMethodsToMonth'),
        method: insightsValue('paymentMethodsMethod')
    };
}

function getPaymentMethodsSignature() {
    const selection = getPaymentMethodsSelection();
    return `${selection.from}/${selection.to}/${selection.method}/${insightsDataFingerprint()}`;
}

function setPaymentMethodsActions(enabled) {
    insightsSetActions(PAYMENT_METHODS_ACTION_IDS, enabled);
}

function clearPaymentMethodsPreview(message) {
    insightsClearPreview('paymentMethodsPreview', message, PAYMENT_METHODS_ACTION_IDS);
    if (typeof destroyChartsInContainer === 'function') destroyChartsInContainer('insightsPaymentMethodsChartContainer');
}

function invalidatePaymentMethodsPreview() {
    if (!paymentMethodsSnapshot) return;
    paymentMethodsSnapshot = null;
    clearPaymentMethodsPreview('غيّرت الفلاتر المعاينة. اضغط «معاينة» لتحديث التقرير.');
}

function isPaymentMethodsCurrent() {
    return Boolean(paymentMethodsSnapshot) && paymentMethodsSignature === PAYMENT_METHODS_SIGNATURE_PREFIX + getPaymentMethodsSignature();
}

function invalidatePaymentMethodsIfStale() {
    if (!paymentMethodsSnapshot) return;
    if (!isPaymentMethodsCurrent()) invalidatePaymentMethodsPreview();
}

function paymentMethodsStatItems(report) {
    const money = cents => fmtMoney(cents / 100);
    return [
        { label: 'إجمالي التحصيلات', text: money(report.totals.cents) },
        { label: 'عدد التحصيلات', text: fmtNum(report.totals.count) },
        { label: 'الطريقة الأعلى', text: report.totals.topMethod + ' · ' + fmtNum(report.totals.topPct) + '%', tone: 'indigo' },
        { label: 'طرق مستخدمة', text: fmtNum(report.totals.methodCount) }
    ];
}

function paymentMethodsMethodLabel(report, code) {
    const row = report.rows.find(entry => entry.code === code);
    if (row) return row.label;
    return typeof getIncomePaymentMethodLabel === 'function' ? getIncomePaymentMethodLabel(code) : (code || 'غير محدد');
}

function renderPaymentMethodsHtml(report) {
    const stats = renderReportStatTiles(paymentMethodsStatItems(report), true);
    const money = cents => fmtMoney(cents / 100);
    const rows = report.rows.map(row => [
        esc(row.label),
        fmtNum(row.count),
        money(row.cents),
        '<span class="sheet-indigo">' + fmtNum(row.pct) + '%</span>'
    ]);
    const monthHeaders = ['الشهر', ...report.methodKeys.map(code => paymentMethodsMethodLabel(report, code)), 'الإجمالي'];
    const monthRows = report.months.map(month => [
        esc(month.label),
        ...report.methodKeys.map(code => month.byMethod[code] ? money(month.byMethod[code]) : '—'),
        money(month.cents)
    ]);
    const chartRows = report.rows;
    const hasChartData = chartRows.length > 0;
    return [
        '<div class="report-preview-flow" dir="rtl">',
        renderReportHeader('تقرير توزيع طرق الدفع · ' + (state.buildingName || 'العمارة'), [
            'الفترة ' + esc(report.fromLabel) + ' — ' + esc(report.toLabel) + ' • ' +
            fmtNum(report.totals.count) + ' تحصيل • ' + fmtNum(report.totals.methodCount) + ' طرق'
        ]),
        stats,
        renderSheetBlock('حصة كل طريقة', ['طريقة الدفع', 'عدد التحصيلات', 'المبلغ', 'الحصة'], rows, {
            empty: 'لا توجد تحصيلات في هذه الفترة.',
            numeric: [1, 2, 3], tableClass: 'statement-table',
            foot: ['الإجمالي', fmtNum(report.totals.count), money(report.totals.cents), '100%']
        }),
        renderSheetBlock('التوزيع الشهري', monthHeaders, monthRows, {
            empty: 'لا توجد أشهر محسوبة.',
            numeric: monthHeaders.map((_, index) => index).slice(1), tableClass: 'statement-table',
            foot: ['الإجمالي', ...report.methodKeys.map(code => {
                const row = report.rows.find(entry => entry.code === code);
                return row && row.cents ? money(row.cents) : '—';
            }), money(report.totals.cents)]
        }),
        renderChartFoldContainer('insightsPaymentMethodsChartContainer', 'التصور البياني - حصة كل طريقة من المبلغ', {
            hasData: hasChartData,
            empty: 'لا توجد تحصيلات لعرض الرسم.',
            summary: hasChartData ? [
                { label: 'الطريقة الأعلى', text: report.totals.topMethod + ' · ' + fmtNum(report.totals.topPct) + '%', tone: 'indigo' },
                { label: 'إجمالي التحصيلات', cents: report.totals.cents }
            ] : []
        }),
        renderReportNotes([
            '<p>الحصة نسبة مبلغ الطريقة من إجمالي التحصيلات خلال الفترة. التحصيل بلا طريقة موثقة يظهر تحت «غير محدد».</p>'
        ])
    ].join('');
}

function drawPaymentMethodsChart(report) {
    if (!document.getElementById('insightsPaymentMethodsChartContainer')) return;
    if (!report.rows.length) return;
    if (typeof createChartContainer !== 'function' || typeof renderBarValues !== 'function') return;
    const canvas = createChartContainer('insightsPaymentMethodsChartContainer', 'paymentMethodsChart', 220);
    if (canvas && typeof canvas.setAttribute === 'function') {
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'مخطط حصة كل طريقة دفع من إجمالي التحصيلات؛ البيانات نفسها متاحة في الجدول أعلاه');
    }
    renderBarValues('paymentMethodsChart',
        report.rows.map(row => row.label),
        report.rows.map(row => row.pct),
        insightsChartColor('indigo'), 'الحصة %');
}

function generatePaymentMethodsReport() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const selection = getPaymentMethodsSelection();
    const report = buildPaymentMethodsReport(selection.from, selection.to, selection.method);
    if (!report) {
        clearPaymentMethodsPreview('تعذر بناء التقرير: تحقق أن «من شهر» لا يتجاوز «إلى شهر».');
        return;
    }
    paymentMethodsSnapshot = report;
    paymentMethodsSignature = PAYMENT_METHODS_SIGNATURE_PREFIX + getPaymentMethodsSignature();
    const preview = document.getElementById('paymentMethodsPreview');
    if (preview) preview.innerHTML = renderPaymentMethodsHtml(report);
    markReportPreviewStale('paymentMethodsPreview', false);
    setPaymentMethodsActions(true);
    drawPaymentMethodsChart(report);
    if (typeof syncReportNavStatus === 'function') syncReportNavStatus();
}

function getSelectedPaymentMethodsSnapshot() {
    if (!isPaymentMethodsCurrent()) {
        if (paymentMethodsSnapshot) invalidatePaymentMethodsPreview();
        return null;
    }
    return paymentMethodsSnapshot;
}

function printPaymentMethodsReport() {
    const report = getSelectedPaymentMethodsSnapshot();
    if (!report) return;
    printInsightsReport('print-payment-methods', 'تقرير توزيع طرق الدفع',
        'الفترة ' + report.fromLabel + ' — ' + report.toLabel);
}

function paymentMethodsCsvRows(report) {
    const money = cents => (cents / 100);
    return [
        ['تقرير توزيع طرق الدفع'],
        ['من', report.fromLabel, 'إلى', report.toLabel],
        [],
        ['طريقة الدفع', 'عدد التحصيلات', 'المبلغ', 'الحصة %'],
        ...report.rows.map(row => [row.label, row.count, money(row.cents), row.pct]),
        [],
        ['الإجمالي', report.totals.count, money(report.totals.cents), 100],
        [],
        ['التوزيع الشهري'],
        ['الشهر', ...report.methodKeys.map(code => paymentMethodsMethodLabel(report, code)), 'الإجمالي'],
        ...report.months.map(month => [
            month.label,
            ...report.methodKeys.map(code => month.byMethod[code] ? money(month.byMethod[code]) : 0),
            money(month.cents)
        ])
    ];
}

function exportPaymentMethodsCsv() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const report = getSelectedPaymentMethodsSnapshot();
    if (!report) return;
    downloadCsv('manzil_payment_methods_' + report.fromKey.slice(0, 7) + '_' + report.toKey.slice(0, 7) + '.csv',
        paymentMethodsCsvRows(report));
}

function exportPaymentMethodsExcel() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const report = getSelectedPaymentMethodsSnapshot();
    if (!report) return;
    exportReportExcel('manzil_payment_methods_' + report.fromKey.slice(0, 7) + '_' + report.toKey.slice(0, 7), [
        { name: 'طرق الدفع', rows: paymentMethodsCsvRows(report), options: { autoFilter: true, freezeHeader: true, columnWidths: [22, 14, 14, 10] } },
        { name: 'الملخص', rows: [['البند', 'القيمة'],
            ['الفترة', report.fromLabel + ' — ' + report.toLabel],
            ['إجمالي التحصيلات', report.totals.cents / 100],
            ['عدد التحصيلات', report.totals.count],
            ['الطريقة الأعلى', report.totals.topMethod + ' · ' + report.totals.topPct + '%'],
            ['طرق مستخدمة', report.totals.methodCount]] }
    ]);
}

function renderPaymentMethodsPdfHtml(report) {
    const generatedLabel = formatDate(new Date().toISOString());
    const money = cents => fmtMoney(cents / 100);
    const rows = report.rows.map(row => [
        '<tr>',
        statementPdfHeadCell(esc(row.label)),
        statementPdfCell(fmtNum(row.count)),
        statementPdfCell(money(row.cents)),
        statementPdfCell(fmtNum(row.pct) + '%'),
        '</tr>'
    ].join('')).join('');
    return [
        reportPdfDocumentOpen(),
        reportPdfHeader(['تقرير توزيع طرق الدفع'], [
            'الفترة ' + esc(report.fromLabel) + ' — ' + esc(report.toLabel),
            fmtNum(report.totals.count) + ' تحصيل • ' + fmtNum(report.totals.methodCount) + ' طرق'
        ]),
        reportPdfSection('الملخص', reportPdfSummaryTable(paymentMethodsStatItems(report))),
        reportPdfSection('حصة كل طريقة', reportPdfTable(
            ['طريقة الدفع', 'عدد التحصيلات', 'المبلغ', 'الحصة'],
            rows || reportPdfEmptyRow(4, 'لا توجد تحصيلات في هذه الفترة.'),
            ['الإجمالي', fmtNum(report.totals.count), money(report.totals.cents), '100%']
        )),
        reportPdfFooter(generatedLabel),
        '</div>'
    ].join('');
}

async function exportPaymentMethodsPdf() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const report = getSelectedPaymentMethodsSnapshot();
    if (!report) return;
    await downloadStatementPdf(renderPaymentMethodsPdfHtml(report),
        'manzil_payment_methods_' + report.fromKey.slice(0, 7) + '_' + report.toKey.slice(0, 7) + '.pdf',
        'paymentMethodsPdfBtn', 'تم تنزيل تقرير توزيع طرق الدفع', 'payment methods pdf',
        () => Boolean(paymentMethodsSnapshot));
}

const INSIGHTS_REPORT_API = {
    buildPayerBehaviorReport,
    buildExpenseVarianceReport,
    buildPaymentMethodsReport,
    generatePaymentMethodsReport,
    getSelectedPaymentMethodsSnapshot,
    renderPaymentMethodsHtml,
    renderPaymentMethodsPdfHtml,
    paymentMethodsCsvRows,
    invalidatePaymentMethodsPreview,
    printPaymentMethodsReport,
    exportPaymentMethodsCsv,
    exportPaymentMethodsExcel,
    exportPaymentMethodsPdf,
    generateExpenseVarianceReport,
    getSelectedExpenseVarianceSnapshot,
    renderExpenseVarianceHtml,
    renderExpenseVariancePdfHtml,
    expenseVarianceCsvRows,
    invalidateExpenseVariancePreview,
    printExpenseVarianceReport,
    exportExpenseVarianceCsv,
    exportExpenseVarianceExcel,
    exportExpenseVariancePdf,
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

// تقارير التحليلات: سلوك السداد وانحراف المصروفات وتوزيع طرق الدفع تسجّل نفسها في فهرس التقارير.
