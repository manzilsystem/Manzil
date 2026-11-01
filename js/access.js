function requireManager(message = 'هذه الصلاحية متاحة للمدير فقط') {
    if (currentUserRole === 'manager') return true;
    toast(message, 'error');
    return false;
}

function clearOwnerPortal() {
    const portal = document.getElementById('ownerPortal');
    if (!portal) return;
    portal.innerHTML = '';
    portal.classList.add('hidden');
    portal.setAttribute('aria-hidden', 'true');
}

function renderOwnerPortal() {
    const portal = document.getElementById('ownerPortal');
    if (!portal) return;
    const resident = state.residents.find(item => item.id === currentResidentId);
    if (!resident) {
        portal.innerHTML = '<div class="app-card border rounded-3xl p-6 text-center"><h2 class="font-black">تعذر العثور على حساب الشقة</h2><p class="text-xs text-slate-400 mt-2">اطلب من المدير مراجعة الحساب.</p></div>';
        portal.classList.remove('hidden');
        updateAccessSwitchButton();
        return;
    }
    const month = getCurrentMonth();
    const paidThisMonth = getPaidAmountForMonth(resident.id, month);
    const dueThisMonth = Number(resident.monthlyAmount ?? state.defaultSubscription) || 0;
    const remainingThisMonth = Math.max(0, dueThisMonth - paidThisMonth);
    const debt = calculateCumulativeDebt(resident.id);
    const ownPayments = state.income
        .filter(payment => payment.residentId === resident.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 12);
    const paymentRows = ownPayments.length ? ownPayments.map(payment => `
        <div class="flex items-center justify-between gap-3 border-b border-slate-700/50 py-2 last:border-0">
            <div><p class="text-xs font-bold">${esc(payment.month || '—')}</p><p class="text-[10px] text-slate-500">${formatDate(payment.date)}</p></div>
            <span class="text-sm font-black text-emerald-400">${fmtNum(payment.amount)} ج.م</span>
        </div>`).join('') : '<p class="text-xs text-slate-500 text-center py-3">لا توجد دفعات مسجلة بعد.</p>';
    const notices = state.notices.length ? state.notices.slice().reverse().map(notice => `
        <article class="app-input border rounded-2xl p-3">
            <p class="text-xs leading-relaxed whitespace-pre-line">${esc(notice.text)}</p>
            <p class="text-[10px] text-slate-500 mt-2">${formatDate(notice.date)}</p>
        </article>`).join('') : '<p class="text-xs text-slate-500 text-center py-3">لا توجد إعلانات حالياً.</p>';

    portal.innerHTML = `
        <div class="app-card border rounded-3xl p-5 sm:p-6 space-y-2">
            <p class="text-[10px] font-bold text-indigo-400">بوابة المالك • قراءة فقط</p>
            <h2 id="ownerPortalTitle" class="text-xl font-black">أهلاً ${esc(resident.name)}</h2>
            <p class="text-xs text-slate-400">الشقة ${esc(resident.apartmentNumber)}${state.buildingName ? ` • ${esc(state.buildingName)}` : ''}</p>
        </div>
        <section class="app-card border rounded-3xl p-5 space-y-4" aria-label="ملخص حساب الشقة">
            <div class="flex items-center justify-between"><h3 class="font-bold text-sm">ملخص ${esc(month)}</h3><span class="text-[10px] text-slate-500">اشتراكك الشهري ${fmtNum(dueThisMonth)} ج.م</span></div>
            <div class="grid grid-cols-2 gap-3 text-center">
                <div class="app-input border rounded-2xl p-3"><p class="text-[10px] text-slate-500">المدفوع هذا الشهر</p><p class="font-black text-emerald-400 mt-1">${fmtNum(paidThisMonth)} ج.م</p></div>
                <div class="app-input border rounded-2xl p-3"><p class="text-[10px] text-slate-500">المتبقي لهذا الشهر</p><p class="font-black ${remainingThisMonth ? 'text-rose-400' : 'text-emerald-400'} mt-1">${fmtNum(remainingThisMonth)} ج.م</p></div>
            </div>
            <div class="app-input border rounded-2xl p-3 flex items-center justify-between gap-3"><span class="text-xs font-bold">إجمالي متأخرات حسابك (${debt.count} شهر)</span><strong class="text-sm ${debt.totalDebt ? 'text-rose-400' : 'text-emerald-400'}">${fmtNum(debt.totalDebt)} ج.م</strong></div>
        </section>
        <section class="app-card border rounded-3xl p-5 space-y-2" aria-labelledby="ownerPaymentHistoryTitle">
            <h3 id="ownerPaymentHistoryTitle" class="font-bold text-sm">سجل دفعات شقتك</h3>
            ${paymentRows}
        </section>
        <section class="app-card border rounded-3xl p-5 space-y-3" aria-labelledby="ownerNoticesTitle">
            <h3 id="ownerNoticesTitle" class="font-bold text-sm">إعلانات العمارة</h3>
            ${notices}
        </section>
        <p class="text-center text-[10px] text-slate-500">هذه الصفحة تعرض بيانات حساب شقتك فقط. للاعتراض أو الاستفسار، تواصل مع المدير.</p>`;
    portal.classList.remove('hidden');
    portal.setAttribute('aria-hidden', 'false');
    document.getElementById('headerBuildingTitle').textContent = state.buildingName || 'Manzil';
    document.getElementById('syncStatus').textContent = 'وضع المالك — قراءة فقط';
    updateAccessSwitchButton();
}

document.addEventListener('DOMContentLoaded', updateAccessSwitchButton);
