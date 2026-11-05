let landlordReportMonth = '';
let landlordReportSignature = '';

function jumpToReportPanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const wrapper = panel.closest('details');
    if (wrapper) wrapper.open = true;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getLandlordReportData(month) {
    return {
        income: state.income.filter(i => i.month === month),
        expenses: state.expenses.filter(e => e.month === month)
    };
}

function buildResidentIndex() {
    return new Map((state.residents || []).map(resident => [resident.id, resident]));
}

function isResidentActiveInMonth(resident, monthKey) {
    if (!resident || !monthKey) return false;
    if (!resident.createdAt) return true;
    const createdAt = new Date(resident.createdAt);
    if (Number.isNaN(createdAt.getTime())) return true;
    const createdKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-01`;
    return createdKey <= monthKey;
}

function getMonthlyBillingTotals(month) {
    const monthKey = monthLabelToKey(month);
    const totals = { expectedCents: 0, outstandingCents: 0 };
    (state.residents || []).forEach(resident => {
        if (!isResidentActiveInMonth(resident, monthKey)) return;
        totals.expectedCents += toCents(getSubscriptionAmountForMonth(resident, month));
        totals.outstandingCents += toCents(getMonthOutstanding(resident, month));
    });
    return totals;
}

function getExpenseCategoryTotals(expenses) {
    const totals = new Map();
    expenses.forEach(expense => {
        const label = String(expense.category || '').trim() || 'غير مصنف';
        const current = totals.get(label) || { count: 0, cents: 0 };
        current.count += 1;
        current.cents += toCents(expense.amount);
        totals.set(label, current);
    });
    return Array.from(totals.entries()).sort((a, b) => b[1].cents - a[1].cents);
}

function getSelectedReportMonth() {
    return String(document.getElementById('reportMonthSelect')?.value || '');
}

function getLandlordReportSignature(month) {
    const { income, expenses } = getLandlordReportData(month);
    return JSON.stringify([
        state.buildingName || '',
        state.managerName || '',
        state.defaultSubscription ?? '',
        state.residents || [],
        income,
        expenses
    ]);
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
    if (preview) preview.innerHTML = `<p class="report-preview-empty">${esc(message)}</p>`;
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
    const { expectedCents, outstandingCents } = getMonthlyBillingTotals(m);
    const collectionRate = expectedCents > 0 ? Math.round((totalIncCents / expectedCents) * 100) : null;
    const expenseCategories = getExpenseCategoryTotals(exp);
    const expenseCategorySummary = expenseCategories.map(([label, totals]) =>
        '<div class="report-list-row"><span class="report-list-title">' +
        esc(label) + ' <span class="report-list-meta">(' + totals.count + ')</span></span>' +
        '<span class="report-list-value text-rose-400 report-amount">' + fmtMoney(totals.cents / 100) + '</span></div>'
    ).join('');
    const paymentMethodTotals = new Map();
    inc.forEach(payment => {
        const label = getIncomePaymentMethodLabel(payment.paymentMethod);
        const totals = paymentMethodTotals.get(label) || { count: 0, cents: 0 };
        totals.count += 1;
        totals.cents += toCents(payment.amount);
        paymentMethodTotals.set(label, totals);
    });
    const paymentMethodSummary = Array.from(paymentMethodTotals.entries()).map(([label, totals]) =>
        '<div class="report-list-row"><span class="report-list-title">' +
        esc(label) + ' <span class="report-list-meta">(' + totals.count + ')</span></span>' +
        '<span class="report-list-value text-emerald-400 report-amount">' + fmtMoney(totals.cents / 100) + '</span></div>'
    ).join('');
    document.getElementById('landlordReportPreview').innerHTML = `
        <div class="space-y-3">
            <header class="report-preview-header">
                <h3 class="report-preview-title">${esc(state.buildingName||'العمارة')}</h3>
                <p class="report-preview-meta">تقرير ${esc(m)} • تم الإنشاء ${formatDate(new Date().toISOString())}</p>
            </header>
            <div class="report-stats">
                <div class="report-stat"><p class="report-stat-label">تحصيل</p><p class="report-stat-value text-emerald-400">${fmtMoney(totalIncCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">مصروف</p><p class="report-stat-value text-rose-400">${fmtMoney(totalExpCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">صافي</p><p class="report-stat-value ${netCents>=0?'text-emerald-400':'text-rose-400'}">${fmtMoney(netCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">المستحق</p><p class="report-stat-value">${fmtMoney(expectedCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">غير المحصّل</p><p class="report-stat-value ${outstandingCents > 0 ? 'text-amber-400' : 'text-emerald-400'}">${fmtMoney(outstandingCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">نسبة التحصيل</p><p class="report-stat-value">${collectionRate === null ? '—' : fmtNum(collectionRate) + '%'}</p></div>
            </div>
            <div class="report-block">
                <p class="report-block-title"><span>توزيع طرق الدفع</span><span class="report-block-count">${fmtNum(paymentMethodTotals.size)}</span></p>
                ${paymentMethodSummary ? '<div class="report-list">' + paymentMethodSummary + '</div>' : '<p class="report-note">لا يوجد</p>'}
            </div>
            <div class="report-block">
                <p class="report-block-title"><span>تصنيفات المصروفات</span><span class="report-block-count">${fmtNum(expenseCategories.length)}</span></p>
                ${expenseCategorySummary ? '<div class="report-list">' + expenseCategorySummary + '</div>' : '<p class="report-note">لا يوجد</p>'}
            </div>
            <div class="report-block">
                <p class="report-block-title"><span>تفاصيل التحصيلات</span><span class="report-block-count">${fmtNum(inc.length)}</span></p>
                ${inc.length ? '<div class="report-list">' + inc.map(i => { const r = residentsById.get(i.residentId); return '<div class="report-list-row"><span class="report-list-title">' + esc(r?.name || '—') + ' <span class="report-list-meta">· ' + esc(getIncomePaymentMethodLabel(i.paymentMethod)) + '</span></span><span class="report-list-value text-emerald-400 report-amount">' + fmtMoney(toCents(i.amount) / 100) + '</span></div>'; }).join('') + '</div>' : '<p class="report-note">لا يوجد</p>'}
            </div>
            <div class="report-block">
                <p class="report-block-title"><span>تفاصيل المصروفات</span><span class="report-block-count">${fmtNum(exp.length)}</span></p>
                ${exp.length ? '<div class="report-list">' + exp.map(e => '<div class="report-list-row"><span class="report-list-title">' + esc(e.title) + '</span><span class="report-list-value text-rose-400 report-amount">' + fmtMoney(toCents(e.amount) / 100) + '</span></div>').join('') + '</div>' : '<p class="report-note">لا يوجد</p>'}
            </div>
            <div class="report-note report-divider text-center"><p>المستحق محسوب بقيمة الاشتراك السارية في شهر التقرير.</p></div>
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

let periodReportSnapshot = null;
let periodReportSignature = '';

function getPeriodReportSelection() {
    return {
        from: String(document.getElementById('periodReportFrom')?.value || ''),
        to: String(document.getElementById('periodReportTo')?.value || '')
    };
}

function setPeriodReportMonthValue(id, monthKey) {
    const select = document.getElementById(id);
    const label = getStatementMonthLabel(monthKey);
    if (!select || !label) return;
    select.value = label;
}

function applyPeriodReportPreset() {
    const preset = String(document.getElementById('periodReportPreset')?.value || '');
    if (!preset || preset === 'custom') return;
    const currentKey = monthLabelToKey(getCurrentMonth());
    if (!currentKey) return;
    const count = preset === 'ytd'
        ? Math.max(1, Number(currentKey.slice(5, 7)) || 1)
        : Math.max(1, Number(preset) || 6);
    setPeriodReportMonthValue('periodReportFrom', shiftStatementMonthKey(currentKey, -(count - 1)));
    setPeriodReportMonthValue('periodReportTo', currentKey);
    invalidatePeriodReportPreview();
}

function onPeriodReportRangeChange() {
    const preset = document.getElementById('periodReportPreset');
    if (preset) preset.value = 'custom';
    invalidatePeriodReportPreview();
}

function buildPeriodMonthKeys(fromMonth, toMonth) {
    const fromKey = monthLabelToKey(fromMonth);
    const toKey = monthLabelToKey(toMonth);
    if (!fromKey || !toKey || fromKey > toKey) return null;
    const keys = [];
    for (let key = fromKey; key <= toKey && keys.length < 60; key = shiftStatementMonthKey(key, 1)) keys.push(key);
    return keys.length ? keys : null;
}

function getPeriodCollectionRate(expectedCents, collectedCents) {
    return expectedCents > 0 ? Math.round((collectedCents / expectedCents) * 100) : null;
}

function buildPeriodReport(fromMonth, toMonth) {
    const keys = buildPeriodMonthKeys(fromMonth, toMonth);
    if (!keys) return null;
    const months = keys.map(key => {
        const month = getStatementMonthLabel(key);
        const collectedCents = (state.income || [])
            .filter(item => item.month === month)
            .reduce((sum, item) => sum + toCents(item.amount), 0);
        const expenseCents = (state.expenses || [])
            .filter(item => item.month === month)
            .reduce((sum, item) => sum + toCents(item.amount), 0);
        const { expectedCents, outstandingCents } = getMonthlyBillingTotals(month);
        return {
            key,
            month,
            expectedCents,
            collectedCents,
            outstandingCents,
            expenseCents,
            netCents: collectedCents - expenseCents,
            rate: getPeriodCollectionRate(expectedCents, collectedCents)
        };
    });
    const totals = months.reduce((acc, row) => {
        acc.expectedCents += row.expectedCents;
        acc.collectedCents += row.collectedCents;
        acc.outstandingCents += row.outstandingCents;
        acc.expenseCents += row.expenseCents;
        if (row.outstandingCents > 0) acc.unpaidMonths += 1;
        return acc;
    }, { expectedCents: 0, collectedCents: 0, outstandingCents: 0, expenseCents: 0, unpaidMonths: 0 });
    totals.netCents = totals.collectedCents - totals.expenseCents;
    totals.rate = getPeriodCollectionRate(totals.expectedCents, totals.collectedCents);
    return {
        fromMonth,
        toMonth,
        months,
        totals,
        rangeLabel: `${fromMonth} – ${toMonth}`,
        generatedAt: new Date().toISOString()
    };
}

function getPeriodReportSignature(fromMonth, toMonth) {
    const labels = new Set([fromMonth, toMonth]);
    (buildPeriodMonthKeys(fromMonth, toMonth) || []).forEach(key => labels.add(getStatementMonthLabel(key)));
    return JSON.stringify([
        state.buildingName || '',
        state.managerName || '',
        state.defaultSubscription ?? '',
        state.residents || [],
        (state.income || []).filter(item => labels.has(item.month)),
        (state.expenses || []).filter(item => labels.has(item.month))
    ]);
}

function setPeriodReportActionsEnabled(enabled) {
    ['periodReportPrintBtn', 'periodReportExportBtn'].forEach(id => {
        const button = document.getElementById(id);
        if (button) button.disabled = !enabled;
    });
}

function clearPeriodReportPreview(message) {
    periodReportSnapshot = null;
    periodReportSignature = '';
    setPeriodReportActionsEnabled(false);
    const preview = document.getElementById('periodReportPreview');
    if (preview) preview.innerHTML = `<p class="report-preview-empty">${esc(message)}</p>`;
}

function invalidatePeriodReportPreview() {
    if (!periodReportSnapshot) return;
    clearPeriodReportPreview('تغيّرت الفترة أو البيانات — اضغط «معاينة» لتحديث التقرير.');
}

function invalidatePeriodReportIfStale() {
    if (!periodReportSnapshot) return;
    if (getPeriodReportSignature(periodReportSnapshot.fromMonth, periodReportSnapshot.toMonth) !== periodReportSignature) {
        clearPeriodReportPreview('تغيّرت البيانات — اضغط «معاينة» لتحديث التقرير.');
    }
}

function getSelectedPeriodReportSnapshot() {
    if (!periodReportSnapshot) {
        toast('اعرض معاينة الفترة أولًا','error');
        return null;
    }
    const selected = getPeriodReportSelection();
    if ((selected.from && selected.from !== periodReportSnapshot.fromMonth) ||
        (selected.to && selected.to !== periodReportSnapshot.toMonth)) {
        toast('اعرض معاينة الفترة المحددة أولًا','error');
        return null;
    }
    return periodReportSnapshot;
}

function renderPeriodReportHtml(report) {
    const monthRows = report.months.map(row => `
        <tr>
            <td>${esc(row.month)}</td>
            <td>${fmtMoney(row.expectedCents / 100)}</td>
            <td class="text-emerald-400">${fmtMoney(row.collectedCents / 100)}</td>
            <td class="${row.outstandingCents ? 'text-rose-400' : ''}">${fmtMoney(row.outstandingCents / 100)}</td>
            <td>${row.rate === null ? '—' : fmtNum(row.rate) + '%'}</td>
            <td class="${row.expenseCents ? 'text-rose-400' : ''}">${fmtMoney(row.expenseCents / 100)}</td>
            <td class="${row.netCents >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${fmtMoney(row.netCents / 100)}</td>
        </tr>`).join('');
    const totals = report.totals;
    const unpaidNote = totals.unpaidMonths > 0
        ? `<p>${fmtNum(totals.unpaidMonths)} شهر من الفترة فيه متبقٍّ غير محصّل.</p>`
        : '';
    return `
        <div class="space-y-3">
            <header class="report-preview-header">
                <h3 class="report-preview-title">${esc(state.buildingName || 'العمارة')}</h3>
                <p class="report-preview-meta">تقرير الفترة ${esc(report.rangeLabel)} • تم الإنشاء ${esc(formatDate(report.generatedAt))}</p>
            </header>
            <div class="report-stats">
                <div class="report-stat"><p class="report-stat-label">المستحق</p><p class="report-stat-value">${fmtMoney(totals.expectedCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">المحصّل</p><p class="report-stat-value text-emerald-400">${fmtMoney(totals.collectedCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">غير المحصّل</p><p class="report-stat-value ${totals.outstandingCents > 0 ? 'text-amber-400' : 'text-emerald-400'}">${fmtMoney(totals.outstandingCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">نسبة التحصيل</p><p class="report-stat-value">${totals.rate === null ? '—' : fmtNum(totals.rate) + '%'}</p></div>
                <div class="report-stat"><p class="report-stat-label">المصروف</p><p class="report-stat-value text-rose-400">${fmtMoney(totals.expenseCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">الصافي</p><p class="report-stat-value ${totals.netCents >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${fmtMoney(totals.netCents / 100)}</p></div>
            </div>
            <div class="report-table-wrap">
                <table class="statement-table">
                    <thead><tr><th>الشهر</th><th>المستحق</th><th>المحصّل</th><th>غير المحصّل</th><th>نسبة التحصيل</th><th>المصروف</th><th>الصافي</th></tr></thead>
                    <tbody>${monthRows}</tbody>
                    <tfoot><tr><td>الإجمالي</td><td>${fmtMoney(totals.expectedCents / 100)}</td><td>${fmtMoney(totals.collectedCents / 100)}</td><td>${fmtMoney(totals.outstandingCents / 100)}</td><td>${totals.rate === null ? '—' : fmtNum(totals.rate) + '%'}</td><td>${fmtMoney(totals.expenseCents / 100)}</td><td>${fmtMoney(totals.netCents / 100)}</td></tr></tfoot>
                </table>
            </div>
            <div class="report-note report-divider text-center">
                <p>كل شهر محسوب بسعر الاشتراك السارية فيه وحصيلته من حركات الشهر نفسه، مثل تقرير الملاك الشهري.</p>
                <p>نسبة تزيد على 100% تعني تحصيلًا أعلى من مستحق الشهر (مقدمة أو متأخرات مسددة).</p>
                ${unpaidNote}
            </div>
        </div>`;
}

function generatePeriodReport() {
    if (!requireManager()) return;
    const { from, to } = getPeriodReportSelection();
    if (!from || !to) { toast('اختر شهر البداية والنهاية','error'); return; }
    const report = buildPeriodReport(from, to);
    if (!report) {
        clearPeriodReportPreview('الفترة غير صحيحة: شهر البداية بعد شهر النهاية.');
        toast('شهر البداية بعد شهر النهاية','error');
        return;
    }
    const preview = document.getElementById('periodReportPreview');
    if (!preview) return;
    preview.innerHTML = renderPeriodReportHtml(report);
    periodReportSnapshot = report;
    periodReportSignature = getPeriodReportSignature(from, to);
    setPeriodReportActionsEnabled(true);
}

function printPeriodReport() {
    if (!requireManager()) return;
    const report = getSelectedPeriodReportSnapshot();
    if (!report) return;
    const title = document.getElementById('printBuildingTitle');
    const meta = document.getElementById('printBuildingMeta');
    const previousTitle = title ? title.textContent : '';
    const previousMeta = meta ? meta.textContent : '';
    if (title) title.textContent = `تقرير الفترة - ${state.buildingName || 'Manzil'}`;
    if (meta) meta.textContent = `الفترة ${report.rangeLabel} • المدير: ${state.managerName || '—'}`;
    document.body.classList.remove('print-landlord', 'print-statement');
    document.body.classList.add('print-period');
    const restore = () => {
        document.body.classList.remove('print-period');
        if (title) title.textContent = previousTitle;
        if (meta) meta.textContent = previousMeta;
    };
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
}

function getPeriodReportFileSlug(report) {
    const fromKey = monthLabelToKey(report.fromMonth) || String(Date.now());
    const toKey = monthLabelToKey(report.toMonth) || String(Date.now());
    return `${fromKey.slice(0, 7)}_${toKey.slice(0, 7)}`;
}

function exportPeriodReportCsv() {
    if (!requireManager()) return;
    const report = getSelectedPeriodReportSnapshot();
    if (!report) return;
    const totals = report.totals;
    const rows = [['الشهر','المستحق','المحصّل','غير المحصّل','نسبة التحصيل %','المصروف','الصافي']];
    report.months.forEach(row => {
        rows.push([row.month, row.expectedCents / 100, row.collectedCents / 100, row.outstandingCents / 100,
            row.rate ?? '', row.expenseCents / 100, row.netCents / 100]);
    });
    rows.push(['الإجمالي', totals.expectedCents / 100, totals.collectedCents / 100, totals.outstandingCents / 100,
        totals.rate ?? '', totals.expenseCents / 100, totals.netCents / 100]);
    downloadCsv(`manzil_period_${getPeriodReportFileSlug(report)}.csv`, rows);
    toast('تم تصدير تقرير الفترة','success');
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

let residentStatementSnapshot = null;
let residentStatementResidentId = '';
let residentStatementSignature = '';

function getStatementMonthKeyFromDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function getStatementMonthLabel(monthKey) {
    const [year, month] = String(monthKey).split('-').map(Number);
    if (!year || !month || !monthsNames[month - 1]) return '';
    return `${monthsNames[month - 1]} ${year}`;
}

function shiftStatementMonthKey(monthKey, offset) {
    const [year, month] = String(monthKey).split('-').map(Number);
    const cursor = new Date(Date.UTC(year, month - 1 + offset, 1));
    return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function getResidentStatementStatus(dueCents, paidCents, monthKey, currentKey) {
    if (dueCents === 0 && paidCents === 0) {
        return monthKey > currentKey
            ? { label: 'لم يحن بعد', className: 'text-slate-500' }
            : { label: 'لا استحقاق', className: 'text-slate-500' };
    }
    if (dueCents === 0) return { label: 'مدفوع مقدماً', className: 'text-sky-400' };
    if (paidCents >= dueCents) {
        return paidCents > dueCents
            ? { label: 'مسدد بزيادة', className: 'text-emerald-400' }
            : { label: 'مسدد', className: 'text-emerald-400' };
    }
    if (paidCents === 0) return { label: 'غير مسدد', className: 'text-rose-400' };
    return { label: 'سداد جزئي', className: 'text-amber-400' };
}

function buildResidentStatement(residentId) {
    const resident = buildResidentIndex().get(String(residentId || ''));
    if (!resident) return null;

    const currentKey = monthLabelToKey(getCurrentMonth()) || '';
    const payments = (state.income || [])
        .filter(payment => payment.residentId === resident.id)
        .slice()
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const paymentKeys = payments
        .map(payment => monthLabelToKey(payment.month))
        .filter(Boolean)
        .sort();
    const createdKey = getStatementMonthKeyFromDate(new Date(resident.createdAt || ''));
    let startKey = createdKey || paymentKeys[0] || currentKey;
    let endKey = currentKey || startKey;
    paymentKeys.forEach(key => {
        if (key < startKey) startKey = key;
        if (key > endKey) endKey = key;
    });
    if (!startKey) return null;
    if (startKey > endKey) endKey = startKey;

    const months = [];
    let dueCents = 0;
    let paidCents = 0;
    let remainingCents = 0;
    for (let key = startKey; key <= endKey; key = shiftStatementMonthKey(key, 1)) {
        const month = getStatementMonthLabel(key);
        const isBilled = (!createdKey || key >= createdKey) && (!currentKey || key <= currentKey);
        const rowDueCents = isBilled ? toCents(getSubscriptionAmountForMonth(resident, month)) : 0;
        const rowPaidCents = toCents(getPaidAmountForMonth(resident.id, month));
        const rowRemainingCents = Math.max(0, rowDueCents - rowPaidCents);
        dueCents += rowDueCents;
        paidCents += rowPaidCents;
        remainingCents += rowRemainingCents;
        months.push({
            key,
            month,
            dueCents: rowDueCents,
            paidCents: rowPaidCents,
            remainingCents: rowRemainingCents,
            status: getResidentStatementStatus(rowDueCents, rowPaidCents, key, currentKey)
        });
    }

    const paymentRows = payments.map(payment => ({
        id: payment.id,
        month: String(payment.month || '—'),
        amountCents: toCents(payment.amount),
        method: getIncomePaymentMethodLabel(payment.paymentMethod),
        date: payment.date || '',
        notes: String(payment.notes || '')
    }));
    const unassignedPaidCents = paymentRows
        .filter(payment => !monthLabelToKey(payment.month))
        .reduce((sum, payment) => sum + payment.amountCents, 0);

    return {
        resident,
        months,
        payments: paymentRows,
        rangeLabel: `${months[0].month} – ${months[months.length - 1].month}`,
        totals: {
            dueCents,
            paidCents,
            remainingCents,
            arrearsMonths: months.filter(row => row.remainingCents > 0 && row.key < currentKey).length,
            unassignedPaidCents
        },
        generatedAt: new Date().toISOString()
    };
}

function getResidentStatementSignature(residentId) {
    const resident = buildResidentIndex().get(String(residentId || ''));
    if (!resident) return '';
    const payments = (state.income || []).filter(payment => payment.residentId === resident.id);
    return JSON.stringify([resident, payments]);
}

function setResidentStatementActionsEnabled(enabled) {
    ['statementPrintBtn', 'statementPdfBtn', 'unitReportPdfBtn', 'statementCsvBtn'].forEach(id => {
        const button = document.getElementById(id);
        if (button) button.disabled = !enabled;
    });
}

function clearResidentStatement(message) {
    residentStatementSnapshot = null;
    residentStatementResidentId = '';
    residentStatementSignature = '';
    setResidentStatementActionsEnabled(false);
    const preview = document.getElementById('residentStatementPreview');
    if (preview) preview.innerHTML = `<p class="report-preview-empty">${esc(message)}</p>`;
}

function invalidateResidentStatementPreview() {
    if (!residentStatementSnapshot) return;
    clearResidentStatement('تغيّر الساكن — اختر ساكنًا ثم اضغط «معاينة» لعرض الكشف.');
}

function invalidateResidentStatementIfStale() {
    if (!residentStatementSnapshot) return;
    if (getResidentStatementSignature(residentStatementSnapshot.resident.id) !== residentStatementSignature) {
        clearResidentStatement('تغيّرت البيانات — اضغط «معاينة» لتحديث الكشف.');
    }
}

function getResidentStatementSnapshot() {
    if (!residentStatementSnapshot) {
        toast('اعرض كشف الحساب أولًا','error');
        return null;
    }
    const selected = String(document.getElementById('statementResidentSelect')?.value || '');
    if (selected && selected !== residentStatementSnapshot.resident.id) {
        toast('اعرض كشف الساكن المحدد أولًا','error');
        return null;
    }
    if (getResidentStatementSignature(residentStatementSnapshot.resident.id) !== residentStatementSignature) {
        clearResidentStatement('تغيّرت البيانات — اضغط «معاينة» لتحديث الكشف.');
        return null;
    }
    return residentStatementSnapshot;
}

function getStatementFileSlug(statement) {
    const apartment = String(statement.resident.apartmentNumber || 'resident').replace(/[^\w\u0621-\u064A-]+/g, '_');
    const lastKey = statement.months[statement.months.length - 1]?.key || '';
    return `${apartment}_${lastKey.slice(0, 7)}`;
}

function renderResidentStatementHtml(statement) {
    const resident = statement.resident;
    const monthRows = statement.months.map(row => `
        <tr>
            <td>${esc(row.month)}</td>
            <td>${fmtMoney(row.dueCents / 100)}</td>
            <td class="text-emerald-400">${fmtMoney(row.paidCents / 100)}</td>
            <td class="${row.remainingCents ? 'text-rose-400' : ''}">${fmtMoney(row.remainingCents / 100)}</td>
            <td class="${row.status.className}">${esc(row.status.label)}</td>
        </tr>`).join('');
    const paymentRows = statement.payments.length
        ? statement.payments.map(payment => `
            <div class="report-list-row items-start">
                <div class="min-w-0">
                    <p class="report-list-title">${esc(payment.month)}</p>
                    <p class="report-list-meta">${esc(payment.method)} · ${esc(formatDate(payment.date) || '—')}</p>
                    ${payment.notes ? `<p class="report-list-meta break-words">${esc(payment.notes)}</p>` : ''}
                </div>
                <strong class="report-list-value text-emerald-400 report-amount">${fmtMoney(payment.amountCents / 100)}</strong>
            </div>`).join('')
        : '<p class="report-note">لا توجد حركات مسجلة.</p>';
    const unassignedNote = statement.totals.unassignedPaidCents > 0
        ? `<p>مدفوعات بدون شهر استحقاق قابل للقراءة: ${fmtMoney(statement.totals.unassignedPaidCents / 100)}</p>`
        : '';
    return `
        <div class="space-y-3">
            <header class="report-preview-header">
                <h3 class="report-preview-title">${esc(state.buildingName || 'العمارة')}</h3>
                <p class="report-preview-meta">كشف حساب ساكن · ${esc(resident.name)} · شقة ${esc(resident.apartmentNumber || '—')}${resident.floor ? ' · الدور ' + esc(resident.floor) : ''}</p>
                <p class="report-preview-meta">الفترة: ${esc(statement.rangeLabel)}</p>
            </header>
            <div class="report-stats report-stats-4">
                <div class="report-stat"><p class="report-stat-label">إجمالي المستحق</p><p class="report-stat-value">${fmtMoney(statement.totals.dueCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">إجمالي المدفوع</p><p class="report-stat-value text-emerald-400">${fmtMoney(statement.totals.paidCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">إجمالي المتبقي</p><p class="report-stat-value ${statement.totals.remainingCents ? 'text-rose-400' : 'text-emerald-400'}">${fmtMoney(statement.totals.remainingCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">أشهر متأخرة</p><p class="report-stat-value ${statement.totals.arrearsMonths ? 'text-amber-400' : 'text-emerald-400'}">${fmtNum(statement.totals.arrearsMonths)}</p></div>
            </div>
            <div class="report-table-wrap">
                <table class="statement-table">
                    <thead><tr><th>الشهر</th><th>المستحق</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr></thead>
                    <tbody>${monthRows}</tbody>
                </table>
            </div>
            <div class="report-block">
                <p class="report-block-title"><span>حركات الساكن</span><span class="report-block-count">${fmtNum(statement.payments.length)}</span></p>
                <div class="report-list">${paymentRows}</div>
            </div>
            <div class="report-note report-divider text-center">
                <p>كل شهر محسوب بقيمة الاشتراك السارية فيه، والمدفوع هو المسجل على الشهر نفسه.</p>
                ${unassignedNote}
                <p>تم الإنشاء: ${esc(formatDate(statement.generatedAt))}</p>
            </div>
        </div>`;
}

function generateResidentStatement() {
    if (!requireManager()) return;
    const residentId = String(document.getElementById('statementResidentSelect')?.value || '');
    if (!residentId) { toast('اختر ساكنًا','error'); return; }
    const statement = buildResidentStatement(residentId);
    if (!statement) { toast('تعذر العثور على الساكن. حدّث البيانات ثم حاول مرة أخرى.','error'); return; }
    const preview = document.getElementById('residentStatementPreview');
    if (!preview) return;
    preview.innerHTML = renderResidentStatementHtml(statement);
    residentStatementSnapshot = statement;
    residentStatementResidentId = residentId;
    residentStatementSignature = getResidentStatementSignature(residentId);
    setResidentStatementActionsEnabled(true);
}

function printResidentStatement() {
    if (!requireManager()) return;
    const statement = getResidentStatementSnapshot();
    if (!statement) return;
    switchTab('reports');
    const title = document.getElementById('printBuildingTitle');
    const meta = document.getElementById('printBuildingMeta');
    const previousTitle = title ? title.textContent : '';
    const previousMeta = meta ? meta.textContent : '';
    if (title) title.textContent = `كشف حساب ساكن - ${state.buildingName || 'Manzil'}`;
    if (meta) meta.textContent = `${statement.resident.name} • شقة ${statement.resident.apartmentNumber || '—'} • ${statement.rangeLabel}`;
    document.body.classList.remove('print-landlord');
    document.body.classList.add('print-statement');
    const restore = () => {
        document.body.classList.remove('print-statement');
        if (title) title.textContent = previousTitle;
        if (meta) meta.textContent = previousMeta;
    };
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
}

function statementPdfCell(value, styles = '') {
    return '<td style="padding:6px;border:1px solid #cbd5e1;text-align:right;' + styles + '">' + value + '</td>';
}

function statementPdfHeadCell(value) {
    return '<th style="padding:6px;border:1px solid #cbd5e1;text-align:right;font-weight:600">' + value + '</th>';
}

function renderStatementMonthsPdfBody(statement) {
    return statement.months.map(row => [
        '<tr>',
        statementPdfHeadCell(esc(row.month)),
        statementPdfCell(fmtMoney(row.dueCents / 100)),
        statementPdfCell(fmtMoney(row.paidCents / 100)),
        statementPdfCell(fmtMoney(row.remainingCents / 100), row.remainingCents ? 'color:#be123c;font-weight:700' : ''),
        statementPdfCell(esc(row.status.label)),
        '</tr>'
    ].join('')).join('');
}

function renderStatementPaymentsPdfBody(statement) {
    return statement.payments.length
        ? statement.payments.map(payment => [
            '<tr>',
            statementPdfCell(esc(payment.month)),
            statementPdfCell(fmtMoney(payment.amountCents / 100), 'color:#047857;font-weight:700'),
            statementPdfCell(esc(payment.method)),
            statementPdfCell(esc(formatDate(payment.date) || '—')),
            statementPdfCell(esc(payment.notes || '—')),
            '</tr>'
        ].join('')).join('')
        : '<tr><td colspan="5" style="padding:8px;border:1px solid #cbd5e1;text-align:center;color:#475569">لا توجد حركات مسجلة.</td></tr>';
}

function renderResidentStatementPdfHtml(statement) {
    const resident = statement.resident;
    const monthRows = renderStatementMonthsPdfBody(statement);
    const paymentRows = renderStatementPaymentsPdfBody(statement);

    return [
        '<div dir="rtl" lang="ar" style="font-family:Cairo,Arial,sans-serif;color:#111827;background:#fff;line-height:1.8">',
        '<header style="text-align:center;border-bottom:2px solid #334155;padding-bottom:12px;margin-bottom:18px">',
        '<h1 style="font-size:22px;font-weight:800;margin:0">', esc(state.buildingName || 'Manzil'), '</h1>',
        '<h2 style="font-size:17px;font-weight:700;margin:4px 0">كشف حساب ساكن — ', esc(resident.name), '</h2>',
        '<p style="font-size:11px;color:#475569;margin:0">',
        'شقة ', esc(resident.apartmentNumber || '—'), resident.floor ? ' • الدور ' + esc(resident.floor) : '',
        ' • الفترة: ', esc(statement.rangeLabel), '</p></header>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">الملخص</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:11px"><tbody>',
        '<tr><th style="text-align:right;padding:7px;border:1px solid #cbd5e1">إجمالي المستحق</th><td style="padding:7px;border:1px solid #cbd5e1">', fmtMoney(statement.totals.dueCents / 100), '</td></tr>',
        '<tr><th style="text-align:right;padding:7px;border:1px solid #cbd5e1">إجمالي المدفوع</th><td style="padding:7px;border:1px solid #cbd5e1;color:#047857;font-weight:700">', fmtMoney(statement.totals.paidCents / 100), '</td></tr>',
        '<tr><th style="text-align:right;padding:7px;border:1px solid #cbd5e1">إجمالي المتبقي</th><td style="padding:7px;border:1px solid #cbd5e1;font-weight:700">', fmtMoney(statement.totals.remainingCents / 100), '</td></tr>',
        '<tr><th style="text-align:right;padding:7px;border:1px solid #cbd5e1">أشهر متأخرة</th><td style="padding:7px;border:1px solid #cbd5e1">', fmtNum(statement.totals.arrearsMonths), '</td></tr>',
        '</tbody></table></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">حساب الشهور</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#e2e8f0">',
        '<th style="padding:6px;border:1px solid #cbd5e1">الشهر</th><th style="padding:6px;border:1px solid #cbd5e1">المستحق</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">المدفوع</th><th style="padding:6px;border:1px solid #cbd5e1">المتبقي</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">الحالة</th></tr></thead><tbody>', monthRows, '</tbody></table></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">حركات الساكن</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#e2e8f0">',
        '<th style="padding:6px;border:1px solid #cbd5e1">الشهر</th><th style="padding:6px;border:1px solid #cbd5e1">المبلغ</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">طريقة الدفع</th><th style="padding:6px;border:1px solid #cbd5e1">التاريخ</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">ملاحظات</th></tr></thead><tbody>', paymentRows, '</tbody></table></section>',
        '<p style="font-size:10px;color:#475569;border-top:1px solid #cbd5e1;padding-top:10px">',
        'كل شهر محسوب بقيمة الاشتراك السارية فيه، والمدفوع هو المسجل على الشهر نفسه. هذا الكشف للقراءة فقط ولا يعدل أي بيانات.',
        '</p><footer style="font-size:9px;color:#64748b;margin-top:18px;text-align:center">Manzil — ',
        esc(formatDate(statement.generatedAt)), '</footer></div>'
    ].join('');
}

function renderUnitReportPdfHtml(statement) {
    const resident = statement.resident;
    const currentMonth = getCurrentMonth();
    const currentRate = getSubscriptionAmountForMonth(resident, currentMonth);
    const currentRow = statement.months.find(row => row.month === currentMonth);
    const unpaidRows = statement.months.filter(row => row.remainingCents > 0);
    const profileRows = [
        ['رقم الشقة', esc(resident.apartmentNumber || '—')],
        ['الدور', esc(resident.floor || '—')],
        ['الساكن', esc(resident.name || '—')],
        ['الهاتف', esc(resident.phone || 'غير مسجل')],
        ['تاريخ إضافة الوحدة', esc(formatDate(resident.createdAt) || '—')],
        ['قيمة الاشتراك الحالية', fmtMoney(currentRate)]
    ].map(([label, value]) => '<tr>' + statementPdfHeadCell(label) + statementPdfCell(value) + '</tr>').join('');
    const unpaidHtml = unpaidRows.length
        ? unpaidRows.map(row => '<tr>' + statementPdfCell(esc(row.month)) + statementPdfCell(fmtMoney(row.remainingCents / 100), 'color:#be123c;font-weight:700') + '</tr>').join('')
        : '<tr><td colspan="2" style="padding:8px;border:1px solid #cbd5e1;text-align:center;color:#047857">لا توجد أشهر غير مسددة.</td></tr>';
    const currentSummary = currentRow
        ? `${currentMonth}: مستحق ${fmtMoney(currentRow.dueCents / 100)} • مدفوع ${fmtMoney(currentRow.paidCents / 100)} • متبقٍ ${fmtMoney(currentRow.remainingCents / 100)}`
        : 'لا يوجد استحقاق للشهر الحالي.';

    return [
        '<div dir="rtl" lang="ar" style="font-family:Cairo,Arial,sans-serif;color:#111827;background:#fff;line-height:1.8">',
        '<header style="text-align:center;border-bottom:2px solid #334155;padding-bottom:12px;margin-bottom:18px">',
        '<h1 style="font-size:22px;font-weight:800;margin:0">', esc(state.buildingName || 'Manzil'), '</h1>',
        '<h2 style="font-size:17px;font-weight:700;margin:4px 0">تقرير وحدة — شقة ', esc(resident.apartmentNumber || '—'), '</h2>',
        '<p style="font-size:11px;color:#475569;margin:0">',
        esc(resident.name || '—'), resident.floor ? ' • الدور ' + esc(resident.floor) : '',
        ' • الفترة: ', esc(statement.rangeLabel), '</p></header>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">بيانات الوحدة</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:11px"><tbody>', profileRows, '</tbody></table></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">الوضع المالي</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:11px"><tbody>',
        '<tr>', statementPdfHeadCell('إجمالي المستحق'), statementPdfCell(fmtMoney(statement.totals.dueCents / 100)), '</tr>',
        '<tr>', statementPdfHeadCell('إجمالي المدفوع'), statementPdfCell(fmtMoney(statement.totals.paidCents / 100), 'color:#047857;font-weight:700'), '</tr>',
        '<tr>', statementPdfHeadCell('إجمالي المتبقي'), statementPdfCell(fmtMoney(statement.totals.remainingCents / 100), 'font-weight:700'), '</tr>',
        '<tr>', statementPdfHeadCell('أشهر متأخرة'), statementPdfCell(fmtNum(statement.totals.arrearsMonths)), '</tr>',
        '</tbody></table>',
        '<p style="font-size:11px;color:#334155;margin:8px 0 0">', esc(currentSummary), '</p></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">المتأخرات</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#e2e8f0">',
        '<th style="padding:6px;border:1px solid #cbd5e1">الشهر</th><th style="padding:6px;border:1px solid #cbd5e1">المتبقي</th>',
        '</tr></thead><tbody>', unpaidHtml, '</tbody></table></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">حساب الشهور</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#e2e8f0">',
        '<th style="padding:6px;border:1px solid #cbd5e1">الشهر</th><th style="padding:6px;border:1px solid #cbd5e1">المستحق</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">المدفوع</th><th style="padding:6px;border:1px solid #cbd5e1">المتبقي</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">الحالة</th></tr></thead><tbody>', renderStatementMonthsPdfBody(statement), '</tbody></table></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">حركات الساكن</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#e2e8f0">',
        '<th style="padding:6px;border:1px solid #cbd5e1">الشهر</th><th style="padding:6px;border:1px solid #cbd5e1">المبلغ</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">طريقة الدفع</th><th style="padding:6px;border:1px solid #cbd5e1">التاريخ</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">ملاحظات</th></tr></thead><tbody>', renderStatementPaymentsPdfBody(statement), '</tbody></table></section>',
        '<p style="font-size:10px;color:#475569;border-top:1px solid #cbd5e1;padding-top:10px">',
        'تقرير وحدة للقراءة فقط ولا يعدل أي بيانات. كل شهر محسوب بقيمة الاشتراك السارية فيه، والمدفوع هو المسجل على الشهر نفسه.',
        '</p><footer style="font-size:9px;color:#64748b;margin-top:18px;text-align:center">Manzil — ',
        esc(formatDate(statement.generatedAt)), '</footer></div>'
    ].join('');
}

async function downloadStatementPdf(statement, html, filename, buttonId, successMessage, logLabel) {
    let root = null;
    const button = document.getElementById(buttonId);
    if (button) button.disabled = true;
    try {
        await ensurePdfLibrary();
        if (document.fonts && document.fonts.ready) await document.fonts.ready;

        root = document.createElement('section');
        root.dir = 'rtl';
        root.lang = 'ar';
        root.style.cssText = 'position:fixed;top:0;left:0;width:190mm;padding:8mm;box-sizing:border-box;background:#fff;z-index:-1';
        root.innerHTML = html;
        document.body.appendChild(root);

        const pdfBlob = await window.html2pdf().set({
            margin: 8,
            filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        }).from(root).outputPdf('blob');

        if (!(pdfBlob instanceof Blob) || pdfBlob.type !== 'application/pdf' || pdfBlob.size < 100) {
            throw new Error('statement_pdf_generation_failed');
        }

        const url = URL.createObjectURL(pdfBlob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        toast(successMessage, 'success');
    } catch (error) {
        console.error(logLabel, error);
        toast('تعذر إنشاء PDF. تحقق من الاتصال ثم أعد المحاولة.','error');
    } finally {
        if (root) root.remove();
        if (button && residentStatementSnapshot) button.disabled = false;
    }
}

async function exportResidentStatementPdf() {
    if (!requireManager()) return;
    const statement = getResidentStatementSnapshot();
    if (!statement) return;
    await downloadStatementPdf(
        statement,
        renderResidentStatementPdfHtml(statement),
        `manzil_statement_${getStatementFileSlug(statement)}.pdf`,
        'statementPdfBtn',
        'تم إنشاء كشف الحساب PDF.',
        'Resident statement PDF export failed:'
    );
}

async function exportUnitReportPdf() {
    if (!requireManager()) return;
    const statement = getResidentStatementSnapshot();
    if (!statement) return;
    await downloadStatementPdf(
        statement,
        renderUnitReportPdfHtml(statement),
        `manzil_unit_${getStatementFileSlug(statement)}.pdf`,
        'unitReportPdfBtn',
        'تم إنشاء تقرير الوحدة PDF.',
        'Unit report PDF export failed:'
    );
}

function exportResidentStatementCsv() {
    if (!requireManager()) return;
    const statement = getResidentStatementSnapshot();
    if (!statement) return;
    const rows = [['الشهر','المستحق','المدفوع','المتبقي','الحالة']];
    statement.months.forEach(row => {
        rows.push([row.month, row.dueCents / 100, row.paidCents / 100, row.remainingCents / 100, row.status.label]);
    });
    rows.push([]);
    rows.push(['الحركات','الشهر','المبلغ','طريقة الدفع','التاريخ','ملاحظات']);
    statement.payments.forEach(payment => {
        rows.push(['تحصيل', payment.month, payment.amountCents / 100, payment.method, formatDate(payment.date) || '', payment.notes]);
    });
    downloadCsv(`manzil_statement_${getStatementFileSlug(statement)}.csv`, rows);
    toast('تم تصدير كشف الحساب','success');
}
