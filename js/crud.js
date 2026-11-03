let ownerProvisionRequested = false;
let incomeSaving = false;
let expenseSaving = false;

function openResidentModal(mode, id) {
    if (!requireManager()) return;
    editingResidentId = mode === 'edit' ? id : null;
    const amountInput = document.getElementById('residentAmount');
    const historyButton = document.getElementById('manageSubscriptionRatesBtn');
    document.getElementById('residentModalTitle').textContent = mode === 'edit' ? 'تعديل بيانات الشقة' : 'شقة جديدة';
    if (mode === 'edit') {
        const r = state.residents.find(x => x.id === id);
        if (r) {
            document.getElementById('residentName').value = r.name || '';
            document.getElementById('residentApartment').value = r.apartmentNumber || '';
            document.getElementById('residentPhone').value = r.phone || '';
            amountInput.value = r.monthlyAmount ?? '';
            amountInput.readOnly = true;
            amountInput.setAttribute('aria-readonly', 'true');
            historyButton?.classList.remove('hidden');
            document.getElementById('residentNotes').value = r.notes || '';
        }
    } else {
        document.getElementById('residentForm').reset();
        amountInput.value = state.defaultSubscription || '';
        amountInput.readOnly = false;
        amountInput.removeAttribute('aria-readonly');
        historyButton?.classList.add('hidden');
    }
    openModal('residentModal');
}

function editResident(id) { openResidentModal('edit', id); }

function saveResidentAndProvisionOwner() {
    if (!requireManager()) return;
    const form = document.getElementById('residentForm');
    if (!form.reportValidity()) return;
    ownerProvisionRequested = true;
    form.requestSubmit();
}

function isValidEffectiveMonth(value) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}

function getSubscriptionAmountForMonthKey(resident, monthKey) {
    const rates = (Array.isArray(resident?.subscriptionRates) ? resident.subscriptionRates : [])
        .filter(rate => /^\d{4}-(0[1-9]|1[0-2])-01$/.test(String(rate.effectiveMonth || ''))
            && String(rate.effectiveMonth).slice(0, 7) <= monthKey)
        .sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
    return Number(rates[rates.length - 1]?.monthlyAmount ?? resident?.monthlyAmount ?? state.defaultSubscription) || 0;
}

function getCurrentSubscriptionAmount(resident) {
    return getSubscriptionAmountForMonthKey(resident, new Date().toISOString().slice(0, 7));
}

let subscriptionRateResidentId = null;

function escapeSubscriptionHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function formatSubscriptionAmount(value) {
    return new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        .format(Number(value) || 0);
}

function renderSubscriptionRateHistory(resident) {
    const body = document.getElementById('subscriptionRateHistoryBody');
    if (!body) return;
    const history = Array.isArray(resident.subscriptionRateHistory) ? resident.subscriptionRateHistory : [];
    if (!history.length) {
        body.innerHTML = '<tr><td colspan="5" class="px-3 py-5 text-center text-xs text-slate-500">لا يوجد سجل تاريخي بعد.</td></tr>';
        return;
    }
    body.innerHTML = [...history]
        .sort((a, b) => String(b.changedAt).localeCompare(String(a.changedAt)))
        .map(change => {
            const previous = change.previousMonthlyAmount == null
                ? '—'
                : formatSubscriptionAmount(change.previousMonthlyAmount);
            const recordedAt = change.changedAt
                ? new Date(change.changedAt).toLocaleString('ar-EG')
                : '—';
            const type = change.changeType === 'baseline' ? 'قيمة تأسيسية' : 'تغيير';
            const actor = change.changedBy ? 'المدير' : 'النظام';
            return `<tr class="border-t border-slate-700/40">
                <td class="px-3 py-2 whitespace-nowrap">${escapeSubscriptionHtml(String(change.effectiveMonth || '').slice(0, 7))}</td>
                <td class="px-3 py-2 whitespace-nowrap">${previous}</td>
                <td class="px-3 py-2 whitespace-nowrap font-bold">${formatSubscriptionAmount(change.newMonthlyAmount)}</td>
                <td class="px-3 py-2 whitespace-nowrap">${escapeSubscriptionHtml(recordedAt)}</td>
                <td class="px-3 py-2 whitespace-nowrap">${type} · ${actor}</td>
            </tr>`;
        }).join('');
}

function openSubscriptionRateModal(residentId) {
    if (!requireManager()) return;
    const resident = state.residents.find(item => item.id === residentId);
    if (!resident) return;
    subscriptionRateResidentId = resident.id;
    document.getElementById('subscriptionRateResidentSummary').textContent =
        `${resident.name} · شقة ${resident.apartmentNumber} · القيمة الحالية ${formatSubscriptionAmount(resident.monthlyAmount)}`;
    const monthInput = document.getElementById('subscriptionRateEffectiveMonth');
    monthInput.value = new Date().toISOString().slice(0, 7);
    const createdMonth = String(resident.createdAt || '').slice(0, 7);
    if (createdMonth) monthInput.min = createdMonth;
    else monthInput.removeAttribute('min');
    document.getElementById('subscriptionRateAmount').value = getCurrentSubscriptionAmount(resident);
    renderSubscriptionRateHistory(resident);
    openModal('subscriptionRateModal');
}

