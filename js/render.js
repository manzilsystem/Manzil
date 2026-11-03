function renderAuditLog() {
    const c = document.getElementById('auditLogContainer'); if (!c) return;
    if (!state.auditLogs.length) { c.innerHTML = '<p class="text-slate-500 text-xs text-center py-2">لا يوجد سجل</p>'; return; }
    c.innerHTML = state.auditLogs.slice(0, 30).map(l => `
        <div class="text-[10px] text-slate-400 flex justify-between gap-2 border-b border-slate-800 pb-1">
            <span class="truncate"><strong class="text-slate-300">${esc(l.action)}</strong>: ${esc(l.details)}</span>
            <span class="shrink-0 text-slate-500">${formatDate(l.date)}</span>
        </div>`).join('');
}

function renderAll() {
    document.getElementById('headerBuildingTitle').textContent = state.buildingName || 'Manzil';
    document.getElementById('printBuildingTitle').textContent = `كشف حساب مالي - ${state.buildingName || 'Manzil'}`;
    document.getElementById('printBuildingMeta').textContent = `المدير: ${state.managerName || '—'} • ${getCurrentMonth()}`;
    renderDashboard(); renderIncomeTable(); renderExpenseTable(); renderResidentsGrid();
    renderNotices(); renderAuditLog(); renderArrearsReport(); populateSelects();
}

function getArrearsReportFilters() {
    return {
        residentId: document.getElementById('arrearsApartmentFilter')?.value || '',
        fromMonth: document.getElementById('arrearsFromMonth')?.value || '',
        toMonth: document.getElementById('arrearsToMonth')?.value || '',
        status: document.getElementById('arrearsStatusFilter')?.value || 'all'
    };
}

function populateArrearsApartmentFilter() {
    const select = document.getElementById('arrearsApartmentFilter');
    if (!select) return;
    const selected = select.value;
    const options = state.residents
        .slice()
        .sort((a, b) => String(a.apartmentNumber || '').localeCompare(String(b.apartmentNumber || ''), 'ar', { numeric: true }))
        .map(resident => `<option value="${esc(resident.id)}">شقة ${esc(resident.apartmentNumber)} · ${esc(resident.name)}</option>`)
        .join('');
    select.innerHTML = '<option value="">كل الشقق</option>' + options;
    if (selected && state.residents.some(resident => resident.id === selected)) select.value = selected;
}

