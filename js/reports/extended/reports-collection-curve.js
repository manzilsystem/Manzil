// @ts-check
/**
 * تقرير منحنى التحصيل — Manzil
 * يقيس سرعة تحصيل مستحقات كل شهر: النسبة التراكمية المحصّلة حتى يوم
 * الاستحقاق، نهاية السماح، منتصف الشهر، ونهايته، من تاريخ التحصيل الفعلي.
 * يُحمّل بعد js/reports.js وjs/reports/extended/reports-insights.js ويعتمد
 * فقط على دوالهما ودوال state.js حتى يعمل وحده في اختبارات الوحدة.
 * كل الحسابات قراءة فقط من state، بالقرش، وبنفس عقود المحاسبة المعتمدة.
 */

/* تسجيل التقرير في سجلات مركز التقارير دون تعديل js/reports.js */
if (typeof REPORT_TABS !== 'undefined' && Array.isArray(REPORT_TABS) && !REPORT_TABS.includes('collectionCurve')) {
    REPORT_TABS.push('collectionCurve');
    Object.assign(REPORT_PANEL_IDS, { collectionCurve: 'collectionCurvePanel' });
    Object.assign(REPORT_OUTPUT_BUTTON_IDS, { collectionCurve: 'collectionCurvePrintBtn' });
    Object.assign(REPORT_FILTER_DESCRIPTORS, {
        collectionCurve: [
            { id: 'collectionCurveFromMonth', label: 'من شهر' },
            { id: 'collectionCurveToMonth', label: 'إلى شهر' }
        ]
    });
}

const COLLECTION_CURVE_DEFAULT_MONTHS = 6;
const COLLECTION_CURVE_MAX_MONTHS = 12;
const COLLECTION_CURVE_SIGNATURE_PREFIX = 'built:';
const COLLECTION_CURVE_ACTION_IDS = ['collectionCurvePrintBtn', 'collectionCurvePdfBtn', 'collectionCurveCsvBtn', 'collectionCurveExcelBtn'];

let collectionCurveSnapshot = null;
let collectionCurveSignature = '';

function collectionCurveValue(id) {
    if (typeof document === 'undefined') return '';
    const element = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.getElementById(id));
    return String(element?.value || '');
}

function getCollectionCurveSelection() {
    return {
        from: collectionCurveValue('collectionCurveFromMonth'),
        to: collectionCurveValue('collectionCurveToMonth')
    };
}

function getCollectionCurveSignature() {
    const selection = getCollectionCurveSelection();
    const fingerprint = typeof insightsDataFingerprint === 'function' ? insightsDataFingerprint() : '';
    return `${selection.from}/${selection.to}/${fingerprint}`;
}

function setCollectionCurveActions(enabled) {
    if (typeof insightsSetActions === 'function') insightsSetActions(COLLECTION_CURVE_ACTION_IDS, enabled);
}

function clearCollectionCurvePreview(message) {
    if (typeof insightsClearPreview === 'function') {
        insightsClearPreview('collectionCurvePreview', message, COLLECTION_CURVE_ACTION_IDS);
    }
    if (typeof destroyChartsInContainer === 'function') destroyChartsInContainer('collectionCurveChartContainer');
}

function invalidateCollectionCurvePreview() {
    if (!collectionCurveSnapshot) return;
    collectionCurveSnapshot = null;
    clearCollectionCurvePreview('غيّرت الفلاتر المعاينة. اضغط «معاينة» لتحديث التقرير.');
}

function isCollectionCurveCurrent() {
    return Boolean(collectionCurveSnapshot) && collectionCurveSignature === COLLECTION_CURVE_SIGNATURE_PREFIX + getCollectionCurveSignature();
}

function invalidateCollectionCurveIfStale() {
    if (!collectionCurveSnapshot) return;
    if (!isCollectionCurveCurrent()) invalidateCollectionCurvePreview();
}

/** مسح فلاتر منحنى التحصيل دون المساس بالسجلات المالية. */
function clearCollectionCurveFilters() {
    ['collectionCurveFromMonth', 'collectionCurveToMonth'].forEach(id => {
        const element = /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
        if (element) element.value = '';
    });
    populateCollectionCurveFilters();
    invalidateCollectionCurvePreview();
    if (typeof syncReportNavStatus === 'function') syncReportNavStatus();
}

