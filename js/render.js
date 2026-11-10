// @ts-check
const AUDIT_LOG_PAGE_SIZE = 50;
let auditLogVisibleCount = AUDIT_LOG_PAGE_SIZE;
let auditLogLastQuery = null;

function renderPurposeLabel(purposeCode) {
    return typeof getIncomePurposeLabel === 'function' ? getIncomePurposeLabel(purposeCode) : 'اشتراك شهري';
}

function renderCashAccountLabel(code) {
    return typeof getCashAccountLabel === 'function' ? getCashAccountLabel(code || 'main') : 'الخزنة الرئيسية';
}

function renderAuditLog(options) {
    const container = document.getElementById('auditLogContainer');
    if (!container) return;
    const query = String(/** @type {HTMLInputElement} */ (document.getElementById('auditLogSearch'))?.value || '').trim().toLocaleLowerCase('ar');
    if (query !== auditLogLastQuery) {
        auditLogLastQuery = query;
        auditLogVisibleCount = AUDIT_LOG_PAGE_SIZE;
    } else if (options && options.more) {
        auditLogVisibleCount += AUDIT_LOG_PAGE_SIZE;
    }
    const filtered = (state.auditLogs || []).filter(entry =>
        !query || [entry.action, entry.details, entry.actorName].some(value =>
            String(value || '').toLocaleLowerCase('ar').includes(query)
        )
    );
    if (!filtered.length) {
        container.innerHTML = `<p class="report-preview-empty">${query ? 'لا توجد نتائج مطابقة.' : 'لا يوجد سجل بعد.'}</p>`;
        return;
    }
    const visible = filtered.slice(0, auditLogVisibleCount);
    const remaining = filtered.length - visible.length;
    container.innerHTML = visible.map(entry => `
        <article class="audit-log-row">
            <p class="text-xs"><strong class="audit-log-action">${esc(entry.action)}</strong>${entry.details ? ': ' + esc(entry.details) : ''}</p>
            <p class="audit-log-meta">بواسطة: ${esc(entry.actorName || 'المدير')} · ${formatDate(entry.date)}</p>
        </article>`).join('') + `
        <div class="audit-log-footer">
            عرض ${fmtNum(visible.length)} من ${fmtNum(filtered.length)}
            ${remaining > 0 ? `<button type="button" onclick="renderAuditLog({ more: true })" class="audit-log-more">عرض المزيد (${fmtNum(remaining)})</button>` : ''}
        </div>`;
}

function renderAll() {
    document.getElementById('headerBuildingTitle').textContent = state.buildingName || 'Manzil';
    document.getElementById('printBuildingTitle').textContent = `كشف حساب مالي - ${state.buildingName || 'Manzil'}`;
    document.getElementById('printBuildingMeta').textContent = `المدير: ${state.managerName || '—'} • ${getCurrentMonth()}`;
    renderDashboard(); renderIncomeTable(); renderExpenseTable(); renderResidentsGrid();
    renderNotices(); renderAuditLog(); renderArrearsReport(); populateSelects();
    invalidateLandlordReportIfStale();
    invalidateResidentStatementIfStale();
    invalidatePeriodReportIfStale();
    if (typeof invalidateExpensesReportIfStale === 'function') invalidateExpensesReportIfStale();
    if (typeof invalidateAdjustmentsReportIfStale === 'function') invalidateAdjustmentsReportIfStale();
    syncReportNavStatus();
    renderCashbox();
    if (typeof renderManagerNotifications === 'function') renderManagerNotifications();
    if (typeof syncAssistantFab === 'function') syncAssistantFab();
}

function getArrearsReportFilters() {
    return {
        residentId: /** @type {HTMLSelectElement} */ (document.getElementById('arrearsApartmentFilter'))?.value || '',
        fromMonth: /** @type {HTMLInputElement} */ (document.getElementById('arrearsFromMonth'))?.value || '',
        toMonth: /** @type {HTMLInputElement} */ (document.getElementById('arrearsToMonth'))?.value || '',
        status: /** @type {HTMLSelectElement} */ (document.getElementById('arrearsStatusFilter'))?.value || 'all'
    };
}