function resetArrearsFilters() {
    ['arrearsApartmentFilter','arrearsFromMonth','arrearsToMonth'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
    const status = document.getElementById('arrearsStatusFilter');
    if (status) status.value = 'all';
    renderArrearsReport();
}

function renderArrearsReport() {
    const c = document.getElementById('arrearsReportContainer');
    if (!c) return;
    populateArrearsApartmentFilter();
    const filters = getArrearsReportFilters();
    const report = buildArrearsReport(filters);
    if (!report.residents.length) {
        const message = report.invalidRange
            ? 'الفترة المحددة غير صحيحة: شهر البداية بعد شهر النهاية.'
            : (filters.residentId || filters.fromMonth || filters.toMonth || filters.status !== 'all')
                ? 'لا توجد متأخرات تطابق الفلاتر المحددة.'
                : 'لا توجد متأخرات مستحقة حالياً.';
        c.innerHTML = `<p class="text-slate-400 text-xs text-center py-4">${message}</p>`;
        return;
    }
    const cards = report.residents.map(item => `
        <details class="app-input border rounded-2xl p-3" open>
            <summary class="cursor-pointer list-none flex items-center justify-between gap-3">
                <span class="min-w-0"><strong class="text-xs">شقة ${esc(item.resident.apartmentNumber)}</strong><span class="text-[11px] text-slate-400 mr-2">${esc(item.resident.name)}</span></span>
                <span class="text-xs font-black text-rose-400 shrink-0">${fmtNum(item.totalDebt)} ج.م</span>
            </summary>
            <div class="mt-3 pt-2 border-t border-slate-700/50 space-y-1">
                <p class="text-[10px] text-amber-400">${esc(item.bucket)} • ${item.count} شهر غير مسدد</p>
                ${item.unpaidMonths.map(month => `<div class="flex justify-between text-[11px]"><span>${esc(month.month)}</span><span class="text-rose-400">${fmtNum(month.amount)} ج.م</span></div>`).join('')}
            </div>
        </details>`).join('');
    c.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div class="app-input border rounded-xl p-2 text-center"><p class="text-[10px] text-slate-500">إجمالي المديونية</p><p class="text-xs font-black text-rose-400">${fmtNum(report.totalDebt)} ج.م</p></div>
            <div class="app-input border rounded-xl p-2 text-center"><p class="text-[10px] text-slate-500">الشقق المتأخرة</p><p class="text-xs font-black">${fmtNum(report.overdueResidents)}</p></div>
            <div class="app-input border rounded-xl p-2 text-center"><p class="text-[10px] text-slate-500">الأشهر</p><p class="text-xs font-black">${fmtNum(report.overdueMonths)}</p></div>
            <div class="app-input border rounded-xl p-2 text-center"><p class="text-[10px] text-slate-500">4+ أشهر</p><p class="text-xs font-black text-amber-400">${fmtNum(report.buckets['4 أشهر فأكثر'])}</p></div>
        </div>
        <div class="space-y-2">${cards}</div>`;
}

function populateSelects() {
    const months = getActiveBuildingMonths();
    const current = getCurrentMonth();
    ['incomeMonth','expenseMonth','reportMonthSelect'].forEach(id => {
        const el = document.getElementById(id); if (!el) return;
        const v = el.value || current;
        el.innerHTML = months.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
        el.value = months.includes(v) ? v : current;
    });
    const rs = document.getElementById('incomeResident');
    if (rs) {
        const v = rs.value;
        rs.innerHTML = '<option value="">اختر الشقة</option>' + state.residents.map(r => `<option value="${r.id}">${esc(r.name)} - شقة ${esc(r.apartmentNumber)}</option>`).join('');
        rs.value = v;
    }
}

function getDashboardPeriod() {
    const value = document.getElementById('dashboardPeriodFilter')?.value || 'all';
    return ['current', 'last6'].includes(value) ? value : 'all';
}
function getDashboardPeriodMonths(period = getDashboardPeriod()) {
    const cursor = new Date();
    cursor.setDate(1);
    const count = period === 'current' ? 1 : 6;
    const months = [];
    for (let offset = 0; offset < count; offset += 1) {
        months.push(`${monthsNames[cursor.getMonth()]} ${cursor.getFullYear()}`);
        cursor.setMonth(cursor.getMonth() - 1);
    }
    return months.reverse();
}
function getDashboardPeriodLabel(period = getDashboardPeriod()) {
    if (period === 'all') return 'كل السجل';
    if (period === 'current') return getCurrentMonth();
    const months = getDashboardPeriodMonths(period);
    return `${months[0]} – ${months[months.length - 1]}`;
}
function matchesDashboardPeriod(record, period = getDashboardPeriod(), periodMonths = null) {
    if (period === 'all') return true;
    const monthSet = periodMonths || new Set(getDashboardPeriodMonths(period));
    return monthSet.has(record.month);
}

function renderDashboard() {
    const period = getDashboardPeriod();
    const periodLabel = getDashboardPeriodLabel(period);
    const periodMonths = new Set(getDashboardPeriodMonths(period));
    const income = state.income.filter(item => matchesDashboardPeriod(item, period, periodMonths));
    const expenses = state.expenses.filter(item => matchesDashboardPeriod(item, period, periodMonths));
    const totalIncome = income.reduce((s,i) => s + (parseFloat(i.amount)||0), 0);
    const totalExpense = expenses.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
    const lifetimeIncome = state.income.reduce((s,i) => s + (parseFloat(i.amount)||0), 0);
    const lifetimeExpense = state.expenses.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
    const net = (state.startingBalance||0) + lifetimeIncome - lifetimeExpense;
    document.getElementById('totalIncomeDisplay').textContent = fmtNum(totalIncome)+' ج.م';
    document.getElementById('totalExpenseDisplay').textContent = fmtNum(totalExpense)+' ج.م';
    const incomeLabel = document.getElementById('incomePeriodLabel');
    const expenseLabel = document.getElementById('expensePeriodLabel');
    if (incomeLabel) incomeLabel.textContent = period === 'all' ? 'إجمالي التحصيلات المسجلة منذ بدء التسجيل' : `إجمالي التحصيلات — ${periodLabel}`;
    if (expenseLabel) expenseLabel.textContent = period === 'all' ? 'إجمالي المصروفات المسجلة منذ بدء التسجيل' : `إجمالي المصروفات — ${periodLabel}`;
    const breakdownPeriodLabel = document.getElementById('expenseBreakdownPeriodLabel');
    if (breakdownPeriodLabel) breakdownPeriodLabel.textContent = periodLabel;
    const netEl = document.getElementById('netBalanceDisplay');
    netEl.textContent = fmtNum(net)+' ج.م';
    netEl.className = `text-2xl sm:text-3xl font-black mt-0.5 ${net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    const currentMonth = getCurrentMonth();
    const currentMonthDue = state.residents.reduce((sum, resident) => sum + (Number(resident.monthlyAmount ?? state.defaultSubscription) || 0), 0);
    const currentMonthPaid = state.residents.reduce((sum, resident) => sum + getPaidAmountForMonth(resident.id, currentMonth), 0);
    const partialPayments = state.residents.filter(resident => {
        const paid = getPaidAmountForMonth(resident.id, currentMonth);
        return paid > 0 && paid < (Number(resident.monthlyAmount ?? state.defaultSubscription) || 0);
    }).length;
    const collectionRate = currentMonthDue > 0 ? Math.min(100, Math.round((currentMonthPaid / currentMonthDue) * 100)) : 0;
    const rateEl = document.getElementById('collectionRateDisplay');
    const paidEl = document.getElementById('currentMonthPaidDisplay');
    const partialEl = document.getElementById('partialPaymentsDisplay');
    const monthLabel = document.getElementById('currentMonthSummaryLabel');
    const rateBar = document.getElementById('collectionRateBar');
    const progress = rateBar?.parentElement;
    if (rateEl) rateEl.textContent = `${collectionRate}%`;
    if (paidEl) paidEl.textContent = `${fmtNum(currentMonthPaid)} ج.م`;
    if (partialEl) partialEl.textContent = fmtNum(partialPayments);
    if (monthLabel) monthLabel.textContent = currentMonth;
    if (rateBar) rateBar.style.width = `${collectionRate}%`;
    if (progress) { progress.setAttribute('aria-valuenow', String(collectionRate)); progress.setAttribute('aria-valuetext', `${collectionRate}%`); }
    renderCashFlowChart(period); renderUnpaidResidents(); renderExpenseBreakdown(period, periodMonths); renderRecent();
}

function renderCashFlowChart(period = getDashboardPeriod()) {
    const c = document.getElementById('cashFlowChartContainer');
    const months = period === 'all' ? getActiveBuildingMonths().slice(-6) : getDashboardPeriodMonths(period);
    const periodLabel = document.getElementById('cashFlowPeriodLabel');
    if (periodLabel) periodLabel.textContent = period === 'all' ? 'عرض آخر 6 أشهر' : getDashboardPeriodLabel(period);
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', `مخطط مقارنة التحصيلات والمصروفات — ${periodLabel?.textContent || 'آخر ستة أشهر'}`);
    if (!months.length) { c.innerHTML = '<p class="text-slate-500 text-xs text-center w-full py-6">لا توجد بيانات</p>'; return; }
    const inc = {}, exp = {};
    months.forEach(m => { inc[m]=0; exp[m]=0; });
    state.income.forEach(i => { if (inc[i.month]!==undefined) inc[i.month]+=parseFloat(i.amount)||0; });
    state.expenses.forEach(e => { if (exp[e.month]!==undefined) exp[e.month]+=parseFloat(e.amount)||0; });
    const max = Math.max(1, ...Object.values(inc), ...Object.values(exp));
    c.innerHTML = months.map(m => {
        const ih = (inc[m]/max)*100, eh = (exp[m]/max)*100;
        return `<div class="flex flex-col items-center flex-1 gap-1">
            <div class="flex items-end gap-0.5 w-full justify-center" style="height:100px;">
                <div class="bg-emerald-500 rounded-t w-2 sm:w-3" style="height:${Math.max(2,ih)}%;" title="تحصيل ${fmtNum(inc[m])}"></div>
                <div class="bg-rose-500 rounded-t w-2 sm:w-3" style="height:${Math.max(2,eh)}%;" title="مصروف ${fmtNum(exp[m])}"></div>
            </div>
            <span class="text-[9px] text-slate-500 truncate w-full text-center">${esc(m.split(' ')[0].substring(0,4))}</span>
        </div>`;
    }).join('');
}

function renderUnpaidResidents() {
    const c = document.getElementById('unpaidResidentsContainer');
    if (!state.residents.length) { c.innerHTML = '<p class="text-slate-500 text-xs text-center py-2">أضف شقق أولاً</p>'; return; }
    const list = state.residents.map(r => ({ r, d: calculateCumulativeDebt(r.id) })).filter(x => x.d.count > 0);
    if (!list.length) { c.innerHTML = '<p class="text-emerald-400 text-xs text-center py-2">✅ لا توجد متأخرات</p>'; return; }
    c.innerHTML = list.map(x => `
        <div class="flex items-center justify-between app-input rounded-2xl p-2.5 border">
            <div class="flex items-center gap-2 min-w-0">
                <div class="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center text-xs font-bold shrink-0">${esc(x.r.apartmentNumber||'?')}</div>
                <div class="min-w-0"><p class="text-xs font-bold truncate">${esc(x.r.name)}</p><p class="text-[10px] text-slate-500">${x.d.count} شهر عليه رصيد</p></div>
            </div>
            <div class="text-right shrink-0">
                <p class="text-xs font-black text-rose-400">${fmtNum(x.d.totalDebt)} ج.م</p>
                    <button onclick="sendWhatsAppReminder('${x.r.id}')" aria-label="إرسال تذكير واتساب إلى ${esc(x.r.name)}" class="text-[10px] text-emerald-400 hover:underline"><i class="fa-brands fa-whatsapp"></i> تذكير</button>
            </div>
        </div>`).join('');
}

function renderExpenseBreakdown(period = getDashboardPeriod(), periodMonths = null) {
    const c = document.getElementById('expenseCategoriesBreakdown');
    const by = {};
    state.expenses.filter(expense => matchesDashboardPeriod(expense, period, periodMonths))
        .forEach(e => { const k = e.category||'أخرى'; by[k] = (by[k]||0) + (parseFloat(e.amount)||0); });
    const entries = Object.entries(by).sort((a,b) => b[1]-a[1]);
    if (!entries.length) { c.innerHTML = '<p class="text-slate-500 text-xs text-center py-2">لا توجد مصروفات</p>'; return; }
    const total = entries.reduce((s,[,v]) => s+v, 0);
    c.innerHTML = entries.map(([k,v]) => {
        const pct = (v/total)*100;
        return `<div><div class="flex justify-between text-[11px] mb-1"><span class="font-bold">${esc(k)}</span><span class="text-slate-400">${fmtNum(v)} ج.م (${pct.toFixed(0)}%)</span></div>
        <div class="h-2 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-rose-500 to-amber-500 rounded-full" style="width:${pct}%"></div></div></div>`;
    }).join('');
}

function renderRecent() {
    const ri = [...state.income].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,4);
    const re = [...state.expenses].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,4);
    const ic = document.getElementById('recentIncomeList');
    ic.innerHTML = ri.length ? ri.map(i => { const r = state.residents.find(x => x.id === i.residentId); return `
        <div class="flex justify-between items-center app-input p-2 rounded-xl border text-xs">
            <div class="min-w-0"><p class="font-bold truncate">${esc(r?.name||'محذوف')}</p><p class="text-[10px] text-slate-500">${esc(i.month||'')}</p></div>
            <span class="text-emerald-400 font-black shrink-0">${fmtNum(i.amount)}</span>
        </div>`; }).join('') : '<p class="text-slate-500 text-xs text-center py-2">لا توجد تحصيلات</p>';
    const ec = document.getElementById('recentExpenseList');
    ec.innerHTML = re.length ? re.map(e => `
        <div class="flex justify-between items-center app-input p-2 rounded-xl border text-xs">
            <div class="min-w-0"><p class="font-bold truncate">${esc(e.title)}</p><p class="text-[10px] text-slate-500">${esc(e.category||'')}</p></div>
            <span class="text-rose-400 font-black shrink-0">${fmtNum(e.amount)}</span>
        </div>`).join('') : '<p class="text-slate-500 text-xs text-center py-2">لا توجد مصروفات</p>';
}

