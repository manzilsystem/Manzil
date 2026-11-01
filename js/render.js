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
    renderNotices(); renderAuditLog(); populateSelects();
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

function renderDashboard() {
    const totalIncome = state.income.reduce((s,i) => s + (parseFloat(i.amount)||0), 0);
    const totalExpense = state.expenses.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
    const net = (state.startingBalance||0) + totalIncome - totalExpense;
    document.getElementById('totalIncomeDisplay').textContent = fmtNum(totalIncome)+' ج.م';
    document.getElementById('totalExpenseDisplay').textContent = fmtNum(totalExpense)+' ج.م';
    const netEl = document.getElementById('netBalanceDisplay');
    netEl.textContent = fmtNum(net)+' ج.م';
    netEl.className = `text-2xl sm:text-3xl font-black mt-0.5 ${net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    renderCashFlowChart(); renderUnpaidResidents(); renderExpenseBreakdown(); renderRecent();
}

function renderCashFlowChart() {
    const c = document.getElementById('cashFlowChartContainer');
    const months = getActiveBuildingMonths().slice(-6);
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', 'مخطط مقارنة التحصيلات والمصروفات خلال آخر ستة أشهر');
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

function renderExpenseBreakdown() {
    const c = document.getElementById('expenseCategoriesBreakdown');
    const by = {};
    state.expenses.forEach(e => { const k = e.category||'أخرى'; by[k] = (by[k]||0) + (parseFloat(e.amount)||0); });
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
    if (!items.length) { c.innerHTML = '<div class="app-card p-8 rounded-3xl border text-center"><p class="text-slate-500 text-sm">لا توجد تحصيلات</p></div>'; return; }
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
    if (!items.length) { c.innerHTML = '<div class="app-card p-8 rounded-3xl border text-center"><p class="text-slate-500 text-sm">لا توجد مصروفات</p></div>'; return; }
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
    let list = [...state.residents].sort((a,b) => (a.apartmentNumber||'').localeCompare(b.apartmentNumber||'', 'ar', { numeric: true }));
    if (s) list = list.filter(r => (r.name||'').toLowerCase().includes(s) || (r.apartmentNumber||'').toLowerCase().includes(s));
    if (!list.length) { c.innerHTML = '<div class="app-card p-8 rounded-3xl border text-center col-span-full"><p class="text-slate-500 text-sm">لا توجد شقق</p></div>'; return; }
    const cur = getCurrentMonth();
    c.innerHTML = list.map(r => {
        const d = calculateCumulativeDebt(r.id);
        const outstanding = getMonthOutstanding(r, cur);
        const paid = outstanding <= 0;
        const partiallyPaid = !paid && getPaidAmountForMonth(r.id, cur) > 0;
        return `<div class="app-card p-4 rounded-3xl border space-y-3">
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-2">
                    <div class="w-11 h-11 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center text-sm font-black shrink-0">${esc(r.apartmentNumber||'?')}</div>
                    <div><p class="text-sm font-bold">${esc(r.name)}</p><p class="text-[10px] text-slate-500">${esc(r.phone||'')}</p></div>
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
            <div class="flex gap-2">
                ${paid ? '<div class="flex-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 py-2 rounded-xl text-xs font-bold text-center"><i class="fa-solid fa-check ml-1"></i> مدفوع بالكامل</div>'
                    : `<button onclick="quickPayResident('${r.id}')" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl text-xs font-bold transition"><i class="fa-solid fa-check ml-1"></i> ${partiallyPaid ? `استكمال ${fmtNum(outstanding)}` : 'تسجيل دفع'}</button>`}
                <button onclick="sendWhatsAppReminder('${r.id}')" aria-label="إرسال تذكير واتساب إلى ${esc(r.name)}" class="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-xl text-xs font-bold"><i class="fa-brands fa-whatsapp"></i></button>
            </div>
        </div>`;
    }).join('');
                                   }