function populateArrearsApartmentFilter() {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById('arrearsApartmentFilter'));
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
        const element = /** @type {HTMLInputElement | HTMLSelectElement} */ (document.getElementById(id));
        if (element) element.value = '';
    });
    const status = /** @type {HTMLSelectElement} */ (document.getElementById('arrearsStatusFilter'));
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
        c.innerHTML = `<p class="report-preview-empty">${message}</p>`;
        return;
    }
    const cards = report.residents.map(item => `
        <details class="arrears-card" open>
            <summary class="arrears-summary">
                <span class="arrears-identity">
                    <span class="arrears-badge" aria-hidden="true">${esc(item.resident.apartmentNumber)}</span>
                    <span class="min-w-0">
                        <span class="arrears-name">${esc(item.resident.name)}</span>
                        <span class="arrears-sub">${esc(item.bucket)} · ${fmtNum(item.count)} شهر غير مسدد${item.daysOverdue ? ` · متأخر ${esc(formatOverdueDuration(item.daysOverdue))}` : ''}</span>
                    </span>
                </span>
                <span class="arrears-amount report-amount">${fmtNum(item.totalDebt)} ج.م</span>
            </summary>
            <div class="arrears-body">
                <div class="report-list">
                    ${item.unpaidMonths.map(month => `<div class="report-list-row"><span class="report-list-title">${esc(month.month)}${month.daysOverdue ? ` <span class="text-xs text-slate-500">(متأخر ${esc(formatOverdueDuration(month.daysOverdue))})</span>` : ''}</span><span class="report-list-value text-rose-400 report-amount">${fmtNum(month.amount)} ج.م</span></div>`).join('')}
                </div>
            </div>
        </details>`).join('');
    c.innerHTML = `
        <div class="report-stats report-stats-4">
            <div class="report-stat"><p class="report-stat-label">إجمالي المديونية</p><p class="report-stat-value text-rose-400">${fmtNum(report.totalDebt)} ج.م</p></div>
            <div class="report-stat"><p class="report-stat-label">الشقق المتأخرة</p><p class="report-stat-value">${fmtNum(report.overdueResidents)}</p></div>
            <div class="report-stat"><p class="report-stat-label">الأشهر</p><p class="report-stat-value">${fmtNum(report.overdueMonths)}</p></div>
            <div class="report-stat"><p class="report-stat-label">4+ أشهر</p><p class="report-stat-value text-amber-400">${fmtNum(report.buckets['4 أشهر فأكثر'])}</p></div>
        </div>
        <div class="space-y-2">${cards}</div>`;
}

function populateSelects() {
    const months = typeof getBuildingMonthOptions === 'function' ? getBuildingMonthOptions(12) : getActiveBuildingMonths();
    const current = getCurrentMonth();
    ['incomeMonth','expenseMonth','cashboxSummaryMonth','reportMonthSelect','monthlyCloseMonthSelect'].forEach(id => {
        const el = /** @type {HTMLSelectElement} */ (document.getElementById(id)); if (!el) return;
        const v = el.value || current;
        el.innerHTML = months.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
        el.value = months.includes(v) ? v : current;
    });
    const rs = /** @type {HTMLSelectElement} */ (document.getElementById('incomeResident'));
    if (rs) {
        const v = rs.value;
        const options = state.residents
            .slice()
            .sort((a, b) => String(a.apartmentNumber || '').localeCompare(String(b.apartmentNumber || ''), 'ar', { numeric: true }))
            .map(r => `<option value="${esc(r.id)}">${esc(formatApartmentLabel(r.apartmentNumber))} · ${esc(r.name)}</option>`)
            .join('');
        rs.innerHTML = '<option value="">اختر الشقة</option>' + options;
        rs.value = state.residents.some(r => r.id === v) ? v : '';
    }
    if (typeof renderIncomeResidentSummary === 'function') renderIncomeResidentSummary();
    const paymentMethodSelect = /** @type {HTMLSelectElement} */ (document.getElementById('incomePaymentMethod'));
    populatePaymentMethodOptions(paymentMethodSelect, paymentMethodSelect?.value || '');
    const purposeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('incomePurpose'));
    if (typeof populateIncomePurposeOptions === 'function') populateIncomePurposeOptions(purposeSelect, purposeSelect?.value || 'subscription');
    populateStatementResidentSelect();
    populatePeriodReportSelects(months, current);
    if (typeof populateExpensesReportFilters === 'function') populateExpensesReportFilters(months, current);
    if (typeof populateAdjustmentsReportFilters === 'function') populateAdjustmentsReportFilters(months, current);
    if (typeof populateReportPurposeFilters === 'function') populateReportPurposeFilters();
    if (typeof populateReportCashAccountFilters === 'function') populateReportCashAccountFilters();
    if (typeof populateReportPaymentMethodFilters === 'function') populateReportPaymentMethodFilters();
    if (typeof populateReportResidentFilters === 'function') populateReportResidentFilters();
}

