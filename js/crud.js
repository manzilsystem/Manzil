let ownerProvisionRequested = false;
let incomeSaving = false;
let editingIncomeId = null;
let expenseSaving = false;
let editingExpenseId = null;

function normalizeApartmentDigits(value) {
    return String(value ?? '').replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776)).trim();
}

function normalizeApartmentNumberKey(value) {
    const normalized = normalizeApartmentDigits(value);
    return /^\d+$/.test(normalized)
        ? normalized.replace(/^0+(?=\d)/, '')
        : normalized.toLocaleLowerCase('ar-EG');
}

function getFloorLabel(floorNumber) {
    return 'الدور ' + Number(floorNumber).toLocaleString('ar-EG');
}

function updateResidentApartmentOptions(preferredApartment = '') {
    const floorSelect = document.getElementById('residentFloor');
    const apartmentSelect = document.getElementById('residentApartment');
    if (!floorSelect || !apartmentSelect) return;
    const floorNumber = Number(floorSelect.value);
    const currentResident = state.residents.find(item => item.id === editingResidentId);
    const options = [];
    if (Number.isInteger(floorNumber) && floorNumber >= 1 && floorNumber <= state.floorCount
        && Number.isInteger(state.apartmentsPerFloor) && state.apartmentsPerFloor > 0) {
        const firstApartment = (floorNumber - 1) * state.apartmentsPerFloor + 1;
        for (let unit = 0; unit < state.apartmentsPerFloor; unit += 1) {
            const number = String(firstApartment + unit);
            const occupied = state.residents.some(item =>
                item.id !== editingResidentId && normalizeApartmentNumberKey(item.apartmentNumber) === normalizeApartmentNumberKey(number)
            );
            if (!occupied) options.push(number);
        }
    }
    const keepCurrentApartment = currentResident
        && normalizeApartmentDigits(currentResident.floor || '') === normalizeApartmentDigits(floorSelect.value || '');
    const currentApartment = normalizeApartmentDigits(preferredApartment || (keepCurrentApartment ? currentResident.apartmentNumber : '') || '');
    if (currentApartment && !options.includes(currentApartment)) options.unshift(currentApartment);
    apartmentSelect.innerHTML = '<option value="">اختر رقم الشقة</option>' +
        options.map(number => '<option value="' + esc(number) + '">شقة ' + esc(number) + '</option>').join('');
    if (currentApartment && options.includes(currentApartment)) apartmentSelect.value = currentApartment;
}

function populateResidentFloorOptions(currentFloor = '') {
    const select = document.getElementById('residentFloor');
    if (!select) return;
    const floors = [];
    for (let floor = 1; floor <= state.floorCount; floor += 1) floors.push(String(floor));
    const selectedFloor = normalizeApartmentDigits(currentFloor || '');
    if (selectedFloor && !floors.includes(selectedFloor)) floors.unshift(selectedFloor);
    select.innerHTML = '<option value="">اختر الدور</option>' +
        floors.map(floor => {
            const label = /^\d+$/.test(floor) ? getFloorLabel(floor) : floor;
            return '<option value="' + esc(floor) + '">' + esc(label) + '</option>';
        }).join('');
    select.value = selectedFloor;
}