async function addSubscriptionRateChange(event) {
    if (!requireManager()) return;
    event.preventDefault();
    const resident = state.residents.find(item => item.id === subscriptionRateResidentId);
    if (!resident) {
        toast('تعذر العثور على الشقة. أعد فتح سجل الاشتراك.', 'error');
        return;
    }
    const effectiveMonth = document.getElementById('subscriptionRateEffectiveMonth').value.trim();
    const monthlyAmount = Number(document.getElementById('subscriptionRateAmount').value);
    if (!isValidEffectiveMonth(effectiveMonth)) {
        toast('اختر شهرًا صحيحًا لتطبيق الاشتراك.', 'error');
        return;
    }
    const createdMonth = String(resident.createdAt || '').slice(0, 7);
    if (createdMonth && effectiveMonth < createdMonth) {
        toast('لا يمكن تطبيق الاشتراك قبل تاريخ إنشاء الشقة.', 'error');
        return;
    }
    if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0) {
        toast('قيمة الاشتراك يجب أن تكون صفرًا أو أكثر.', 'error');
        return;
    }

    const effectiveDate = effectiveMonth + '-01';
    const existingRate = (resident.subscriptionRates || []).find(rate => rate.effectiveMonth === effectiveDate);
    const previousAmount = existingRate
        ? Number(existingRate.monthlyAmount) || 0
        : getSubscriptionAmountForMonthKey(resident, effectiveMonth);
    if (Math.round(previousAmount * 100) === Math.round(monthlyAmount * 100)) {
        toast('لا يوجد تغيير في قيمة الاشتراك لهذا الشهر.', 'info');
        return;
    }

    const previousState = cloneStateSnapshot();
    resident.subscriptionRates = Array.isArray(resident.subscriptionRates) ? resident.subscriptionRates : [];
    resident.subscriptionRates = resident.subscriptionRates.filter(rate => rate.effectiveMonth !== effectiveDate);
    resident.subscriptionRates.push({ effectiveMonth: effectiveDate, monthlyAmount });
    resident.subscriptionRates.sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
    resident.monthlyAmount = getCurrentSubscriptionAmount(resident);
    logAction('تغيير قيمة الاشتراك', `${resident.name} - ${previousAmount} إلى ${monthlyAmount} بدءًا من ${effectiveMonth}`);

    if (!await saveWithRollback(previousState)) return;
    try {
        if (typeof reloadResidentSubscriptionRateHistory === 'function') {
            await reloadResidentSubscriptionRateHistory(resident.id);
        }
    } catch (error) {
        console.error('Could not refresh subscription rate history:', error);
    }
    renderSubscriptionRateHistory(resident);
    const amountInput = document.getElementById('residentAmount');
    if (amountInput && editingResidentId === resident.id) amountInput.value = resident.monthlyAmount;
    const summary = document.getElementById('subscriptionRateResidentSummary');
    if (summary) {
        summary.textContent = `${resident.name} · شقة ${resident.apartmentNumber} · القيمة الحالية ${formatSubscriptionAmount(resident.monthlyAmount)}`;
    }
    toast('تم حفظ تغيير الاشتراك وإضافته إلى السجل التاريخي.', 'success');
}


async function handleResidentSubmit(e) {
    if (!requireManager()) return;
    e.preventDefault();
    const previousState = cloneStateSnapshot();
    const shouldProvisionOwner = ownerProvisionRequested;
    ownerProvisionRequested = false;
    const name = document.getElementById('residentName').value.trim();
    const apartmentNumber = document.getElementById('residentApartment').value.trim();
    const phone = document.getElementById('residentPhone').value.trim();
    const amountInput = document.getElementById('residentAmount').value.trim();
    const monthlyAmount = amountInput === '' ? Number(state.defaultSubscription) || 0 : Number(amountInput);
    const notes = document.getElementById('residentNotes').value.trim();
    if (!name || !apartmentNumber) { toast('الاسم ورقم الشقة مطلوبان','error'); return; }
    if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0) { toast('قيمة الاشتراك يجب أن تكون صفراً أو أكثر','error'); return; }
    if (shouldProvisionOwner && !normalizeOwnerPhone(phone)) { toast('أدخل رقم جوال صحيحًا أولاً؛ مثال مصري: 01012345678','error'); return; }
    const normalizedApartment = apartmentNumber.toLocaleLowerCase('ar-EG');
    if (state.residents.some(r => r.id !== editingResidentId && String(r.apartmentNumber||'').trim().toLocaleLowerCase('ar-EG') === normalizedApartment)) {
        toast('رقم الشقة مسجل بالفعل','error'); return;
    }
    let targetResidentId;
    if (editingResidentId) {
        const r = state.residents.find(x => x.id === editingResidentId);
        if (r) {
            const previousAmount = Number(r.monthlyAmount ?? state.defaultSubscription) || 0;
            if (Math.round(previousAmount * 100) !== Math.round(monthlyAmount * 100)) {
                toast('غيّر قيمة الاشتراك من زر «إدارة تاريخ الاشتراك» حتى يُحفظ التغيير في السجل.', 'error');
                return;
            }
            Object.assign(r, { name, apartmentNumber, phone, monthlyAmount, notes });
            targetResidentId = r.id;
            logAction('تعديل شقة', `${name} - شقة ${apartmentNumber}`);
        }
    } else {
        const resident = {
            id: generateId(), name, apartmentNumber, phone, monthlyAmount, notes,
            createdAt: new Date().toISOString(),
            subscriptionRates: [{ effectiveMonth: new Date().toISOString().slice(0, 7) + '-01', monthlyAmount }]
        };
        state.residents.push(resident);
        targetResidentId = resident.id;
        logAction('إضافة شقة', `${name} - شقة ${apartmentNumber}`);
    }
    if (!await saveWithRollback(previousState)) return;
    closeModal('residentModal'); renderAll();
    toast(editingResidentId ? 'تم التعديل' : 'تمت الإضافة', 'success');
    if (shouldProvisionOwner && targetResidentId) await provisionOwnerAccess(targetResidentId);
}