function renderNotices() {
    const c = document.getElementById('noticeBoardContent');
    if (!state.notices.length) { c.innerHTML = '<p class="text-slate-500 text-xs text-center py-2">لا توجد إعلانات</p>'; return; }
    c.innerHTML = state.notices.slice().reverse().map(n => `
        <div class="app-input p-3 rounded-2xl border">
            <p class="text-xs leading-relaxed whitespace-pre-line">${esc(n.text)}</p>
            <div class="flex justify-between items-center mt-2 pt-2 border-t border-slate-700/50">
                <span class="text-[10px] text-slate-500">${formatDate(n.date)}</span>
                <button onclick="deleteNotice('${n.id}')" class="text-[10px] text-rose-400 hover:underline"><i class="fa-solid fa-trash"></i> حذف</button>
            </div>
        </div>`).join('');
}

function renderIncomeTable() {
    const c = document.getElementById('incomeCardsList');
    const s = (document.getElementById('searchIncomeInput')?.value||'').toLowerCase();
    const fm = document.getElementById('filterIncomeMonth')?.value||'';
    const filterSel = document.getElementById('filterIncomeMonth');
    if (filterSel) { const v = filterSel.value; filterSel.innerHTML = '<option value="">كل الشهور</option>' + getActiveBuildingMonths().map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join(''); filterSel.value = v; }
    let items = [...state.income].sort((a,b) => new Date(b.date)-new Date(a.date));
    if (fm) items = items.filter(i => i.month === fm);
    if (s) items = items.filter(i => {
        const r = state.residents.find(x => x.id === i.residentId);
        return [r?.name, r?.apartmentNumber, i.month, i.notes, i.amount].some(value => String(value ?? '').toLocaleLowerCase('ar-EG').includes(s));
    });
    if (!items.length) {
        c.innerHTML = '<div class="app-card p-8 rounded-3xl border text-center space-y-3"><div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto"><i class="fa-solid fa-hand-holding-dollar"></i></div><div><p class="text-sm font-bold">لا توجد تحصيلات مطابقة</p><p class="text-xs text-slate-500 mt-1">سجّل أول تحصيل أو غيّر الفلتر الحالي.</p></div><button onclick="openModal(\'incomeModal\')" class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-2xl text-xs font-bold transition"><i class="fa-solid fa-plus"></i> تسجيل تحصيل</button></div>';
        return;
    }
    c.innerHTML = items.map(i => { const r = state.residents.find(x => x.id === i.residentId); return `
        <div class="app-card p-3 rounded-2xl border flex justify-between items-center gap-2">
            <div class="flex items-center gap-2 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-xs font-bold shrink-0">${esc(r?.apartmentNumber||'?')}</div>
                <div class="min-w-0"><p class="text-xs font-bold truncate">${esc(r?.name||'محذوف')}</p><p class="text-[10px] text-slate-500">${esc(i.month||'')} • ${formatDate(i.date)}</p></div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <span class="text-sm font-black text-emerald-400">${fmtNum(i.amount)}</span>
                <button onclick="deleteIncome('${i.id}')" class="text-rose-400 hover:text-rose-300 p-1"><i class="fa-solid fa-trash text-xs"></i></button>
            </div>
        </div>`; }).join('');
}