function populatePeriodReportSelects(months, current = getCurrentMonth()) {
    const currentKey = monthLabelToKey(current) || '';
    const defaultFrom = currentKey ? (getStatementMonthLabel(shiftStatementMonthKey(currentKey, -5)) || current) : current;
    const defaults = { periodReportFrom: defaultFrom, periodReportTo: current };
    ['periodReportFrom', 'periodReportTo'].forEach(id => {
        const el = /** @type {HTMLSelectElement} */ (document.getElementById(id));
        if (!el) return;
        el.innerHTML = months.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
        const v = el.value || defaults[id];
        el.value = months.includes(v) ? v : defaults[id];
    });
}

function populateStatementResidentSelect() {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById('statementResidentSelect'));
    if (!select) return;
    const selected = select.value;
    const options = state.residents
        .slice()
        .sort((a, b) => String(a.apartmentNumber || '').localeCompare(String(b.apartmentNumber || ''), 'ar', { numeric: true }))
        .map(resident => `<option value="${esc(resident.id)}">شقة ${esc(resident.apartmentNumber)} · ${esc(resident.name)}</option>`)
        .join('');
    select.innerHTML = '<option value="">اختر المالك</option>' + options;
    if (selected && state.residents.some(resident => resident.id === selected)) select.value = selected;
}

