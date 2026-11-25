// @ts-check
let monthlyCloseLastReport = null;

const monthlyCloseAccounts = [
    { code: 'main', label: 'الخزنة الرئيسية' },
    { code: 'development', label: 'صندوق التطوير' },
    { code: 'emergency', label: 'صندوق الصيانة الطارئة' }
];

function invalidateMonthlyClosePreview() {
    monthlyCloseLastReport = null;
    const exportButton = /** @type {HTMLButtonElement} */ (document.getElementById('monthlyClosePdfButton'));
    if (exportButton) exportButton.disabled = true;
    const printButton = /** @type {HTMLButtonElement} */ (document.getElementById('monthlyClosePrintButton'));
    if (printButton) printButton.disabled = true;
    const status = document.getElementById('monthlyCloseReportStatus');
    if (status) status.textContent = 'تغيّر الشهر المحدد. أنشئ معاينة جديدة قبل التصدير.';
    destroyMonthlyCloseChart();
    const preview = document.getElementById('monthlyClosePreview');
    if (preview) preview.innerHTML = '<p class="report-preview-empty">اختر الشهر ثم اضغط «مراجعة الإقفال».</p>';
    markReportPreviewStale('monthlyClosePreview', true);
    syncReportNavStatus();
}

function monthlyCloseMoney(value) {
    const amount = Number(value);
    return fmtNum(Number.isFinite(amount) ? amount : 0);
}

function monthlyCloseChartColor(name) {
    return typeof REPORT_CHART_COLORS !== 'undefined' && REPORT_CHART_COLORS
        ? REPORT_CHART_COLORS[name]
        : 'currentColor';
}

function destroyMonthlyCloseChart() {
    if (typeof destroyChartsInContainer === 'function') destroyChartsInContainer('monthlyCloseChartContainer');
}

function getMonthlyCloseChart(data) {
    const money = value => monthlyCloseMoney(value) + ' ج.م';
    const rows = monthlyCloseAccounts.map(function (account) {
        const balance = Number((data.accounts[account.code] || {}).closing_balance || 0);
        return { label: account.label, value: Number.isFinite(balance) ? balance : 0 };
    });
    const hasData = typeof hasReportChartData === 'function'
        ? hasReportChartData(rows.map(row => row.value))
        : rows.some(row => row.value !== 0);
    const top = rows.reduce(function (best, row) {
        return !best || row.value > best.value ? row : best;
    }, null);
    return {
        rows,
        hasData,
        summary: hasData ? [
            { label: 'رصيد نهاية الشهر', text: money(data.totals.closing_balance) },
            { label: 'عدد الصناديق', text: fmtNum(rows.length) },
            { label: 'أعلى صندوق', text: top ? top.label : '—', note: top ? money(top.value) : '' },
            {
                label: 'حالة المطابقة',
                text: data.reconciled ? 'مطابق' : 'يحتاج مراجعة',
                tone: data.reconciled ? 'emerald' : 'amber'
            }
        ] : []
    };
}

async function drawMonthlyCloseChart(data) {
    if (!document.getElementById('monthlyCloseChartContainer')) return;
    const chart = getMonthlyCloseChart(data);
    if (!chart.hasData) return;
    if (typeof createChartContainer !== 'function' || typeof renderBarValues !== 'function') return;
    const canvas = createChartContainer('monthlyCloseChartContainer', 'monthlyCloseChart', 220);
    if (canvas && typeof canvas.setAttribute === 'function') {
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'مخطط أرصدة الصناديق في نهاية الشهر؛ البيانات نفسها متاحة في الجدول.');
    }
    await renderBarValues('monthlyCloseChart', chart.rows.map(row => row.label),
        chart.rows.map(row => row.value), monthlyCloseChartColor('sky'), 'رصيد نهاية الشهر',
        { horizontal: true, maintainAspectRatio: false });
}