function populateCollectionCurveFilters(months, current = getCurrentMonth()) {
    const options = Array.isArray(months) && months.length ? months
        : (typeof getBuildingMonthOptions === 'function' ? getBuildingMonthOptions(12) : [current]);
    const fromSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('collectionCurveFromMonth'));
    const toSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('collectionCurveToMonth'));
    if (!fromSelect || !toSelect || !options.length) return;
    const selectedFrom = fromSelect.value;
    const selectedTo = toSelect.value;
    const html = options.map(month => '<option value="' + esc(month) + '">' + esc(month) + '</option>').join('');
    fromSelect.innerHTML = html;
    toSelect.innerHTML = html;
    const fallbackFrom = options[Math.max(0, options.length - COLLECTION_CURVE_DEFAULT_MONTHS)];
    fromSelect.value = options.includes(selectedFrom) ? selectedFrom : fallbackFrom;
    toSelect.value = options.includes(selectedTo) ? selectedTo : (options.includes(current) ? current : options[options.length - 1]);
}

function collectionCurveShiftMonthKey(key, offset) {
    const date = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function collectionCurveRule() {
    return {
        dueDay: Math.min(28, Math.max(1, Number(state.subscriptionDueDay) || 1)),
        graceDays: Math.min(31, Math.max(0, Number(state.subscriptionGraceDays) || 0))
    };
}

/**
 * يبني منحنى التحصيل التراكمي لكل شهر في الفترة.
 * التحصيل المؤرخ داخل شهر الاستحقاق يدخل المنحنى بيومه، والمحصّل بعد
 * نهاية الشهر يظهر في «المحصّل حتى الآن» دون نقاط المنحنى، والتحصيل
 * بلا تاريخ موثق يدخل الإجمالي فقط ويُذكر في الملاحظات.
 * @param {string} fromMonth أول شهر (تسمية عربية) أو فارغ لآخر 6 أشهر
 * @param {string} toMonth آخر شهر أو فارغ للشهر الحالي
 * @param {Date} [now] مرجع «اليوم» لقابلية الاختبار
 */
function buildCollectionCurveReport(fromMonth = '', toMonth = '', now = new Date()) {
    const currentKey = monthLabelToKey(getCurrentMonth());
    if (!currentKey) return null;
    const toKey0 = monthLabelToKey(toMonth) || currentKey;
    const toKey = toKey0 > currentKey ? currentKey : toKey0;
    const fromKey = monthLabelToKey(fromMonth) || collectionCurveShiftMonthKey(toKey, -(COLLECTION_CURVE_DEFAULT_MONTHS - 1));
    if (!fromKey || !toKey || fromKey > toKey) return null;
    const monthKeys = [];
    for (let key = fromKey; key <= toKey && monthKeys.length < COLLECTION_CURVE_MAX_MONTHS + 24; key = collectionCurveShiftMonthKey(key, 1)) {
        monthKeys.push(key);
    }
    if (monthKeys.length > COLLECTION_CURVE_MAX_MONTHS) return null;
    const rule = collectionCurveRule();
    const milestones = [
        { id: 'due', label: 'حتى يوم الاستحقاق', day: rule.dueDay },
        { id: 'grace', label: 'حتى نهاية السماح', day: Math.min(28, rule.dueDay + rule.graceDays) },
        { id: 'mid', label: 'حتى منتصف الشهر', day: 15 },
        { id: 'end', label: 'حتى نهاية الشهر', day: 28 }
    ].sort((a, b) => a.day - b.day);
    const income = Array.isArray(state.income) ? state.income : [];
    const residents = Array.isArray(state.residents) ? state.residents : [];
    const rows = [];
    let undatedCount = 0;
    monthKeys.forEach(key => {
        const monthLabel = monthKeyToLabel(key);
        const dueCents = residents.reduce((sum, resident) => {
            if (typeof isResidentActiveInMonth === 'function' && !isResidentActiveInMonth(resident, key)) return sum;
            return sum + toCents(getMonthlyDueAmountForMonth(resident, monthLabel));
        }, 0);
        if (dueCents <= 0) return;
        const payments = income.filter(payment =>
            monthLabelToKey(payment.month) === key &&
            (typeof getIncomePurposeFormCode === 'function' ? getIncomePurposeFormCode(payment.purposeCode) : 'subscription') === 'subscription'
        );
        const monthPrefix = key.slice(0, 7);
        const within = [];
        let afterCents = 0;
        let undatedCents = 0;
        payments.forEach(payment => {
            const cents = toCents(payment.amount);
            const date = String(payment.date || '').trim();
            if (!date) {
                undatedCents += cents;
                undatedCount += 1;
                return;
            }
            if (date.slice(0, 7) < monthPrefix) {
                // سداد مبكر قبل بداية شهر الاستحقاق: محسوب من أول نقطة في المنحنى.
                within.push({ day: 1, cents });
            } else if (date.slice(0, 7) === monthPrefix) {
                within.push({ day: Math.min(28, Math.max(1, Number(date.slice(8, 10)) || 1)), cents });
            } else {
                afterCents += cents;
            }
        });
        const cumulative = milestones.map(milestone => {
            const cents = within
                .filter(payment => payment.day <= milestone.day)
                .reduce((sum, payment) => sum + payment.cents, 0);
            return { id: milestone.id, label: milestone.label, day: milestone.day, cents, pct: Math.min(100, Math.round((cents / dueCents) * 100)) };
        });
        const withinCents = within.reduce((sum, payment) => sum + payment.cents, 0);
        const paidCents = withinCents + afterCents + undatedCents;
        rows.push({
            key,
            label: typeof getStatementMonthLabel === 'function' ? getStatementMonthLabel(key) : monthLabel,
            dueCents,
            milestones: cumulative,
            withinCents,
            afterCents,
            undatedCents,
            paidCents,
            paidPct: Math.min(100, Math.round((paidCents / dueCents) * 100)),
            outstandingCents: Math.max(0, dueCents - paidCents)
        });
    });
    const totals = rows.reduce((acc, row) => {
        acc.dueCents += row.dueCents;
        acc.paidCents += row.paidCents;
        acc.outstandingCents += row.outstandingCents;
        return acc;
    }, { dueCents: 0, paidCents: 0, outstandingCents: 0 });
    const averageCurve = milestones.map((milestone, index) => ({
        label: milestone.label,
        pct: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.milestones[index].pct, 0) / rows.length) : 0
    }));
    const avgEndPct = rows.length
        ? Math.round(rows.reduce((sum, row) => sum + row.milestones[row.milestones.length - 1].pct, 0) / rows.length)
        : 0;
    return {
        fromKey,
        toKey,
        fromLabel: typeof getStatementMonthLabel === 'function' ? getStatementMonthLabel(fromKey) : fromKey,
        toLabel: typeof getStatementMonthLabel === 'function' ? getStatementMonthLabel(toKey) : toKey,
        rule,
        milestones,
        rows,
        averageCurve,
        avgEndPct,
        undatedCount,
        totals
    };
}