function renderExpenseTable() {
    const c = document.getElementById('expenseCardsList');
    const s = (document.getElementById('searchExpenseInput')?.value||'').toLowerCase();
    const fc = document.getElementById('filterExpenseCategory')?.value||'';
    const fm = document.getElementById('filterExpenseMonth')?.value||'';
    const filterSel = document.getElementById('filterExpenseMonth');
    if (filterSel) { const v = filterSel.value; filterSel.innerHTML = '<option value="">كل الشهور</option>' + getActiveBuildingMonths().map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join(''); filterSel.value = v; }
    let items = [...state.expenses].sort((a,b) => new Date(b.date)-new Date(a.date));
    if (fc) items = items.filter(e => e.category === fc);
    if (fm) items = items.filter(e => e.month === fm);
    if (s) items = items.filter(e => [e.title, e.category, e.month, e.notes, e.amount].some(value => String(value ?? '').toLocaleLowerCase('ar-EG').includes(s)));
    if (!items.length) {
        c.innerHTML = '<div class="app-card p-8 rounded-3xl border text-center space-y-3"><div class="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto"><i class="fa-solid fa-receipt"></i></div><div><p class="text-sm font-bold">لا توجد مصروفات مطابقة</p><p class="text-xs text-slate-500 mt-1">سجّل أول مصروف أو غيّر الفلاتر الحالية.</p></div><button onclick="openModal(\'expenseModal\')" class="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2.5 rounded-2xl text-xs font-bold transition"><i class="fa-solid fa-plus"></i> تسجيل مصروف</button></div>';
        return;
    }
    c.innerHTML = items.map(e => `
        <div class="app-card p-3 rounded-2xl border flex justify-between items-center gap-2">
            <div class="flex items-center gap-2 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center text-xs shrink-0"><i class="fa-solid fa-receipt"></i></div>
                <div class="min-w-0"><p class="text-xs font-bold truncate">${esc(e.title)}</p><p class="text-[10px] text-slate-500">${esc(e.category||'')} • ${esc(e.month||'')}</p></div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <span class="text-sm font-black text-rose-400">${fmtNum(e.amount)}</span>
                <button onclick="deleteExpense('${e.id}')" class="text-rose-400 hover:text-rose-300 p-1"><i class="fa-solid fa-trash text-xs"></i></button>
            </div>
        </div>`).join('');
}