function openResidentModal(mode, id) {
    if (!requireManager()) return;
    const isEdit = mode === 'edit';
    if (!isEdit && (!state.floorCount || !state.apartmentsPerFloor)) {
        toast('حدد عدد الأدوار وعدد الشقق في إعدادات العقار أولًا.', 'error');
        return;
    }
    editingResidentId = isEdit ? id : null;
    const amountInput = document.getElementById('residentAmount');
    const historyButton = document.getElementById('manageSubscriptionRatesBtn');
    document.getElementById('residentModalTitle').textContent = isEdit ? 'تعديل بيانات الشقة' : 'شقة جديدة';
    if (isEdit) {
        const resident = state.residents.find(item => item.id === id);
        if (resident) {
            document.getElementById('residentName').value = resident.name || '';
            populateResidentFloorOptions(resident.floor || '');
            updateResidentApartmentOptions(resident.apartmentNumber || '');
            document.getElementById('residentPhone').value = resident.phone || '';
            amountInput.value = getCurrentSubscriptionAmount(resident);
            amountInput.readOnly = false;
            amountInput.removeAttribute('aria-readonly');
            const amountHelp = document.getElementById('residentAmountHelp');
            if (amountHelp) {
                amountHelp.textContent = 'يمكنك تعديل الاشتراك مباشرة؛ سيُسجّل التغيير من الشهر الحالي مع الاحتفاظ بالسجل السابق. لاختيار شهر سريان آخر استخدم سجل الاشتراك.';
                amountHelp.classList.remove('hidden');
            }
            historyButton?.classList.remove('hidden');
            document.getElementById('residentNotes').value = resident.notes || '';
        }
    } else {
        document.getElementById('residentForm').reset();
        populateResidentFloorOptions();
        updateResidentApartmentOptions();
        amountInput.value = state.defaultSubscription || '';
        amountInput.readOnly = false;
        amountInput.removeAttribute('aria-readonly');
        document.getElementById('residentAmountHelp')?.classList.add('hidden');
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

function getLocalMonthKey(date = new Date()) {
    const value = date && typeof date.getTime === 'function' ? date : new Date(date);
    if (!Number.isFinite(value.getTime())) return '';
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

function getCurrentSubscriptionAmount(resident, date = new Date()) {
    return getSubscriptionAmountForMonthKey(resident, getLocalMonthKey(date));
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
        `${resident.name} · شقة ${resident.apartmentNumber} · القيمة الحالية ${formatSubscriptionAmount(getCurrentSubscriptionAmount(resident))}`;
    const monthInput = document.getElementById('subscriptionRateEffectiveMonth');
    monthInput.value = getLocalMonthKey();
    const createdMonth = getLocalMonthKey(resident.createdAt);
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
    const createdMonth = getLocalMonthKey(resident.createdAt);
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
        summary.textContent = `${resident.name} · شقة ${resident.apartmentNumber} · القيمة الحالية ${formatSubscriptionAmount(getCurrentSubscriptionAmount(resident))}`;
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
    const apartmentNumber = normalizeApartmentDigits(document.getElementById('residentApartment').value);
    const floor = normalizeApartmentDigits(document.getElementById('residentFloor').value);
    const phone = document.getElementById('residentPhone').value.trim();
    const amountInput = document.getElementById('residentAmount').value.trim();
    const monthlyAmount = amountInput === '' ? Number(state.defaultSubscription) || 0 : Number(amountInput);
    const notes = document.getElementById('residentNotes').value.trim();
    if (!name || !apartmentNumber || (state.floorCount > 0 && !floor)) { toast('الاسم والدور ورقم الشقة مطلوبة.', 'error'); return; }
    const existingResident = state.residents.find(item => item.id === editingResidentId);
    if (editingResidentId && !existingResident) {
        toast('تعذر العثور على الشقة. أعد تحميل البيانات ثم حاول مرة أخرى.', 'error');
        return;
    }
    const unchangedLegacyLocation = existingResident
        && normalizeApartmentDigits(existingResident.floor || '') === floor
        && normalizeApartmentDigits(existingResident.apartmentNumber || '') === apartmentNumber;
    const floorNumber = Number(floor);
    const apartmentValue = Number(apartmentNumber);
    if (!unchangedLegacyLocation && (!Number.isInteger(floorNumber) || floorNumber < 1
        || floorNumber > state.floorCount || !Number.isInteger(apartmentValue)
        || apartmentValue < (floorNumber - 1) * state.apartmentsPerFloor + 1
        || apartmentValue > floorNumber * state.apartmentsPerFloor)) {
        toast('رقم الشقة لا يتوافق مع الدور المحدد.', 'error');
        return;
    }
    if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0) { toast('قيمة الاشتراك يجب أن تكون صفراً أو أكثر','error'); return; }
    if (shouldProvisionOwner && !normalizeOwnerPhone(phone)) { toast('أدخل رقم جوال صحيحًا أولاً؛ مثال مصري: 01012345678','error'); return; }
    const normalizedApartment = normalizeApartmentNumberKey(apartmentNumber);
    if (state.residents.some(r => r.id !== editingResidentId && normalizeApartmentNumberKey(r.apartmentNumber) === normalizedApartment)) {
        toast('رقم الشقة مسجل بالفعل','error'); return;
    }
    let targetResidentId;
    if (editingResidentId) {
        const r = state.residents.find(x => x.id === editingResidentId);
        if (r) {
            const previousAmount = getCurrentSubscriptionAmount(r);
            const subscriptionChanged = Math.round(previousAmount * 100) !== Math.round(monthlyAmount * 100);
            Object.assign(r, { name, apartmentNumber, floor, phone, notes });
            if (subscriptionChanged) {
                const effectiveMonth = getLocalMonthKey();
                const effectiveDate = effectiveMonth + '-01';
                r.subscriptionRates = Array.isArray(r.subscriptionRates) ? r.subscriptionRates : [];
                r.subscriptionRates = r.subscriptionRates.filter(rate => rate.effectiveMonth !== effectiveDate);
                r.subscriptionRates.push({ effectiveMonth: effectiveDate, monthlyAmount });
                r.subscriptionRates.sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
                r.monthlyAmount = getCurrentSubscriptionAmount(r);
                logAction('تغيير قيمة الاشتراك', `${name} - ${previousAmount} إلى ${monthlyAmount} بدءًا من ${effectiveMonth}`);
            } else {
                r.monthlyAmount = monthlyAmount;
                logAction('تعديل شقة', `${name} - شقة ${apartmentNumber}`);
            }
            targetResidentId = r.id;
        }
    } else {
        const createdAt = new Date();
        const resident = {
            id: generateId(), name, apartmentNumber, floor, phone, monthlyAmount, notes,
            createdAt: createdAt.toISOString(),
            subscriptionRates: [{ effectiveMonth: getLocalMonthKey(createdAt) + '-01', monthlyAmount }]
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
        membership_snapshot_failed: 'تعذر التحقق من ارتباط الحساب بالمبنى قبل التعديل. لم يتم إصدار الرمز.',
        profile_snapshot_failed: 'تعذر حفظ حالة حساب المالك السابقة. لم يتم إصدار الرمز.',
        account_has_conflicting_role: 'هذا الحساب مرتبط بدور مدير أو بدور آخر في المبنى، ولا يمكن ربطه كمالك.',
        provisioning_compensation_failed: 'تعذر التراجع الكامل عن خطوات إنشاء الحساب. أوقف إعادة المحاولة وراجع حالة الحساب والشقة.',
        audit_log_save_failed: 'تعذر تسجيل عملية إصدار PIN. لم يتم إصدار الرمز.',
        auth_update_status_unknown: 'تعذر تأكيد تحديث PIN. أعد إصدار الرمز من نفس الشقة لإنشاء رمز جديد للحساب المرتبط.',
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
        const loaded = await loadState();
        if (loaded !== true) {
            toast('تم إنشاء الحساب، لكن لم يُعرض الرمز لتعذر التحقق من الجلسة. سجّل الدخول مجددًا وتحقق من الحساب قبل إعادة الإصدار.', 'error');
            return;
        }
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

function quickPayResident(residentId) {
    if (!requireManager()) return;
    const resident = state.residents.find(item => item.id === residentId);
    if (!resident) {
        toast('تعذر العثور على الشقة. حدّث البيانات ثم حاول مرة أخرى.', 'error');
        return;
    }

    const month = getCurrentMonth();
    const amount = getMonthOutstanding(resident, month);
    if (amount <= 0) {
        toast('تم سداد اشتراك الشهر بالكامل.', 'info');
        return;
    }

    if (typeof populateSelects === 'function') populateSelects();
    const residentSelect = document.getElementById('incomeResident');
    const amountInput = document.getElementById('incomeAmount');
    const monthSelect = document.getElementById('incomeMonth');
    const paymentMethodSelect = document.getElementById('incomePaymentMethod');
    const notesInput = document.getElementById('incomeNotes');
    if (!residentSelect || !amountInput || !monthSelect || !paymentMethodSelect) {
        toast('تعذر تجهيز نموذج التحصيل. أعد تحميل الصفحة وحاول مرة أخرى.', 'error');
        return;
    }

    residentSelect.value = residentId;
    amountInput.value = amount.toFixed(2);
    monthSelect.value = month;
    paymentMethodSelect.value = '';
    if (notesInput) notesInput.value = 'دفع سريع';

    previewIncomeAllocation();
    openModal('incomeModal');
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
    const paymentMethod = document.getElementById('incomePaymentMethod').value;
    if (!residentId || !Number.isFinite(amount) || amount <= 0 || !month
        || !Object.prototype.hasOwnProperty.call(INCOME_PAYMENT_METHOD_LABELS, paymentMethod)
        || !isIncomePaymentMethodEnabled(paymentMethod)) {
        toast('اختر الشقة وطريقة الدفع والشهر، وأدخل مبلغاً أكبر من صفر.', 'error');
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
            paymentMethod,
            notes: allocationNote
        });
    });
    logAction(
        'تحصيل موزع',
        `${resident.name} - ${fmtNum(amount)} ج.م - ${getIncomePaymentMethodLabel(paymentMethod)} - ${allocation.allocations.length} شهر - ${paymentReference}`
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


function openIncomeEditModal(id) {
    if (!requireManager()) return;
    const payment = state.income.find(item => item.id === id);
    if (!payment) {
        toast('تعذر العثور على التحصيل. حدّث السجل ثم حاول مرة أخرى.', 'error');
        return;
    }
    const resident = state.residents.find(item => item.id === payment.residentId);
    if (!resident) {
        toast('الشقة المرتبطة بالتحصيل غير موجودة.', 'error');
        return;
    }
    editingIncomeId = payment.id;
    document.getElementById('incomeEditResidentSummary').textContent =
        resident.name + ' · شقة ' + resident.apartmentNumber;
    const monthSelect = document.getElementById('incomeEditMonth');
    monthSelect.innerHTML = getActiveBuildingMonths()
        .map(month => '<option value="' + esc(month) + '">' + esc(month) + '</option>').join('');
    monthSelect.value = payment.month;
    document.getElementById('incomeEditAmount').value = payment.amount;
    const paymentMethodSelect = document.getElementById('incomeEditPaymentMethod');
    populatePaymentMethodOptions(paymentMethodSelect, payment.paymentMethod || '', true);
    paymentMethodSelect.value = payment.paymentMethod || '';
    const distributionNote = String(payment.notes || '').match(/^(دفعة موزعة\s+[A-Z0-9]+\s+\(\d+\/\d+\))(?:\s+·\s+([\s\S]*))?$/i);
    document.getElementById('incomeEditNotes').value = distributionNote ? (distributionNote[2] || '') : (payment.notes || '');
    openModal('incomeEditModal');
}

async function handleIncomeEditSubmit(event) {
    if (!requireManager() || incomeSaving) return;
    event.preventDefault();
    const payment = state.income.find(item => item.id === editingIncomeId);
    if (!payment) {
        toast('تعذر العثور على التحصيل. أعد فتح سجل التحصيلات.', 'error');
        return;
    }
    const resident = state.residents.find(item => item.id === payment.residentId);
    if (!resident) {
        toast('الشقة المرتبطة بالتحصيل غير موجودة.', 'error');
        return;
    }
    const amount = Number(document.getElementById('incomeEditAmount').value);
    const amountCents = Number.isFinite(amount) ? Math.round(amount * 100) : 0;
    const month = document.getElementById('incomeEditMonth').value;
    const monthKey = monthLabelToKey(month);
    const notes = document.getElementById('incomeEditNotes').value.trim();
    const paymentMethod = document.getElementById('incomeEditPaymentMethod').value;
    if (!monthKey || amountCents <= 0
        || !Object.prototype.hasOwnProperty.call(INCOME_PAYMENT_METHOD_LABELS, paymentMethod)
        || (!isIncomePaymentMethodEnabled(paymentMethod) && paymentMethod !== (payment.paymentMethod || ''))) {
        toast('اختر شهرًا صحيحًا وطريقة الدفع وأدخل مبلغًا أكبر من صفر.', 'error');
        return;
    }
    const createdMonth = getLocalMonthKey(resident.createdAt);
    if (createdMonth && monthKey.slice(0, 7) < createdMonth) {
        toast('لا يمكن تسجيل تحصيل قبل تاريخ إنشاء الشقة.', 'error');
        return;
    }
    const dueCents = Math.max(0, Math.round(getSubscriptionAmountForMonth(resident, month) * 100));
    const paidByOthersCents = state.income.reduce((sum, item) => {
        if (item.id === payment.id || item.residentId !== payment.residentId || item.month !== month) return sum;
        const value = Number(item.amount);
        return sum + (Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0);
    }, 0);
    const availableCents = Math.max(0, dueCents - paidByOthersCents);
    if (amountCents > availableCents) {
        toast('المبلغ أكبر من المتبقي لهذا الشهر (' + fmtNum(availableCents / 100) + ' ج.م).', 'error');
        return;
    }
    if (amountCents === Math.round(Number(payment.amount) * 100)
        && month === payment.month && notes === (payment.notes || '')
        && paymentMethod === (payment.paymentMethod || '')) {
        toast('لم يتم تغيير بيانات التحصيل.', 'info');
        return;
    }

    incomeSaving = true;
    const submit = document.getElementById('incomeEditSubmitButton');
    if (submit) {
        submit.disabled = true;
        submit.textContent = 'جارٍ الحفظ...';
    }
    const previousState = cloneStateSnapshot();
    const previousAmount = Number(payment.amount) || 0;
    const previousMonth = payment.month;
    const distributionMatch = String(payment.notes || '').match(/^(دفعة موزعة\s+([A-Z0-9]+)\s+\(\d+\/\d+\))(?:\s+·\s+[\s\S]*)?$/i);
    const relatedPayments = distributionMatch
        ? state.income.filter(item => item.residentId === payment.residentId
            && item.date === payment.date
            && String(item.notes || '').includes(distributionMatch[2]))
        : [payment];
    payment.amount = amountCents / 100;
    payment.month = month;
    relatedPayments.forEach(item => { item.paymentMethod = paymentMethod; });
    payment.notes = distributionMatch
        ? distributionMatch[1] + (notes ? ' · ' + notes : '')
        : notes;
    logAction('تعديل تحصيل', resident.name + ' - ' + previousMonth + ' إلى ' + month
        + ' - طريقة الدفع: ' + getIncomePaymentMethodLabel(paymentMethod)
        + ' - ' + fmtNum(previousAmount) + ' إلى ' + fmtNum(payment.amount));
    try {
        if (!await saveWithRollback(previousState)) return;
        closeModal('incomeEditModal');
        editingIncomeId = null;
        renderAll();
        toast('تم تعديل التحصيل بنجاح.', 'success');
    } finally {
        incomeSaving = false;
        if (submit) {
            submit.disabled = false;
            submit.textContent = 'حفظ التعديل';
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
    const editingExpense = editingExpenseId ? state.expenses.find(item => item.id === editingExpenseId) : null;
    const accountBalance = getCashAccountBalance(cashAccountCode) +
        (editingExpense && (editingExpense.cashAccountCode || 'main') === cashAccountCode ? (Number(editingExpense.amount) || 0) : 0);
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

function openExpenseModal() {
    if (!requireManager()) return;
    editingExpenseId = null;
    document.getElementById('expenseForm')?.reset();
    document.getElementById('expenseTitle').value = '';
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseNotes').value = '';
    document.getElementById('expenseMonth').value = getCurrentMonth();
    document.getElementById('expenseCashAccount').value = 'main';
    document.getElementById('expenseModalTitle').textContent = 'مصروف جديد';
    document.getElementById('expenseSubmitButton').textContent = 'حفظ المصروف';
    document.getElementById('expensePreview')?.classList.add('hidden');
    openModal('expenseModal');
}

function openExpenseEditModal(id) {
    if (!requireManager()) return;
    const expense = state.expenses.find(item => item.id === id);
    if (!expense) { toast('تعذر العثور على المصروف. حدّث السجل ثم حاول مرة أخرى.', 'error'); return; }
    editingExpenseId = id;
    document.getElementById('expenseTitle').value = expense.title || '';
    document.getElementById('expenseAmount').value = String(expense.amount ?? '');
    document.getElementById('expenseCategory').value = expense.category || 'أخرى';
    document.getElementById('expenseMonth').value = expense.month || getCurrentMonth();
    document.getElementById('expenseCashAccount').value = expense.cashAccountCode || 'main';
    document.getElementById('expenseNotes').value = expense.notes || '';
    document.getElementById('expenseModalTitle').textContent = 'تعديل المصروف';
    document.getElementById('expenseSubmitButton').textContent = 'حفظ التعديل';
    openModal('expenseModal');
    previewExpense();
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
    const existingExpense = editingExpenseId ? state.expenses.find(item => item.id === editingExpenseId) : null;
    if (editingExpenseId && !existingExpense) {
        toast('المصروف المراد تعديله لم يعد موجوداً. حدّث السجل ثم حاول مجدداً.', 'error');
        editingExpenseId = null;
        return;
    }
    if (!title || !Number.isFinite(amount) || amount <= 0 || !month ||
        !['main', 'development', 'emergency'].includes(cashAccountCode)) {
        toast('أدخل وصفاً ومبلغاً أكبر من صفر واختر الشهر والصندوق', 'error');
        return;
    }
    const availableBalance = getCashAccountBalance(cashAccountCode) +
        (existingExpense && (existingExpense.cashAccountCode || 'main') === cashAccountCode ? (Number(existingExpense.amount) || 0) : 0);
    if (cashAccountCode !== 'main' && amount > availableBalance + 0.000001) {
        toast('الرصيد المتاح في ' + getCashAccountLabel(cashAccountCode) + ' غير كافٍ.', 'error');
        previewExpense();
        return;
    }
    expenseSaving = true;
    const submit = document.getElementById('expenseSubmitButton');
    if (submit) { submit.disabled = true; submit.textContent = 'جارٍ الحفظ...'; }
    const previousState = cloneStateSnapshot();
    if (existingExpense) {
        state.expenses = state.expenses.map(item => item.id === editingExpenseId
            ? { ...item, title, amount, category, month, notes, cashAccountCode } : item);
        logAction('تعديل مصروف', existingExpense.title + ' ← ' + title + ' - ' + fmtNum(amount));
    } else {
        state.expenses.push({ id: generateId(), title, amount, category, month, notes, cashAccountCode, date: new Date().toISOString() });
        logAction('مصروف', title + ' - ' + fmtNum(amount));
    }
    try {
        if (!await saveWithRollback(previousState)) return;
        editingExpenseId = null;
        closeModal('expenseModal');
        document.getElementById('expenseForm').reset();
        document.getElementById('expensePreview')?.classList.add('hidden');
        document.getElementById('expenseModalTitle').textContent = 'مصروف جديد';
        renderAll();
        toast(existingExpense ? 'تم تعديل المصروف بنجاح.' : 'تم تسجيل المصروف', 'success');
    } finally {
        expenseSaving = false;
        if (submit) { submit.disabled = false; submit.textContent = 'حفظ المصروف'; }
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