function collectionCurveStatItems(report) {
    const money = cents => fmtMoney(cents / 100);
    return [
        { label: 'إجمالي المستحق', text: money(report.totals.dueCents) },
        { label: 'إجمالي المحصّل', text: money(report.totals.paidCents) },
        { label: 'متوسط التحصيل بنهاية الشهر', text: fmtNum(report.avgEndPct) + '%', tone: 'sky' },
        { label: 'المتبقي', text: money(report.totals.outstandingCents) }
    ];
}

function renderCollectionCurveHtml(report) {
    const stats = renderReportStatTiles(collectionCurveStatItems(report), true);
    const money = cents => fmtMoney(cents / 100);
    const pct = value => '<span class="sheet-sky">' + fmtNum(value) + '%</span>';
    const rows = report.rows.map(row => [
        esc(row.label),
        money(row.dueCents),
        pct(row.milestones[0].pct),
        pct(row.milestones[1].pct),
        pct(row.milestones[2].pct),
        pct(row.milestones[3].pct),
        pct(row.paidPct),
        money(row.outstandingCents)
    ]);
    const totalsRow = ['الإجمالي', money(report.totals.dueCents), '—', '—', '—', '—',
        report.totals.dueCents ? fmtNum(Math.min(100, Math.round((report.totals.paidCents / report.totals.dueCents) * 100))) + '%' : '—',
        money(report.totals.outstandingCents)];
    const hasChartData = report.rows.length > 0;
    const notes = [
        '<p>النقاط تقيس النسبة التراكمية من مستحق الشهر المحصّلة حتى كل موعد، من تاريخ التحصيل الفعلي. يوم الاستحقاق ' +
            fmtNum(report.rule.dueDay) + ' وفترة السماح ' + fmtNum(report.rule.graceDays) + ' يوم من إعدادات الاشتراك.</p>',
        '<p>التحصيل المؤرخ بعد نهاية شهر الاستحقاق يدخل «المحصّل حتى الآن» دون نقاط المنحنى.</p>'
    ];
    if (report.undatedCount > 0) {
        notes.push('<p>' + fmtNum(report.undatedCount) + ' تحصيل بلا تاريخ موثق دخل الإجمالي فقط ولم يدخل المنحنى.</p>');
    }
    return [
        '<div class="report-preview-flow" dir="rtl">',
        renderReportHeader('تقرير منحنى التحصيل · ' + (state.buildingName || 'العمارة'), [
            'الفترة ' + esc(report.fromLabel) + ' — ' + esc(report.toLabel) + ' • ' + fmtNum(report.rows.length) + ' شهر'
        ]),
        stats,
        renderSheetBlock('المنحنى التراكمي لكل شهر', ['الشهر', 'المستحق', 'يوم الاستحقاق', 'نهاية السماح', 'منتصف الشهر', 'نهاية الشهر', 'المحصّل حتى الآن', 'المتبقي'], rows, {
            empty: 'لا توجد مستحقات في هذه الفترة.',
            numeric: [1, 2, 3, 4, 5, 6, 7], tableClass: 'statement-table',
            foot: totalsRow
        }),
        renderChartFoldContainer('collectionCurveChartContainer', 'التصور البياني - متوسط المنحنى التراكمي عبر أشهر الفترة', {
            hasData: hasChartData,
            empty: 'لا توجد أشهر محسوبة لعرض الرسم.',
            summary: hasChartData ? [
                { label: 'متوسط التحصيل بنهاية الشهر', text: fmtNum(report.avgEndPct) + '%', tone: 'sky' },
                { label: 'إجمالي المحصّل', cents: report.totals.paidCents }
            ] : []
        }),
        renderReportNotes(notes)
    ].join('');
}

