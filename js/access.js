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


function groupOwnerPaymentsIntoReceipts(residentId) {
    const groups = new Map();
    (Array.isArray(state.income) ? state.income : [])
        .filter(payment => payment.residentId === residentId)
        .forEach(payment => {
            const match = String(payment.notes || '').match(/دفعة موزعة\s+([A-Z0-9]+)/i);
            const reference = match?.[1]
                || String(payment.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 12).toUpperCase();
            const key = match
                ? `${payment.date || ''}:${residentId}:${reference}`
                : `single:${payment.id}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    id: key,
                    reference,
                    date: payment.date || '',
                    paymentMethod: payment.paymentMethod || '',
                    payments: []
                });
            }
            groups.get(key).payments.push(payment);
        });

    return Array.from(groups.values()).map(receipt => {
        const payments = receipt.payments.slice().sort((a, b) => {
            const order = item => Number(String(item.notes || '').match(/\((\d+)\//)?.[1] || 0);
            return order(a) - order(b);
        });
        const totalCents = payments.reduce((sum, payment) => {
            const amount = Number(payment.amount);
            return sum + (Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0);
        }, 0);
        return { ...receipt, payments, totalAmount: totalCents / 100 };
    }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function getOwnerManagerWhatsAppPhone() {
    let phone = String(state.managerPhone || '').replace(/\D/g, '');
    if (phone.startsWith('00')) phone = phone.slice(2);
    else if (phone.startsWith('0')) phone = '20' + phone.slice(1);
    else if (phone.length === 10) phone = '20' + phone;
    return phone;
}

function contactOwnerManager() {
    if (currentUserRole !== 'owner' || !activeSession || !activeBuildingId || !currentResidentId) return;
    const phone = getOwnerManagerWhatsAppPhone();
    if (!phone || phone.length < 10) {
        toast('رقم مدير العمارة غير مسجل في إعدادات المبنى. اطلب تحديثه من الإدارة.', 'error');
        return;
    }
    const resident = state.residents.find(item => item.id === currentResidentId);
    if (!resident) return;
    const message = [
        'مرحبًا، أحتاج الاستفسار عن حساب شقتي في تطبيق Manzil.',
        `العمارة: ${state.buildingName || '—'}`,
        `الشقة: ${resident.apartmentNumber || '—'}`,
        `الاسم: ${resident.name || '—'}`
    ].join('\n');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}


function printOwnerReceipt(receiptId) {
    if (currentUserRole !== 'owner' || !activeSession || !activeBuildingId || !currentResidentId) return;
    const resident = state.residents.find(item => item.id === currentResidentId);
    if (!resident) return;
    const receipt = groupOwnerPaymentsIntoReceipts(resident.id).find(item => item.id === receiptId);
    if (!receipt) {
        toast('تعذر العثور على الإيصال. حدّث الصفحة وحاول مرة أخرى.', 'error');
        return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        toast('اسمح بفتح نافذة الإيصال من المتصفح، ثم حاول مرة أخرى.', 'error');
        return;
    }
    const rows = receipt.payments.map(payment => `
        <tr>
            <td>${esc(payment.month || '—')}</td>
            <td>${fmtNum(payment.amount)} ج.م</td>
        </tr>`).join('');
    const thankYou = typeof getReceiptThankYouMessage === 'function'
        ? getReceiptThankYouMessage()
        : 'شكراً لالتزامكم، ونسعد دائماً بخدمتكم.';
    const documentHtml = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>إيصال ${esc(receipt.reference)} - Manzil</title>
    <style>
        * { box-sizing:border-box; }
        body { margin:0; padding:24px; background:#f1f5f9; color:#0f172a; font-family:Tahoma,Arial,sans-serif; }
        .receipt { max-width:720px; margin:0 auto; padding:28px; background:#fff; border:1px solid #cbd5e1; border-radius:16px; }
        header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding-bottom:18px; border-bottom:2px solid #334155; }
        h1 { margin:0; font-size:22px; } .brand { font-size:18px; font-weight:900; }
        .number { margin-top:8px; color:#475569; font-size:12px; }
        .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:22px 0; }
        .field { padding:11px; border:1px solid #e2e8f0; border-radius:10px; min-width:0; }
        .label { color:#64748b; font-size:11px; } .value { margin-top:6px; font-size:13px; font-weight:700; overflow-wrap:anywhere; }
        table { width:100%; border-collapse:collapse; margin-top:16px; }
        th,td { padding:12px 10px; text-align:right; border-bottom:1px solid #e2e8f0; font-size:12px; }
        th { color:#475569; background:#f8fafc; }
        .total { display:flex; justify-content:space-between; gap:12px; margin-top:18px; padding:16px; border-radius:10px; background:#ecfdf5; color:#065f46; font-weight:900; }
        footer { margin-top:24px; padding-top:16px; border-top:1px solid #e2e8f0; text-align:center; color:#475569; font-size:12px; line-height:1.8; }
        .actions { margin-top:20px; text-align:center; }
        .actions button { min-height:46px; padding:10px 22px; border:0; border-radius:10px; background:#4f46e5; color:#fff; font-size:14px; font-weight:700; cursor:pointer; }
        @media(max-width:480px) { body { padding:10px; } .receipt { padding:16px; } h1 { font-size:18px; } .grid { gap:8px; } .field { padding:9px; } }
        @media print { body { padding:0; background:#fff; } .receipt { max-width:none; border:0; border-radius:0; padding:0; } .actions { display:none; } }
    </style>
</head>
<body>
    <main class="receipt">
        <header>
            <div><div class="brand">${esc(state.buildingName || 'Manzil')}</div><p class="number">رقم الإيصال: ${esc(receipt.reference)}</p></div>
            <h1>إيصال استلام</h1>
        </header>
        <section class="grid">
            <div class="field"><div class="label">اسم المالك</div><div class="value">${esc(resident.name || '—')}</div></div>
            <div class="field"><div class="label">رقم الشقة</div><div class="value">${esc(resident.apartmentNumber || '—')}</div></div>
            <div class="field"><div class="label">تاريخ الاستلام</div><div class="value">${esc(formatDate(receipt.date) || '—')}</div></div>
            <div class="field"><div class="label">طريقة الدفع</div><div class="value">${esc(getIncomePaymentMethodLabel(receipt.paymentMethod))}</div></div>
        </section>
        <h2 style="font-size:14px;margin:0">تفاصيل السداد</h2>
        <table><thead><tr><th>شهر الاشتراك</th><th>المبلغ</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="total"><span>إجمالي المبلغ المستلم</span><span>${fmtNum(receipt.totalAmount)} ج.م</span></div>
        <footer>${esc(thankYou)}<br>تم إصدار هذا الإيصال من بوابة المالك في Manzil.</footer>
        <div class="actions"><button type="button" onclick="window.print()">طباعة / حفظ PDF</button></div>
    </main>
</body>
</html>`;
    try {
        printWindow.document.open();
        printWindow.document.write(documentHtml);
        printWindow.document.close();
        printWindow.opener = null;
        printWindow.focus();
        setTimeout(() => {
            try { printWindow.print(); } catch {}
        }, 250);
    } catch {
        try { printWindow.close(); } catch {}
        toast('تعذر تجهيز الإيصال للطباعة. حاول مرة أخرى.', 'error');
    }
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
    const ownerReceipts = groupOwnerPaymentsIntoReceipts(resident.id);
    const ownerReceiptRows = ownerReceipts.length ? ownerReceipts.map(receipt => {
        const allocationRows = receipt.payments.map(payment => `
            <div class="flex items-center justify-between gap-3 py-2 border-b border-slate-700/40 last:border-0">
                <span class="text-xs">${esc(payment.month || '—')}</span>
                <strong class="text-xs text-emerald-400 shrink-0">${fmtNum(payment.amount)} ج.م</strong>
            </div>`).join('');
        return `
            <details class="app-input border rounded-2xl p-3">
                <summary class="cursor-pointer list-none flex items-center justify-between gap-3">
                    <span class="min-w-0">
                        <strong class="block text-xs">إيصال رقم ${esc(receipt.reference)}</strong>
                        <span class="block text-[10px] text-slate-500 mt-1">${esc(formatDate(receipt.date) || '—')} · ${esc(getIncomePaymentMethodLabel(receipt.paymentMethod))}</span>
                    </span>
                    <strong class="text-sm font-black text-emerald-400 shrink-0">${fmtNum(receipt.totalAmount)} ج.م</strong>
                </summary>
                <div class="mt-3 pt-3 border-t border-slate-700/50 space-y-3">
                    <div class="grid grid-cols-2 gap-2 text-[10px]">
                        <div><span class="text-slate-500">العمارة</span><p class="font-bold mt-1">${esc(state.buildingName || '—')}</p></div>
                        <div><span class="text-slate-500">الشقة</span><p class="font-bold mt-1">${esc(resident.apartmentNumber || '—')}</p></div>
                        <div><span class="text-slate-500">صاحب الإيصال</span><p class="font-bold mt-1">${esc(resident.name || '—')}</p></div>
                        <div><span class="text-slate-500">طريقة الدفع</span><p class="font-bold mt-1">${esc(getIncomePaymentMethodLabel(receipt.paymentMethod))}</p></div>
                        <div><span class="text-slate-500">تاريخ الاستلام</span><p class="font-bold mt-1">${esc(formatDate(receipt.date) || '—')}</p></div>
                        <div><span class="text-slate-500">المبلغ المستلم</span><p class="font-black text-emerald-400 mt-1">${fmtNum(receipt.totalAmount)} ج.م</p></div>
                    </div>
                    <div class="rounded-xl border border-slate-700/40 px-3">
                        <p class="text-[10px] font-bold text-slate-400 pt-2">تفاصيل توزيع المبلغ</p>
                        ${allocationRows}
                    </div>
                    <p class="text-[10px] text-slate-500">${esc(typeof getReceiptThankYouMessage === 'function' ? getReceiptThankYouMessage() : 'تم تسجيل عملية السداد بنجاح.')}</p>
                    <button type="button" onclick="printOwnerReceipt(${esc(JSON.stringify(String(receipt.id)))})" class="w-full min-h-11 border border-indigo-500/30 text-indigo-300 rounded-xl px-3 py-2.5 text-xs font-bold"><i class="fa-solid fa-print ml-1"></i> طباعة الإيصال / حفظ PDF</button>
                </div>
            </details>`;
    }).join('') : '<p class="text-xs text-slate-500 text-center py-3">لا توجد إيصالات مسجلة لهذا الحساب حتى الآن.</p>';
    const ownerArrears = (debt.unpaidMonths || []).map(unpaidMonth => ({
        month: unpaidMonth,
        amount: getMonthOutstanding(resident, unpaidMonth)
    }));
    const ownerArrearsHtml = ownerArrears.length
        ? `<details class="app-input border rounded-2xl p-3">
            <summary class="cursor-pointer list-none flex items-center justify-between gap-3">
                <span class="text-xs font-bold">تفصيل الشهور المتأخرة</span>
                <span class="text-[10px] text-indigo-300">عرض التفاصيل</span>
            </summary>
            <div class="mt-2 pt-2 border-t border-slate-700/40">
                ${ownerArrears.slice(0, 12).map(item => `
                    <div class="flex justify-between gap-3 py-2 border-b border-slate-700/40 last:border-0">
                        <span class="text-xs">${esc(item.month)}</span>
                        <strong class="text-xs text-rose-400">${fmtNum(item.amount)} ج.م</strong>
                    </div>`).join('')}
                ${ownerArrears.length > 12 ? `<p class="text-[10px] text-slate-500 pt-2">تم عرض أقدم 12 شهرًا من أصل ${fmtNum(ownerArrears.length)} شهر.</p>` : ''}
            </div>
        </details>`
        : '<p class="text-[10px] text-emerald-400 text-center">لا توجد شهور متأخرة.</p>';
    const managerPhone = String(state.managerPhone || '').trim();
    const managerPhoneTel = managerPhone.replace(/[^0-9+]/g, '');
    const managerContact = managerPhoneTel
        ? `<div class="app-input border rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0"><p class="text-[10px] text-slate-500">التواصل مع المدير</p><p class="text-xs font-bold mt-1">${esc(state.managerName || 'مدير العمارة')}</p><p class="text-[10px] text-slate-500 mt-1" dir="ltr">${esc(managerPhone)}</p></div>
            <div class="flex gap-2">
                <a href="tel:${esc(managerPhoneTel)}" class="inline-flex items-center justify-center min-h-11 px-3 rounded-xl border border-slate-600 text-xs font-bold"><i class="fa-solid fa-phone ml-1"></i> اتصال</a>
                <button type="button" onclick="contactOwnerManager()" class="min-h-11 px-3 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold"><i class="fa-brands fa-whatsapp ml-1"></i> واتساب</button>
            </div>
        </div>`
        : '<div class="app-input border rounded-2xl p-3 text-xs text-slate-500">رقم تواصل المدير غير مسجل. اطلب من الإدارة تحديث رقم الهاتف في بيانات العمارة.</div>';
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
                ${notification.readAt ? '' : `<button type="button" onclick="markOwnerNotificationRead('${esc(notification.id)}')" class="inline-flex items-center min-h-11 px-3 text-[11px] text-indigo-300 font-bold">تحديد كمقروء</button>`}
            </div>
        </article>`).join('') : '<p class="text-xs text-slate-500 text-center py-3">لا توجد إشعارات حتى الآن.</p>';

    portal.innerHTML = `
        <div class="app-card border rounded-3xl p-5 sm:p-6 space-y-2">
            <p class="text-[10px] font-bold text-indigo-400">بوابة المالك • قراءة فقط</p>
            <h2 id="ownerPortalTitle" class="text-xl font-black">أهلاً ${esc(resident.name)}</h2>
            <p class="text-xs text-slate-400">الشقة ${esc(resident.apartmentNumber)}${state.buildingName ? ` • ${esc(state.buildingName)}` : ''}</p>
        </div>
        ${managerContact}
        <section class="app-card border rounded-3xl p-5 space-y-4" aria-label="ملخص حساب الشقة">
            <div class="flex items-center justify-between"><h3 class="font-bold text-sm">ملخص ${esc(month)}</h3><span class="text-[10px] text-slate-500">اشتراكك الشهري ${fmtNum(dueThisMonth)} ج.م</span></div>
            <div class="grid grid-cols-2 gap-3 text-center">
                <div class="app-input border rounded-2xl p-3"><p class="text-[10px] text-slate-500">المدفوع هذا الشهر</p><p class="font-black text-emerald-400 mt-1">${fmtNum(paidThisMonth)} ج.م</p></div>
                <div class="app-input border rounded-2xl p-3"><p class="text-[10px] text-slate-500">المتبقي لهذا الشهر</p><p class="font-black ${remainingThisMonth ? 'text-rose-400' : 'text-emerald-400'} mt-1">${fmtNum(remainingThisMonth)} ج.م</p></div>
            </div>
            <div class="app-input border rounded-2xl p-3 flex items-center justify-between gap-3"><span class="text-xs font-bold">إجمالي متأخرات حسابك (${debt.count} شهر)</span><strong class="text-sm ${debt.totalDebt ? 'text-rose-400' : 'text-emerald-400'}">${fmtNum(debt.totalDebt)} ج.م</strong></div>
            ${ownerArrearsHtml}
        </section>
        <section class="app-card border rounded-3xl p-5 space-y-3" aria-labelledby="ownerPaymentMethodsTitle">
            <div>
                <h3 id="ownerPaymentMethodsTitle" class="font-bold text-sm">طرق سداد الاشتراك</h3>
                <p class="text-[10px] text-slate-500 mt-1">موعد الاستحقاق يوم ${subscriptionDueDay} من كل شهر · فترة السماح ${subscriptionGraceDays} يوم</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${paymentInstructions}</div>
        </section>
        <section class="app-card border rounded-3xl p-5 space-y-3" aria-labelledby="ownerReceiptsTitle">
            <div>
                <h3 id="ownerReceiptsTitle" class="font-bold text-sm">إيصالات السداد</h3>
                <p class="text-[10px] text-slate-500 mt-1">${ownerReceipts.length} إيصال مسجل لحساب شقتك</p>
            </div>
            <div class="space-y-2">${ownerReceiptRows}</div>
        </section>
        <section class="app-card border rounded-3xl p-5 space-y-3" aria-labelledby="ownerNotificationsTitle">
            <div class="flex items-center justify-between gap-3">
                <div>
                    <h3 id="ownerNotificationsTitle" class="font-bold text-sm">إشعارات حسابك</h3>
                    <p class="text-[10px] text-slate-500 mt-1">${unreadNotifications.length} إشعار غير مقروء</p>
                </div>
                ${unreadNotifications.length ? '<button type="button" onclick="markAllOwnerNotificationsRead()" class="inline-flex items-center min-h-11 px-3 text-[11px] text-indigo-300 font-bold">قراءة الكل</button>' : ''}
            </div>
            <div class="space-y-2">${notificationRows}</div>
        </section>
        <section class="app-card border rounded-3xl p-5 space-y-2" aria-labelledby="ownerPaymentHistoryTitle">
            <h3 id="ownerPaymentHistoryTitle" class="font-bold text-sm">سجل الدفعات حسب الشهر</h3>
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

document.addEventListener('DOMContentLoaded', () => updateAccessSwitchButton());