function renderMonthlyClosePreview(report) {
    const totals = report.totals;
    const money = value => monthlyCloseMoney(value) + ' ج.م';
    const closeChart = getMonthlyCloseChart(report);
    const accountRows = monthlyCloseAccounts.map(function (account) {
        const row = report.accounts[account.code] || {};
        return [
            esc(account.label), money(row.opening_balance),
            '<span class="sheet-positive">' + money(row.income) + '</span>',
            '<span class="sheet-negative">' + money(row.expenses) + '</span>',
            money(row.transfers_in), money(row.transfers_out),
            money(row.net_movement), '<strong>' + money(row.closing_balance) + '</strong>'
        ];
    });

    return [
        '<div class="report-preview-flow" dir="rtl">',
        renderReportHeader('مراجعة الإقفال النقدي · ' + (state.buildingName || 'Manzil'), [
            'شهر ' + esc(report.month),
            'الفترة محسوبة بالتوقيت المحلي: ' + esc(report.time_zone)
        ]),
        renderReportStatTiles([
            { label: 'رصيد أول الشهر', text: money(totals.opening_balance) },
            { label: 'التحصيلات', text: money(totals.income), tone: 'emerald' },
            { label: 'المصروفات', text: money(totals.expenses), tone: 'rose' },
            { label: 'صافي الحركة', text: money(totals.net_movement) }
        ], true),
        renderSheetBlock('أرصدة الصناديق وحركتها',
            ['الصندوق', 'رصيد أول الشهر', 'التحصيلات', 'المصروفات', 'تحويلات واردة', 'تحويلات صادرة', 'صافي الحركة', 'رصيد آخر الشهر'],
            accountRows, {
                empty: 'لا توجد صناديق لعرضها.', numeric: [1, 2, 3, 4, 5, 6, 7],
                foot: ['الإجمالي', money(totals.opening_balance),
                    '<span class="sheet-positive">' + money(totals.income) + '</span>',
                    '<span class="sheet-negative">' + money(totals.expenses) + '</span>',
                    money(totals.transfers_in || 0), money(totals.transfers_out || 0),
                    money(totals.net_movement), money(totals.closing_balance)]
            }),
        '<p class="text-xs font-bold ', report.reconciled ? 'text-emerald-400' : 'text-rose-400', '" role="status">',
        report.reconciled ? '✓ إجمالي الصناديق مطابق للحركة النقدية.' : '⚠ يوجد فرق في المطابقة. راجع حركة الصناديق قبل اعتماد التقرير.',
        '</p>',
        renderChartFoldContainer('monthlyCloseChartContainer', 'التصور البياني - أرصدة الصناديق', {
            hasData: closeChart.hasData,
            empty: 'لا توجد أرصدة كافية لعرض الرسم.',
            summary: closeChart.summary
        }),
        renderReportNotes([
            '<p>إجمالي رصيد الصناديق في نهاية الشهر: <strong class="report-amount">' +
                money(totals.closing_balance) + '</strong>. التحويلات الداخلية لا تزيد أو تنقص إجمالي النقد.</p>',
            '<p>تعتمد المراجعة على تاريخ التحصيل الفعلي وتاريخ الصرف وتاريخ التحويل، لا على شهر استحقاق الاشتراك. ' +
                'هذه مراجعة للقراءة فقط؛ لا تقفل الشهر ولا تمنع التصحيح أو تسجيل الحركات اللاحقة.</p>'
        ]),
        '</div>'
    ].join('');
}

async function loadMonthlyCloseReport() {
    if (!requireManager()) return;
    if (!activeBuildingId || !supabaseClient) {
        toast('بيانات العمارة غير جاهزة. أعد تحميل التطبيق.', 'error');
        return;
    }

    const monthSelect = /** @type {HTMLSelectElement} */ (document.getElementById('monthlyCloseMonthSelect'));
    const preview = document.getElementById('monthlyClosePreview');
    const status = document.getElementById('monthlyCloseReportStatus');
    const reviewButton = /** @type {HTMLButtonElement} */ (document.getElementById('monthlyCloseReviewButton'));
    const exportButton = /** @type {HTMLButtonElement} */ (document.getElementById('monthlyClosePdfButton'));
    const monthKey = monthLabelToKey(monthSelect && monthSelect.value);

    if (!monthKey || !preview || !status) {
        toast('اختر شهرًا صحيحًا للمراجعة.', 'error');
        return;
    }

    monthlyCloseLastReport = null;
    if (exportButton) exportButton.disabled = true;
    if (reviewButton) reviewButton.disabled = true;
    status.textContent = 'جارٍ حساب الأرصدة والحركات من قاعدة البيانات...';
    destroyMonthlyCloseChart();
    preview.innerHTML = '<p class="report-preview-empty">جارٍ إعداد المراجعة الشهرية...</p>';
    markReportPreviewStale('monthlyClosePreview', false);
    syncReportNavStatus();

    const buildingId = activeBuildingId;
    try {
        const result = await supabaseClient.rpc('get_monthly_cashbox_close', {
            p_building_id: buildingId,
            p_month: monthKey
        });
        if (result.error) throw result.error;
        if (activeBuildingId !== buildingId || monthLabelToKey(monthSelect.value) !== monthKey) return;
        const data = result.data;
        if (
            !data ||
            data.month !== monthKey.slice(0, 7) ||
            !data.accounts ||
            !data.totals ||
            !monthlyCloseAccounts.every(function (account) { return data.accounts[account.code]; })
        ) throw new Error('invalid_monthly_close_response');

        monthlyCloseLastReport = { data: data, buildingId: buildingId, monthKey: monthKey };
        preview.innerHTML = renderMonthlyClosePreview(data);
        await drawMonthlyCloseChart(data);
        status.textContent = data.reconciled
            ? 'اكتملت المراجعة والمطابقة النقدية.'
            : 'اكتملت المراجعة مع وجود فرق يحتاج إلى مراجعة.';
        if (exportButton) exportButton.disabled = false;
        const printButton = /** @type {HTMLButtonElement} */ (document.getElementById('monthlyClosePrintButton'));
        if (printButton) printButton.disabled = false;
        markReportPreviewStale('monthlyClosePreview', false);
        syncReportNavStatus();
    } catch (error) {
        console.error('Monthly cashbox close failed:', error);
        destroyMonthlyCloseChart();
        status.textContent = 'تعذر إعداد الإقفال الشهري. تحقق من الاتصال ثم أعد المحاولة.';
        preview.innerHTML = '<p class="text-rose-400 text-center py-4">لم تكتمل المراجعة. لم يتم حفظ أو تعديل أي بيانات.</p>';
        toast('تعذر إعداد المراجعة الشهرية.', 'error');
    } finally {
        if (reviewButton) reviewButton.disabled = false;
    }
}