function drawCollectionCurveChart(report) {
    if (!document.getElementById('collectionCurveChartContainer')) return;
    if (!report.rows.length) return;
    if (typeof createChartContainer !== 'function' || typeof renderBarValues !== 'function') return;
    const canvas = createChartContainer('collectionCurveChartContainer', 'collectionCurveChart', 220);
    if (canvas && typeof canvas.setAttribute === 'function') {
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'مخطط متوسط النسبة التراكمية المحصّلة عند كل موعد؛ البيانات نفسها متاحة في الجدول أعلاه');
    }
    const color = typeof REPORT_CHART_COLORS !== 'undefined' && REPORT_CHART_COLORS
        ? (REPORT_CHART_COLORS.sky || REPORT_CHART_COLORS.indigo || 'currentColor')
        : 'currentColor';
    renderBarValues('collectionCurveChart',
        report.averageCurve.map(point => point.label.replace('حتى ', '')),
        report.averageCurve.map(point => point.pct),
        color, 'متوسط المحصّل %');
}

function generateCollectionCurveReport() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    const selection = getCollectionCurveSelection();
    const report = buildCollectionCurveReport(selection.from, selection.to);
    if (!report) {
        clearCollectionCurvePreview('تعذر بناء التقرير: اختر فترة لا تتجاوز ' + fmtNum(COLLECTION_CURVE_MAX_MONTHS) + ' شهرًا ولا يتجاوز فيها «من شهر» «إلى شهر».');
        return;
    }
    collectionCurveSnapshot = report;
    collectionCurveSignature = COLLECTION_CURVE_SIGNATURE_PREFIX + getCollectionCurveSignature();
    const preview = document.getElementById('collectionCurvePreview');
    if (preview) preview.innerHTML = renderCollectionCurveHtml(report);
    markReportPreviewStale('collectionCurvePreview', false);
    setCollectionCurveActions(true);
    drawCollectionCurveChart(report);
    if (typeof syncReportNavStatus === 'function') syncReportNavStatus();
}