function renderResidentsGrid() {
    const c = document.getElementById('residentsGrid');
    const s = (document.getElementById('searchResidentsInput')?.value||'').toLowerCase();
    const statusFilter = document.getElementById('residentStatusFilter')?.value || 'all';
    const sortBy = document.getElementById('residentSort')?.value || 'apartment';
    const getStatus = resident => {
        const outstanding = getMonthOutstanding(resident, getCurrentMonth());
        const paid = getPaidAmountForMonth(resident.id, getCurrentMonth());
        if (outstanding <= 0) return { key: 'paid', label: 'مسدد بالكامل', className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
        if (paid > 0) return { key: 'partial', label: 'دفع جزئي', className: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
        return { key: 'overdue', label: 'غير مسدد', className: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
    };
    let list = state.residents.map(r => ({ r, status: getStatus(r), debt: calculateCumulativeDebt(r.id) }));
    if (s) list = list.filter(item => String(item.r.name||'').toLocaleLowerCase('ar-EG').includes(s) || String(item.r.apartmentNumber||'').toLocaleLowerCase('ar-EG').includes(s));
    if (statusFilter !== 'all') list = list.filter(item => item.status.key === statusFilter);
    list.sort((a, b) => {
        if (sortBy === 'debt') return b.debt.totalDebt - a.debt.totalDebt;
        if (sortBy === 'name') return String(a.r.name||'').localeCompare(String(b.r.name||''), 'ar');
        return String(a.r.apartmentNumber||'').localeCompare(String(b.r.apartmentNumber||''), 'ar', { numeric: true });
    });
    if (!list.length) {
        const hasFilters = Boolean(s || statusFilter !== 'all');
        const emptyAction = hasFilters ? 'clearResidentFilters()' : "openResidentModal('add')";
        const emptyActionLabel = hasFilters ? '<i class="fa-solid fa-rotate-left"></i> مسح الفلاتر' : '<i class="fa-solid fa-user-plus"></i> إضافة شقة';
        c.innerHTML = `<div class="app-card p-8 rounded-3xl border text-center col-span-full space-y-3">
            <div class="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mx-auto"><i class="fa-solid ${hasFilters ? 'fa-filter-circle-xmark' : 'fa-building-circle-exclamation'}"></i></div>
            <div><p class="text-sm font-bold">${hasFilters ? 'لا توجد نتائج مطابقة' : 'لا توجد شقق بعد'}</p><p class="text-xs text-slate-500 mt-1">${hasFilters ? 'جرّب تغيير البحث أو الفلاتر الحالية.' : 'ابدأ بإضافة أول شقة لإدارة الاشتراكات والتحصيلات.'}</p></div>
            <button onclick="${emptyAction}" class="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-2xl text-xs font-bold transition">${emptyActionLabel}</button>
        </div>`;
        return;
    }
    const cur = getCurrentMonth();
    c.innerHTML = list.map(item => {
        const r = item.r;
        const d = item.debt;
        const outstanding = getMonthOutstanding(r, cur);
        const paid = outstanding <= 0;
        const partiallyPaid = !paid && getPaidAmountForMonth(r.id, cur) > 0;
        return `<div class="app-card p-4 rounded-3xl border space-y-3">
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-2">
                    <div class="w-11 h-11 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center text-sm font-black shrink-0">${esc(r.apartmentNumber||'?')}</div>
                    <div class="min-w-0"><p class="text-sm font-bold truncate">${esc(r.name)}</p><p class="text-[10px] text-slate-500 truncate">${esc(r.phone||'')}</p></div>
                </div>
                <div class="flex gap-1">
                    <button onclick="editResident('${r.id}')" aria-label="تعديل بيانات ${esc(r.name)}" class="text-indigo-400 hover:text-indigo-300 p-1.5"><i class="fa-solid fa-pen text-xs"></i></button>
                    <button onclick="deleteResident('${r.id}')" aria-label="حذف الشقة ${esc(r.apartmentNumber)}" class="text-rose-400 hover:text-rose-300 p-1.5"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2 text-center">
                <div class="app-input p-2 rounded-xl border"><p class="text-[10px] text-slate-500">الاشتراك</p><p class="text-xs font-bold">${fmtNum(r.monthlyAmount ?? state.defaultSubscription)}</p></div>
                <div class="app-input p-2 rounded-xl border"><p class="text-[10px] text-slate-500">المتأخرات</p><p class="text-xs font-bold ${d.count>0?'text-rose-400':'text-emerald-400'}">${d.count>0?fmtNum(d.totalDebt):'0'}</p></div>
            </div>
            <div class="flex items-center justify-between gap-2">
                <span class="text-[10px] font-bold border rounded-full px-2.5 py-1 ${item.status.className}">${item.status.label}</span>
                ${r.phone ? `<a href="tel:${esc(r.phone)}" class="text-[10px] text-indigo-400 hover:underline" aria-label="الاتصال بـ ${esc(r.name)}"><i class="fa-solid fa-phone ml-1"></i> اتصال</a>` : '<span></span>'}
            </div>
            <div class="flex gap-2">
                ${paid ? '<div class="flex-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 py-2 rounded-xl text-xs font-bold text-center"><i class="fa-solid fa-check ml-1"></i> مدفوع بالكامل</div>'
                    : `<button onclick="quickPayResident('${r.id}')" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl text-xs font-bold transition"><i class="fa-solid fa-check ml-1"></i> ${partiallyPaid ? `استكمال ${fmtNum(outstanding)}` : 'تسجيل دفع'}</button>`}
                <button onclick="sendWhatsAppReminder('${r.id}')" aria-label="إرسال تذكير واتساب إلى ${esc(r.name)}" class="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-xl text-xs font-bold"><i class="fa-brands fa-whatsapp"></i></button>
            </div>
        </div>`;
    }).join('');
}

function clearResidentFilters() {
    const search = document.getElementById('searchResidentsInput');
    const status = document.getElementById('residentStatusFilter');
    if (search) search.value = '';
    if (status) status.value = 'all';
    renderResidentsGrid();
}
