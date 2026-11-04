function generateLandlordReport() {
    if (!requireManager()) return;
    const m = document.getElementById('reportMonthSelect').value;
    if (!m) { toast('اختر شهر','error'); return; }
    const inc = state.income.filter(i => i.month === m);
    const exp = state.expenses.filter(e => e.month === m);
    const totalInc = inc.reduce((s,i) => s + (parseFloat(i.amount)||0), 0);
    const totalExp = exp.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
    const net = totalInc - totalExp;
    const paymentMethodTotals = new Map();
    inc.forEach(payment => {
        const label = getIncomePaymentMethodLabel(payment.paymentMethod);
        const totals = paymentMethodTotals.get(label) || { count: 0, amount: 0 };
        totals.count += 1;
        totals.amount += Number(payment.amount) || 0;
        paymentMethodTotals.set(label, totals);
    });
    const paymentMethodSummary = Array.from(paymentMethodTotals.entries()).map(([label, totals]) =>
        '<div class="flex justify-between text-[11px] border-b border-slate-800 py-1"><span>' +
        esc(label) + ' <span class="text-slate-500">(' + totals.count + ')</span></span>' +
        '<span class="text-emerald-400">' + fmtNum(totals.amount) + ' ج.م</span></div>'
    ).join('');
    document.getElementById('landlordReportPreview').innerHTML = `
        <div class="space-y-3">
            <div class="text-center border-b border-slate-700 pb-2"><h3 class="font-black text-sm">${esc(state.buildingName||'العمارة')}</h3><p class="text-[10px] text-slate-400">تقرير ${esc(m)}</p></div>
            <div class="grid grid-cols-3 gap-2 text-center">
                <div class="app-card p-2 rounded-xl border"><p class="text-[10px] text-slate-500">تحصيل</p><p class="text-xs font-black text-emerald-400">${fmtNum(totalInc)}</p></div>
                <div class="app-card p-2 rounded-xl border"><p class="text-[10px] text-slate-500">مصروف</p><p class="text-xs font-black text-rose-400">${fmtNum(totalExp)}</p></div>
                <div class="app-card p-2 rounded-xl border"><p class="text-[10px] text-slate-500">صافي</p><p class="text-xs font-black ${net>=0?'text-emerald-400':'text-rose-400'}">${fmtNum(net)}</p></div>
            </div>
            <div><p class="text-[10px] font-bold text-slate-400 mb-1">توزيع طرق الدفع:</p>
                ${paymentMethodSummary || '<p class="text-slate-500 text-[10px]">لا يوجد</p>'}
            </div>
            <div><p class="text-[10px] font-bold text-slate-400 mb-1">تفاصيل التحصيلات (${inc.length}):</p>
                ${inc.length ? inc.map(i => { const r = state.residents.find(x => x.id === i.residentId); return '<div class="flex justify-between text-[11px] border-b border-slate-800 py-1 gap-2"><span>' + esc(r?.name || '—') + ' <span class="text-slate-500">· ' + esc(getIncomePaymentMethodLabel(i.paymentMethod)) + '</span></span><span class="text-emerald-400 shrink-0">' + fmtNum(i.amount) + '</span></div>'; }).join('') : '<p class="text-slate-500 text-[10px]">لا يوجد</p>'}
            </div>
            <div><p class="text-[10px] font-bold text-slate-400 mb-1">تفاصيل المصروفات (${exp.length}):</p>
                ${exp.length?exp.map(e => `<div class="flex justify-between text-[11px] border-b border-slate-800 py-1"><span>${esc(e.title)}</span><span class="text-rose-400">${fmtNum(e.amount)}</span></div>`).join(''):'<p class="text-slate-500 text-[10px]">لا يوجد</p>'}
            </div>
            <div class="text-[10px] text-slate-500 text-center pt-2 border-t border-slate-700">تم الإنشاء: ${formatDate(new Date().toISOString())}</div>
        </div>`;
}

function exportToCSV() {
    if (!requireManager()) return;
    const rows = [['النوع','الوصف','الشقة','الشهر','المبلغ','طريقة الدفع','ملاحظات']];
    state.income.forEach(i => {
        const r = state.residents.find(x => x.id === i.residentId);
        rows.push(['تحصيل', r?.name||'', r?.apartmentNumber||'', i.month, i.amount, getIncomePaymentMethodLabel(i.paymentMethod), i.notes||'']);
    });
    state.expenses.forEach(e => rows.push(['مصروف', e.title, '', e.month, e.amount, '', [e.category, e.notes].filter(Boolean).join(' ')]));
    const csvCell = value => {
        let text = String(value ?? '');
        if (typeof value === 'string' && /^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g,'""')}"`;
    };
    const csv = '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `manzil_${Date.now()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportArrearsCSV() {
    if (!requireManager()) return;
    const report = buildArrearsReport(getArrearsReportFilters());
    const rows = [['الشقة','اسم الساكن','التصنيف','الشهر غير المسدد','المبلغ المستحق']];
    report.residents.forEach(item => item.unpaidMonths.forEach(month => {
        rows.push([item.resident.apartmentNumber, item.resident.name, item.bucket, month.month, month.amount]);
    }));
    const csvCell = value => {
        let text = String(value ?? '');
        if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    };
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `manzil_arrears_${Date.now()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('تم تصدير تقرير المتأخرات','success');
}
