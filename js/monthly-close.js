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
    const status = document.getElementById('monthlyCloseReportStatus');
    if (status) status.textContent = 'تغيّر الشهر المحدد. أنشئ معاينة جديدة قبل التصدير.';
    const preview = document.getElementById('monthlyClosePreview');
    if (preview) preview.innerHTML = '<p class="text-slate-500 text-center py-4">اختر الشهر ثم اضغط «مراجعة الإقفال».</p>';
    markReportPreviewStale('monthlyClosePreview', true);
    syncReportNavStatus();
}

function monthlyCloseMoney(value) {
    const amount = Number(value);
    return fmtNum(Number.isFinite(amount) ? amount : 0);
}

function renderMonthlyClosePreview(report) {
    const totals = report.totals;
    const accounts = monthlyCloseAccounts.map(function (account) {
        const row = report.accounts[account.code];
        return [
            '<article class="report-surface p-3 space-y-2">',
            '<h4 class="font-black text-xs">', esc(account.label), '</h4>',
            '<div class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">',
            '<div><span class="block report-list-meta">رصيد أول الشهر</span><strong class="report-amount">', monthlyCloseMoney(row.opening_balance), ' ج.م</strong></div>',
            '<div><span class="block report-list-meta">تحصيلات</span><strong class="text-emerald-400 report-amount">', monthlyCloseMoney(row.income), ' ج.م</strong></div>',
            '<div><span class="block report-list-meta">مصروفات</span><strong class="text-rose-400 report-amount">', monthlyCloseMoney(row.expenses), ' ج.م</strong></div>',
            '<div><span class="block report-list-meta">تحويلات واردة</span><strong class="report-amount">', monthlyCloseMoney(row.transfers_in), ' ج.م</strong></div>',
            '<div><span class="block report-list-meta">تحويلات صادرة</span><strong class="report-amount">', monthlyCloseMoney(row.transfers_out), ' ج.م</strong></div>',
            '<div><span class="block report-list-meta">صافي الحركة</span><strong class="report-amount">', monthlyCloseMoney(row.net_movement), ' ج.م</strong></div>',
            '</div><div class="report-divider flex justify-between items-center gap-2">',
            '<span class="text-xs font-bold">رصيد آخر الشهر</span><strong class="text-sm report-amount">',
            monthlyCloseMoney(row.closing_balance), ' ج.م</strong></div></article>'
        ].join('');
    }).join('');

    return [
        '<div class="space-y-3" dir="rtl"><header class="report-preview-header">',
        '<h3 class="report-preview-title">', esc(state.buildingName || 'Manzil'), '</h3>',
        '<p class="report-preview-meta">مراجعة الإقفال النقدي لشهر ', esc(report.month), '</p>',
        '<p class="report-preview-meta">الفترة محسوبة بالتوقيت المحلي: ', esc(report.time_zone), '</p></header>',
        '<div class="report-stats report-stats-4">',
        '<div class="report-stat"><p class="report-stat-label">رصيد أول الشهر</p><p class="report-stat-value">', monthlyCloseMoney(totals.opening_balance), ' ج.م</p></div>',
        '<div class="report-stat"><p class="report-stat-label">التحصيلات</p><p class="report-stat-value text-emerald-400">', monthlyCloseMoney(totals.income), ' ج.م</p></div>',
        '<div class="report-stat"><p class="report-stat-label">المصروفات</p><p class="report-stat-value text-rose-400">', monthlyCloseMoney(totals.expenses), ' ج.م</p></div>',
        '<div class="report-stat"><p class="report-stat-label">صافي الحركة</p><p class="report-stat-value">', monthlyCloseMoney(totals.net_movement), ' ج.م</p></div></div>',
        '<div class="report-block"><p class="report-block-title"><span>أرصدة الصناديق وحركتها</span><span class="report-block-count">', fmtNum(monthlyCloseAccounts.length), '</span></p>',
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">', accounts, '</div></div>',
        '<div class="report-surface p-3 flex justify-between items-center gap-3"><div>',
        '<p class="font-bold text-xs">إجمالي رصيد الصناديق في نهاية الشهر</p>',
        '<p class="report-list-meta mt-1">التحويلات الداخلية لا تزيد أو تنقص إجمالي النقد.</p></div><strong class="text-base report-amount">',
        monthlyCloseMoney(totals.closing_balance), ' ج.م</strong></div>',
        '<p class="text-xs font-bold ', report.reconciled ? 'text-emerald-400' : 'text-rose-400', '" role="status">',
        report.reconciled ? '✓ إجمالي الصناديق مطابق للحركة النقدية.' : '⚠ يوجد فرق في المطابقة. راجع حركة الصناديق قبل اعتماد التقرير.',
        '</p><p class="report-note report-divider">',
        'تعتمد المراجعة على تاريخ التحصيل الفعلي وتاريخ الصرف وتاريخ التحويل، لا على شهر استحقاق الاشتراك. ',
        'هذه مراجعة للقراءة فقط؛ لا تقفل الشهر ولا تمنع التصحيح أو تسجيل الحركات اللاحقة.</p></div>'
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
    preview.innerHTML = '<p class="text-slate-400 text-center py-4">جارٍ إعداد المراجعة الشهرية...</p>';
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
        status.textContent = data.reconciled
            ? 'اكتملت المراجعة والمطابقة النقدية.'
            : 'اكتملت المراجعة مع وجود فرق يحتاج إلى مراجعة.';
        if (exportButton) exportButton.disabled = false;
        markReportPreviewStale('monthlyClosePreview', false);
        syncReportNavStatus();
    } catch (error) {
        console.error('Monthly cashbox close failed:', error);
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

    const generatedAtLabel = formatDate(new Date().toISOString());
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
        if (document.fonts && document.fonts.ready) await document.fonts.ready;

        root = document.createElement('section');
        root.dir = 'rtl';
        root.lang = 'ar';
        root.style.cssText = 'position:fixed;top:0;left:0;width:190mm;padding:8mm;box-sizing:border-box;background:' + REPORT_PDF_PALETTE.surface + ';z-index:-1';
        root.innerHTML = renderMonthlyClosePdfHtml(report.data);
        document.body.appendChild(root);

        const pdfBlob = await /** @type {any} */ (window.html2pdf)().set({
            margin: 8,
            filename: 'manzil_monthly_close_' + report.monthKey.slice(0, 7) + '.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: REPORT_PDF_PALETTE.surface, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        }).from(root).outputPdf('blob');

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
