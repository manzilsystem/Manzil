let landlordReportMonth = '';
let landlordReportSignature = '';

function getLandlordReportData(month) {
    return {
        income: state.income.filter(i => i.month === month),
        expenses: state.expenses.filter(e => e.month === month)
    };
}

function buildResidentIndex() {
    return new Map((state.residents || []).map(resident => [resident.id, resident]));
}

function getSelectedReportMonth() {
    return String(document.getElementById('reportMonthSelect')?.value || '');
}

function getLandlordReportSignature(month) {
    const { income, expenses } = getLandlordReportData(month);
    return JSON.stringify([state.buildingName || '', state.managerName || '', income, expenses]);
}

function setLandlordReportActionsEnabled(enabled) {
    ['reportPrintBtn', 'reportExportBtn'].forEach(id => {
        const button = document.getElementById(id);
        if (button) button.disabled = !enabled;
    });
}

function clearLandlordReportPreview(message) {
    landlordReportMonth = '';
    landlordReportSignature = '';
    setLandlordReportActionsEnabled(false);
    const preview = document.getElementById('landlordReportPreview');
    if (preview) preview.innerHTML = `<p class="text-slate-400 text-center py-4">${esc(message)}</p>`;
}

function invalidateLandlordReportPreview() {
    if (!landlordReportMonth) return;
    clearLandlordReportPreview('تغيّر الشهر أو البيانات — اضغط «معاينة» لتحديث التقرير.');
}

function invalidateLandlordReportIfStale() {
    if (!landlordReportMonth) return;
    if (getLandlordReportSignature(landlordReportMonth) !== landlordReportSignature) {
        clearLandlordReportPreview('تغيّرت البيانات — اضغط «معاينة» لتحديث التقرير.');
    }
}

function generateLandlordReport() {
    if (!requireManager()) return;
    const m = document.getElementById('reportMonthSelect').value;
    if (!m) { toast('اختر شهر','error'); return; }
    const { income: inc, expenses: exp } = getLandlordReportData(m);
    const residentsById = buildResidentIndex();
    const totalIncCents = inc.reduce((sum, i) => sum + toCents(i.amount), 0);
    const totalExpCents = exp.reduce((sum, e) => sum + toCents(e.amount), 0);
    const netCents = totalIncCents - totalExpCents;
    const paymentMethodTotals = new Map();
    inc.forEach(payment => {
        const label = getIncomePaymentMethodLabel(payment.paymentMethod);
        const totals = paymentMethodTotals.get(label) || { count: 0, cents: 0 };
        totals.count += 1;
        totals.cents += toCents(payment.amount);
        paymentMethodTotals.set(label, totals);
    });
    const paymentMethodSummary = Array.from(paymentMethodTotals.entries()).map(([label, totals]) =>
        '<div class="flex justify-between text-[11px] border-b border-slate-800 py-1"><span>' +
        esc(label) + ' <span class="text-slate-500">(' + totals.count + ')</span></span>' +
        '<span class="text-emerald-400 report-amount">' + fmtMoney(totals.cents / 100) + '</span></div>'
    ).join('');
    document.getElementById('landlordReportPreview').innerHTML = `
        <div class="space-y-3">
            <div class="text-center border-b border-slate-700 pb-2"><h3 class="font-black text-sm">${esc(state.buildingName||'العمارة')}</h3><p class="text-[10px] text-slate-400">تقرير ${esc(m)}</p></div>
            <div class="grid grid-cols-3 gap-2">
                <div class="report-stat"><p class="report-stat-label">تحصيل</p><p class="report-stat-value text-emerald-400">${fmtMoney(totalIncCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">مصروف</p><p class="report-stat-value text-rose-400">${fmtMoney(totalExpCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">صافي</p><p class="report-stat-value ${netCents>=0?'text-emerald-400':'text-rose-400'}">${fmtMoney(netCents / 100)}</p></div>
            </div>
            <div><p class="text-[10px] font-bold text-slate-400 mb-1">توزيع طرق الدفع:</p>
                ${paymentMethodSummary || '<p class="text-slate-500 text-[10px]">لا يوجد</p>'}
            </div>
            <div><p class="text-[10px] font-bold text-slate-400 mb-1">تفاصيل التحصيلات (${inc.length}):</p>
                ${inc.length ? inc.map(i => { const r = residentsById.get(i.residentId); return '<div class="flex justify-between text-[11px] border-b border-slate-800 py-1 gap-2"><span>' + esc(r?.name || '—') + ' <span class="text-slate-500">· ' + esc(getIncomePaymentMethodLabel(i.paymentMethod)) + '</span></span><span class="text-emerald-400 shrink-0 report-amount">' + fmtMoney(toCents(i.amount) / 100) + '</span></div>'; }).join('') : '<p class="text-slate-500 text-[10px]">لا يوجد</p>'}
            </div>
            <div><p class="text-[10px] font-bold text-slate-400 mb-1">تفاصيل المصروفات (${exp.length}):</p>
                ${exp.length?exp.map(e => `<div class="flex justify-between text-[11px] border-b border-slate-800 py-1"><span>${esc(e.title)}</span><span class="text-rose-400 report-amount">${fmtMoney(toCents(e.amount) / 100)}</span></div>`).join(''):'<p class="text-slate-500 text-[10px]">لا يوجد</p>'}
            </div>
            <div class="text-[10px] text-slate-500 text-center pt-2 border-t border-slate-700">تم الإنشاء: ${formatDate(new Date().toISOString())}</div>
        </div>`;
    landlordReportMonth = m;
    landlordReportSignature = getLandlordReportSignature(m);
    setLandlordReportActionsEnabled(true);
}