function getDashboardPeriod() {
    const value = /** @type {HTMLSelectElement} */ (document.getElementById('dashboardPeriodFilter'))?.value || 'all';
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
    // المؤشرات العليا (التحصيلات/المصروفات/رصيد الخزنة) تراكمية دائمًا منذ بدء التسجيل،
    // وفلتر الفترة يخصّ المخطط المالي وتفصيل المصروفات فقط ليبقى النطاق موحّدًا.
    const lifetimeIncome = state.income.reduce((s,i) => s + (parseFloat(i.amount)||0), 0);
    const lifetimeExpense = state.expenses.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
    const net = (state.startingBalance||0) + lifetimeIncome - lifetimeExpense;
    document.getElementById('totalIncomeDisplay').textContent = fmtNum(lifetimeIncome)+' ج.م';
    document.getElementById('totalExpenseDisplay').textContent = fmtNum(lifetimeExpense)+' ج.م';
    const incomeLabel = document.getElementById('incomePeriodLabel');
    const expenseLabel = document.getElementById('expensePeriodLabel');
    if (incomeLabel) incomeLabel.textContent = 'إجمالي التحصيلات المسجلة منذ بدء التسجيل';
    if (expenseLabel) expenseLabel.textContent = 'إجمالي المصروفات المسجلة منذ بدء التسجيل';
    const breakdownPeriodLabel = document.getElementById('expenseBreakdownPeriodLabel');
    if (breakdownPeriodLabel) breakdownPeriodLabel.textContent = periodLabel;
    const netEl = document.getElementById('netBalanceDisplay');
    netEl.textContent = fmtNum(net)+' ج.م';
    netEl.className = `text-2xl sm:text-3xl font-black mt-0.5 ${net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    const currentMonth = getCurrentMonth();
    const currentMonthDue = state.residents.reduce((sum, resident) => sum + (typeof getMonthlyDueAmountForMonth === 'function'
        ? getMonthlyDueAmountForMonth(resident, currentMonth) : getSubscriptionAmountForMonth(resident, currentMonth)), 0);
    const currentMonthPaid = state.residents.reduce((sum, resident) => sum + (typeof getMonthlyDuePaidAmount === 'function'
        ? getMonthlyDuePaidAmount(resident.id, currentMonth) : getPaidAmountForMonth(resident.id, currentMonth)), 0);
    const partialPayments = state.residents.filter(resident => {
        const paid = typeof getMonthlyDuePaidAmount === 'function'
            ? getMonthlyDuePaidAmount(resident.id, currentMonth) : getPaidAmountForMonth(resident.id, currentMonth);
        const due = typeof getMonthlyDueAmountForMonth === 'function'
            ? getMonthlyDueAmountForMonth(resident, currentMonth) : getSubscriptionAmountForMonth(resident, currentMonth);
        return paid > 0 && paid < due;
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
    const months = period === 'all'
        ? (typeof getRecentMonthLabels === 'function' ? getRecentMonthLabels(6) : getActiveBuildingMonths().slice(-6))
        : getDashboardPeriodMonths(period);
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
            <span class="text-xs text-slate-500 truncate w-full text-center">${esc(m.split(' ')[0].substring(0,4))}</span>
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
                <div class="min-w-0"><p class="text-xs font-bold truncate">${esc(x.r.name)}</p><p class="text-xs text-slate-500">${x.d.count} شهر عليه رصيد</p></div>
            </div>
            <div class="text-right shrink-0">
                <p class="text-xs font-black text-rose-400">${fmtNum(x.d.totalDebt)} ج.م</p>
                    <button onclick="sendWhatsAppReminder('${x.r.id}')" aria-label="إرسال تذكير واتساب إلى ${esc(x.r.name)}" class="text-xs text-emerald-400 hover:underline"><i class="fa-brands fa-whatsapp"></i> تذكير</button>
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
        return `<div><div class="flex justify-between text-xs mb-1"><span class="font-bold">${esc(k)}</span><span class="text-slate-400">${fmtNum(v)} ج.م (${pct.toFixed(0)}%)</span></div>
        <div class="h-2 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-rose-500 to-amber-500 rounded-full" style="width:${pct}%"></div></div></div>`;
    }).join('');
}

function renderRecent() {
    const ri = [...state.income].sort((a,b) => new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,4);
    const re = [...state.expenses].sort((a,b) => new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,4);
    const ic = document.getElementById('recentIncomeList');
    ic.innerHTML = ri.length ? ri.map(i => { const r = state.residents.find(x => x.id === i.residentId); return `
        <div class="flex justify-between items-center app-input p-2 rounded-xl border text-xs">
            <div class="min-w-0"><p class="font-bold truncate">${esc(r?.name||'محذوف')}</p><p class="text-xs text-slate-500">${esc(i.month||'')} • ${esc(renderPurposeLabel(i.purposeCode))}</p></div>
            <span class="text-emerald-400 font-black shrink-0">${fmtNum(i.amount)}</span>
        </div>`; }).join('') : '<p class="text-slate-500 text-xs text-center py-2">لا توجد تحصيلات</p>';
    const ec = document.getElementById('recentExpenseList');
    ec.innerHTML = re.length ? re.map(e => `
        <div class="flex justify-between items-center app-input p-2 rounded-xl border text-xs">
            <div class="min-w-0"><p class="font-bold truncate">${esc(e.title)}</p><p class="text-xs text-slate-500">${esc(e.category||'')}</p></div>
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
                <span class="text-xs text-slate-500">${formatDate(n.date)}</span>
                <button onclick="deleteNotice('${n.id}')" aria-label="حذف الإعلان" class="text-xs text-rose-400 hover:underline"><i class="fa-solid fa-trash"></i> حذف</button>
            </div>
        </div>`).join('');
}

function populateIncomeListFilters() {
    const definitions = [
        { id: 'filterIncomeMonth', label: 'كل الشهور', values: [...new Set((state.income || []).map(item => item.month).filter(Boolean))], format: value => value },
        { id: 'filterIncomePurpose', label: 'كل الأغراض', values: [...new Set((state.income || []).map(item => item.purposeCode || 'subscription'))], format: renderPurposeLabel },
        { id: 'filterIncomeCashbox', label: 'كل الصناديق', values: [...new Set((state.income || []).map(item => item.cashAccountCode || 'main'))], format: renderCashAccountLabel },
        { id: 'filterIncomePaymentMethod', label: 'كل طرق الدفع', values: [...new Set((state.income || []).map(item => item.paymentMethod || '__unspecified__'))], format: value => value === '__unspecified__' ? 'غير محدد' : getIncomePaymentMethodLabel(value) }
    ];
    definitions.forEach(definition => {
        const select = /** @type {HTMLSelectElement} */ (document.getElementById(definition.id));
        if (!select) return;
        const selected = select.value;
        const options = definition.values
            .sort((a, b) => String(definition.format(a)).localeCompare(String(definition.format(b)), 'ar-EG'))
            .map(value => `<option value="${esc(value)}">${esc(definition.format(value))}</option>`)
            .join('');
        select.innerHTML = `<option value="">${definition.label}</option>` + options;
        select.value = definition.values.includes(selected) ? selected : '';
    });
}

function getIncomeListBatchKey(item) {
    const reference = typeof getIncomeBatchReference === 'function'
        ? getIncomeBatchReference(item)
        : '';
    return reference ? `${item.residentId}:${item.date}:${reference}` : `income:${item.id}`;
}

function renderIncomeListRow(i, resident, rowIndexLabel = '') {
    const displayNotes = stripIncomeBatchNote(i.notes);
    const indexBadge = rowIndexLabel
        ? `<span class="text-xs font-bold text-slate-500 min-w-[1.75rem] text-center shrink-0" aria-hidden="true">${esc(rowIndexLabel)}</span>`
        : '';
    return `
        <div class="flex justify-between items-center gap-2 py-2 border-t border-slate-500/10 first:border-t-0">
            <div class="flex items-center gap-2 min-w-0">
                ${indexBadge}
                <div class="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-xs font-bold shrink-0">${esc(resident?.apartmentNumber || '?')}</div>
                <div class="min-w-0">
                    <p class="text-xs font-bold truncate">${esc(resident?.name || 'محذوف')}</p>
                    <p class="text-xs text-slate-500">${esc(formatApartmentLabel(resident?.apartmentNumber))} • ${esc(i.month || '')} • ${formatDate(i.date)} • ${esc(getIncomePaymentMethodLabel(i.paymentMethod))}</p>
                    <span class="cash-account-tag mt-1">${esc(renderPurposeLabel(i.purposeCode))}</span>
                    <span class="cash-account-tag mt-1"><i class="fa-solid fa-vault" aria-hidden="true"></i>${esc(renderCashAccountLabel(i.cashAccountCode))}</span>
                    ${displayNotes ? `<p class="mt-1 text-xs text-slate-400 truncate"><i class="fa-solid fa-note-sticky ml-1" aria-hidden="true"></i>${esc(displayNotes)}</p>` : ''}
                </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <span class="text-sm font-black text-emerald-400">${fmtNum(i.amount)}</span>
                <button onclick="openIncomeReceiptModal('${i.id}')" aria-label="عرض إيصال ${esc(resident?.name || '')}" title="عرض الإيصال وطباعته" class="text-indigo-400 hover:text-indigo-300 p-1"><i class="fa-solid fa-print text-sm"></i></button>
                <button onclick="sendIncomeReceiptOnWhatsApp('${i.id}')" aria-label="إرسال إيصال واتساب إلى ${esc(resident?.name || '')}" title="إرسال إيصال واتساب" class="text-emerald-400 hover:text-emerald-300 p-1"><i class="fa-brands fa-whatsapp text-sm"></i></button>
                <button onclick="openIncomeEditModal('${i.id}')" aria-label="تعديل التحصيل ${esc(i.month || '')}" class="icon-action text-indigo-400 hover:text-indigo-300 p-1"><i class="fa-solid fa-pen text-xs"></i></button>
                <button onclick="deleteIncome('${i.id}')" aria-label="حذف التحصيل ${esc(i.month || '')}" class="icon-action text-rose-400 hover:text-rose-300 p-1"><i class="fa-solid fa-trash text-xs"></i></button>
            </div>
        </div>`;
}

function renderIncomeTable() {
    const c = document.getElementById('incomeCardsList');
    if (!c) return;
    populateIncomeListFilters();
    const search = (/** @type {HTMLInputElement} */ (document.getElementById('searchIncomeInput'))?.value || '').toLocaleLowerCase('ar-EG');
    const month = /** @type {HTMLSelectElement} */ (document.getElementById('filterIncomeMonth'))?.value || '';
    const purpose = /** @type {HTMLSelectElement} */ (document.getElementById('filterIncomePurpose'))?.value || '';
    const cashbox = /** @type {HTMLSelectElement} */ (document.getElementById('filterIncomeCashbox'))?.value || '';
    const paymentMethod = /** @type {HTMLSelectElement} */ (document.getElementById('filterIncomePaymentMethod'))?.value || '';
    let items = [...(state.income || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (month) items = items.filter(item => item.month === month);
    if (purpose) items = items.filter(item => (item.purposeCode || 'subscription') === purpose);
    if (cashbox) items = items.filter(item => (item.cashAccountCode || 'main') === cashbox);
    if (paymentMethod) items = items.filter(item => paymentMethod === '__unspecified__'
        ? !item.paymentMethod
        : item.paymentMethod === paymentMethod);
    if (search) items = items.filter(item => {
        const resident = state.residents.find(person => person.id === item.residentId);
        return [resident?.name, resident?.apartmentNumber, item.month, item.notes, item.amount,
            getIncomePaymentMethodLabel(item.paymentMethod), renderPurposeLabel(item.purposeCode),
            renderCashAccountLabel(item.cashAccountCode)]
            .some(value => String(value ?? '').toLocaleLowerCase('ar-EG').includes(search));
    });

    const summary = document.getElementById('incomeResultsSummary');
    if (summary) {
        const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        summary.classList.toggle('hidden', false);
        summary.innerHTML = `
            <div><p class="text-slate-500">عدد الحركات</p><p class="font-bold text-sm">${fmtNum(items.length)}</p></div>
            <div><p class="text-slate-500">إجمالي النتائج</p><p class="font-black text-sm text-emerald-400">${fmtNum(total)} ج.م</p></div>`;
    }
    if (!items.length) {
        c.innerHTML = '<div class="app-card p-8 rounded-3xl border text-center space-y-3"><div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto"><i class="fa-solid fa-hand-holding-dollar"></i></div><div><p class="text-sm font-bold">لا توجد تحصيلات مطابقة</p><p class="text-xs text-slate-500 mt-1">سجّل أول تحصيل أو غيّر الفلاتر الحالية.</p></div><button onclick="openNewIncomeModal()" class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-2xl text-xs font-bold transition"><i class="fa-solid fa-plus"></i> تسجيل تحصيل</button></div>';
        return;
    }

    const groups = new Map();
    items.forEach(item => {
        const key = getIncomeListBatchKey(item);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    });
    c.innerHTML = [...groups.values()].map((group, groupIndex) => {
        const first = group[0];
        const resident = state.residents.find(person => person.id === first.residentId);
        const entryNumber = groupIndex + 1;
        if (group.length === 1) return `<div class="app-card p-3 rounded-2xl border">${renderIncomeListRow(first, resident, String(entryNumber))}</div>`;
        const batchTotal = group.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const batchReference = typeof getIncomeBatchReference === 'function' ? getIncomeBatchReference(first) : '';
        const batchMeta = [`${entryNumber}. دفعة مجمعة`];
        if (batchReference) batchMeta.push(batchReference);
        batchMeta.push(formatDate(first.date));
        batchMeta.push(`${fmtNum(group.length)} بنود`);
        return `
            <section class="app-card p-3 rounded-2xl border">
                <div class="flex justify-between items-center gap-2 pb-2">
                    <div class="min-w-0"><p class="text-xs font-bold">${esc(resident?.name || 'محذوف')} · شقة ${esc(resident?.apartmentNumber || '?')}</p><p class="text-xs text-slate-500">${esc(batchMeta.join(' · '))}</p></div>
                    <div class="flex items-center gap-2 shrink-0">
                        <p class="text-sm font-black text-emerald-400">${fmtNum(batchTotal)} ج.م</p>
                        <button onclick="openIncomeReceiptModal('${first.id}')" aria-label="عرض إيصال الدفعة كاملًا" title="عرض إيصال الدفعة وطباعته" class="text-indigo-400 hover:text-indigo-300 p-1"><i class="fa-solid fa-receipt text-sm"></i></button>
                        <button onclick="sendIncomeReceiptOnWhatsApp('${first.id}')" aria-label="إرسال إيصال الدفعة واتساب" title="إرسال إيصال الدفعة واتساب" class="text-emerald-400 hover:text-emerald-300 p-1"><i class="fa-brands fa-whatsapp text-sm"></i></button>
                    </div>
                </div>
                ${group.map(item => {
                    const position = typeof getIncomeBatchPosition === 'function' ? getIncomeBatchPosition(item) : null;
                    return renderIncomeListRow(item, resident, position ? `${position.index}/${position.total}` : '');
                }).join('')}
            </section>`;
    }).join('');
}

function renderExpenseTable() {
    const c = document.getElementById('expenseCardsList');
    const s = (/** @type {HTMLInputElement} */ (document.getElementById('searchExpenseInput'))?.value||'').toLowerCase();
    const fc = /** @type {HTMLSelectElement} */ (document.getElementById('filterExpenseCategory'))?.value||'';
    const fm = /** @type {HTMLSelectElement} */ (document.getElementById('filterExpenseMonth'))?.value||'';
    const filterSel = /** @type {HTMLSelectElement} */ (document.getElementById('filterExpenseMonth'));
    if (filterSel) { const v = filterSel.value; filterSel.innerHTML = '<option value="">كل الشهور</option>' + getActiveBuildingMonths().map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join(''); filterSel.value = v; }
    let items = [...state.expenses].sort((a,b) => new Date(b.date).getTime()-new Date(a.date).getTime());
    if (fc) items = items.filter(e => e.category === fc);
    if (fm) items = items.filter(e => e.month === fm);
    if (s) items = items.filter(e => [e.title, e.category, e.month, e.notes, e.amount, renderCashAccountLabel(e.cashAccountCode)].some(value => String(value ?? '').toLocaleLowerCase('ar-EG').includes(s)));
    if (!items.length) {
        c.innerHTML = '<div class="app-card p-8 rounded-3xl border text-center space-y-3"><div class="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto"><i class="fa-solid fa-receipt"></i></div><div><p class="text-sm font-bold">لا توجد مصروفات مطابقة</p><p class="text-xs text-slate-500 mt-1">سجّل أول مصروف أو غيّر الفلاتر الحالية.</p></div><button onclick="openModal(\'expenseModal\')" class="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2.5 rounded-2xl text-xs font-bold transition"><i class="fa-solid fa-plus"></i> تسجيل مصروف</button></div>';
        return;
    }
    c.innerHTML = items.map(e => `
        <div class="app-card p-3 rounded-2xl border flex justify-between items-center gap-2">
            <div class="flex items-center gap-2 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center text-xs shrink-0"><i class="fa-solid fa-receipt"></i></div>
                <div class="min-w-0"><p class="text-xs font-bold truncate">${esc(e.title)}</p><p class="text-xs text-slate-500">${esc(e.category||'')} • ${esc(e.month||'')}</p><p class="text-xs text-indigo-300">${esc(renderCashAccountLabel(e.cashAccountCode))}</p></div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <span class="text-sm font-black text-rose-400">${fmtNum(e.amount)}</span>
                <button onclick="openExpenseEditModal('${e.id}')" aria-label="تعديل المصروف ${esc(e.title)}" class="icon-action text-indigo-400 hover:text-indigo-300 p-1"><i class="fa-solid fa-pen text-xs"></i></button>
                <button onclick="deleteExpense('${e.id}')" aria-label="حذف المصروف ${esc(e.title)}" class="icon-action text-rose-400 hover:text-rose-300 p-1"><i class="fa-solid fa-trash text-xs"></i></button>
            </div>
        </div>`).join('');
}

function renderResidentsGrid() {
    const c = document.getElementById('residentsGrid');
    const s = (/** @type {HTMLInputElement} */ (document.getElementById('searchResidentsInput'))?.value||'').toLowerCase();
    const statusFilter = /** @type {HTMLSelectElement} */ (document.getElementById('residentStatusFilter'))?.value || 'all';
    const sortBy = /** @type {HTMLSelectElement} */ (document.getElementById('residentSort'))?.value || 'apartment';
    const getStatus = resident => {
        const outstanding = getMonthOutstanding(resident, getCurrentMonth());
        const paid = getPaidAmountForMonth(resident.id, getCurrentMonth());
        const previousArrears = calculateCumulativeDebt(resident.id);
        if (previousArrears.totalDebt > 0) {
            return { key: 'overdue', label: 'متأخر', className: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
        }
        if (outstanding <= 0) return { key: 'paid', label: 'مسدد بالكامل', className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
        if (paid > 0) return { key: 'partial', label: 'دفع جزئي', className: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
        if (!isSubscriptionMonthOverdue(getCurrentMonth())) {
            return { key: 'due', label: 'لم يتأخر بعد', className: 'text-sky-400 bg-sky-500/10 border-sky-500/20' };
        }
        return { key: 'overdue', label: 'متأخر', className: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
    };
    let list = state.residents.map(r => ({ r, status: getStatus(r), debt: calculateCumulativeDebt(r.id) }));
    if (s) list = list.filter(item => String(item.r.name||'').toLocaleLowerCase('ar-EG').includes(s) || String(item.r.apartmentNumber||'').toLocaleLowerCase('ar-EG').includes(s) || String(item.r.floor||'').toLocaleLowerCase('ar-EG').includes(s));
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
        const fullySettled = paid && d.count === 0;
        const receiptPayment = fullySettled ? state.income
            .filter(payment => payment.residentId === r.id && payment.month === cur)
            .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())[0] : null;
        return `<div class="app-card p-4 rounded-3xl border space-y-3">
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-2">
                    <div class="w-11 h-11 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center text-sm font-black shrink-0">${esc(r.apartmentNumber||'?')}</div>
                    <div class="min-w-0"><p class="text-sm font-bold truncate">${esc(r.name)}</p><p class="text-xs text-slate-500 truncate">${r.floor ? `الدور ${esc(r.floor)} · ` : ''}${esc(r.phone||'')}</p></div>
                </div>
                <div class="flex gap-1">
                    <button onclick="openResidentProfile(${esc(JSON.stringify(String(r.id)))})" aria-label="عرض ملف ${esc(r.name)}" title="تفاصيل الشقة" class="text-sky-400 hover:text-sky-300 p-1.5"><i class="fa-solid fa-circle-info text-xs"></i></button>
                    <button onclick="editResident('${r.id}')" aria-label="تعديل بيانات ${esc(r.name)}" class="text-indigo-400 hover:text-indigo-300 p-1.5"><i class="fa-solid fa-pen text-xs"></i></button>
                    <button onclick="deleteResident('${r.id}')" aria-label="حذف الشقة ${esc(r.apartmentNumber)}" class="text-rose-400 hover:text-rose-300 p-1.5"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2 text-center">
                <div class="app-input p-2 rounded-xl border"><p class="text-xs text-slate-500">الاشتراك</p><p class="text-xs font-bold">${fmtNum(r.monthlyAmount ?? state.defaultSubscription)}</p></div>
                <div class="app-input p-2 rounded-xl border"><p class="text-xs text-slate-500">المتأخرات</p><p class="text-xs font-bold ${d.count>0?'text-rose-400':'text-emerald-400'}">${d.count>0?fmtNum(d.totalDebt):'0'}</p></div>
            </div>
            <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-bold border rounded-full px-2.5 py-1 ${item.status.className}">${item.status.label}</span>
                ${r.phone ? `<a href="tel:${esc(r.phone)}" class="text-xs text-indigo-400 hover:underline" aria-label="الاتصال بـ ${esc(r.name)}"><i class="fa-solid fa-phone ml-1"></i> اتصال</a>` : '<span></span>'}
            </div>
            <div class="flex gap-2">
                ${paid ? '<div class="flex-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 py-2 rounded-xl text-xs font-bold text-center"><i class="fa-solid fa-check ml-1"></i> مدفوع بالكامل</div>'
                    : `<button onclick="quickPayResident('${r.id}')" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl text-xs font-bold transition"><i class="fa-solid fa-check ml-1"></i> ${partiallyPaid ? `استكمال ${fmtNum(outstanding)}` : 'تسجيل دفع'}</button>`}
                ${fullySettled
                    ? (receiptPayment ? `<button onclick="sendIncomeReceiptOnWhatsApp('${receiptPayment.id}')" aria-label="إرسال إيصال واتساب إلى ${esc(r.name)}" title="إرسال إيصال السداد" class="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-xl text-xs font-bold"><i class="fa-brands fa-whatsapp"></i> إيصال</button>` : '')
                    : `<button onclick="sendWhatsAppReminder('${r.id}')" aria-label="إرسال تذكير واتساب إلى ${esc(r.name)}" title="إرسال تذكير بالمتأخرات" class="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-xl text-xs font-bold"><i class="fa-brands fa-whatsapp"></i> تذكير</button>`}
            </div>
        </div>`;
    }).join('');
}

function clearResidentFilters() {
    const search = /** @type {HTMLInputElement} */ (document.getElementById('searchResidentsInput'));
    const status = /** @type {HTMLSelectElement} */ (document.getElementById('residentStatusFilter'));
    if (search) search.value = '';
    if (status) status.value = 'all';
    renderResidentsGrid();
}