// Part 67: the monthly close PDF is written into a detached element before html2pdf
// renders it, so it cannot inherit the app :root tokens. It reuses the shared report
// shell palette (REPORT_PDF_PALETTE in js/reports.js) for rules, hairlines, muted ink
// and surface, and declares here only the two reconciliation tone colours it owns once.
// Every value matches the literal it replaced, so the generated PDF is unchanged.
const MONTHLY_CLOSE_PDF_PALETTE = Object.freeze({
    reconciled: '#047857',
    discrepancy: '#b91c1c'
});
const MONTHLY_CLOSE_CELL_STYLE = 'padding:7px;border:1px solid ' + REPORT_PDF_PALETTE.line;

function renderMonthlyClosePdfHtml(report) {
    const totals = report.totals;
    const rows = monthlyCloseAccounts.map(function (account) {
        const row = report.accounts[account.code];
        return [
            '<tr><th>', esc(account.label), '</th><td>', monthlyCloseMoney(row.opening_balance),
            '</td><td>', monthlyCloseMoney(row.income), '</td><td>', monthlyCloseMoney(row.expenses),
            '</td><td>', monthlyCloseMoney(row.transfers_in), '</td><td>', monthlyCloseMoney(row.transfers_out),
            '</td><td><strong>', monthlyCloseMoney(row.closing_balance), '</strong></td></tr>'
        ].join('');
    }).join('');

    const generatedAtLabel = reportPdfDate(new Date().toISOString());
    return [
        reportPdfDocumentOpen(),
        reportPdfHeader([
            'مراجعة الإقفال النقدي — ', esc(report.month)
        ], [
            'التوقيت المحلي: ', esc(report.time_zone)
        ]),
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">ملخص الحركة النقدية</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:12px"><tbody>',
        '<tr><th style="text-align:right;', MONTHLY_CLOSE_CELL_STYLE, '">رصيد أول الشهر</th><td style="', MONTHLY_CLOSE_CELL_STYLE, '">', monthlyCloseMoney(totals.opening_balance), ' ج.م</td></tr>',
        '<tr><th style="text-align:right;', MONTHLY_CLOSE_CELL_STYLE, '">إجمالي التحصيلات الفعلية</th><td style="', MONTHLY_CLOSE_CELL_STYLE, '">', monthlyCloseMoney(totals.income), ' ج.م</td></tr>',
        '<tr><th style="text-align:right;', MONTHLY_CLOSE_CELL_STYLE, '">إجمالي المصروفات</th><td style="', MONTHLY_CLOSE_CELL_STYLE, '">', monthlyCloseMoney(totals.expenses), ' ج.م</td></tr>',
        '<tr><th style="text-align:right;', MONTHLY_CLOSE_CELL_STYLE, '">صافي الحركة</th><td style="', MONTHLY_CLOSE_CELL_STYLE, '">', monthlyCloseMoney(totals.net_movement), ' ج.م</td></tr>',
        '<tr><th style="text-align:right;', MONTHLY_CLOSE_CELL_STYLE, '">رصيد آخر الشهر</th><td style="', MONTHLY_CLOSE_CELL_STYLE, '"><strong>', monthlyCloseMoney(totals.closing_balance), ' ج.م</strong></td></tr>',
        '</tbody></table></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">تفصيل الصناديق</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:', REPORT_PDF_PALETTE.hairline, '">',
        '<th style="', MONTHLY_CLOSE_CELL_STYLE, '">الصندوق</th><th style="', MONTHLY_CLOSE_CELL_STYLE, '">أول المدة</th>',
        '<th style="', MONTHLY_CLOSE_CELL_STYLE, '">تحصيل</th><th style="', MONTHLY_CLOSE_CELL_STYLE, '">صرف</th>',
        '<th style="', MONTHLY_CLOSE_CELL_STYLE, '">تحويل وارد</th><th style="', MONTHLY_CLOSE_CELL_STYLE, '">تحويل صادر</th>',
        '<th style="', MONTHLY_CLOSE_CELL_STYLE, '">آخر المدة</th></tr></thead><tbody>', rows, '</tbody></table></section>',
        '<p style="font-size:11px;font-weight:700;color:', report.reconciled ? MONTHLY_CLOSE_PDF_PALETTE.reconciled : MONTHLY_CLOSE_PDF_PALETTE.discrepancy, '">',
        report.reconciled ? 'إجمالي الصناديق مطابق للحركة النقدية.' : 'يوجد فرق في المطابقة النقدية؛ يلزم التحقق قبل الاعتماد.',
        '</p><p style="font-size:10px;color:', REPORT_PDF_PALETTE.muted, ';border-top:1px solid ', REPORT_PDF_PALETTE.line, ';padding-top:10px">',
        'هذا التقرير مراجعة حسابية للقراءة فقط، ولا ينشئ قيد إقفال ولا يمنع تعديل البيانات مستقبلًا. ',
        'تم احتساب التحصيلات من تاريخ القبض الفعلي والمصروفات من تاريخ الصرف والتحويلات من وقت تنفيذها، وفق توقيت القاهرة.',
        '</p>',
        reportPdfFooter(generatedAtLabel),
        '</div>'
    ].join('');
}