function printLandlordReport() {
    if (!requireManager()) return;
    const selected = getSelectedReportMonth();
    if (!landlordReportMonth || (selected && selected !== landlordReportMonth)) {
        toast('اعرض معاينة الشهر المحدد أولًا','error');
        return;
    }
    const title = document.getElementById('printBuildingTitle');
    const meta = document.getElementById('printBuildingMeta');
    const previousTitle = title ? title.textContent : '';
    const previousMeta = meta ? meta.textContent : '';
    if (title) title.textContent = `تقرير الملاك - ${state.buildingName || 'Manzil'}`;
    if (meta) meta.textContent = `تقرير ${landlordReportMonth} • المدير: ${state.managerName || '—'}`;
    document.body.classList.add('print-landlord');
    const restore = () => {
        document.body.classList.remove('print-landlord');
        if (title) title.textContent = previousTitle;
        if (meta) meta.textContent = previousMeta;
    };
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
}

function printCurrentView() {
    document.body.classList.remove('print-landlord');
    const title = document.getElementById('printBuildingTitle');
    const meta = document.getElementById('printBuildingMeta');
    if (title) title.textContent = `كشف حساب مالي - ${state.buildingName || 'Manzil'}`;
    if (meta) meta.textContent = `المدير: ${state.managerName || '—'} • ${getCurrentMonth()}`;
    window.print();
}

function escapeCsvCell(value) {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(rows) {
    return '\uFEFF' + rows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
}

function downloadCsv(filename, rows) {
    const blob = new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportToCSV(month = landlordReportMonth) {
    if (!requireManager()) return;
    const reportMonth = String(month || '');
    if (!reportMonth) { toast('اعرض معاينة التقرير أولًا','error'); return; }
    const selected = getSelectedReportMonth();
    if (selected && selected !== reportMonth) { toast('اعرض معاينة الشهر المحدد أولًا','error'); return; }
    const { income: inc, expenses: exp } = getLandlordReportData(reportMonth);
    const residentsById = buildResidentIndex();
    const rows = [['النوع','الوصف','الشقة','الشهر','المبلغ','طريقة الدفع','ملاحظات']];
    inc.forEach(i => {
        const r = residentsById.get(i.residentId);
        rows.push(['تحصيل', r?.name||'', r?.apartmentNumber||'', i.month, toCents(i.amount) / 100, getIncomePaymentMethodLabel(i.paymentMethod), i.notes||'']);
    });
    exp.forEach(e => rows.push(['مصروف', e.title, '', e.month, toCents(e.amount) / 100, '', [e.category, e.notes].filter(Boolean).join(' ')]));
    const monthKey = monthLabelToKey(reportMonth);
    downloadCsv(`manzil_report_${monthKey ? monthKey.slice(0, 7) : Date.now()}.csv`, rows);
    toast(`تم تصدير تقرير ${reportMonth}`,'success');
}

function exportArrearsCSV() {
    if (!requireManager()) return;
    const report = buildArrearsReport(getArrearsReportFilters());
    const rows = [['الشقة','اسم الساكن','التصنيف','الشهر غير المسدد','المبلغ المستحق']];
    report.residents.forEach(item => item.unpaidMonths.forEach(month => {
        rows.push([item.resident.apartmentNumber, item.resident.name, item.bucket, month.month, month.amount]);
    }));
    downloadCsv(`manzil_arrears_${Date.now()}.csv`, rows);
    toast('تم تصدير تقرير المتأخرات','success');
}