async function getOwnerProvisioningErrorCode(error, data) {
    if (typeof data?.error === 'string') return data.error;
    const response = error?.context;
    if (!response || typeof response.clone !== 'function') return '';
    try {
        const body = await response.clone().json();
        return typeof body?.error === 'string' ? body.error : '';
    } catch {
        return '';
    }
}

async function provisionOwnerAccess(residentId) {
    if (!requireManager()) return;
    const messages = {
        invalid_phone: 'رقم الجوال غير صحيح. استخدم رقمًا مصريًا مثل 01012345678.',
        phone_already_linked: 'رقم الجوال مربوط بحساب مالك آخر.',
        phone_account_create_failed: 'تعذر إنشاء حساب لهذا الرقم؛ ربما له حساب سابق. راجع المدير.',
        manager_only: 'إنشاء حساب المالك متاح للمدير فقط.',
        resident_not_found: 'تعذر العثور على الشقة في هذا المبنى. أعد تحميل الصفحة وحاول مرة أخرى.',
        server_configuration_error: 'إعدادات وظيفة Supabase غير مكتملة. راجع إعدادات الخادم.',
        profile_lookup_failed: 'تعذر التحقق من حساب المالك الحالي. حاول لاحقًا أو راجع المدير.',
        profile_link_lookup_failed: 'تعذر التحقق من ارتباط الحساب الحالي. لم يتم تغيير الحساب؛ حاول لاحقًا.',
        profile_save_failed: 'تعذر حفظ ملف حساب المالك في Supabase. لم يُعرض أي كود.',
        membership_save_failed: 'تعذر ربط حساب المالك بالمبنى. لم يُعرض أي كود.',
        resident_link_failed: 'تعذر ربط الحساب بالشقة. لم يُعرض أي كود.',
        auth_update_failed: 'تعذر تحديث بيانات دخول المالك. راجع المدير قبل إعادة المحاولة.'
    };
    let data;
    try {
        const result = await supabaseClient.functions.invoke('manage-owner-access', { body: { resident_id: residentId } });
        data = result.data;
        if (result.error || !data?.temporary_pin) {
            const errorCode = await getOwnerProvisioningErrorCode(result.error, data);
            const status = result.error?.context?.status;
            console.error('Owner provisioning failed:', errorCode || result.error?.message || 'unknown error');
            const fallback = status
                ? `وصل الطلب إلى Supabase لكنه رُفض (HTTP ${status}). راجع الخطأ أو أعد المحاولة لاحقًا.`
                : 'تعذر الاتصال بـ Supabase. تحقق من الإنترنت ثم أعد المحاولة.';
            toast(messages[errorCode] || fallback, 'error');
            return;
        }
        await loadState();
    } catch (error) {
        console.error('Owner provisioning refresh failed:', error);
        toast('تم إنشاء الحساب لكن تعذر تحديث البيانات. أعد تحميل الصفحة قبل متابعة العمل.', 'error');
        return;
    }
    renderAll();
    const phoneDisplay = document.getElementById('ownerTempPinPhone');
    const resident = state.residents.find(item => item.id === residentId);
    phoneDisplay.textContent = data.phone;
    phoneDisplay.dataset.phone = data.phone;
    phoneDisplay.dataset.apartmentNumber = resident?.apartmentNumber || '';
    document.getElementById('ownerTempPinValue').value = data.temporary_pin;
    const modal = document.getElementById('ownerTempPinModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function sendOwnerTempPinOnWhatsApp() {
    const phoneDisplay = document.getElementById('ownerTempPinPhone');
    const pin = document.getElementById('ownerTempPinValue')?.value.trim() || '';
    const phoneDigits = String(phoneDisplay?.dataset.phone || '').replace(/\D/g, '');
    const apartmentNumber = String(phoneDisplay?.dataset.apartmentNumber || '').trim();
    if (!/^[1-9]\d{7,14}$/.test(phoneDigits)) {
        toast('رقم المالك المسجل غير صالح؛ انسخ الرمز وأرسله يدويًا.', 'error');
        return;
    }
    if (!/^\d{8}$/.test(pin)) {
        toast('لا يوجد PIN مؤقت صالح من 8 أرقام لإرساله.', 'error');
        return;
    }
    const apartmentLabel = apartmentNumber ? ` للشقة ${apartmentNumber}` : '';
    const message = [
        'مرحبًا،',
        `رمز الدخول المؤقت لتطبيق Manzil${apartmentLabel}: ${pin}`,
        'سيُطلب منك تغييره عند أول دخول. لا تشارك الرمز مع أي شخص آخر.'
    ].join('\n');
    const url = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    toast('فتحنا واتساب على رقم المالك المسجل. راجع الرسالة واضغط «إرسال».', 'success');
}

async function copyOwnerTempPin() {
    const input = document.getElementById('ownerTempPinValue');
    input.select();
    let copied = false;
    try {
        await navigator.clipboard.writeText(input.value);
        copied = true;
    } catch {
        try { copied = document.execCommand('copy'); } catch {}
    }
    toast(copied ? 'تم نسخ الرمز. شاركه مع المالك مباشرةً.' : 'تعذر نسخ الرمز؛ حدده وانسخه يدويًا.', copied ? 'success' : 'error');
}

function closeOwnerTempPinModal() {
    const input = document.getElementById('ownerTempPinValue');
    input.value = '';
    const modal = document.getElementById('ownerTempPinModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function deleteResident(id) {
    if (!requireManager()) return;
    const r = state.residents.find(x => x.id === id); if (!r) return;
    if (state.income.some(payment => payment.residentId === id)) {
        toast('لا يمكن حذف شقة لها تحصيلات مسجلة؛ احتفظ بالسجل المالي ولا تحذف بياناتها.', 'error');
        return;
    }
    if (!confirm(`حذف شقة ${r.name}؟`)) return;
    const previousState = cloneStateSnapshot();
    state.residents = state.residents.filter(x => x.id !== id);
    logAction('حذف شقة', `${r.name} - شقة ${r.apartmentNumber}`);
    if (!await saveWithRollback(previousState)) return;
    toast('تم الحذف','info');
}

async function quickPayResident(residentId) {
    if (!requireManager()) return;
    const r = state.residents.find(x => x.id === residentId); if (!r) return;
    const month = getCurrentMonth();
    const amount = getMonthOutstanding(r, month);
    if (amount <= 0) { toast('تم سداد اشتراك الشهر بالكامل','info'); return; }
    const previousState = cloneStateSnapshot();
    state.income.push({ id: generateId(), residentId, amount, month, date: new Date().toISOString(), notes: 'دفع سريع' });
    logAction('تحصيل', `${r.name} - ${month} - ${fmtNum(amount)}`);
    if (!await saveWithRollback(previousState)) return;
    toast(`تم تسجيل باقي اشتراك ${month}`,'success');
}

function previewIncomeAllocation() {
    const preview = document.getElementById('incomeAllocationPreview');
    const summary = document.getElementById('incomeAllocationSummary');
    const rows = document.getElementById('incomeAllocationRows');
    const submit = document.getElementById('incomeSubmitButton');
    if (!preview || !summary || !rows) return;

    const residentId = document.getElementById('incomeResident')?.value || '';
    const amount = Number(document.getElementById('incomeAmount')?.value);
    const month = document.getElementById('incomeMonth')?.value || '';
    const ready = Boolean(residentId && month && Number.isFinite(amount) && amount > 0);
    if (!ready) {
        preview.classList.add('hidden');
        if (submit) submit.disabled = false;
        return;
    }

    const result = calculateIncomeAllocationPreview(residentId, amount, month);
    preview.classList.remove('hidden');
    if (result.invalidStart) {
        summary.textContent = 'لا يمكن توزيع التحصيل قبل تاريخ إنشاء الشقة.';
        rows.innerHTML = '';
        if (submit) submit.disabled = true;
        return;
    }
    if (result.invalid || !result.allocations.length) {
        summary.textContent = 'لا توجد اشتراكات مستحقة يمكن توزيع المبلغ عليها من هذا الشهر.';
        rows.innerHTML = '';
        if (submit) submit.disabled = true;
        return;
    }

    summary.textContent = result.remainingCents > 0
        ? `تم توزيع ${fmtNum(result.totalAllocated)} من ${fmtNum(amount)} ج.م. المتبقي ${fmtNum(result.remainingAmount)} ج.م خارج نطاق التوزيع؛ قلّل المبلغ.`
        : `سيتم توزيع ${fmtNum(result.totalAllocated)} ج.م على ${result.allocations.length} شهر، بدءًا من أقدم شهر غير مسدد.`;
    rows.innerHTML = result.allocations.map(item =>
        `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>${esc(item.month)}</span><strong class="text-emerald-400">${fmtNum(item.amount)} ج.م</strong></div>`
    ).join('');
    if (submit) submit.disabled = result.remainingCents > 0;
}

async function handleIncomeSubmit(e) {
    if (!requireManager() || incomeSaving) return;
    e.preventDefault();
    const residentId = document.getElementById('incomeResident').value;
    const amount = Number(document.getElementById('incomeAmount').value);
    const month = document.getElementById('incomeMonth').value;
    const notes = document.getElementById('incomeNotes').value.trim();
    if (!residentId || !Number.isFinite(amount) || amount <= 0 || !month) {
        toast('اختر الشقة والشهر وأدخل مبلغاً أكبر من صفر', 'error');
        return;
    }
    const resident = state.residents.find(item => item.id === residentId);
    if (!resident) {
        toast('الشقة المحددة غير موجودة؛ حدّث القائمة ثم حاول مجدداً', 'error');
        return;
    }

    const allocation = calculateIncomeAllocationPreview(residentId, amount, month);
    if (allocation.invalid || !allocation.allocations.length || allocation.remainingCents > 0) {
        previewIncomeAllocation();
        toast('تعذر توزيع كامل المبلغ على فترات الاشتراك. راجع المعاينة أو قلّل المبلغ.', 'error');
        return;
    }

    incomeSaving = true;
    const submit = document.getElementById('incomeSubmitButton');
    if (submit) {
        submit.disabled = true;
        submit.textContent = 'جارٍ الحفظ...';
    }
    const previousState = cloneStateSnapshot();
    const paidAt = new Date().toISOString();
    const paymentReference = generateId().replace(/-/g, '').slice(0, 12).toUpperCase();
    allocation.allocations.forEach((item, index) => {
        const allocationNote = [
            `دفعة موزعة ${paymentReference} (${index + 1}/${allocation.allocations.length})`,
            notes
        ].filter(Boolean).join(' · ');
        state.income.push({
            id: generateId(),
            residentId,
            amount: item.amount,
            month: item.month,
            date: paidAt,
            notes: allocationNote
        });
    });
    logAction(
        'تحصيل موزع',
        `${resident.name} - ${fmtNum(amount)} ج.م - ${allocation.allocations.length} شهر - ${paymentReference}`
    );

    try {
        if (!await saveWithRollback(previousState)) return;
        closeModal('incomeModal');
        document.getElementById('incomeForm').reset();
        document.getElementById('incomeAllocationPreview')?.classList.add('hidden');
        renderAll();
        toast(
            allocation.allocations.length > 1
                ? `تم توزيع التحصيل على ${allocation.allocations.length} أشهر`
                : 'تم تسجيل التحصيل',
            'success'
        );
    } finally {
        incomeSaving = false;
        if (submit) {
            submit.disabled = false;
            submit.textContent = 'حفظ التحصيل وتوزيعه';
        }
    }
}


async function deleteIncome(id) {
    if (!requireManager()) return;
    if (!confirm('حذف هذا التحصيل؟')) return;
    const previousState = cloneStateSnapshot();
    state.income = state.income.filter(i => i.id !== id);
    logAction('حذف تحصيل', id);
    if (!await saveWithRollback(previousState)) return;
    toast('تم الحذف','info');
}

function previewExpense() {
    const preview = document.getElementById('expensePreview');
    const summary = document.getElementById('expensePreviewSummary');
    const details = document.getElementById('expensePreviewDetails');
    if (!preview || !summary || !details) return;

    const title = document.getElementById('expenseTitle')?.value.trim() || '';
    const amount = Number(document.getElementById('expenseAmount')?.value);
    const category = document.getElementById('expenseCategory')?.value || '';
    const month = document.getElementById('expenseMonth')?.value || '';
    const notes = document.getElementById('expenseNotes')?.value.trim() || '';
    const cashAccountCode = document.getElementById('expenseCashAccount')?.value || 'main';
    const accountBalance = getCashAccountBalance(cashAccountCode);
    const balanceAfter = accountBalance - (Number.isFinite(amount) ? amount : 0);
    const fundInsufficient = cashAccountCode !== 'main' && Number.isFinite(amount) && amount > accountBalance + 0.000001;
    if (!title || !Number.isFinite(amount) || amount <= 0 || !month) {
        preview.classList.add('hidden');
        return;
    }

    summary.textContent = `معاينة المصروف: ${title} — ${fmtNum(amount)} ج.م`;
    summary.className = `text-xs font-bold ${fundInsufficient ? 'text-rose-400' : 'text-rose-300'}`;
    details.innerHTML = [
        `<div class="flex justify-between gap-3"><span>الفئة</span><strong>${esc(category || 'أخرى')}</strong></div>`,
        `<div class="flex justify-between gap-3"><span>الصندوق</span><strong>${esc(getCashAccountLabel(cashAccountCode))}</strong></div>`,
        `<div class="flex justify-between gap-3"><span>الرصيد قبل الصرف</span><strong>${fmtNum(accountBalance)} ج.م</strong></div>`,
        `<div class="flex justify-between gap-3"><span>الرصيد بعد الصرف</span><strong class="${fundInsufficient ? 'text-rose-400' : ''}">${fmtNum(balanceAfter)} ج.م</strong></div>`,
        `<div class="flex justify-between gap-3"><span>الشهر</span><strong>${esc(month)}</strong></div>`,
        `<div class="flex justify-between gap-3"><span>الملاحظات</span><strong class="text-left">${esc(notes || '—')}</strong></div>`
    ].join('');
    preview.classList.remove('hidden');
}

async function handleExpenseSubmit(e) {
    if (!requireManager() || expenseSaving) return;
    e.preventDefault();
    const title = document.getElementById('expenseTitle').value.trim();
    const amount = Number(document.getElementById('expenseAmount').value);
    const category = document.getElementById('expenseCategory').value;
    const month = document.getElementById('expenseMonth').value;
    const notes = document.getElementById('expenseNotes').value.trim();
    const cashAccountCode = document.getElementById('expenseCashAccount')?.value || 'main';
    if (!title || !Number.isFinite(amount) || amount <= 0 || !month ||
        !['main', 'development', 'emergency'].includes(cashAccountCode)) {
        toast('أدخل وصفاً ومبلغاً أكبر من صفر واختر الشهر والصندوق', 'error');
        return;
    }
    const availableBalance = getCashAccountBalance(cashAccountCode);
    if (cashAccountCode !== 'main' && amount > availableBalance + 0.000001) {
        toast(`الرصيد المتاح في ${getCashAccountLabel(cashAccountCode)} غير كافٍ.`, 'error');
        previewExpense();
        return;
    }

    expenseSaving = true;
    const submit = document.getElementById('expenseSubmitButton');
    if (submit) {
        submit.disabled = true;
        submit.textContent = 'جارٍ الحفظ...';
    }
    const previousState = cloneStateSnapshot();
    state.expenses.push({ id: generateId(), title, amount, category, month, notes, cashAccountCode, date: new Date().toISOString() });
    logAction('مصروف', `${title} - ${fmtNum(amount)}`);
    try {
        if (!await saveWithRollback(previousState)) return;
        closeModal('expenseModal');
        document.getElementById('expenseForm').reset();
        document.getElementById('expensePreview')?.classList.add('hidden');
        renderAll();
        toast('تم تسجيل المصروف', 'success');
    } finally {
        expenseSaving = false;
        if (submit) {
            submit.disabled = false;
            submit.textContent = 'حفظ المصروف';
        }
    }
}


async function deleteExpense(id) {
    if (!requireManager()) return;
    if (!confirm('حذف هذا المصروف؟')) return;
    const previousState = cloneStateSnapshot();
    state.expenses = state.expenses.filter(e => e.id !== id);
    logAction('حذف مصروف', id);
    if (!await saveWithRollback(previousState)) return;
    toast('تم الحذف','info');
}

function openNoticeModal() { if (!requireManager()) return; document.getElementById('noticeInput').value = ''; openModal('noticeModal'); }

function applyNoticeTemplate(type) {
    if (!requireManager()) return;
    const t = {
        monthly_sub: `السادة سكان العمارة،\nنذكركم بضرورة سداد اشتراك شهر ${getCurrentMonth()} وقدره ${fmtNum(state.defaultSubscription)} جنيه.\nشاكرين تعاونكم.`,
        cleaning: `إعلان هام:\nسيتم عمل حملة نظافة للعمارة يوم ____ القادم.\nنرجو التعاون وإزالة أي عوائق من أمام الأبواب.`,
        elevator: `إعلان:\nنظراً لأعمال الصيانة الدورية، سيكون الأسانسير متوقفاً يوم ____ من الساعة __ إلى __.\nنعتذر عن الإزعاج.`,
        eid: `كل عام وأنتم بخير بمناسبة ____.\nأعاده الله عليكم باليمن والبركات.\nإدارة العمارة.`
    };
    document.getElementById('noticeInput').value = t[type] || '';
}

async function handleNoticeSubmit() {
    if (!requireManager()) return;
    const text = document.getElementById('noticeInput').value.trim();
    if (!text) { toast('اكتب نص الإعلان','error'); return; }
    const previousState = cloneStateSnapshot();
    state.notices.push({ id: generateId(), text, date: new Date().toISOString() });
    logAction('إعلان جديد', text.substring(0, 40));
    if (!await saveWithRollback(previousState)) return;
    closeModal('noticeModal'); renderNotices(); toast('تم النشر','success');
}

async function deleteNotice(id) {
    if (!requireManager()) return;
    const notice = state.notices.find(n => n.id === id); if (!notice) return;
    if (!confirm('حذف هذا الإعلان؟')) return;
    const previousState = cloneStateSnapshot();
    state.notices = state.notices.filter(n => n.id !== id);
    logAction('حذف إعلان', notice?.text || id);
    if (!await saveWithRollback(previousState)) return;
    renderNotices();
    toast('تم حذف الإعلان', 'info');
}

function shareNoticeToWhatsApp() {
    if (!requireManager()) return;
    if (!state.notices.length) { toast('لا يوجد إعلان','error'); return; }
    const n = state.notices[state.notices.length - 1];
    const text = `📢 ${state.buildingName || 'العمارة'}\n\n${n.text}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function copyNoticeToClipboard() {
    if (!requireManager()) return;
    if (!state.notices.length) { toast('لا يوجد إعلان','error'); return; }
    const n = state.notices[state.notices.length - 1];
    navigator.clipboard.writeText(n.text).then(() => toast('تم النسخ','success')).catch(() => toast('فشل النسخ','error'));
}

function cleanPhone(p) {
    if (!p) return '';
    let d = p.replace(/\D/g, '');
    if (d.startsWith('0')) d = '20' + d.substring(1);
    else if (d.length === 10) d = '20' + d;
    return d;
}

function sendWhatsAppReminder(residentId) {
    if (!requireManager()) return;
    const r = state.residents.find(x => x.id === residentId); if (!r) return;
    const d = calculateCumulativeDebt(residentId);
    const phone = cleanPhone(r.phone);
    if (!phone) { toast('أضف رقم هاتف الساكن أولاً لإرسال التذكير','error'); return; }
    const msg = `مرحباً ${r.name}،\nنذكركم بسداد اشتراك شهر ${getCurrentMonth()} للعمارة.\n${d.count>0?`إجمالي المتأخرات: ${fmtNum(d.totalDebt)} ج.م (${d.count} شهر)\n`:''}شكراً لتعاونكم.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function generateLandlordReport() {
    if (!requireManager()) return;
    const m = document.getElementById('reportMonthSelect').value;
    if (!m) { toast('اختر شهر','error'); return; }
    const inc = state.income.filter(i => i.month === m);
    const exp = state.expenses.filter(e => e.month === m);
    const totalInc = inc.reduce((s,i) => s + (parseFloat(i.amount)||0), 0);
    const totalExp = exp.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
    const net = totalInc - totalExp;
    document.getElementById('landlordReportPreview').innerHTML = `
        <div class="space-y-3">
            <div class="text-center border-b border-slate-700 pb-2"><h3 class="font-black text-sm">${esc(state.buildingName||'العمارة')}</h3><p class="text-[10px] text-slate-400">تقرير ${esc(m)}</p></div>
            <div class="grid grid-cols-3 gap-2 text-center">
                <div class="app-card p-2 rounded-xl border"><p class="text-[10px] text-slate-500">تحصيل</p><p class="text-xs font-black text-emerald-400">${fmtNum(totalInc)}</p></div>
                <div class="app-card p-2 rounded-xl border"><p class="text-[10px] text-slate-500">مصروف</p><p class="text-xs font-black text-rose-400">${fmtNum(totalExp)}</p></div>
                <div class="app-card p-2 rounded-xl border"><p class="text-[10px] text-slate-500">صافي</p><p class="text-xs font-black ${net>=0?'text-emerald-400':'text-rose-400'}">${fmtNum(net)}</p></div>
            </div>
            <div><p class="text-[10px] font-bold text-slate-400 mb-1">تفاصيل التحصيلات (${inc.length}):</p>
                ${inc.length?inc.map(i => { const r = state.residents.find(x => x.id===i.residentId); return `<div class="flex justify-between text-[11px] border-b border-slate-800 py-1"><span>${esc(r?.name||'—')}</span><span class="text-emerald-400">${fmtNum(i.amount)}</span></div>`; }).join(''):'<p class="text-slate-500 text-[10px]">لا يوجد</p>'}
            </div>
            <div><p class="text-[10px] font-bold text-slate-400 mb-1">تفاصيل المصروفات (${exp.length}):</p>
                ${exp.length?exp.map(e => `<div class="flex justify-between text-[11px] border-b border-slate-800 py-1"><span>${esc(e.title)}</span><span class="text-rose-400">${fmtNum(e.amount)}</span></div>`).join(''):'<p class="text-slate-500 text-[10px]">لا يوجد</p>'}
            </div>
            <div class="text-[10px] text-slate-500 text-center pt-2 border-t border-slate-700">تم الإنشاء: ${formatDate(new Date().toISOString())}</div>
        </div>`;
}

function exportToCSV() {
    if (!requireManager()) return;
    const rows = [['النوع','الوصف','الشقة','الشهر','المبلغ','ملاحظات']];
    state.income.forEach(i => {
        const r = state.residents.find(x => x.id === i.residentId);
        rows.push(['تحصيل', r?.name||'', r?.apartmentNumber||'', i.month, i.amount, i.notes||'']);
    });
    state.expenses.forEach(e => rows.push(['مصروف', e.title, '', e.month, e.amount, [e.category, e.notes].filter(Boolean).join(' ')]));
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

function exportJSON() {
    if (!requireManager()) return;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `manzil_backup_${Date.now()}.json`;
    a.click();
    toast('تم التصدير','success');
}

function isValidBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const requiredArrays = ['residents','income','expenses','notices'];
    if (!requiredArrays.every(key => Array.isArray(data[key]))) return false;
    const validId = value => typeof value === 'string' && /^[\w-]{1,100}$/.test(value);
    const validNumber = value => (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
    const validAmount = value => validNumber(value) && Number(value) >= 0;
    if (!data.residents.every(r => r && typeof r === 'object' && validId(r.id) && typeof r.name === 'string' && typeof r.apartmentNumber === 'string' && (r.phone === undefined || typeof r.phone === 'string') && (r.notes === undefined || typeof r.notes === 'string') && validAmount(r.monthlyAmount ?? 0))) return false;
    if (!data.residents.every(r => r.userId === undefined || r.userId === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(r.userId)))) return false;
    const hasUnique = values => new Set(values).size === values.length;
    if (!hasUnique(data.residents.map(r => r.id))) return false;
    const apartmentKeys = data.residents.map(r => String(r.apartmentNumber).trim().toLocaleLowerCase('ar-EG'));
    if (!hasUnique(apartmentKeys)) return false;
    if (!data.residents.every(r => {
        if (r.subscriptionRates === undefined) return true;
        if (!Array.isArray(r.subscriptionRates)) return false;
        const months = r.subscriptionRates.map(rate => rate?.effectiveMonth);
        return hasUnique(months) && r.subscriptionRates.every(rate =>
            rate && typeof rate === 'object' &&
            /^\d{4}-(0[1-9]|1[0-2])-01$/.test(String(rate.effectiveMonth || '')) &&
            validAmount(rate.monthlyAmount)
        );
    })) return false;
    const residentIds = new Set(data.residents.map(r => r.id));
    if (!data.income.every(i => i && typeof i === 'object' && validId(i.id) && validId(i.residentId) && residentIds.has(i.residentId) && typeof i.month === 'string' && validAmount(i.amount) && (i.notes === undefined || typeof i.notes === 'string'))) return false;
    if (!hasUnique(data.income.map(i => i.id))) return false;
    if (!data.expenses.every(e => e && typeof e === 'object' && validId(e.id) && typeof e.title === 'string' && typeof e.month === 'string' && validAmount(e.amount) && (e.category === undefined || typeof e.category === 'string') && (e.notes === undefined || typeof e.notes === 'string'))) return false;
    if (!hasUnique(data.expenses.map(e => e.id))) return false;
    if (!data.notices.every(n => n && typeof n === 'object' && validId(n.id) && typeof n.text === 'string')) return false;
    if (!hasUnique(data.notices.map(n => n.id))) return false;
    if (data.auditLogs !== undefined && !Array.isArray(data.auditLogs)) return false;
    if (data.currentTheme !== undefined && !['dark','light','emerald','ocean','sand'].includes(data.currentTheme)) return false;
    if (data.defaultSubscription !== undefined && !validAmount(data.defaultSubscription)) return false;
    if (data.startingBalance !== undefined && !validNumber(data.startingBalance)) return false;
    return true;
}

function importJSON(ev) {
    if (!requireManager()) return;
    const f = ev.target.files[0]; if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast('حجم النسخة أكبر من الحد المسموح (10 ميجابايت)','error'); ev.target.value = ''; return; }
    const r = new FileReader();
    r.onload = async () => {
        try {
            const data = JSON.parse(r.result);
            if (!isValidBackup(data)) throw new Error('ملف غير صالح');
            if (!confirm('استيراد البيانات؟ سيتم استبدال الحالية.')) return;
            const previousState = cloneStateSnapshot();
            state = { ...state, ...data, auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs : [] };
            if (!await saveWithRollback(previousState)) throw new Error('تعذر حفظ النسخة');
            const importedTheme = state.currentTheme || 'dark';
            document.body.setAttribute('data-theme', importedTheme);
            const themeColors = { dark:'#0b1020', light:'#f3f6fc', emerald:'#071c18', ocean:'#071827', sand:'#211b16' };
            document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[importedTheme] || themeColors.dark);
            renderAll();
            toast('تم الاستيراد','success'); closeModal('backupModal');
        } catch (e) { console.error('تعذر استيراد النسخة:', e); toast('النسخة غير صالحة أو تعذر حفظها؛ لم يتم استبدال البيانات','error'); }
        finally { ev.target.value = ''; }
    };
    r.onerror = () => { toast('تعذر قراءة الملف','error'); ev.target.value = ''; };
    r.readAsText(f);
}