async function exportMonthlyClosePdf() {
    if (!requireManager()) return;
    const report = monthlyCloseLastReport;
    if (!report || report.buildingId !== activeBuildingId) {
        toast('أنشئ مراجعة جديدة قبل تصدير PDF.', 'error');
        return;
    }

    let root = null;
    const button = /** @type {HTMLButtonElement} */ (document.getElementById('monthlyClosePdfButton'));
    if (button) button.disabled = true;

    try {
        await ensurePdfLibrary();
        await loadReportPdfFonts();

        root = document.createElement('section');
        root.dir = 'rtl';
        root.lang = 'ar';
        root.style.cssText = 'position:fixed;top:0;left:0;width:190mm;padding:8mm;box-sizing:border-box;background:' + REPORT_PDF_PALETTE.surface + ';z-index:-1';
        root.innerHTML = renderMonthlyClosePdfHtml(report.data);
        document.body.appendChild(root);

        const pdfBlob = await renderReportRootToPdfBlob(root, 'manzil_monthly_close_' + report.monthKey.slice(0, 7) + '.pdf', { key: 'A4', w: 210, h: 297 });

        if (!(pdfBlob instanceof Blob) || pdfBlob.type !== 'application/pdf' || pdfBlob.size < 100) {
            throw new Error('monthly_close_pdf_generation_failed');
        }

        const url = URL.createObjectURL(pdfBlob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'manzil_monthly_close_' + report.monthKey.slice(0, 7) + '.pdf';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        toast('تم إنشاء ملف PDF للتقرير الشهري.', 'success');
    } catch (error) {
        console.error('Monthly close PDF export failed:', error);
        toast('تعذر إنشاء PDF. تحقق من الاتصال ثم أعد المحاولة.', 'error');
    } finally {
        if (root) root.remove();
        if (button && monthlyCloseLastReport && monthlyCloseLastReport.buildingId === activeBuildingId) {
            button.disabled = false;
        }
    }
}

// Real-text path: the browser prints only the review card, so "Save as PDF" keeps selectable Arabic text.
function printMonthlyClose() {
    if (!requireManager()) return;
    const report = monthlyCloseLastReport;
    if (!report || report.buildingId !== activeBuildingId) {
        toast('أنشئ مراجعة جديدة قبل الطباعة.', 'error');
        return;
    }
    const title = document.getElementById('printBuildingTitle');
    const meta = document.getElementById('printBuildingMeta');
    const previousTitle = title ? title.textContent : '';
    const previousMeta = meta ? meta.textContent : '';
    if (title) title.textContent = 'مراجعة الإقفال الشهري - ' + (state.buildingName || 'Manzil');
    if (meta) meta.textContent = 'شهر ' + report.data.month + ' • المدير: ' + (state.managerName || '—');
    document.body.classList.add('print-monthly-close');
    window.addEventListener('afterprint', function () {
        document.body.classList.remove('print-monthly-close');
        if (title) title.textContent = previousTitle;
        if (meta) meta.textContent = previousMeta;
    }, { once: true });
    window.print();
}
