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
        portal.setAttribute('aria-hidden', 'false');
        updateAccessSwitchButton();
        return;
    }
    const month = getCurrentMonth();
    const paidThisMonth = getPaidAmountForMonth(resident.id, month);
    const dueThisMonth = getSubscriptionAmountForMonth(resident, month);
    const remainingThisMonth = Math.max(0, dueThisMonth - paidThisMonth);
    const debt = calculateCumulativeDebt(resident.id);
    const paymentMethodLabels = typeof INCOME_PAYMENT_METHOD_LABELS !== 'undefined'
        ? INCOME_PAYMENT_METHOD_LABELS
        : { cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي' };
    const paymentSettings = typeof normalizePaymentSettings === 'function'
        ? normalizePaymentSettings(state.paymentSettings)
        : (state.paymentSettings || {
            cash: { enabled: true }, wallet: { enabled: false },
            instapay: { enabled: false }, bank_transfer: { enabled: false }
        });
    const paymentInstructions = Object.entries(paymentMethodLabels)
        .filter(([method]) => paymentSettings[method]?.enabled)
        .map(([method, label]) => {
            const settings = paymentSettings[method] || {};
            const details = [];
            if (method === 'wallet') {
                if (settings.provider) details.push('الشركة: ' + settings.provider);
                if (settings.accountName) details.push('صاحب المحفظة: ' + settings.accountName);
                if (settings.number) details.push('رقم المحفظة: ' + settings.number);
            } else if (method === 'instapay') {
                if (settings.accountName) details.push('صاحب الحساب: ' + settings.accountName);
                if (settings.address) details.push('عنوان الدفع: ' + settings.address);
            } else if (method === 'bank_transfer') {
                if (settings.bankName) details.push('البنك: ' + settings.bankName);
                if (settings.accountName) details.push('صاحب الحساب: ' + settings.accountName);
                if (settings.accountNumber) details.push('رقم الحساب: ' + settings.accountNumber);
                if (settings.iban) details.push('IBAN: ' + settings.iban);
            } else {
                details.push('يتم التسليم مباشرةً إلى مدير العمارة.');
            }
            return `<div class="app-input border rounded-xl p-3 space-y-1">
                <p class="text-xs font-bold">${esc(label)}</p>
                ${details.length ? details.map(item => `<p class="text-[11px] text-slate-400 break-words">${esc(item)}</p>`).join('') : '<p class="text-[11px] text-slate-500">يرجى التواصل مع المدير للحصول على بيانات الاستلام.</p>'}
            </div>`;
        }).join('');
    const subscriptionDueDay = Math.min(28, Math.max(1, Number(state.subscriptionDueDay) || 1));
    const subscriptionGraceDays = Math.min(31, Math.max(0, Number(state.subscriptionGraceDays) || 0));
    const ownPayments = state.income
        .filter(payment => payment.residentId === resident.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 12);
    const paymentRows = ownPayments.length ? ownPayments.map(payment => `
        <div class="flex items-center justify-between gap-3 border-b border-slate-700/50 py-2 last:border-0">
            <div><p class="text-xs font-bold">${esc(payment.month || '—')}</p><p class="text-[10px] text-slate-500">${formatDate(payment.date)} · ${esc(getIncomePaymentMethodLabel(payment.paymentMethod))}</p></div>
            <span class="text-sm font-black text-emerald-400">${fmtNum(payment.amount)} ج.م</span>
        </div>`).join('') : '<p class="text-xs text-slate-500 text-center py-3">لا توجد دفعات مسجلة بعد.</p>';
    const notices = state.notices.length ? state.notices.slice().reverse().map(notice => `
        <article class="app-input border rounded-2xl p-3">
            <p class="text-xs leading-relaxed whitespace-pre-line">${esc(notice.text)}</p>
            <p class="text-[10px] text-slate-500 mt-2">${formatDate(notice.date)}</p>
        </article>`).join('') : '<p class="text-xs text-slate-500 text-center py-3">لا توجد إعلانات حالياً.</p>';
    const ownerNotifications = Array.isArray(state.ownerNotifications) ? state.ownerNotifications : [];
    const unreadNotifications = ownerNotifications.filter(notification => !notification.readAt);
    const notificationRows = ownerNotifications.length ? ownerNotifications.map(notification => `
        <article class="app-input border rounded-2xl p-3 space-y-2">
            <div class="flex items-start justify-between gap-3">
                <p class="text-xs font-bold">${esc(notification.title)}</p>
                ${notification.readAt ? '<span class="text-[9px] text-slate-500">مقروء</span>' : '<span class="text-[9px] text-indigo-300 font-bold">جديد</span>'}
            </div>
            <p class="text-xs leading-relaxed whitespace-pre-line">${esc(notification.body)}</p>
            <div class="flex items-center justify-between gap-2">
                <span class="text-[10px] text-slate-500">${formatDate(notification.createdAt)}</span>
                ${notification.readAt ? '' : `<button type="button" onclick="markOwnerNotificationRead('${esc(notification.id)}')" class="text-[10px] text-indigo-300 underline">تحديد كمقروء</button>`}
            </div>
        </article>`).join('') : '<p class="text-xs text-slate-500 text-center py-3">لا توجد إشعارات حتى الآن.</p>';

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
        <section class="app-card border rounded-3xl p-5 space-y-3" aria-labelledby="ownerPaymentMethodsTitle">
            <div>
                <h3 id="ownerPaymentMethodsTitle" class="font-bold text-sm">طرق سداد الاشتراك</h3>
                <p class="text-[10px] text-slate-500 mt-1">موعد الاستحقاق يوم ${subscriptionDueDay} من كل شهر · فترة السماح ${subscriptionGraceDays} يوم</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${paymentInstructions}</div>
        </section>
        <section class="app-card border rounded-3xl p-5 space-y-3" aria-labelledby="ownerNotificationsTitle">
            <div class="flex items-center justify-between gap-3">
                <div>
                    <h3 id="ownerNotificationsTitle" class="font-bold text-sm">إشعارات حسابك</h3>
                    <p class="text-[10px] text-slate-500 mt-1">${unreadNotifications.length} إشعار غير مقروء</p>
                </div>
                ${unreadNotifications.length ? '<button type="button" onclick="markAllOwnerNotificationsRead()" class="text-[10px] text-indigo-300 underline">قراءة الكل</button>' : ''}
            </div>
            <div class="space-y-2">${notificationRows}</div>
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


async function markOwnerNotificationRead(notificationId) {
    if (currentUserRole !== 'owner' || !activeSession || !activeBuildingId) return;
    const notification = (state.ownerNotifications || []).find(item => item.id === notificationId);
    if (!notification || notification.readAt) return;
    const readAt = new Date().toISOString();
    const { error } = await supabaseClient.from('notifications')
        .update({ read_at: readAt })
        .eq('id', notificationId)
        .eq('building_id', activeBuildingId)
        .eq('target_user_id', activeSession.user.id);
    if (error) {
        toast('تعذر تحديث حالة الإشعار. حاول مجددًا.', 'error');
        return;
    }
    notification.readAt = readAt;
    renderOwnerPortal();
}

async function markAllOwnerNotificationsRead() {
    if (currentUserRole !== 'owner' || !activeSession || !activeBuildingId) return;
    const unread = (state.ownerNotifications || []).filter(item => !item.readAt);
    if (!unread.length) return;
    const readAt = new Date().toISOString();
    const { error } = await supabaseClient.from('notifications')
        .update({ read_at: readAt })
        .eq('building_id', activeBuildingId)
        .eq('target_user_id', activeSession.user.id)
        .is('read_at', null);
    if (error) {
        toast('تعذر تحديث الإشعارات. حاول مجددًا.', 'error');
        return;
    }
    unread.forEach(notification => { notification.readAt = readAt; });
    renderOwnerPortal();
}

function requestOwnerPinOnWhatsApp() {
    const supportNumber = '201027767039';
    const phone = document.getElementById('authIdentifier')?.value.trim() || '';
    const apartmentNumber = document.getElementById('ownerApartmentRequestNumber')?.value.trim() || '';
    const message = [
        'مرحبًا، أنا مالك شقة وأحتاج الرقم السري للدخول إلى تطبيق المبنى. من فضلك راجع طلبي وأرسل لي طريقة الدخول.',
        phone ? `رقم الجوال الذي أحاول الدخول به: ${phone}` : '',
        `رقم الشقة: ${apartmentNumber || '(اكتب رقم الشقة هنا)'}`
    ].filter(Boolean).join('\n');
    const url = `https://wa.me/${supportNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    const notice = document.getElementById('pinRequestNotice');
    if (notice) notice.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', updateAccessSwitchButton);