function getSelectedCollectionCurveSnapshot() {
    if (!isCollectionCurveCurrent()) {
        if (collectionCurveSnapshot) invalidateCollectionCurvePreview();
        return null;
    }
    return collectionCurveSnapshot;
}

function printCollectionCurveReport() {
    const report = getSelectedCollectionCurveSnapshot();
    if (!report) return;
    if (typeof printInsightsReport === 'function') {
        printInsightsReport('print-collection-curve', 'تقرير منحنى التحصيل',
            'الفترة ' + report.fromLabel + ' — ' + report.toLabel);
    }
}

function collectionCurveCsvRows(report) {
    const rows = [['الشهر', 'المستحق', 'حتى يوم الاستحقاق %', 'حتى نهاية السماح %', 'حتى منتصف الشهر %', 'حتى نهاية الشهر %', 'المحصل حتى الآن %', 'المتبقي']];
    const money = cents => (cents / 100).toFixed(2);
    report.rows.forEach(row => {
        rows.push([
            row.label,
            money(row.dueCents),
            String(row.milestones[0].pct),
            String(row.milestones[1].pct),
            String(row.milestones[2].pct),
            String(row.milestones[3].pct),
            String(row.paidPct),
            money(row.outstandingCents)
        ]);
    });
    rows.push(['الإجمالي', money(report.totals.dueCents), '', '', '', '',
        report.totals.dueCents ? String(Math.min(100, Math.round((report.totals.paidCents / report.totals.dueCents) * 100))) : '',
        money(report.totals.outstandingCents)]);
    return rows;
}

function exportCollectionCurveCsv() {
    const report = getSelectedCollectionCurveSnapshot();
    if (!report) return;
    downloadCsv('manzil_collection_curve_' + report.fromKey.slice(0, 7) + '_' + report.toKey.slice(0, 7) + '.csv', collectionCurveCsvRows(report));
}

function exportCollectionCurveExcel() {
    const report = getSelectedCollectionCurveSnapshot();
    if (!report) return;
    exportReportExcel('manzil_collection_curve_' + report.fromKey.slice(0, 7) + '_' + report.toKey.slice(0, 7), [
        { name: 'منحنى التحصيل', rows: collectionCurveCsvRows(report) }
    ]);
}

function renderCollectionCurvePdfHtml(report) {
    return renderCollectionCurveHtml(report);
}

async function exportCollectionCurvePdf() {
    const report = getSelectedCollectionCurveSnapshot();
    if (!report) return;
    await downloadStatementPdf(renderCollectionCurvePdfHtml(report),
        'manzil_collection_curve_' + report.fromKey.slice(0, 7) + '_' + report.toKey.slice(0, 7) + '.pdf',
        'collectionCurvePdfBtn', 'تم تنزيل تقرير منحنى التحصيل', 'collection curve pdf',
        () => Boolean(collectionCurveSnapshot));
}

const COLLECTION_CURVE_REPORT_API = {
    buildCollectionCurveReport,
    renderCollectionCurveHtml,
    renderCollectionCurvePdfHtml,
    collectionCurveCsvRows,
    collectionCurveStatItems,
    getCollectionCurveSignature,
    generateCollectionCurveReport,
    getSelectedCollectionCurveSnapshot,
    invalidateCollectionCurvePreview,
    invalidateCollectionCurveIfStale,
    populateCollectionCurveFilters,
    clearCollectionCurveFilters,
    printCollectionCurveReport,
    exportCollectionCurveCsv,
    exportCollectionCurveExcel,
    exportCollectionCurvePdf
};

if (typeof window !== 'undefined') window.MANZIL_COLLECTION_CURVE_REPORT = COLLECTION_CURVE_REPORT_API;
