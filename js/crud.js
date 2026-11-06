// @ts-check
let ownerProvisionRequested = false;
let incomeSaving = false;
let editingIncomeId = null;
let expenseSaving = false;
let editingExpenseId = null;

const CRUD_INCOME_PURPOSES = ['subscription', 'services', 'development', 'emergency', 'penalty', 'donation', 'other', 'settlement'];
const CRUD_INCOME_PURPOSE_FORM_CODES = ['subscription', 'development', 'emergency', 'settlement', 'other'];
const CRUD_INCOME_PURPOSE_LABELS = {
    subscription: 'اشتراك شهري', services: 'أخرى', development: 'تطوير',
    emergency: 'صيانة طارئة', penalty: 'أخرى', donation: 'أخرى', other: 'أخرى',
    settlement: 'سداد تسوية'
};

function crudIncomePurpose(purpose) {
    const value = String(purpose || '').trim();
    if (typeof normalizeIncomePurpose === 'function') return normalizeIncomePurpose(value);
    return CRUD_INCOME_PURPOSES.includes(value) ? value : 'subscription';
}

function crudIncomePurposeFormCode(purpose) {
    if (typeof getIncomePurposeFormCode === 'function') return getIncomePurposeFormCode(purpose);
    const normalized = crudIncomePurpose(purpose);
    return CRUD_INCOME_PURPOSE_FORM_CODES.includes(normalized) ? normalized : 'other';
}

function crudIncomePurposeLabel(purpose) {
    if (typeof getIncomePurposeLabel === 'function') return getIncomePurposeLabel(purpose);
    return CRUD_INCOME_PURPOSE_LABELS[crudIncomePurpose(purpose)];
}

function crudIncomePurposeCashAccount(purpose) {
    if (typeof getIncomePurposeCashAccount === 'function') return getIncomePurposeCashAccount(purpose);
    const normalized = crudIncomePurpose(purpose);
    return normalized === 'development' || normalized === 'emergency' ? normalized : 'main';
}

function crudIncomePurposeLocked(purpose) {
    if (typeof isIncomePurposeCashAccountLocked === 'function') return isIncomePurposeCashAccountLocked(purpose);
    const normalized = crudIncomePurposeFormCode(purpose);
    return normalized !== 'other';
}

function crudIsSubscriptionIncome(payment) {
    if (typeof isSubscriptionIncome === 'function') return isSubscriptionIncome(payment);
    return crudIncomePurpose(payment?.purposeCode) === 'subscription';
}

function crudCashAccountLabel(code) {
    return typeof getCashAccountLabel === 'function' ? getCashAccountLabel(code || 'main') : 'الخزنة الرئيسية';
}

const CRUD_EXTRA_INCOME_PURPOSES = ['development', 'emergency', 'other'];

function incomeExtraLineElements() {
    const container = document.getElementById('incomeExtraLines');
    if (!container || typeof container.querySelectorAll !== 'function') return [];
    return Array.from(container.querySelectorAll('[data-income-line]'));
}

function incomeExtraLineMarkup(index = 1) {
    const purposeOptions = CRUD_EXTRA_INCOME_PURPOSES.map(purpose =>
        `<option value="${purpose}">${esc(crudIncomePurposeLabel(purpose))}</option>`
    ).join('');
    return `<div data-income-line class="income-extra-line rounded-xl border border-slate-700/50 p-2.5 space-y-2">
        <div class="flex items-center gap-2">
            <select class="income-line-purpose flex-1 app-input border rounded-xl px-2.5 py-2 text-xs" aria-label="غرض البند الإضافي ${index}" onchange="handleIncomeLinePurposeChange(this)">${purposeOptions}</select>
            <button type="button" onclick="removeIncomeLine(this)" aria-label="حذف البند الإضافي ${index}" class="min-h-11 min-w-11 border border-rose-500/40 text-rose-300 rounded-xl px-2 text-xs font-bold"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="grid grid-cols-2 gap-2">
            <input type="number" class="income-line-amount app-input border rounded-xl px-2.5 py-2 text-xs" min="0.01" step="0.01" inputmode="decimal" placeholder="مبلغ البند" aria-label="مبلغ البند الإضافي ${index}" oninput="previewIncomeAllocation()" required>
            <select class="income-line-cash-account app-input border rounded-xl px-2.5 py-2 text-xs" aria-label="صندوق البند الإضافي ${index}" onchange="previewIncomeAllocation()">
                <option value="main">الخزنة الرئيسية</option>
                <option value="development">صندوق التطوير</option>
                <option value="emergency">صندوق الصيانة الطارئة</option>
            </select>
        </div>
        <p class="income-line-hint text-[10px] text-slate-500"></p>
    </div>`;
}

function addIncomeLine(purpose = 'other') {
    const container = document.getElementById('incomeExtraLines');
    if (!container || typeof document.createElement !== 'function') return null;
    const index = incomeExtraLineElements().length + 1;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = incomeExtraLineMarkup(index);
    const line = wrapper.firstElementChild;
    if (!line) return null;
    const purposeSelect = /** @type {any} */ (line.querySelector('.income-line-purpose'));
    if (purposeSelect && CRUD_EXTRA_INCOME_PURPOSES.includes(purpose)) purposeSelect.value = purpose;
    container.appendChild(line);
    syncIncomeLineCashAccount(line);
    previewIncomeAllocation();
    return line;
}

function removeIncomeLine(button) {
    const line = button?.closest?.('[data-income-line]');
    if (!line) return;
    line.remove();
    renumberIncomeLines();
    previewIncomeAllocation();
}

function renumberIncomeLines() {
    incomeExtraLineElements().forEach((line, index) => {
        const number = index + 1;
        const purposeSelect = line.querySelector('.income-line-purpose');
        const amountInput = line.querySelector('.income-line-amount');
        const cashAccountSelect = line.querySelector('.income-line-cash-account');
        const removeButton = line.querySelector('button');
        if (purposeSelect) purposeSelect.setAttribute('aria-label', `غرض البند الإضافي ${number}`);
        if (amountInput) amountInput.setAttribute('aria-label', `مبلغ البند الإضافي ${number}`);
        if (cashAccountSelect) cashAccountSelect.setAttribute('aria-label', `صندوق البند الإضافي ${number}`);
        if (removeButton) removeButton.setAttribute('aria-label', `حذف البند الإضافي ${number}`);
    });
}

function syncIncomeLineCashAccount(line) {
    const element = line?.closest?.('[data-income-line]') || (line?.querySelector ? line : null);
    if (!element) return 'other';
    const purpose = String(element.querySelector('.income-line-purpose')?.value || 'other');
    const cashAccountSelect = element.querySelector('.income-line-cash-account');
    const hint = element.querySelector('.income-line-hint');
    if (cashAccountSelect) {
        const locked = purpose === 'development' || purpose === 'emergency' || crudIncomePurposeLocked(purpose);
        if (locked) cashAccountSelect.value = crudIncomePurposeCashAccount(purpose);
        cashAccountSelect.disabled = locked;
        if (typeof cashAccountSelect.setAttribute === 'function') {
            cashAccountSelect.setAttribute('aria-disabled', locked ? 'true' : 'false');
        }
    }
    if (hint) hint.textContent = getIncomePurposeCashHint(purpose, false);
    return purpose;
}

function handleIncomeLinePurposeChange(select) {
    syncIncomeLineCashAccount(select);
    previewIncomeAllocation();
}

function getIncomeExtraLines() {
    return incomeExtraLineElements().map(line => ({
        purpose: String(/** @type {any} */ (line.querySelector('.income-line-purpose'))?.value || ''),
        amount: Number(/** @type {any} */ (line.querySelector('.income-line-amount'))?.value),
        cashAccountCode: String(/** @type {any} */ (line.querySelector('.income-line-cash-account'))?.value || 'main')
    }));
}

function validateIncomeExtraLines(lines) {
    for (const line of lines) {
        if (!CRUD_EXTRA_INCOME_PURPOSES.includes(line.purpose)) {
            return { valid: false, message: 'اختر غرضًا صحيحًا لكل بند إضافي؛ الاشتراك يُسجل في البند الأساسي.', totalCents: 0 };
        }
        if (!Number.isFinite(line.amount) || line.amount <= 0) {
            return { valid: false, message: 'أدخل مبلغًا أكبر من صفر لكل بند إضافي أو احذفه.', totalCents: 0 };
        }
        if (!['main', 'development', 'emergency'].includes(line.cashAccountCode)) {
            return { valid: false, message: 'اختر صندوقًا صحيحًا لكل بند إضافي.', totalCents: 0 };
        }
        if ((line.purpose === 'development' && line.cashAccountCode !== 'development')
            || (line.purpose === 'emergency' && line.cashAccountCode !== 'emergency')) {
            return { valid: false, message: 'بند التطوير أو الصيانة الطارئة يتطلب صندوقه الخاص.', totalCents: 0 };
        }
    }
    const totalCents = lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0);
    return { valid: true, message: '', totalCents };
}

function clearIncomeExtraLines() {
    const container = document.getElementById('incomeExtraLines');
    if (container) container.innerHTML = '';
    const total = document.getElementById('incomeMixedTotal');
    if (total) {
        total.textContent = '';
        total.classList.add('hidden');
    }
}

function buildIncomePaymentRows(options) {
    const rows = [];
    const appendRow = (amount, month, purposeCode, cashAccountCode, settlementAdjustmentId = null) => {
        rows.push({ amount, month, purposeCode, cashAccountCode, settlementAdjustmentId });
    };
    if (options.isSubscription && options.allocation) {
        options.allocation.allocations.forEach(item => {
            appendRow(item.amount, item.month, 'subscription', options.cashAccountCode);
        });
    } else {
        appendRow(options.amount, options.month, options.purpose, options.cashAccountCode, options.settlementAdjustmentId || null);
    }
    (options.extraLines || []).forEach(line => {
        appendRow(line.amount, options.month, line.purpose, line.cashAccountCode);
    });

    const usesBatchReference = options.isSubscription || (options.extraLines || []).length > 0;
    const paymentReference = options.paymentReference;
    return rows.map((row, index) => {
        const batchNote = `دفعة موزعة ${paymentReference} (${index + 1}/${rows.length})`;
        const note = usesBatchReference
            ? [batchNote, options.notes].filter(Boolean).join(' · ')
            : options.notes;
        return {
            id: generateId(),
            residentId: options.residentId,
            amount: row.amount,
            month: row.month,
            date: options.paidAt,
            paymentMethod: options.paymentMethod,
            cashAccountCode: row.cashAccountCode,
            purposeCode: row.purposeCode,
            settlementAdjustmentId: row.settlementAdjustmentId || null,
            notes: note
        };
    });
}

function getIncomeBatchReference(payment) {
    return String(payment?.notes || '').match(/^دفعة موزعة\s+([A-Z0-9]+)\s+\(\d+\/\d+\)/i)?.[1] || '';
}

function getIncomeBatchPayments(payment) {
    const reference = getIncomeBatchReference(payment);
    if (!reference) return [payment];
    return state.income.filter(item =>
        item.residentId === payment.residentId &&
        item.date === payment.date &&
        String(item.notes || '').startsWith('دفعة موزعة ' + reference + ' (')
    );
}

function isMixedIncomeBatch(payment) {
    const purposes = new Set(getIncomeBatchPayments(payment).map(item => crudIncomePurpose(item.purposeCode)));
    return purposes.size > 1;
}

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
    const floorSelect = /** @type {any} */ (document.getElementById('residentFloor'));
    const apartmentSelect = /** @type {any} */ (document.getElementById('residentApartment'));
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
    const select = /** @type {any} */ (document.getElementById('residentFloor'));
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
    const amountInput = /** @type {any} */ (document.getElementById('residentAmount'));
    const historyButton = /** @type {any} */ (document.getElementById('manageSubscriptionRatesBtn'));
    /** @type {any} */ (document.getElementById('residentModalTitle')).textContent = isEdit ? 'تعديل بيانات الشقة' : 'شقة جديدة';
    if (isEdit) {
        const resident = state.residents.find(item => item.id === id);
        if (resident) {
            /** @type {any} */ (document.getElementById('residentName')).value = resident.name || '';
            populateResidentFloorOptions(resident.floor || '');
            updateResidentApartmentOptions(resident.apartmentNumber || '');
            /** @type {any} */ (document.getElementById('residentPhone')).value = resident.phone || '';
            amountInput.value = getCurrentSubscriptionAmount(resident);
            amountInput.readOnly = false;
            amountInput.removeAttribute('aria-readonly');
            const amountHelp = /** @type {any} */ (document.getElementById('residentAmountHelp'));
            if (amountHelp) {
                amountHelp.textContent = 'يمكنك تعديل الاشتراك مباشرة؛ سيُسجّل التغيير من الشهر الحالي مع الاحتفاظ بالسجل السابق. لاختيار شهر سريان آخر استخدم سجل الاشتراك.';
                amountHelp.classList.remove('hidden');
            }
            historyButton?.classList.remove('hidden');
            /** @type {any} */ (document.getElementById('residentNotes')).value = resident.notes || '';
            const billingInput = /** @type {HTMLInputElement | null} */ (document.getElementById('residentBillingStart'));
            if (billingInput) billingInput.value = String(resident.billingStartMonth || '').slice(0, 7);
        }
    } else {
        /** @type {any} */ (document.getElementById('residentForm')).reset();
        populateResidentFloorOptions();
        updateResidentApartmentOptions();
        amountInput.value = state.defaultSubscription || '';
        amountInput.readOnly = false;
        amountInput.removeAttribute('aria-readonly');
        /** @type {any} */ (document.getElementById('residentAmountHelp'))?.classList.add('hidden');
        historyButton?.classList.add('hidden');
    }
    openModal('residentModal');
}

function editResident(id) { openResidentModal('edit', id); }

function buildResidentProfileHtml(resident) {
    const currentMonth = getCurrentMonth();
    const currentAmount = getSubscriptionAmountForMonth(resident, currentMonth);
    const currentPaid = getPaidAmountForMonth(resident.id, currentMonth);
    const currentOutstanding = getMonthOutstanding(resident, currentMonth);
    const isOverdue = currentOutstanding > 0 && isSubscriptionMonthOverdue(currentMonth);
    const paymentStatus = currentOutstanding <= 0
        ? { label: 'مسدد بالكامل', className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' }
        : isOverdue
            ? { label: 'متأخر عن السداد', className: 'text-rose-400 bg-rose-500/10 border-rose-500/20' }
            : { label: 'داخل مهلة السداد', className: 'text-sky-400 bg-sky-500/10 border-sky-500/20' };
    const debt = calculateCumulativeDebt(resident.id);
    const currentAdjustment = getAdjustmentAmountForMonth(resident.id, currentMonth);
    const residentAdjustments = getResidentAdjustments(resident.id);
    const unpaidMonths = (debt.unpaidMonths || []).map(month => ({
        month,
        amount: getMonthOutstanding(resident, month)
    }));
    const recentPayments = state.income
        .filter(payment => payment.residentId === resident.id)
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
        .slice(0, 10);
    const rateHistory = (Array.isArray(resident.subscriptionRateHistory) ? resident.subscriptionRateHistory : [])
        .slice()
        .sort((a, b) => String(b.changedAt || '').localeCompare(String(a.changedAt || '')))
        .slice(0, 6);
    const phone = String(resident.phone || '').replace(/[^0-9+]/g, '');
    const residentArg = esc(JSON.stringify(String(resident.id)));
    const arrearsHtml = unpaidMonths.length
        ? unpaidMonths.slice(0, 12).map(item => `
            <div class="flex items-center justify-between gap-3 py-2 border-b border-slate-700/40 last:border-0">
                <span class="text-xs">${esc(item.month)}</span>
                <strong class="text-xs text-rose-400 shrink-0">${fmtNum(item.amount)} ج.م</strong>
            </div>`).join('') + (unpaidMonths.length > 12
                ? `<p class="text-[10px] text-slate-500 pt-2">تم عرض أقدم 12 شهرًا من أصل ${fmtNum(unpaidMonths.length)} شهر.</p>`
                : '')
        : '<p class="text-xs text-emerald-400 text-center py-3">لا توجد متأخرات مستحقة.</p>';
    const paymentsHtml = recentPayments.length
        ? recentPayments.map(payment => `
            <article class="app-input border rounded-xl p-3 space-y-1">
                <div class="flex justify-between items-start gap-3">
                    <div class="min-w-0">
                        <p class="text-xs font-bold">${esc(payment.month || '—')}</p>
                        <p class="text-[10px] text-slate-500">${esc(getIncomePaymentMethodLabel(payment.paymentMethod))} · ${esc(formatDate(payment.date) || '—')}</p>
                    </div>
                    <strong class="text-xs text-emerald-400 shrink-0">${fmtNum(payment.amount)} ج.م</strong>
                </div>
                ${payment.notes ? `<p class="text-[10px] text-slate-500 break-words">${esc(payment.notes)}</p>` : ''}
            </article>`).join('')
        : '<p class="text-xs text-slate-500 text-center py-3">لا توجد تحصيلات مسجلة للشقة.</p>';
    const ratesHtml = rateHistory.length
        ? rateHistory.map(change => `
            <div class="flex items-center justify-between gap-3 py-2 border-b border-slate-700/40 last:border-0">
                <div class="min-w-0">
                    <p class="text-xs font-bold">${esc(String(change.effectiveMonth || '').slice(0, 7) || '—')}</p>
                    <p class="text-[10px] text-slate-500">${esc(formatDate(change.changedAt) || '—')}</p>
                </div>
                <div class="text-left shrink-0">
                    <p class="text-xs font-bold">${formatSubscriptionAmount(change.newMonthlyAmount)} ج.م</p>
                    <p class="text-[10px] text-slate-500">${change.previousMonthlyAmount == null ? 'قيمة تأسيسية' : 'بدلًا من ' + formatSubscriptionAmount(change.previousMonthlyAmount) + ' ج.م'}</p>
                </div>
            </div>`).join('')
        : '<p class="text-xs text-slate-500 text-center py-3">لا توجد تغييرات تاريخية مسجلة.</p>';
    const adjustmentsHtml = residentAdjustments.length
        ? residentAdjustments.slice(0, 6).map(adjustment => `
            <div class="flex items-start justify-between gap-3 py-2 border-b border-slate-700/40 last:border-0">
                <div class="min-w-0">
                    <p class="text-xs font-bold">${esc(adjustmentMonthKeyToLabel(String(adjustment.effectiveMonth || '').slice(0, 7)) || '—')}</p>
                    <p class="text-[10px] text-slate-500 break-words">${esc(getAdjustmentKindLabel(adjustment.kind))}${adjustment.reason ? ' · ' + esc(adjustment.reason) : ''}</p>
                </div>
                <strong class="text-xs text-amber-300 shrink-0">${formatSubscriptionAmount(adjustment.amount)} ج.م</strong>
            </div>`).join('')
        : '<p class="text-xs text-slate-500 text-center py-3">لا توجد إعفاءات أو تخفيضات مسجلة.</p>';

    return `
        <div class="space-y-4">
            <section class="app-input border rounded-2xl p-4 space-y-3">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <p class="text-[10px] text-slate-500">بيانات الوحدة</p>
                        <h4 class="text-base font-black mt-1">${esc(resident.name || 'بدون اسم')}</h4>
                        <p class="text-xs text-slate-400 mt-1">شقة ${esc(resident.apartmentNumber || '—')}${resident.floor ? ' · ' + 'الدور ' + esc(resident.floor) : ''}</p>
                    </div>
                    ${phone ? `<a href="tel:${esc(phone)}" class="inline-flex items-center justify-center gap-2 min-h-11 px-3 rounded-xl bg-indigo-600/15 border border-indigo-500/25 text-indigo-300 text-xs font-bold shrink-0"><i class="fa-solid fa-phone"></i> اتصال</a>` : ''}
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="bg-slate-900/30 rounded-xl p-3 min-w-0">
                        <p class="text-[10px] text-slate-500">رقم الهاتف</p>
                        <p class="text-xs font-bold mt-1 break-words">${esc(resident.phone || 'غير مسجل')}</p>
                    </div>
                    <div class="bg-slate-900/30 rounded-xl p-3 min-w-0">
                        <p class="text-[10px] text-slate-500">تاريخ إضافة الشقة</p>
                        <p class="text-xs font-bold mt-1">${esc(formatDate(resident.createdAt) || '—')}</p>
                    </div>
                    <div class="bg-slate-900/30 rounded-xl p-3 min-w-0">
                        <p class="text-[10px] text-slate-500">بداية المحاسبة</p>
                        <p class="text-xs font-bold mt-1">${esc(monthKeyToLabel(getResidentBillingStartKey(resident)) || '—')}</p>
                    </div>
                </div>
                ${resident.notes ? `<p class="text-xs text-slate-400 border-t border-slate-700/40 pt-2 break-words"><strong>ملاحظات:</strong> ${esc(resident.notes)}</p>` : ''}
            </section>

            <section class="space-y-2">
                <h4 class="text-xs font-black">حساب الاشتراك — ${esc(currentMonth)}</h4>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div class="app-card border rounded-xl p-3 min-w-0"><p class="text-[10px] text-slate-500">قيمة الاشتراك</p><p class="text-sm font-black mt-1">${formatSubscriptionAmount(currentAmount)}</p></div>
                    <div class="app-card border rounded-xl p-3 min-w-0"><p class="text-[10px] text-slate-500">المدفوع</p><p class="text-sm font-black text-emerald-400 mt-1">${formatSubscriptionAmount(currentPaid)}</p></div>
                    <div class="app-card border rounded-xl p-3 min-w-0"><p class="text-[10px] text-slate-500">المتبقي</p><p class="text-sm font-black mt-1">${formatSubscriptionAmount(currentOutstanding)}</p></div>
                    <div class="app-card border rounded-xl p-3 min-w-0"><p class="text-[10px] text-slate-500">إجمالي المتأخرات</p><p class="text-sm font-black text-rose-400 mt-1">${formatSubscriptionAmount(debt.totalDebt)}</p><p class="text-[10px] text-slate-500">${fmtNum(debt.count)} شهر</p></div>
                </div>
                <div class="flex items-center justify-between gap-2">
                    <span class="text-[10px] font-bold border rounded-full px-3 py-1 ${paymentStatus.className}">${paymentStatus.label}</span>
                    <span class="text-[10px] text-slate-500">حالة الشهر الحالي</span>
                </div>
                ${currentAdjustment > 0 ? `<p class="text-[10px] text-amber-300">إعفاءات وتخفيضات ${esc(currentMonth)}: ${formatSubscriptionAmount(currentAdjustment)} ج.م</p>` : ''}
            </section>

            <section class="app-input border rounded-2xl p-4">
                <div class="flex items-center justify-between gap-2 mb-2">
                    <h4 class="text-xs font-black">الشهور المتأخرة</h4>
                    <strong class="text-xs text-rose-400">${fmtNum(debt.totalDebt)} ج.م</strong>
                </div>
                ${arrearsHtml}
            </section>

            <section class="app-input border rounded-2xl p-4 space-y-2">
                <h4 class="text-xs font-black">آخر 10 تحصيلات</h4>
                ${paymentsHtml}
            </section>

            <section class="app-input border rounded-2xl p-4">
                <div class="flex items-center justify-between gap-2 mb-2">
                    <h4 class="text-xs font-black">سجل تغييرات الاشتراك</h4>
                    <span class="text-[10px] text-slate-500">آخر 6 تغييرات</span>
                </div>
                ${ratesHtml}
            </section>

            <section class="app-input border rounded-2xl p-4">
                <div class="flex items-center justify-between gap-2 mb-2">
                    <h4 class="text-xs font-black">الإعفاءات والتخفيضات</h4>
                    <span class="text-[10px] text-slate-500">${fmtNum(residentAdjustments.length)} تسجيل</span>
                </div>
                ${adjustmentsHtml}
            </section>

            <section class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button type="button" onclick="openResidentIncomeFromProfile(${residentArg})" class="min-h-11 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-3 py-3 text-xs font-bold"><i class="fa-solid fa-hand-holding-dollar ml-1"></i> تسجيل تحصيل</button>
                <button type="button" onclick="editResidentFromProfile(${residentArg})" class="min-h-11 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-3 py-3 text-xs font-bold"><i class="fa-solid fa-pen ml-1"></i> تعديل بيانات الشقة</button>
                <button type="button" onclick="openAdjustmentFromProfile(${residentArg})" class="min-h-11 bg-amber-600/15 border border-amber-500/30 text-amber-300 rounded-xl px-3 py-3 text-xs font-bold"><i class="fa-solid fa-percent ml-1"></i> إعفاء أو تخفيض</button>
                <button type="button" onclick="openResidentStatementFromProfile(${residentArg})" class="min-h-11 app-input border rounded-xl px-3 py-3 text-xs font-bold"><i class="fa-solid fa-file-invoice ml-1"></i> كشف حساب</button>
                <button type="button" onclick="openSubscriptionRatesFromProfile(${residentArg})" class="min-h-11 app-input border rounded-xl px-3 py-3 text-xs font-bold"><i class="fa-solid fa-clock-rotate-left ml-1"></i> إدارة سجل الاشتراك</button>
                ${phone && debt.totalDebt > 0 ? `<button type="button" onclick="sendWhatsAppReminderFromProfile(${residentArg})" class="min-h-11 bg-emerald-600/15 border border-emerald-500/30 text-emerald-400 rounded-xl px-3 py-3 text-xs font-bold"><i class="fa-brands fa-whatsapp ml-1"></i> تذكير بالمتأخرات</button>` : ''}
            </section>
        </div>`;
}

function openResidentProfile(residentId) {
    if (!requireManager()) return;
    const resident = state.residents.find(item => item.id === residentId);
    if (!resident) {
        toast('تعذر العثور على الشقة. حدّث البيانات ثم حاول مرة أخرى.', 'error');
        return;
    }
    const content = /** @type {any} */ (document.getElementById('residentProfileContent'));
    if (!content) {
        toast('تعذر فتح ملف الشقة. أعد تحميل الصفحة وحاول مرة أخرى.', 'error');
        return;
    }
    content.innerHTML = buildResidentProfileHtml(resident);
    openModal('residentProfileModal');
}

function openResidentIncomeFromProfile(residentId) {
    if (!requireManager()) return;
    const resident = state.residents.find(item => item.id === residentId);
    if (!resident) {
        toast('تعذر العثور على الشقة. حدّث البيانات ثم حاول مرة أخرى.', 'error');
        return;
    }
    if (typeof populateSelects === 'function') populateSelects();
    const residentSelect = /** @type {any} */ (document.getElementById('incomeResident'));
    const amountInput = /** @type {any} */ (document.getElementById('incomeAmount'));
    const monthSelect = /** @type {any} */ (document.getElementById('incomeMonth'));
    const paymentMethodSelect = /** @type {any} */ (document.getElementById('incomePaymentMethod'));
    const notesInput = /** @type {any} */ (document.getElementById('incomeNotes'));
    if (!residentSelect || !amountInput || !monthSelect || !paymentMethodSelect) {
        toast('تعذر تجهيز نموذج التحصيل. أعد تحميل الصفحة وحاول مرة أخرى.', 'error');
        return;
    }
    residentSelect.value = residentId;
    refreshIncomeMonthOptions(residentId, getCurrentMonth());
    monthSelect.value = getCurrentMonth();
    paymentMethodSelect.value = '';
    const purposeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('incomePurpose'));
    if (purposeSelect) purposeSelect.value = 'subscription';
    if (notesInput) notesInput.value = '';
    incomeSelectedMonths = new Set();
    incomeAmountManual = false;
    selectFirstUnpaidIncomeMonth(resident);
    renderIncomeMonthsGrid(resident);
    syncIncomeAmountFromSelection();
    syncIncomePurposeUi();
    syncIncomePurposeCashAccount('incomePurpose', 'incomeCashAccount', {
        resetUnlocked: true,
        hintId: 'incomePurposeCashHint'
    });
    renderIncomeResidentSummary();
    if (typeof previewIncomeAllocation === 'function') previewIncomeAllocation();
    closeModal('residentProfileModal');
    openModal('incomeModal');
}

function editResidentFromProfile(residentId) {
    if (!requireManager()) return;
    closeModal('residentProfileModal');
    editResident(residentId);
}

function openSubscriptionRatesFromProfile(residentId) {
    if (!requireManager()) return;
    closeModal('residentProfileModal');
    openSubscriptionRateModal(residentId);
}

function sendWhatsAppReminderFromProfile(residentId) {
    if (!requireManager()) return;
    closeModal('residentProfileModal');
    sendWhatsAppReminder(residentId);
}

function openResidentStatementFromProfile(residentId) {
    if (!requireManager()) return;
    closeModal('residentProfileModal');
    switchTab('reports');
    jumpToReportPanel('residentStatementCard');
    const select = /** @type {any} */ (document.getElementById('statementResidentSelect'));
    if (select) select.value = residentId;
    generateResidentStatement();
}

let adjustmentResidentId = null;
let editingAdjustmentId = null;
const ADJUSTMENT_KIND_LABELS = { waiver: 'إعفاء', discount: 'تخفيض', settlement: 'تسوية' };
const ADJUSTMENT_FORM_KINDS = ['waiver', 'discount', 'settlement'];

function getAdjustmentKindLabel(kind) {
    return ADJUSTMENT_KIND_LABELS[kind] || 'تسوية';
}

function adjustmentMonthKeyToLabel(monthKey) {
    const [year, month] = String(monthKey || '').split('-');
    const name = monthsNames[Number(month) - 1];
    return name && year ? `${name} ${year}` : String(monthKey || '');
}

function getResidentAdjustments(residentId) {
    return (Array.isArray(state.adjustments) ? state.adjustments : [])
        .filter(adjustment => adjustment.residentId === residentId)
        .sort((a, b) => String(b.effectiveMonth || '').localeCompare(String(a.effectiveMonth || '')));
}

function getAdjustmentMonthDue(resident, monthKey) {
    if (!resident || !isValidEffectiveMonth(monthKey)) return 0;
    return Number(getSubscriptionAmountForMonth(resident, adjustmentMonthKeyToLabel(monthKey))) || 0;
}

function getAdjustedTotalForMonth(residentId, monthKey, excludeId = null) {
    const prefix = `${monthKey}-01`;
    return getResidentAdjustments(residentId)
        .filter(adjustment => adjustment.effectiveMonth === prefix && adjustment.id !== excludeId
            && ['waiver', 'discount'].includes(adjustment.kind))
        .reduce((sum, adjustment) => {
            const amount = Number(adjustment.amount);
            return sum + (Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0);
        }, 0) / 100;
}

function updateAdjustmentDueHint() {
    const resident = state.residents.find(item => item.id === adjustmentResidentId);
    const hint = document.getElementById('adjustmentDueHint');
    const monthInput = /** @type {HTMLInputElement | null} */ (document.getElementById('adjustmentMonth'));
    const amountInput = /** @type {HTMLInputElement | null} */ (document.getElementById('adjustmentAmount'));
    if (!resident || !hint || !monthInput) return;
    const monthKey = monthInput.value;
    if (!isValidEffectiveMonth(monthKey)) {
        hint.textContent = 'اختر شهر الاستحقاق.';
        hint.className = 'text-[10px] text-slate-400';
        return;
    }
    const dueCents = Math.round(getAdjustmentMonthDue(resident, monthKey) * 100);
    const existingCents = Math.round(getAdjustedTotalForMonth(resident.id, monthKey, editingAdjustmentId) * 100);
    const entered = Number(amountInput?.value);
    const enteredCents = Number.isFinite(entered) && entered > 0 ? Math.round(entered * 100) : 0;
    const kind = String(/** @type {HTMLSelectElement | null} */ (document.getElementById('adjustmentKind'))?.value || 'waiver');
    if (kind === 'settlement') {
        const settlement = (state.adjustments || []).find(item => item.residentId === resident.id
            && item.effectiveMonth === `${monthKey}-01` && item.kind === 'settlement' && item.id !== editingAdjustmentId);
        const subscriptionPaidCents = Math.round(getPaidAmountForMonth(resident.id, adjustmentMonthKeyToLabel(monthKey)) * 100);
        const settlementPaidCents = editingAdjustmentId && typeof getSettlementPaidAmount === 'function'
            ? Math.round(getSettlementPaidAmount(editingAdjustmentId) * 100) : 0;
        const availableCents = Math.max(0, dueCents - existingCents - subscriptionPaidCents);
        const valid = !settlement && subscriptionPaidCents === 0 && existingCents === 0
            && enteredCents >= settlementPaidCents && enteredCents <= availableCents;
        hint.textContent = settlement
            ? 'يوجد اتفاق تسوية لهذا الشهر بالفعل.'
            : subscriptionPaidCents > 0 || existingCents > 0
                ? 'لا يمكن إنشاء تسوية مع وجود تحصيل اشتراك أو إعفاء/تخفيض مسجل لهذا الشهر.'
                : `المتاح للتسوية: ${formatSubscriptionAmount(availableCents / 100)} ج.م · المدفوع من التسوية: ${formatSubscriptionAmount(settlementPaidCents / 100)} ج.م · المتبقي بعد هذا المبلغ: ${formatSubscriptionAmount(Math.max(0, enteredCents - settlementPaidCents) / 100)} ج.م`;
        hint.className = valid ? 'text-[10px] text-slate-400' : 'text-[10px] text-rose-400';
        return;
    }
    const remainingCents = dueCents - existingCents - enteredCents;
    hint.textContent = `مستحق ${adjustmentMonthKeyToLabel(monthKey)}: ${formatSubscriptionAmount(dueCents / 100)} ج.م · المسجل من إعفاءات وتخفيضات: ${formatSubscriptionAmount(existingCents / 100)} ج.م · المتبقي بعد هذا المبلغ: ${formatSubscriptionAmount(Math.max(0, remainingCents) / 100)} ج.م`;
    hint.className = remainingCents < 0 ? 'text-[10px] text-rose-400' : 'text-[10px] text-slate-400';
}

function updateAdjustmentFormState() {
    const editing = editingAdjustmentId
        ? (Array.isArray(state.adjustments) ? state.adjustments : []).find(item => item.id === editingAdjustmentId)
        : null;
    const title = document.getElementById('adjustmentFormTitle');
    const cancel = document.getElementById('adjustmentCancelEdit');
    const save = document.getElementById('adjustmentSaveButton');
    const kind = String(/** @type {HTMLSelectElement | null} */ (document.getElementById('adjustmentKind'))?.value || editing?.kind || 'waiver');
    const label = kind === 'settlement' ? 'التسوية' : 'الإعفاء أو التخفيض';
    if (title) title.textContent = editing ? 'تعديل ' + label : 'تسجيل ' + label;
    if (cancel) cancel.classList.toggle('hidden', !editing);
    if (save) save.textContent = editing ? 'حفظ التعديل' : kind === 'settlement' ? 'حفظ اتفاق التسوية' : 'حفظ الإعفاء/التخفيض';
}

function renderAdjustmentList(resident) {
    const body = document.getElementById('adjustmentListBody');
    if (!body) return;
    const list = getResidentAdjustments(resident.id);
    const count = document.getElementById('adjustmentListCount');
    if (count) count.textContent = list.length ? `${fmtNum(list.length)} تسجيل` : '';
    if (!list.length) {
        body.innerHTML = '<tr><td colspan="5" class="px-3 py-5 text-center text-xs text-slate-500">لا توجد إعفاءات أو تخفيضات مسجلة.</td></tr>';
        return;
    }
    body.innerHTML = list.map(adjustment => {
        const monthKey = String(adjustment.effectiveMonth || '').slice(0, 7);
        const monthLabel = adjustmentMonthKeyToLabel(monthKey);
        const kindLabel = getAdjustmentKindLabel(adjustment.kind);
        const argument = esc(JSON.stringify(String(adjustment.id)));
        return `<tr class="border-t border-slate-700/40">
            <td class="px-3 py-2 whitespace-nowrap">${esc(monthLabel || '—')}</td>
            <td class="px-3 py-2 whitespace-nowrap">${esc(kindLabel)}</td>
            <td class="px-3 py-2 whitespace-nowrap font-bold text-amber-300">${formatSubscriptionAmount(adjustment.amount)} ج.م</td>
            <td class="px-3 py-2 max-w-[220px] break-words">${esc(adjustment.reason || '—')}</td>
            <td class="px-3 py-2 whitespace-nowrap">
                <button type="button" onclick="editAdjustment(${argument})" aria-label="تعديل ${esc(kindLabel)} شهر ${esc(monthLabel)}" class="icon-action rounded-lg text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"><i class="fa-solid fa-pen"></i></button>
                <button type="button" onclick="deleteAdjustment(${argument})" aria-label="حذف ${esc(kindLabel)} شهر ${esc(monthLabel)}" class="icon-action rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

function resetAdjustmentForm() {
    editingAdjustmentId = null;
    const form = /** @type {HTMLFormElement | null} */ (document.getElementById('adjustmentForm'));
    form?.reset();
    const kindSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('adjustmentKind'));
    if (kindSelect) kindSelect.disabled = false;
    const monthInput = /** @type {HTMLInputElement | null} */ (document.getElementById('adjustmentMonth'));
    if (monthInput) monthInput.disabled = false;
    if (monthInput) monthInput.value = getLocalMonthKey();
    updateAdjustmentFormState();
    updateAdjustmentDueHint();
}

function openAdjustmentModal(residentId) {
    if (!requireManager()) return;
    const resident = state.residents.find(item => item.id === residentId);
    if (!resident) {
        toast('تعذر العثور على الشقة. حدّث البيانات ثم حاول مرة أخرى.', 'error');
        return;
    }
    adjustmentResidentId = resident.id;
    editingAdjustmentId = null;
    const form = /** @type {HTMLFormElement | null} */ (document.getElementById('adjustmentForm'));
    form?.reset();
    const monthInput = /** @type {HTMLInputElement | null} */ (document.getElementById('adjustmentMonth'));
    if (monthInput) {
        const createdMonth = getIncomeBillingStartKey(resident);
        if (createdMonth) monthInput.min = createdMonth;
        else monthInput.removeAttribute('min');
        monthInput.value = getLocalMonthKey();
    }
    const summary = document.getElementById('adjustmentResidentSummary');
    if (summary) {
        summary.textContent = `${resident.name} · شقة ${resident.apartmentNumber} · الاشتراك الحالي ${formatSubscriptionAmount(getCurrentSubscriptionAmount(resident))} ج.م`;
    }
    renderAdjustmentList(resident);
    updateAdjustmentFormState();
    updateAdjustmentDueHint();
    openModal('adjustmentModal');
}

function openAdjustmentFromProfile(residentId) {
    if (!requireManager()) return;
    closeModal('residentProfileModal');
    openAdjustmentModal(residentId);
}

function editAdjustment(id) {
    if (!requireManager()) return;
    const adjustment = (Array.isArray(state.adjustments) ? state.adjustments : []).find(item => item.id === id);
    if (!adjustment || adjustment.residentId !== adjustmentResidentId) return;
    editingAdjustmentId = adjustment.id;
    const kindSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('adjustmentKind'));
    if (kindSelect) kindSelect.value = ADJUSTMENT_FORM_KINDS.includes(adjustment.kind) ? adjustment.kind : 'waiver';
    const monthInput = /** @type {HTMLInputElement | null} */ (document.getElementById('adjustmentMonth'));
    if (monthInput) monthInput.value = String(adjustment.effectiveMonth || '').slice(0, 7);
    const amountInput = /** @type {HTMLInputElement | null} */ (document.getElementById('adjustmentAmount'));
    if (amountInput) amountInput.value = String(Number(adjustment.amount) || '');
    const reasonInput = /** @type {HTMLInputElement | null} */ (document.getElementById('adjustmentReason'));
    if (reasonInput) reasonInput.value = adjustment.reason || '';
    const hasPayments = adjustment.kind === 'settlement'
        && typeof getSettlementPaidAmount === 'function'
        && getSettlementPaidAmount(adjustment.id) > 0;
    if (kindSelect) kindSelect.disabled = hasPayments;
    if (monthInput) monthInput.disabled = hasPayments;
    updateAdjustmentFormState();
    updateAdjustmentDueHint();
    reasonInput?.focus();
}

function cancelAdjustmentEdit() {
    if (!requireManager()) return;
    resetAdjustmentForm();
}

async async function handleAdjustmentSubmit(event) {
    if (!requireManager()) return;
    event.preventDefault();
    const resident = state.residents.find(item => item.id === adjustmentResidentId);
    if (!resident) {
        toast('تعذر العثور على الشقة. أعد فتح نافذة الإعفاء والتخفيض.', 'error');
        return;
    }
    const kindSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('adjustmentKind'));
    const monthInput = /** @type {HTMLInputElement | null} */ (document.getElementById('adjustmentMonth'));
    const amountInput = /** @type {HTMLInputElement | null} */ (document.getElementById('adjustmentAmount'));
    const reasonInput = /** @type {HTMLInputElement | null} */ (document.getElementById('adjustmentReason'));
    const kind = String(kindSelect?.value || '');
    const monthKey = String(monthInput?.value || '');
    const amount = Number(amountInput?.value);
    const reason = String(reasonInput?.value || '').trim();

    if (!ADJUSTMENT_FORM_KINDS.includes(kind)) {
        toast('اختر نوع الإعفاء أو التخفيض أو التسوية.', 'error');
        return;
    }
    if (!isValidEffectiveMonth(monthKey)) {
        toast('اختر شهرًا صحيحًا للاستحقاق.', 'error');
        return;
    }
    const createdMonth = getIncomeBillingStartKey(resident);
    if (createdMonth && monthKey < createdMonth) {
        toast('لا يمكن تسجيل تسوية أو إعفاء قبل بداية محاسبة الشقة.', 'error');
        return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        toast('المبلغ يجب أن يكون أكبر من صفر.', 'error');
        return;
    }
    if (!reason) {
        toast('اكتب سبب الإجراء.', 'error');
        return;
    }

    const dueCents = Math.round(getAdjustmentMonthDue(resident, monthKey) * 100);
    if (dueCents <= 0) {
        toast('لا يوجد اشتراك مستحق لهذا الشهر.', 'error');
        return;
    }
    const effectiveMonth = `${monthKey}-01`;
    const amountCents = Math.round(amount * 100);
    const existingSettlement = (Array.isArray(state.adjustments) ? state.adjustments : []).find(item =>
        item.residentId === resident.id && item.effectiveMonth === effectiveMonth
        && item.kind === 'settlement' && item.id !== editingAdjustmentId
    );
    const existingDiscounts = Math.round(getAdjustedTotalForMonth(resident.id, monthKey, editingAdjustmentId) * 100);
    const subscriptionPaidCents = Math.round(getPaidAmountForMonth(resident.id, adjustmentMonthKeyToLabel(monthKey)) * 100);
    const editing = editingAdjustmentId
        ? (Array.isArray(state.adjustments) ? state.adjustments : []).find(item => item.id === editingAdjustmentId)
        : null;
    const editingSettlementPaidCents = editing?.kind === 'settlement' && typeof getSettlementPaidAmount === 'function'
        ? Math.round(getSettlementPaidAmount(editing.id) * 100) : 0;

    if (editing?.kind === 'settlement' && editingSettlementPaidCents > 0
        && (kind !== 'settlement' || effectiveMonth !== editing.effectiveMonth)) {
        toast('لا يمكن تغيير نوع أو شهر تسوية بدأ سدادها. عدّل المبلغ فقط.', 'error');
        return;
    }
    if (kind === 'settlement') {
        if (existingSettlement) {
            toast('يوجد اتفاق تسوية لهذا الشهر بالفعل.', 'error');
            return;
        }
        if (existingDiscounts > 0 || subscriptionPaidCents > 0) {
            toast('لا يمكن إنشاء تسوية مع وجود إعفاء/تخفيض أو تحصيل اشتراك مسجل لهذا الشهر.', 'error');
            return;
        }
        if (amountCents < editingSettlementPaidCents || amountCents > dueCents) {
            toast(`مبلغ التسوية يجب أن يكون بين ${formatSubscriptionAmount(editingSettlementPaidCents / 100)} و${formatSubscriptionAmount(dueCents / 100)} ج.م.`, 'error');
            return;
        }
    } else {
        if (existingSettlement) {
            toast('يوجد اتفاق تسوية لهذا الشهر؛ لا يمكن إضافة إعفاء أو تخفيض معه.', 'error');
            return;
        }
        if (existingDiscounts + amountCents > dueCents) {
            toast(`مجموع الإعفاءات والتخفيضات يتجاوز مستحق الشهر (${formatSubscriptionAmount(dueCents / 100)} ج.م). `, 'error');
            return;
        }
    }

    const previousState = cloneStateSnapshot();
    const label = adjustmentMonthKeyToLabel(monthKey);
    state.adjustments = Array.isArray(state.adjustments) ? state.adjustments : [];
    if (editingAdjustmentId) {
        const target = state.adjustments.find(item => item.id === editingAdjustmentId);
        if (!target || target.residentId !== resident.id) {
            toast('تعذر العثور على الإجراء المطلوب تعديله. أعد فتح النافذة.', 'error');
            return;
        }
        target.kind = kind;
        target.effectiveMonth = effectiveMonth;
        target.amount = amountCents / 100;
        target.reason = reason;
        logAction('تعديل ' + getAdjustmentKindLabel(kind), `${resident.name} - شقة ${resident.apartmentNumber} - ${label} - ${formatSubscriptionAmount(target.amount)} ج.م`);
    } else {
        state.adjustments.push({
            id: generateId(),
            residentId: resident.id,
            effectiveMonth,
            kind,
            amount: amountCents / 100,
            reason,
            createdAt: new Date().toISOString()
        });
        logAction('إضافة ' + getAdjustmentKindLabel(kind), `${resident.name} - شقة ${resident.apartmentNumber} - ${label} - ${formatSubscriptionAmount(amountCents / 100)} ج.م`);
    }

    if (!await saveWithRollback(previousState)) return;
    toast(editingAdjustmentId
        ? 'تم تحديث الإجراء.'
        : kind === 'settlement'
            ? 'تم حفظ اتفاق التسوية. سجّل الدفعات عليه من غرض «سداد تسوية».'
            : 'تم حفظ الإعفاء أو التخفيض وخصمه من المستحق.', 'success');
    resetAdjustmentForm();
    renderAdjustmentList(resident);
}
async function deleteAdjustment(id) {
    if (!requireManager()) return;
    const adjustment = (Array.isArray(state.adjustments) ? state.adjustments : []).find(item => item.id === id);
    if (!adjustment || adjustment.residentId !== adjustmentResidentId) return;
    const monthLabel = adjustmentMonthKeyToLabel(String(adjustment.effectiveMonth || '').slice(0, 7));
    if (adjustment.kind === 'settlement' && typeof getSettlementPaidAmount === 'function'
        && getSettlementPaidAmount(adjustment.id) > 0) {
        toast('لا يمكن حذف تسوية سُجلت عليها دفعات. احذف حركاتها أولًا وفق إجراءات التصحيح.', 'error');
        return;
    }
    if (!confirmRecordDeletion(`${getAdjustmentKindLabel(adjustment.kind)} شهر ${monthLabel} بقيمة ${formatSubscriptionAmount(adjustment.amount)} ج.م`)) return;
    const previousState = cloneStateSnapshot();
    state.adjustments = (Array.isArray(state.adjustments) ? state.adjustments : []).filter(item => item.id !== id);
    const resident = state.residents.find(item => item.id === adjustment.residentId);
    logAction('حذف إعفاء/تخفيض', `${resident ? resident.name : adjustment.residentId} - ${getAdjustmentKindLabel(adjustment.kind)} ${monthLabel}`);
    if (!await saveWithRollback(previousState)) return;
    toast('تم حذف الإعفاء أو التخفيض.', 'success');
    if (editingAdjustmentId === id) resetAdjustmentForm();
    if (resident) renderAdjustmentList(resident);
    updateAdjustmentDueHint();
}

function saveResidentAndProvisionOwner() {
    if (!requireManager()) return;
    const form = /** @type {any} */ (document.getElementById('residentForm'));
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
    const body = /** @type {any} */ (document.getElementById('subscriptionRateHistoryBody'));
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
    /** @type {any} */ (document.getElementById('subscriptionRateResidentSummary')).textContent =
        `${resident.name} · شقة ${resident.apartmentNumber} · القيمة الحالية ${formatSubscriptionAmount(getCurrentSubscriptionAmount(resident))}`;
    const monthInput = /** @type {any} */ (document.getElementById('subscriptionRateEffectiveMonth'));
    monthInput.value = getLocalMonthKey();
    const createdMonth = getIncomeBillingStartKey(resident);
    if (createdMonth) monthInput.min = createdMonth;
    else monthInput.removeAttribute('min');
    /** @type {any} */ (document.getElementById('subscriptionRateAmount')).value = getCurrentSubscriptionAmount(resident);
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
    const effectiveMonth = /** @type {any} */ (document.getElementById('subscriptionRateEffectiveMonth')).value.trim();
    const monthlyAmount = Number(/** @type {any} */ (document.getElementById('subscriptionRateAmount')).value);
    if (!isValidEffectiveMonth(effectiveMonth)) {
        toast('اختر شهرًا صحيحًا لتطبيق الاشتراك.', 'error');
        return;
    }
    const createdMonth = getIncomeBillingStartKey(resident);
    if (createdMonth && effectiveMonth < createdMonth) {
        toast('لا يمكن تطبيق الاشتراك قبل بداية محاسبة الشقة.', 'error');
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
    const amountInput = /** @type {any} */ (document.getElementById('residentAmount'));
    if (amountInput && editingResidentId === resident.id) amountInput.value = resident.monthlyAmount;
    const summary = /** @type {any} */ (document.getElementById('subscriptionRateResidentSummary'));
    if (summary) {
        summary.textContent = `${resident.name} · شقة ${resident.apartmentNumber} · القيمة الحالية ${formatSubscriptionAmount(getCurrentSubscriptionAmount(resident))}`;
    }
    toast('تم حفظ تغيير الاشتراك وإضافته إلى السجل التاريخي.', 'success');
}

let subscriptionPriceSheetMonth = '';

function subscriptionPriceSheetMonthLabel(monthKey) {
    const [year, month] = String(monthKey || '').split('-');
    const name = monthsNames[Number(month) - 1];
    return name && year ? `${name} ${year}` : String(monthKey || '');
}

function openSubscriptionPriceSheet() {
    if (!requireManager()) return;
    subscriptionPriceSheetMonth = getLocalMonthKey();
    const monthInput = /** @type {any} */ (document.getElementById('subscriptionPriceSheetMonth'));
    if (monthInput) {
        monthInput.min = getLocalMonthKey();
        monthInput.value = subscriptionPriceSheetMonth;
    }
    const uniform = /** @type {any} */ (document.getElementById('subscriptionPriceSheetUniform'));
    if (uniform) uniform.value = '';
    renderSubscriptionPriceSheet();
    openModal('subscriptionPriceSheetModal');
}

function renderSubscriptionPriceSheet() {
    const body = /** @type {any} */ (document.getElementById('subscriptionPriceSheetBody'));
    if (!body) return;
    const monthInput = /** @type {any} */ (document.getElementById('subscriptionPriceSheetMonth'));
    const selected = String(monthInput?.value || '');
    subscriptionPriceSheetMonth = isValidEffectiveMonth(selected) ? selected : getLocalMonthKey();
    if (monthInput && monthInput.value !== subscriptionPriceSheetMonth) monthInput.value = subscriptionPriceSheetMonth;
    const residents = [...state.residents].sort((a, b) =>
        String(a.apartmentNumber || '').localeCompare(String(b.apartmentNumber || ''), 'ar', { numeric: true }));
    if (!residents.length) {
        body.innerHTML = '<tr><td colspan="3" class="px-3 py-6 text-center text-xs text-slate-500">لا توجد شقق مسجلة بعد.</td></tr>';
        updateSubscriptionPriceSheetSummary();
        return;
    }
    body.innerHTML = residents.map(resident => {
        const amount = getSubscriptionAmountForMonthKey(resident, subscriptionPriceSheetMonth);
        return `<tr class="border-t border-slate-700/40">
            <td class="px-3 py-2"><span class="font-bold">شقة ${escapeSubscriptionHtml(resident.apartmentNumber || '—')}</span><span class="text-slate-400"> · ${escapeSubscriptionHtml(resident.name || '—')}</span></td>
            <td class="px-3 py-2 whitespace-nowrap">${formatSubscriptionAmount(amount)}</td>
            <td class="px-3 py-2">
                <input type="number" min="0" step="0.01" inputmode="decimal" data-price-sheet-resident="${escapeSubscriptionHtml(resident.id)}" value="${amount}" aria-label="سعر اشتراك شقة ${escapeSubscriptionHtml(resident.apartmentNumber || '')}" oninput="updateSubscriptionPriceSheetSummary()" class="w-full app-input border rounded-xl px-3 py-2 text-sm">
            </td>
        </tr>`;
    }).join('');
    updateSubscriptionPriceSheetSummary();
}

function collectSubscriptionPriceSheetChanges() {
    const changes = [];
    let invalid = 0;
    document.querySelectorAll('[data-price-sheet-resident]').forEach(node => {
        const input = /** @type {any} */ (node);
        const resident = state.residents.find(item => item.id === input.dataset.priceSheetResident);
        if (!resident) return;
        const value = Number(input.value);
        const valid = input.value !== '' && Number.isFinite(value) && value >= 0;
        input.classList.toggle('border-rose-500', !valid);
        if (!valid) { invalid += 1; return; }
        const current = getSubscriptionAmountForMonthKey(resident, subscriptionPriceSheetMonth);
        if (Math.round(value * 100) !== Math.round(current * 100)) changes.push({ resident, monthlyAmount: value });
    });
    return { changes, invalid };
}

function updateSubscriptionPriceSheetSummary() {
    const { changes, invalid } = collectSubscriptionPriceSheetChanges();
    const summary = document.getElementById('subscriptionPriceSheetSummary');
    const save = /** @type {HTMLButtonElement | null} */ (document.getElementById('subscriptionPriceSheetSave'));
    if (summary) {
        summary.textContent = invalid
            ? 'أصلح القيم غير الصحيحة أولًا.'
            : changes.length
                ? `سيتم تحديث ${changes.length} شقة بدءًا من ${subscriptionPriceSheetMonthLabel(subscriptionPriceSheetMonth)}.`
                : 'لا توجد تغييرات على الأسعار.';
        summary.classList.toggle('text-rose-400', invalid > 0);
        summary.classList.toggle('text-emerald-400', invalid === 0 && changes.length > 0);
    }
    if (save) save.disabled = invalid > 0 || changes.length === 0;
}

function applySubscriptionPriceSheetUniform() {
    const uniform = /** @type {any} */ (document.getElementById('subscriptionPriceSheetUniform'));
    const value = Number(uniform?.value);
    if (uniform?.value === '' || !Number.isFinite(value) || value < 0) {
        toast('أدخل قيمة صحيحة لتعبئة كل الشقق.', 'error');
        return;
    }
    document.querySelectorAll('[data-price-sheet-resident]').forEach(node => {
        /** @type {any} */ (node).value = String(value);
    });
    updateSubscriptionPriceSheetSummary();
}

async function saveSubscriptionPriceSheet(event) {
    event.preventDefault();
    if (!requireManager()) return;
    const monthKey = subscriptionPriceSheetMonth;
    if (!isValidEffectiveMonth(monthKey) || monthKey < getLocalMonthKey()) {
        toast('اختر الشهر الحالي أو شهرًا قادمًا. لا يمكن تعديل أسعار شهر سابق.', 'error');
        return;
    }
    const { changes, invalid } = collectSubscriptionPriceSheetChanges();
    if (invalid) {
        toast('أصلح قيم الاشتراك غير الصحيحة أولًا.', 'error');
        return;
    }
    if (!changes.length) {
        toast('لا توجد تغييرات على الأسعار.', 'info');
        return;
    }
    const previousState = cloneStateSnapshot();
    const effectiveDate = monthKey + '-01';
    changes.forEach(({ resident, monthlyAmount }) => {
        resident.subscriptionRates = Array.isArray(resident.subscriptionRates) ? resident.subscriptionRates : [];
        resident.subscriptionRates = resident.subscriptionRates.filter(rate => rate.effectiveMonth !== effectiveDate);
        resident.subscriptionRates.push({ effectiveMonth: effectiveDate, monthlyAmount });
        resident.subscriptionRates.sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
        resident.monthlyAmount = getCurrentSubscriptionAmount(resident);
    });
    logAction('تحديث ورقة أسعار الاشتراك', `${monthKey}: ${changes.length} شقة`);
    if (!await saveWithRollback(previousState)) return;
    closeModal('subscriptionPriceSheetModal');
    toast(`تم حفظ أسعار ${subscriptionPriceSheetMonthLabel(monthKey)} لعدد ${changes.length} شقة.`, 'success');
}

async function handleResidentSubmit(e) {
    if (!requireManager()) return;
    e.preventDefault();
    const previousState = cloneStateSnapshot();
    const shouldProvisionOwner = ownerProvisionRequested;
    ownerProvisionRequested = false;
    const name = /** @type {any} */ (document.getElementById('residentName')).value.trim();
    const apartmentNumber = normalizeApartmentDigits(/** @type {any} */ (document.getElementById('residentApartment')).value);
    const floor = normalizeApartmentDigits(/** @type {any} */ (document.getElementById('residentFloor')).value);
    const phone = /** @type {any} */ (document.getElementById('residentPhone')).value.trim();
    const amountInput = /** @type {any} */ (document.getElementById('residentAmount')).value.trim();
    const monthlyAmount = amountInput === '' ? Number(state.defaultSubscription) || 0 : Number(amountInput);
    const notes = /** @type {any} */ (document.getElementById('residentNotes')).value.trim();
    const billingStartValue = String(/** @type {any} */ (document.getElementById('residentBillingStart'))?.value || '').trim();
    if (billingStartValue && !isValidEffectiveMonth(billingStartValue)) {
        toast('اختر شهرًا صحيحًا لبداية المحاسبة.', 'error');
        return;
    }
    const billingStartMonth = billingStartValue ? `${billingStartValue}-01` : null;
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
            const previousBillingStart = r.billingStartMonth || '';
            const nextBillingStart = billingStartMonth || '';
            const subscriptionChanged = Math.round(previousAmount * 100) !== Math.round(monthlyAmount * 100);
            Object.assign(r, { name, apartmentNumber, floor, phone, notes, billingStartMonth });
            if (nextBillingStart !== previousBillingStart) {
                const backfilled = ensureSubscriptionRateFromBillingStart(r);
                let details = `${name} - شقة ${apartmentNumber}: ${billingStartMonth ? monthKeyToLabel(billingStartMonth) : 'من تاريخ الإضافة'}`;
                if (backfilled !== null) details += ` · سعر تاريخي ${fmtNum(backfilled)} ج.م`;
                logAction('تعديل بداية المحاسبة', details);
            }
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
                if (nextBillingStart === previousBillingStart) {
                    logAction('تعديل شقة', `${name} - شقة ${apartmentNumber}`);
                }
            }
            targetResidentId = r.id;
        }
    } else {
        const createdAt = new Date();
        const createdMonthKey = getLocalMonthKey(createdAt) + '-01';
        const rateMonthKey = billingStartMonth && billingStartMonth < createdMonthKey ? billingStartMonth : createdMonthKey;
        const resident = {
            id: generateId(), name, apartmentNumber, floor, phone, monthlyAmount, notes,
            createdAt: createdAt.toISOString(),
            billingStartMonth,
            subscriptionRates: [{ effectiveMonth: rateMonthKey, monthlyAmount }]
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
    const phoneDisplay = /** @type {any} */ (document.getElementById('ownerTempPinPhone'));
    const resident = state.residents.find(item => item.id === residentId);
    phoneDisplay.textContent = data.phone;
    phoneDisplay.dataset.phone = data.phone;
    phoneDisplay.dataset.apartmentNumber = resident?.apartmentNumber || '';
    /** @type {any} */ (document.getElementById('ownerTempPinValue')).value = data.temporary_pin;
    const modal = /** @type {any} */ (document.getElementById('ownerTempPinModal'));
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function sendOwnerTempPinOnWhatsApp() {
    const phoneDisplay = /** @type {any} */ (document.getElementById('ownerTempPinPhone'));
    const pin = /** @type {any} */ (document.getElementById('ownerTempPinValue'))?.value.trim() || '';
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
    const input = /** @type {any} */ (document.getElementById('ownerTempPinValue'));
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
    const input = /** @type {any} */ (document.getElementById('ownerTempPinValue'));
    input.value = '';
    const modal = /** @type {any} */ (document.getElementById('ownerTempPinModal'));
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
    if (!confirmRecordDeletion(`شقة ${r.name} (رقم ${r.apartmentNumber})`)) return;
    const previousState = cloneStateSnapshot();
    state.residents = state.residents.filter(x => x.id !== id);
    logAction('حذف شقة', `${r.name} - شقة ${r.apartmentNumber}`);
    if (!await saveWithRollback(previousState)) return;
    toast('تم حذف الشقة بنجاح', 'success');
}

function quickPayResident(residentId) {
    if (!requireManager()) return;
    const resident = state.residents.find(item => item.id === residentId);
    if (!resident) {
        toast('تعذر العثور على الشقة. حدّث البيانات ثم حاول مرة أخرى.', 'error');
        return;
    }

    const currentMonth = getCurrentMonth();
    let month = currentMonth;
    let amount = getMonthOutstanding(resident, currentMonth);
    if (amount <= 0 && typeof getIncomeCollectionMonthLabels === 'function') {
        const unpaid = getIncomeCollectionMonthLabels(resident, 12)
            .find(item => getMonthOutstanding(resident, item) > 0);
        if (unpaid) {
            month = unpaid;
            amount = getMonthOutstanding(resident, unpaid);
        }
    }
    if (amount <= 0) {
        toast('تم سداد اشتراك الشهر بالكامل.', 'info');
        return;
    }

    if (typeof populateSelects === 'function') populateSelects();
    const residentSelect = /** @type {any} */ (document.getElementById('incomeResident'));
    const amountInput = /** @type {any} */ (document.getElementById('incomeAmount'));
    const monthSelect = /** @type {any} */ (document.getElementById('incomeMonth'));
    const paymentMethodSelect = /** @type {any} */ (document.getElementById('incomePaymentMethod'));
    const notesInput = /** @type {any} */ (document.getElementById('incomeNotes'));
    if (!residentSelect || !amountInput || !monthSelect || !paymentMethodSelect) {
        toast('تعذر تجهيز نموذج التحصيل. أعد تحميل الصفحة وحاول مرة أخرى.', 'error');
        return;
    }

    residentSelect.value = residentId;
    refreshIncomeMonthOptions(residentId, month);
    amountInput.value = amount.toFixed(2);
    monthSelect.value = month;
    paymentMethodSelect.value = '';
    const purposeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('incomePurpose'));
    if (purposeSelect) purposeSelect.value = 'subscription';
    if (notesInput) notesInput.value = 'دفع سريع';
    incomeSelectedMonths = new Set([month]);
    incomeAmountManual = false;
    syncIncomeMonthPicker(resident, month);
    renderIncomeMonthsGrid(resident);
    syncIncomePurposeUi();
    if (typeof syncIncomePurposeCashAccount === 'function') {
        syncIncomePurposeCashAccount('incomePurpose', 'incomeCashAccount', {
            resetUnlocked: true,
            hintId: 'incomePurposeCashHint'
        });
    }
    clearIncomeExtraLines();
    renderIncomeResidentSummary();

    previewIncomeAllocation();
    setIncomeWizardStep(1);
    openModal('incomeModal');
}

function getIncomePurposeCashHint(purpose, forEdit) {
    const code = crudIncomePurposeFormCode(purpose);
    if (code === 'development') return 'غرض التطوير يُودع في صندوق التطوير فقط.';
    if (code === 'emergency') return 'غرض الصيانة الطارئة يُودع في صندوق الصيانة الطارئة فقط.';
    if (code === 'other' && !forEdit) return 'غرض «أخرى» يُكتب بالتفصيل في الملاحظات، ويمكن اختيار الصندوق المستلم.';
    if (forEdit) return 'يمكنك تعديل الصندوق مع الحفاظ على تاريخ التحصيل.';
    if (crudIncomePurposeLocked(purpose)) {
        return 'غرض «' + crudIncomePurposeLabel(purpose) + '» يُودع في الخزنة الرئيسية.';
    }
    return 'يمكنك اختيار الصندوق المستلم لهذا الغرض.';
}

function syncIncomePurposeCashAccount(purposeSelectId, cashAccountSelectId, options = {}) {
    const purposeSelect = /** @type {HTMLSelectElement} */ (document.getElementById(purposeSelectId));
    const cashAccountSelect = /** @type {HTMLSelectElement} */ (document.getElementById(cashAccountSelectId));
    const purpose = crudIncomePurpose(purposeSelect?.value);
    if (!cashAccountSelect) return purpose;
    const locked = purpose === 'development' || purpose === 'emergency'
        || (!options.forEdit && crudIncomePurposeLocked(purpose));
    if (locked || options.resetUnlocked) {
        cashAccountSelect.value = crudIncomePurposeCashAccount(purpose);
    }
    cashAccountSelect.disabled = locked;
    if (typeof cashAccountSelect.setAttribute === 'function') {
        cashAccountSelect.setAttribute('aria-disabled', locked ? 'true' : 'false');
    }
    const hint = document.getElementById(options.hintId || '');
    if (hint) hint.textContent = getIncomePurposeCashHint(purpose, options.forEdit === true);
    return purpose;
}

function getIncomeSettlementFromForm() {
    const id = String(/** @type {HTMLSelectElement | null} */ (document.getElementById('incomeSettlementSelect'))?.value || '');
    return (Array.isArray(state.adjustments) ? state.adjustments : []).find(item =>
        item.id === id && item.kind === 'settlement'
    ) || null;
}

function refreshIncomeSettlementOptions(residentId, preferredId = '') {
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('incomeSettlementSelect'));
    const hint = document.getElementById('incomeSettlementHint');
    if (!select) return [];
    const options = (Array.isArray(state.adjustments) ? state.adjustments : [])
        .filter(item => item.residentId === residentId && item.kind === 'settlement')
        .map(item => ({ adjustment: item, remaining: getSettlementRemainingAmount(item) }))
        .filter(item => item.remaining > 0)
        .sort((a, b) => String(a.adjustment.effectiveMonth || '').localeCompare(String(b.adjustment.effectiveMonth || '')));
    select.innerHTML = '<option value="">اختر تسوية مفتوحة</option>' + options.map(({ adjustment, remaining }) => {
        const month = adjustmentMonthKeyToLabel(String(adjustment.effectiveMonth || '').slice(0, 7));
        return '<option value="' + crudHtmlEscape(adjustment.id) + '">'
            + crudHtmlEscape(month + ' · متبقٍ ' + formatSubscriptionAmount(remaining) + ' ج.م · ' + (adjustment.reason || '')) + '</option>';
    }).join('');
    const selected = options.find(item => item.adjustment.id === preferredId) || options[0];
    select.value = selected ? selected.adjustment.id : '';
    select.disabled = options.length === 0;
    if (hint) hint.textContent = options.length
        ? 'اختر اتفاق التسوية، وسيُحدد شهره والمبلغ المتبقي تلقائيًا.'
        : 'لا توجد تسويات مفتوحة لهذه الشقة. سجّل اتفاق التسوية أولًا من الإعفاءات والتخفيضات.';
    return options;
}

function handleIncomeSettlementChange() {
    const adjustment = getIncomeSettlementFromForm();
    const resident = getIncomeResidentFromForm();
    const monthSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('incomeMonth'));
    const amountInput = /** @type {HTMLInputElement | null} */ (document.getElementById('incomeAmount'));
    const hint = document.getElementById('incomeSettlementHint');
    if (!adjustment || !resident) {
        if (monthSelect) monthSelect.disabled = false;
        if (amountInput) amountInput.removeAttribute('max');
        if (hint && resident) hint.textContent = 'اختر اتفاق تسوية مفتوحًا.';
        previewIncomeAllocation();
        return;
    }
    const month = monthKeyToLabel(String(adjustment.effectiveMonth || '').slice(0, 7));
    refreshIncomeMonthOptions(resident.id, month);
    if (monthSelect) {
        monthSelect.value = month;
        monthSelect.disabled = true;
    }
    const remaining = getSettlementRemainingAmount(adjustment);
    const paid = getSettlementPaidAmount(adjustment.id);
    if (amountInput) {
        amountInput.max = remaining.toFixed(2);
        if (!incomeAmountManual || Number(amountInput.value) > remaining) {
            amountInput.value = remaining > 0 ? remaining.toFixed(2) : '';
            incomeAmountManual = false;
        }
    }
    if (hint) hint.textContent = 'المبلغ المتفق عليه: ' + formatSubscriptionAmount(adjustment.amount)
        + ' ج.م · المدفوع: ' + formatSubscriptionAmount(paid)
        + ' ج.م · المتبقي: ' + formatSubscriptionAmount(remaining) + ' ج.م';
    previewIncomeAllocation();
}

function handleIncomePurposeChange() {
    const purpose = syncIncomePurposeCashAccount('incomePurpose', 'incomeCashAccount', {
        resetUnlocked: true,
        hintId: 'incomePurposeCashHint'
    });
    syncIncomePurposeUi();
    const resident = getIncomeResidentFromForm();
    if (purpose === 'subscription' && resident) {
        const monthSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('incomeMonth'));
        if (monthSelect) monthSelect.disabled = false;
        if (!incomeSelectedMonths.size) selectFirstUnpaidIncomeMonth(resident);
        renderIncomeMonthsGrid(resident);
        if (!incomeAmountManual) syncIncomeAmountFromSelection();
    } else if (purpose === 'settlement') {
        const options = refreshIncomeSettlementOptions(resident?.id || '');
        if (options.length) handleIncomeSettlementChange();
        else previewIncomeAllocation();
    } else {
        const monthSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('incomeMonth'));
        if (monthSelect) monthSelect.disabled = false;
        refreshIncomeMonthOptions(resident?.id || '', getCurrentMonth());
        if (monthSelect && !monthSelect.value) monthSelect.value = getCurrentMonth();
        previewIncomeAllocation();
    }
    renderIncomeResidentSummary();
    previewIncomeAllocation();
}

function handleIncomeEditPurposeChange() {
    syncIncomePurposeCashAccount('incomeEditPurpose', 'incomeEditCashAccount', {
        forEdit: true,
        resetUnlocked: true,
        hintId: 'incomeEditPurposeHint'
    });
}

function crudIncomeMonthLabels(resident, includeMonths = []) {
    if (typeof getIncomeMonthLabels === 'function') return getIncomeMonthLabels(resident, includeMonths);
    if (typeof getActiveBuildingMonths === 'function') return getActiveBuildingMonths();
    return [getCurrentMonth()];
}

function crudApartmentLabel(value) {
    if (typeof formatApartmentLabel === 'function') return formatApartmentLabel(value);
    const raw = String(value ?? '').trim();
    if (!raw) return 'شقة —';
    return /^شقة(?:\s|$)/.test(raw) ? raw : `شقة ${raw}`;
}

function crudHtmlEscape(value) {
    return typeof esc === 'function' ? esc(value) : String(value ?? '');
}

function crudIncomeMonthOptionLabel(resident, month) {
    return typeof getIncomeMonthOptionLabel === 'function' ? getIncomeMonthOptionLabel(resident, month) : month;
}

function refreshIncomeMonthOptions(residentId, preferredMonth = '') {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById('incomeMonth'));
    if (!select) return;
    const resident = state.residents.find(item => item.id === residentId) || null;
    const currentMonth = getCurrentMonth();
    const previous = preferredMonth || select.value || currentMonth;
    const labels = crudIncomeMonthLabels(resident, [previous]);
    select.innerHTML = labels
        .map(month => `<option value="${crudHtmlEscape(month)}">${crudHtmlEscape(crudIncomeMonthOptionLabel(resident, month))}</option>`)
        .join('');
    if (labels.includes(previous)) select.value = previous;
    else if (labels.includes(currentMonth)) select.value = currentMonth;
    else if (labels.length) select.value = labels[labels.length - 1];
}

let incomeSelectedMonths = new Set();
let incomeAmountManual = false;

function getIncomeResidentFromForm() {
    const residentId = /** @type {HTMLSelectElement | null} */ (document.getElementById('incomeResident'))?.value || '';
    return state.residents.find(item => item.id === residentId) || null;
}

function getSelectedIncomeMonths() {
    const grid = document.getElementById('incomeMonthsGrid');
    if (!grid || typeof grid.querySelectorAll !== 'function') {
        const fallback = /** @type {HTMLSelectElement | null} */ (document.getElementById('incomeMonth'))?.value || '';
        return fallback ? [fallback] : [];
    }
    return Array.from(grid.querySelectorAll('input[data-income-month]:checked'))
        .map(input => input.getAttribute('data-income-month') || '')
        .filter(Boolean);
}

function getIncomeBillingStartKey(resident) {
    return (getResidentBillingStartKey(resident) || '').slice(0, 7);
}

function getIncomePickerLabel() {
    const picker = /** @type {HTMLInputElement | null} */ (document.getElementById('incomeMonthPicker'));
    return monthKeyToLabel(picker?.value || '');
}

function syncIncomeMonthPicker(resident, monthLabel = '') {
    const picker = /** @type {HTMLInputElement | null} */ (document.getElementById('incomeMonthPicker'));
    if (!picker) return;
    const label = monthLabel || getSelectedIncomeMonths()[0] || getCurrentMonth();
    const key = monthLabelToKey(label);
    if (key) picker.value = key.slice(0, 7);
    updateIncomeMonthPickerHint(resident);
}

function getIncomeMonthPickerStatus(resident, monthLabel) {
    const key = monthLabelToKey(monthLabel);
    const picker = /** @type {HTMLInputElement | null} */ (document.getElementById('incomeMonthPicker'));
    if (!resident || !key || !picker?.value) return null;
    if (key.slice(0, 7) !== String(picker.value).slice(0, 7)) return null;
    return {
        key,
        due: getSubscriptionAmountForMonth(resident, monthLabel),
        paid: getPaidAmountForMonth(resident.id, monthLabel),
        adjusted: typeof getAdjustmentAmountForMonth === 'function'
            ? getAdjustmentAmountForMonth(resident.id, monthLabel)
            : 0,
        outstanding: getMonthOutstanding(resident, monthLabel)
    };
}

function updateIncomeMonthPickerHint(resident = null) {
    const hint = document.getElementById('incomeMonthPickerHint');
    if (!hint) return;
    const target = resident || getIncomeResidentFromForm();
    if (!target) {
        hint.className = 'text-[10px] text-slate-500';
        hint.textContent = 'اختر الشقة أولًا لعرض حالة الشهر.';
        return;
    }
    const picker = /** @type {HTMLInputElement | null} */ (document.getElementById('incomeMonthPicker'));
    const key = String(picker?.value || '');
    const label = monthKeyToLabel(key);
    if (!label) {
        hint.className = 'text-[10px] text-slate-500';
        hint.textContent = 'اختر شهر التحصيل من الكلندر.';
        return;
    }
    const createdKey = getIncomeBillingStartKey(target);
    if (createdKey && key < createdKey) {
        hint.className = 'text-[10px] text-rose-300';
        hint.textContent = `هذا الشهر قبل بداية محاسبة الشقة (${monthKeyToLabel(createdKey)}). اختر الشهر لتأكيد تعديل بداية المحاسبة.`;
        return;
    }
    const status = getIncomeMonthPickerStatus(target, label);
    if (!status) return;
    const parts = [
        `مستحق ${fmtNum(status.due)} ج.م`,
        `مدفوع ${fmtNum(status.paid)} ج.م`
    ];
    if (status.adjusted > 0) parts.push(`إعفاء/تخفيض ${fmtNum(status.adjusted)} ج.م`);
    parts.push(`متبقٍ ${fmtNum(status.outstanding)} ج.م`);
    if (status.outstanding <= 0) {
        hint.className = 'text-[10px] text-emerald-300';
        hint.textContent = `${parts.join(' · ')} — الشهر مسدد بالكامل.`;
    } else {
        hint.className = 'text-[10px] text-slate-400';
        hint.textContent = parts.join(' · ');
    }
}

function ensureSubscriptionRateFromBillingStart(resident) {
    const startKey = getResidentBillingStartKey(resident);
    if (!startKey) return null;
    const rates = Array.isArray(resident.subscriptionRates) ? resident.subscriptionRates : [];
    const earliestRate = rates
        .filter(rate => /^\d{4}-\d{2}-01$/.test(String(rate.effectiveMonth || '')))
        .sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth))[0];
    if (!earliestRate || earliestRate.effectiveMonth <= startKey) return null;
    const amount = Math.max(0, Number(earliestRate.monthlyAmount) || 0);
    resident.subscriptionRates = rates
        .concat({ effectiveMonth: startKey, monthlyAmount: amount })
        .sort((a, b) => String(a.effectiveMonth).localeCompare(String(b.effectiveMonth)));
    return amount;
}

async function adjustResidentBillingStart(resident, monthKey) {
    const previousState = cloneStateSnapshot();
    resident.billingStartMonth = `${monthKey}-01`;
    const backfilled = ensureSubscriptionRateFromBillingStart(resident);
    let details = `${resident.name} - شقة ${resident.apartmentNumber}: ${monthKeyToLabel(monthKey)}`;
    if (backfilled !== null) details += ` · سعر تاريخي ${fmtNum(backfilled)} ج.م`;
    logAction('تعديل بداية المحاسبة', details);
    if (!await saveWithRollback(previousState)) return false;
    updateIncomeMonthPickerHint(resident);
    return true;
}

async function handleIncomeMonthPickerChange() {
    const resident = getIncomeResidentFromForm();
    const picker = /** @type {HTMLInputElement | null} */ (document.getElementById('incomeMonthPicker'));
    const key = String(picker?.value || '');
    const label = monthKeyToLabel(key);
    if (!resident || !label) {
        updateIncomeMonthPickerHint(resident);
        return;
    }
    const amountInput = /** @type {HTMLInputElement | null} */ (document.getElementById('incomeAmount'));
    const billingStartKey = getIncomeBillingStartKey(resident);
    if (billingStartKey && key < billingStartKey) {
        const confirmed = confirm(`الشهر المختار ${label} قبل بداية محاسبة الشقة (${monthKeyToLabel(billingStartKey)}).\nهل تريد تعديل بداية المحاسبة إلى ${label} لتحصيله؟`);
        if (!confirmed) {
            incomeSelectedMonths = new Set();
            incomeAmountManual = false;
            renderIncomeMonthsGrid(resident);
            if (amountInput) amountInput.value = '';
            previewIncomeAllocation();
            updateIncomeMonthPickerHint(resident);
            return;
        }
        if (!await adjustResidentBillingStart(resident, key)) return;
        toast(`تم تعديل بداية المحاسبة إلى ${label}.`, 'success');
        renderIncomeResidentSummary();
    }
    const outstanding = getMonthOutstanding(resident, label);
    incomeSelectedMonths = outstanding > 0 ? new Set([label]) : new Set();
    incomeAmountManual = false;
    renderIncomeMonthsGrid(resident);
    if (outstanding > 0) {
        syncIncomeAmountFromSelection();
    } else {
        if (amountInput) amountInput.value = '';
        toast('الشهر المختار مسدد بالكامل — اختر شهرًا غير مسدد.', 'info');
    }
    previewIncomeAllocation();
    updateIncomeMonthPickerHint(resident);
}

function getIncomeMonthStatus(resident, month) {
    const key = monthLabelToKey(month);
    const currentKey = getLocalMonthKey();
    const outstanding = getMonthOutstanding(resident, month);
    const settlement = resident && typeof getSettlementAdjustmentForMonth === 'function'
        ? getSettlementAdjustmentForMonth(resident.id, month) : null;
    const settlementPaid = settlement && typeof getSettlementPaidAmount === 'function'
        ? getSettlementPaidAmount(settlement.id) : 0;
    const monthKey = key ? key.slice(0, 7) : '';
    const future = Boolean(monthKey && monthKey > currentKey);
    const late = Boolean(monthKey && monthKey < currentKey)
        || (typeof isSubscriptionMonthOverdue === 'function' && isSubscriptionMonthOverdue(month));
    return {
        key,
        outstanding,
        late,
        future,
        disabled: outstanding <= 0 || Boolean(settlement),
        status: settlement
            ? outstanding <= 0 ? 'التسوية مسددة' : settlementPaid > 0 ? 'تسوية جزئية' : 'تسوية قائمة'
            : outstanding <= 0 ? 'مسدد' : future ? 'قادم' : late ? 'متأخر' : 'مستحق'
    };
}

function selectFirstUnpaidIncomeMonth(resident) {
    if (!resident) return;
    const labels = typeof getIncomeCollectionMonthLabels === 'function'
        ? getIncomeCollectionMonthLabels(resident, 12)
        : [];
    const first = labels.find(month => getMonthOutstanding(resident, month) > 0);
    incomeSelectedMonths = new Set(first ? [first] : []);
    syncIncomeMonthPicker(resident, first || getCurrentMonth());
}

function renderIncomeMonthsGrid(resident) {
    const grid = document.getElementById('incomeMonthsGrid');
    if (!grid) return;
    if (!resident) {
        incomeSelectedMonths.clear();
        grid.innerHTML = '<p class="text-[11px] text-slate-500">اختر الشقة أولًا لعرض الشهور.</p>';
        return;
    }
    const labels = typeof getIncomeCollectionMonthLabels === 'function'
        ? getIncomeCollectionMonthLabels(resident, 12, getIncomePickerLabel() ? [getIncomePickerLabel()] : [])
        : [];
    const payable = new Set(labels.filter(month => getMonthOutstanding(resident, month) > 0));
    incomeSelectedMonths = new Set(Array.from(incomeSelectedMonths).filter(month => payable.has(month)));
    grid.innerHTML = labels.map(month => {
        const info = getIncomeMonthStatus(resident, month);
        const checked = incomeSelectedMonths.has(month) && !info.disabled;
        const badgeClass = info.disabled
            ? 'text-slate-500 border-slate-700/60'
            : info.late
                ? 'text-amber-300 border-amber-500/40'
                : info.future
                    ? 'text-sky-300 border-sky-500/30'
                    : 'text-emerald-300 border-emerald-500/30';
        const settlement = typeof getSettlementAdjustmentForMonth === 'function'
            ? getSettlementAdjustmentForMonth(resident.id, month) : null;
        const due = settlement ? Number(settlement.amount) || 0 : getSubscriptionAmountForMonth(resident, month);
        const paid = settlement && typeof getSettlementPaidAmount === 'function'
            ? getSettlementPaidAmount(settlement.id) : getPaidAmountForMonth(resident.id, month);
        return `<label class="income-month-row flex items-start gap-2 rounded-xl border px-2.5 py-2 text-[11px] ${info.disabled ? 'border-slate-800/60 opacity-60' : 'border-slate-700/60'}">
            <input type="checkbox" data-income-month="${crudHtmlEscape(month)}" ${checked ? 'checked' : ''} ${info.disabled ? 'disabled' : ''} onchange="handleIncomeMonthToggle(this)" aria-label="${crudHtmlEscape(`${month} ${info.status}`)}" class="mt-0.5 h-4 w-4 accent-emerald-500">
            <span class="flex-1 min-w-0">
                <span class="font-bold">${crudHtmlEscape(month)}</span>
                <span class="mx-1 rounded-full border px-1.5 py-0.5 text-[9px] ${badgeClass}">${info.status}</span>
                <span class="block text-[10px] text-slate-500">مستحق ${fmtNum(due)} · مدفوع ${fmtNum(paid)} · متبقٍ ${fmtNum(info.outstanding)}</span>
            </span>
        </label>`;
    }).join('');
}

function handleIncomeMonthToggle(input) {
    const month = input?.getAttribute?.('data-income-month') || '';
    if (!month) return;
    if (input.checked) incomeSelectedMonths.add(month);
    else incomeSelectedMonths.delete(month);
    const selected = Array.from(incomeSelectedMonths)
        .sort((a, b) => (monthLabelToKey(a) || '').localeCompare(monthLabelToKey(b) || ''));
    if (selected.length) syncIncomeMonthPicker(getIncomeResidentFromForm(), selected[0]);
    else updateIncomeMonthPickerHint(getIncomeResidentFromForm());
    if (!incomeAmountManual) syncIncomeAmountFromSelection();
    previewIncomeAllocation();
}

function syncIncomeAmountFromSelection() {
    const resident = getIncomeResidentFromForm();
    const amountInput = /** @type {HTMLInputElement | null} */ (document.getElementById('incomeAmount'));
    if (!resident || !amountInput) return;
    const totalCents = getSelectedIncomeMonths().reduce(
        (sum, month) => sum + Math.round(getMonthOutstanding(resident, month) * 100),
        0
    );
    amountInput.value = totalCents > 0 ? String(totalCents / 100) : '';
    incomeAmountManual = false;
}

function handleIncomeAmountInput() {
    incomeAmountManual = true;
    previewIncomeAllocation();
}

function applyIncomeMonthQuickAction(action) {
    const resident = getIncomeResidentFromForm();
    if (!resident) {
        toast('اختر الشقة أولًا.', 'error');
        return;
    }
    const labels = typeof getIncomeCollectionMonthLabels === 'function'
        ? getIncomeCollectionMonthLabels(resident, 12)
        : [];
    const unpaid = labels.filter(month => getMonthOutstanding(resident, month) > 0);
    const currentKey = getLocalMonthKey();
    const currentMonth = getCurrentMonth();
    if (action === 'clear') {
        incomeSelectedMonths.clear();
    } else if (action === 'current') {
        incomeSelectedMonths = new Set(unpaid.includes(currentMonth) ? [currentMonth] : []);
        if (!unpaid.includes(currentMonth)) toast('الشهر الحالي مسدد بالكامل.', 'info');
    } else if (action === 'arrears') {
        const arrears = unpaid.filter(month => {
            const key = monthLabelToKey(month);
            return Boolean(key && key.slice(0, 7) < currentKey)
                || (typeof isSubscriptionMonthOverdue === 'function' && isSubscriptionMonthOverdue(month));
        });
        incomeSelectedMonths = new Set(arrears);
        if (!arrears.length) toast('لا توجد متأخرات مستحقة.', 'info');
    } else if (action === 'two' || action === 'three') {
        const count = action === 'two' ? 2 : 3;
        incomeSelectedMonths = new Set(unpaid.slice(0, count));
        if (!unpaid.length) toast('لا توجد شهور مستحقة.', 'info');
    }
    incomeAmountManual = false;
    const ordered = Array.from(incomeSelectedMonths)
        .sort((a, b) => (monthLabelToKey(a) || '').localeCompare(monthLabelToKey(b) || ''));
    if (ordered.length) syncIncomeMonthPicker(resident, ordered[0]);
    else updateIncomeMonthPickerHint(resident);
    renderIncomeMonthsGrid(resident);
    syncIncomeAmountFromSelection();
    previewIncomeAllocation();
}

function syncIncomePurposeUi() {
    const purpose = crudIncomePurpose(/** @type {HTMLSelectElement | null} */ (document.getElementById('incomePurpose'))?.value);
    const isSubscription = purpose === 'subscription';
    const isSettlement = purpose === 'settlement';
    const monthsWrap = document.getElementById('incomeMonthsWrap');
    const registrationWrap = document.getElementById('incomeNonSubscriptionMonthWrap');
    const settlementWrap = document.getElementById('incomeSettlementWrap');
    if (monthsWrap?.classList && typeof monthsWrap.classList.toggle === 'function') {
        monthsWrap.classList.toggle('hidden', !isSubscription);
    }
    if (registrationWrap?.classList && typeof registrationWrap.classList.toggle === 'function') {
        registrationWrap.classList.toggle('hidden', isSubscription);
    }
    if (settlementWrap?.classList && typeof settlementWrap.classList.toggle === 'function') {
        settlementWrap.classList.toggle('hidden', !isSettlement);
    }
}

function renderIncomeResidentSummary() {
    const box = document.getElementById('incomeResidentSummary');
    if (!box) return;
    const residentId = /** @type {HTMLSelectElement} */ (document.getElementById('incomeResident'))?.value || '';
    const resident = state.residents.find(item => item.id === residentId);
    if (!resident) {
        box.innerHTML = '';
        box.classList.add('hidden');
        return;
    }
    const summary = typeof getResidentCollectionSummary === 'function' ? getResidentCollectionSummary(resident) : null;
    const debt = summary?.debt || { count: 0, totalDebt: 0 };
    const purpose = crudIncomePurpose(/** @type {HTMLSelectElement} */ (document.getElementById('incomePurpose'))?.value);
    const cashAccountCode = /** @type {HTMLSelectElement} */ (document.getElementById('incomeCashAccount'))?.value || 'main';
    const lastPayment = summary?.lastPayment;
    const lastPaymentText = lastPayment
        ? `${formatDate(lastPayment.date)} · ${fmtNum(lastPayment.amount)} ج.م · ${crudIncomePurposeLabel(lastPayment.purposeCode)}`
        : 'لا توجد دفعات سابقة';
    const statusClass = debt.count > 0
        ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
        : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    const statusText = debt.count > 0 ? `متأخر ${fmtNum(debt.totalDebt)} ج.م` : 'منتظم';
    box.innerHTML = `
        <div class="flex items-center justify-between gap-2">
            <p class="font-bold text-slate-200">${crudHtmlEscape(crudApartmentLabel(resident.apartmentNumber))} · ${crudHtmlEscape(resident.name || '—')}</p>
            <span class="rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClass}">${statusText}</span>
        </div>
        <p class="text-slate-400">الاشتراك الحالي: ${fmtNum(summary?.currentSubscription || 0)} ج.م · مستحق هذا الشهر: ${fmtNum(summary?.currentOutstanding || 0)} ج.م</p>
        <p class="text-slate-400">المتأخرات: ${fmtNum(debt.totalDebt)} ج.م (${fmtNum(debt.count)} شهر) · آخر دفعة: ${crudHtmlEscape(lastPaymentText)}</p>
        <p class="text-emerald-300">الغرض: ${crudHtmlEscape(crudIncomePurposeLabel(purpose))} · الصندوق: ${crudHtmlEscape(crudCashAccountLabel(cashAccountCode))}</p>`;
    box.classList.remove('hidden');
}

function handleIncomeResidentChange() {
    const resident = getIncomeResidentFromForm();
    const purpose = crudIncomePurpose(/** @type {HTMLSelectElement | null} */ (document.getElementById('incomePurpose'))?.value);
    incomeSelectedMonths = new Set();
    incomeAmountManual = false;
    const monthSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('incomeMonth'));
    if (monthSelect) monthSelect.disabled = false;
    refreshIncomeMonthOptions(resident?.id || '', getCurrentMonth());
    if (monthSelect) monthSelect.value = getCurrentMonth();
    if (purpose === 'settlement') {
        const options = refreshIncomeSettlementOptions(resident?.id || '');
        if (options.length) handleIncomeSettlementChange();
    } else {
        selectFirstUnpaidIncomeMonth(resident);
        renderIncomeMonthsGrid(resident);
        if (!resident) {
            const amountInput = /** @type {HTMLInputElement | null} */ (document.getElementById('incomeAmount'));
            if (amountInput) amountInput.value = '';
        } else if (purpose === 'subscription') {
            syncIncomeAmountFromSelection();
        }
    }
    renderIncomeResidentSummary();
    previewIncomeAllocation();
}

function setIncomeNoteSuggestion(text) {
    const input = /** @type {HTMLTextAreaElement} */ (document.getElementById('incomeNotes'));
    if (!input) return;
    const current = String(input.value || '').trim();
    input.value = current ? `${current} · ${text}` : text;
    if (typeof input.focus === 'function') input.focus();
    previewIncomeAllocation();
}

function resetIncomeFormFields() {
    /** @type {HTMLFormElement} */ (document.getElementById('incomeForm'))?.reset();
    const residentSelect = /** @type {HTMLSelectElement} */ (document.getElementById('incomeResident'));
    if (residentSelect) residentSelect.value = '';
    const purposeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('incomePurpose'));
    if (purposeSelect) purposeSelect.value = 'subscription';
    const settlementSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('incomeSettlementSelect'));
    if (settlementSelect) {
        settlementSelect.innerHTML = '<option value="">اختر تسوية مفتوحة</option>';
        settlementSelect.value = '';
        settlementSelect.disabled = true;
    }
    const monthSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('incomeMonth'));
    if (monthSelect) monthSelect.disabled = false;
    const amountInput = /** @type {HTMLInputElement | null} */ (document.getElementById('incomeAmount'));
    if (amountInput) amountInput.removeAttribute('max');
    const settlementHint = document.getElementById('incomeSettlementHint');
    if (settlementHint) settlementHint.textContent = 'اختر اتفاقًا لتحديد المبلغ المتبقي.';
    incomeSelectedMonths = new Set();
    incomeAmountManual = false;
    refreshIncomeMonthOptions('', getCurrentMonth());
    const monthSelect = /** @type {HTMLSelectElement} */ (document.getElementById('incomeMonth'));
    const currentMonth = getCurrentMonth();
    if (monthSelect?.options && Array.from(monthSelect.options).some(option => option.value === currentMonth)) {
        monthSelect.value = currentMonth;
    }
    const monthPicker = /** @type {HTMLInputElement | null} */ (document.getElementById('incomeMonthPicker'));
    if (monthPicker) monthPicker.value = getLocalMonthKey();
    const monthPickerHint = document.getElementById('incomeMonthPickerHint');
    if (monthPickerHint) {
        monthPickerHint.textContent = '';
        monthPickerHint.className = 'text-[10px] text-slate-500';
    }
    syncIncomePurposeUi();
    syncIncomePurposeCashAccount('incomePurpose', 'incomeCashAccount', {
        resetUnlocked: true,
        hintId: 'incomePurposeCashHint'
    });
    renderIncomeMonthsGrid(null);
    clearIncomeExtraLines();
    renderIncomeResidentSummary();
    for (const id of ['incomeOutstandingHint', 'incomeSelectionHint', 'incomeMonthsSummary']) {
        const hint = document.getElementById(id);
        if (hint) hint.textContent = '';
    }
    /** @type {HTMLElement} */ (document.getElementById('incomeAllocationPreview'))?.classList.add('hidden');
}


let incomeWizardStep = 1;
const INCOME_WIZARD_LABELS = ['بيانات الساكن', 'المبلغ والتوزيع', 'الدفع والمراجعة'];

function validateIncomeWizardStep(step) {
    const value = id => String((/** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null} */ (document.getElementById(id)))?.value || '').trim();
    if (step === 1 && !value('incomeResident')) {
        toast('اختر الشقة أولًا.', 'error'); return false;
    }
    if (step === 2) {
        const amount = Number(value('incomeAmount'));
        const purpose = value('incomePurpose') || 'subscription';
        if (!Number.isFinite(amount) || amount <= 0) { toast('أدخل مبلغًا أكبر من صفر.', 'error'); return false; }
        if (purpose === 'subscription' && !getSelectedIncomeMonths().length) {
            toast('اختر شهرًا واحدًا على الأقل.', 'error'); return false;
        }
        if (purpose !== 'subscription' && !value('incomeMonth')) {
            toast('اختر شهر تسجيل التحصيل.', 'error'); return false;
        }
        const validation = validateIncomeExtraLines(getIncomeExtraLines());
        if (!validation.valid) { toast(validation.message, 'error'); return false; }
    }
    return true;
}

function setIncomeWizardStep(step) {
    incomeWizardStep = Math.max(1, Math.min(3, Number(step) || 1));
    for (let index = 1; index <= 3; index++) {
        const panel = document.getElementById('incomeWizardStep' + index);
        if (panel?.classList && typeof panel.classList.toggle === 'function') panel.classList.toggle('hidden', index !== incomeWizardStep);
    }
    const progress = document.getElementById('incomeWizardProgress');
    const dots = document.getElementById('incomeWizardStepDots');
    const back = document.getElementById('incomeWizardBack');
    const next = document.getElementById('incomeWizardNext');
    const submit = document.getElementById('incomeSubmitButton');
    if (progress) progress.textContent = 'الخطوة ' + incomeWizardStep + ' من 3 · ' + INCOME_WIZARD_LABELS[incomeWizardStep - 1];
    if (dots) dots.textContent = [1, 2, 3].map(index => index <= incomeWizardStep ? '●' : '○').join(' ');
    if (back?.classList && typeof back.classList.toggle === 'function') back.classList.toggle('hidden', incomeWizardStep === 1);
    if (next?.classList && typeof next.classList.toggle === 'function') next.classList.toggle('hidden', incomeWizardStep === 3);
    if (submit?.classList && typeof submit.classList.toggle === 'function') submit.classList.toggle('hidden', incomeWizardStep !== 3);
    if (incomeWizardStep === 3) previewIncomeAllocation();
}

function changeIncomeWizardStep(direction) {
    if (direction > 0 && !validateIncomeWizardStep(incomeWizardStep)) return;
    setIncomeWizardStep(incomeWizardStep + direction);
}

function openNewIncomeModal() {
    if (!requireManager()) return;
    if (typeof populateSelects === 'function') populateSelects();
    resetIncomeFormFields();
    setIncomeWizardStep(1);
    openModal('incomeModal');
}

function previewIncomeAllocation() {
    const purpose = syncIncomePurposeCashAccount('incomePurpose', 'incomeCashAccount', {
        hintId: 'incomePurposeCashHint'
    });
    const isSubscription = purpose === 'subscription';
    const isSettlement = purpose === 'settlement';
    const settlement = isSettlement ? getIncomeSettlementFromForm() : null;
    syncIncomePurposeUi();
    const monthLabel = document.getElementById('incomeMonthLabel');
    const monthSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('incomeMonth'));
    if (monthLabel) monthLabel.textContent = isSubscription ? 'شهر بداية التوزيع' : isSettlement ? 'شهر التسوية' : 'شهر تسجيل التحصيل';
    if (monthSelect && typeof monthSelect.setAttribute === 'function') {
        monthSelect.setAttribute('aria-label', isSubscription ? 'شهر بداية التوزيع' : 'شهر تسجيل التحصيل');
    }
    const preview = /** @type {any} */ (document.getElementById('incomeAllocationPreview'));
    const summary = /** @type {any} */ (document.getElementById('incomeAllocationSummary'));
    const rows = /** @type {any} */ (document.getElementById('incomeAllocationRows'));
    const submit = /** @type {any} */ (document.getElementById('incomeSubmitButton'));
    if (!preview || !summary || !rows) return;

    const residentId = /** @type {any} */ (document.getElementById('incomeResident'))?.value || '';
    const amount = Number(/** @type {any} */ (document.getElementById('incomeAmount'))?.value);
    const selectedMonths = isSubscription ? getSelectedIncomeMonths() : [];
    const registrationMonth = /** @type {any} */ (monthSelect)?.value || '';
    const month = isSubscription ? (selectedMonths[0] || registrationMonth || getCurrentMonth()) : registrationMonth;
    const notes = String(/** @type {any} */ (document.getElementById('incomeNotes'))?.value || '').trim();
    const resident = state.residents.find(item => item.id === residentId) || null;
    const currentKey = typeof monthLabelToKey === 'function' ? monthLabelToKey(getCurrentMonth()) : null;
    const monthKeyOf = label => (typeof monthLabelToKey === 'function' ? monthLabelToKey(label) : null);
    const selectedTotalCents = resident
        ? selectedMonths.reduce((sum, item) => sum + Math.round(getMonthOutstanding(resident, item) * 100), 0)
        : 0;
    const selectedMonthLate = selectedMonths.some(label => {
        const key = monthKeyOf(label);
        return Boolean(key && currentKey && key < currentKey);
    });
    const outstandingHint = document.getElementById('incomeOutstandingHint');
    const selectionHint = document.getElementById('incomeSelectionHint');
    const monthsSummary = document.getElementById('incomeMonthsSummary');
    if (monthsSummary) {
        monthsSummary.textContent = selectedMonths.length
            ? `${fmtNum(selectedMonths.length)} شهر · مستحق ${fmtNum(selectedTotalCents / 100)} ج.م`
            : '';
    }
    if (selectionHint) {
        if (!resident || !isSubscription) {
            selectionHint.textContent = '';
        } else if (!selectedMonths.length) {
            selectionHint.textContent = 'اختر شهرًا واحدًا على الأقل من قائمة شهور السداد.';
        } else {
            selectionHint.textContent = `المحدد: ${fmtNum(selectedMonths.length)} شهر · المستحق ${fmtNum(selectedTotalCents / 100)} ج.م · المدفوع الآن ${Number.isFinite(amount) ? fmtNum(amount) : 0} ج.م`;
        }
    }
    if (outstandingHint) {
        if (!resident || !isSubscription) {
            outstandingHint.textContent = '';
        } else {
            const debt = typeof calculateCumulativeDebt === 'function' ? calculateCumulativeDebt(resident.id) : { count: 0, totalDebt: 0 };
            const parts = [];
            if (selectedMonths.length) {
                parts.push(`${selectedMonthLate ? 'ضمن المحدد شهور متأخرة — ' : ''}مستحق الشهور المحددة: ${fmtNum(selectedTotalCents / 100)} ج.م`);
            }
            if (debt.count > 0) parts.push(`متأخرات حالية: ${fmtNum(debt.totalDebt)} ج.م (${fmtNum(debt.count)} شهر)`);
            outstandingHint.textContent = parts.join(' · ');
        }
    }
    const wizardSummary = document.getElementById('incomeWizardSummary');
    if (wizardSummary) {
        const residentName = resident ? (resident.name || crudApartmentLabel(resident.apartmentNumber)) : 'لم يتم اختيار الساكن';
        const method = (/** @type {HTMLSelectElement | null} */ (document.getElementById('incomePaymentMethod')))?.selectedOptions?.[0]?.textContent || 'لم تحدد طريقة الدفع';
        const cashbox = crudCashAccountLabel((/** @type {HTMLSelectElement | null} */ (document.getElementById('incomeCashAccount')))?.value || 'main');
        const base = Number.isFinite(amount) && amount > 0 ? amount : 0;
        const extrasTotal = getIncomeExtraLines().reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
        wizardSummary.textContent = residentName + ' · ' + crudIncomePurposeLabel(purpose) + ' · ' + fmtNum(base + extrasTotal) + ' ج.م · ' + method + ' · ' + cashbox;
    }
    const extraLines = getIncomeExtraLines();
    if (purpose === 'settlement' && extraLines.length) {
        toast('سداد التسوية يُسجل كبند مستقل؛ احذف البنود الإضافية ثم أعد المحاولة.', 'error');
        return;
    }
    const extraValidation = validateIncomeExtraLines(extraLines);
    const hasExtras = extraLines.length > 0;
    const mixedTotal = document.getElementById('incomeMixedTotal');
    const ready = Boolean(residentId && Number.isFinite(amount) && amount > 0
        && (isSubscription ? selectedMonths.length : month));
    const baseCents = Number.isFinite(amount) ? Math.round(amount * 100) : 0;
    const collectedCents = ready && extraValidation.valid ? baseCents + extraValidation.totalCents : 0;
    const setSubmitLabel = label => {
        if (submit && !incomeSaving) submit.textContent = label;
    };
    if (mixedTotal) {
        if (ready && hasExtras) {
            mixedTotal.textContent = extraValidation.valid
                ? `إجمالي الدفعة: ${fmtNum(collectedCents / 100)} ج.م`
                : extraValidation.message;
            mixedTotal.classList.remove('hidden');
        } else {
            mixedTotal.textContent = '';
            mixedTotal.classList.add('hidden');
        }
    }
    renderIncomeResidentSummary();
    if (!ready) {
        preview.classList.add('hidden');
        if (submit) submit.disabled = false;
        setSubmitLabel('حفظ التحصيل وتوزيعه');
        return;
    }
    setSubmitLabel(hasExtras ? 'حفظ الدفعة المختلطة' : 'حفظ التحصيل وتوزيعه');

    const extraRowsHtml = extraLines.map(line => {
        const label = CRUD_EXTRA_INCOME_PURPOSES.includes(line.purpose)
            ? crudIncomePurposeLabel(line.purpose)
            : 'غرض غير صالح';
        const validAmount = Number.isFinite(line.amount) && line.amount > 0;
        return `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>${esc(label)} · ${esc(crudCashAccountLabel(line.cashAccountCode))}</span><strong class="${validAmount ? 'text-emerald-400' : 'text-rose-400'}">${fmtNum(line.amount)} ج.م</strong></div>`;
    }).join('');
    const totalRowsHtml = hasExtras && extraValidation.valid
        ? `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/60 pt-1.5"><span>إجمالي الدفعة</span><strong>${fmtNum(collectedCents / 100)} ج.م</strong></div>`
        : '';

    const cashAccountCode = /** @type {any} */ (document.getElementById('incomeCashAccount'))?.value || 'main';
    const accountBalance = typeof getCashAccountBalance === 'function' ? getCashAccountBalance(cashAccountCode) : 0;
    const balanceAfter = accountBalance + (Number.isFinite(amount) ? amount : 0);
    const cashRowsHtml = `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>رصيد ${esc(crudCashAccountLabel(cashAccountCode))} قبل التحصيل</span><strong>${fmtNum(accountBalance)} ج.م</strong></div>`
        + `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>${hasExtras ? 'الرصيد بعد إضافة البند الأساسي' : 'الرصيد بعد التحصيل'}</span><strong class="text-emerald-400">${fmtNum(balanceAfter)} ج.م</strong></div>`;
    const notesRowHtml = `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>ملاحظات الدفع</span><strong class="text-left">${esc(notes || '—')}</strong></div>`;

    if (isSettlement) {
        preview.classList.remove('hidden');
        const remaining = settlement ? getSettlementRemainingAmount(settlement) : 0;
        const paid = settlement ? getSettlementPaidAmount(settlement.id) : 0;
        const validAmount = Boolean(settlement && Number.isFinite(amount) && amount > 0
            && Math.round(amount * 100) <= Math.round(remaining * 100) && !hasExtras);
        summary.textContent = !settlement
            ? 'اختر اتفاق تسوية مفتوحًا.'
            : hasExtras
                ? 'لا يمكن دمج بنود إضافية مع سداد التسوية.'
                : !validAmount
                    ? 'المبلغ أكبر من المتبقي في اتفاق التسوية (' + fmtNum(remaining) + ' ج.م).'
                    : 'سيتم تسجيل دفعة نقدية على اتفاق التسوية لشهر ' + month + '.';
        rows.innerHTML = settlement
            ? `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>اتفاق التسوية</span><strong>${esc(month)} · ${esc(settlement.reason || '')}</strong></div>`
                + `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>المبلغ المتفق عليه</span><strong>${fmtNum(settlement.amount)} ج.م</strong></div>`
                + `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>المدفوع سابقًا</span><strong>${fmtNum(paid)} ج.م</strong></div>`
                + `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>المتبقي بعد الدفعة</span><strong class="text-emerald-400">${fmtNum(Math.max(0, remaining - (Number.isFinite(amount) ? amount : 0)))} ج.م</strong></div>`
                + `<div class="flex justify-between items-center gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>الصندوق المستلم</span><strong class="cash-account-tag">${esc(crudCashAccountLabel(cashAccountCode))}</strong></div>`
                + cashRowsHtml + notesRowHtml
            : '';
        if (submit) submit.disabled = !validAmount;
        setSubmitLabel('تسجيل دفعة التسوية');
        return;
    }

    if (!isSubscription) {
        preview.classList.remove('hidden');
        summary.textContent = hasExtras
            ? `بند أساسي «${crudIncomePurposeLabel(purpose)}» بمبلغ ${fmtNum(amount)} ج.م في ${crudCashAccountLabel(cashAccountCode)}، مع ${extraLines.length} بند إضافي. إجمالي الدفعة ${fmtNum(collectedCents / 100)} ج.م.`
            : `سيُسجل تحصيل «${crudIncomePurposeLabel(purpose)}» بمبلغ ${fmtNum(amount)} ج.م في ${crudCashAccountLabel(cashAccountCode)} دون توزيعه على أشهر الاشتراك.`;
        rows.innerHTML = `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>الغرض</span><strong>${esc(crudIncomePurposeLabel(purpose))}</strong></div>`
            + `<div class="flex justify-between items-center gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>الصندوق المستلم</span><strong class="cash-account-tag">${esc(crudCashAccountLabel(cashAccountCode))}</strong></div>`
            + extraRowsHtml + cashRowsHtml + notesRowHtml + totalRowsHtml;
        if (submit) submit.disabled = hasExtras && !extraValidation.valid;
        return;
    }

    const allocation = typeof calculateIncomeAllocationPreview === 'function'
        ? calculateIncomeAllocationPreview(residentId, amount, month, 120, '', selectedMonths)
        : null;
    preview.classList.remove('hidden');
    if (!allocation) {
        summary.textContent = 'تعذر حساب توزيع المبلغ. أعد تحميل الصفحة وحاول مرة أخرى.';
        rows.innerHTML = '';
        if (submit) submit.disabled = true;
        return;
    }
    const debtBefore = resident && typeof calculateCumulativeDebt === 'function'
        ? calculateCumulativeDebt(resident.id).totalDebt
        : 0;
    const overduePaid = /** @type {Array<{ month: string, amount: number, amountCents: number }>} */ (allocation.allocations).reduce((sum, item) => {
        const key = monthKeyOf(item.month);
        const overdue = (typeof isSubscriptionMonthOverdue === 'function' && isSubscriptionMonthOverdue(item.month))
            || Boolean(key && currentKey && key < currentKey);
        return sum + (overdue ? item.amount : 0);
    }, 0);
    const prepaidCents = /** @type {Array<{ month: string, amount: number, amountCents: number }>} */ (allocation.allocations).reduce((sum, item) => {
        const key = monthKeyOf(item.month);
        return sum + (key && currentKey && key > currentKey ? item.amountCents : 0);
    }, 0);
    const debtAfter = Math.max(0, debtBefore - overduePaid);
    const debtRowsHtml = `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>${selectedMonthLate || overduePaid > 0 ? 'المتأخرات بعد الدفعة' : 'المتأخرات الحالية'}</span><strong class="${debtAfter > 0 ? 'text-amber-300' : 'text-emerald-400'}">${fmtNum(Math.max(0, debtAfter))} ج.م</strong></div>`;
    if (allocation.invalidStart) {
        summary.textContent = 'لا يمكن اختيار شهر قبل بداية محاسبة الشقة.';
        rows.innerHTML = '';
        if (submit) submit.disabled = true;
        return;
    }
    if (allocation.invalid || !allocation.allocations.length) {
        summary.textContent = selectedMonths.length
            ? 'الشهور المختارة مسددة بالكامل. اختر شهورًا أخرى من القائمة.'
            : 'اختر شهرًا واحدًا على الأقل من قائمة شهور السداد.';
        rows.innerHTML = '';
        if (submit) submit.disabled = true;
        return;
    }

    const prepaidRowsHtml = prepaidCents > 0
        ? `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>منها دفعة مقدمة</span><strong class="text-sky-300">${fmtNum(prepaidCents / 100)} ج.م</strong></div>`
        : '';
    summary.textContent = allocation.remainingCents > 0
        ? `تم توزيع ${fmtNum(allocation.totalAllocated)} من ${fmtNum(amount)} ج.م. المتبقي ${fmtNum(allocation.remainingAmount)} ج.م أكبر من المستحق في الشهور المختارة والشهور الـ12 التالية؛ قلّل المبلغ أو أضف شهورًا.`
        : `سيتم توزيع ${fmtNum(allocation.totalAllocated)} ج.م على ${fmtNum(allocation.allocations.length)} شهر${prepaidCents > 0 ? '، منها دفعة مقدمة' : ''}.`
            + (selectedMonthLate ? ' الدفعة تشمل شهورًا متأخرة.' : '')
            + (hasExtras ? ` إجمالي الدفعة ${fmtNum(collectedCents / 100)} ج.م.` : '');
    rows.innerHTML = allocation.allocations.map(item => {
        const key = monthKeyOf(item.month);
        const late = Boolean(key && currentKey && key < currentKey);
        const future = Boolean(key && currentKey && key > currentKey);
        const badge = late
            ? ' <span class="text-amber-300">· متأخر</span>'
            : future
                ? ' <span class="text-sky-300">· دفعة مقدمة</span>'
                : '';
        return `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>${esc(item.month)}${badge}</span><strong class="text-emerald-400">${fmtNum(item.amount)} ج.م</strong></div>`;
    }).join('') + extraRowsHtml
        + `<div class="flex justify-between items-center gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>الصندوق المستلم</span><strong class="cash-account-tag">${esc(crudCashAccountLabel(cashAccountCode))}</strong></div>`
        + cashRowsHtml + debtRowsHtml + prepaidRowsHtml + notesRowHtml + totalRowsHtml;
    if (submit) submit.disabled = allocation.remainingCents > 0 || (hasExtras && !extraValidation.valid);
}

async function handleIncomeSubmit(e) {
    if (!requireManager() || incomeSaving) return;
    e.preventDefault();
    if (!validateIncomeWizardStep(1) || !validateIncomeWizardStep(2)) return;
    const residentId = /** @type {any} */ (document.getElementById('incomeResident')).value;
    const amount = Number(/** @type {any} */ (document.getElementById('incomeAmount')).value);
    const notes = /** @type {any} */ (document.getElementById('incomeNotes')).value.trim();
    const paymentMethod = /** @type {any} */ (document.getElementById('incomePaymentMethod')).value;
    const purpose = syncIncomePurposeCashAccount('incomePurpose', 'incomeCashAccount', {
        hintId: 'incomePurposeCashHint'
    });
    const isSubscription = purpose === 'subscription';
    const settlementAdjustment = purpose === 'settlement' ? getIncomeSettlementFromForm() : null;
    const settlementAdjustmentId = settlementAdjustment?.id || null;
    const selectedMonths = isSubscription ? getSelectedIncomeMonths() : [];
    const registrationMonth = /** @type {any} */ (document.getElementById('incomeMonth'))?.value || '';
    let month = isSubscription ? (selectedMonths[0] || registrationMonth || getCurrentMonth()) : registrationMonth;
    if (settlementAdjustment) month = monthKeyToLabel(String(settlementAdjustment.effectiveMonth || '').slice(0, 7));
    const cashAccountCode = /** @type {any} */ (document.getElementById('incomeCashAccount'))?.value || 'main';
    const paymentMethodEnabled = typeof isIncomePaymentMethodEnabled === 'function'
        ? isIncomePaymentMethodEnabled(paymentMethod)
        : Object.prototype.hasOwnProperty.call(INCOME_PAYMENT_METHOD_LABELS, paymentMethod);
    if (!residentId || !Number.isFinite(amount) || amount <= 0
        || (isSubscription ? !selectedMonths.length : !month)
        || !Object.prototype.hasOwnProperty.call(INCOME_PAYMENT_METHOD_LABELS, paymentMethod)
        || !CRUD_INCOME_PURPOSES.includes(purpose)
        || (purpose === 'settlement' && (!settlementAdjustment || settlementAdjustment.residentId !== residentId))
        || !['main', 'development', 'emergency'].includes(cashAccountCode)
        || !paymentMethodEnabled) {
        toast(isSubscription && residentId && !selectedMonths.length
            ? 'اختر شهرًا واحدًا على الأقل من قائمة شهور السداد.'
            : 'اختر الشقة والغرض وطريقة الدفع والشهور والصندوق، وأدخل مبلغاً أكبر من صفر.', 'error');
        return;
    }
    const resident = state.residents.find(item => item.id === residentId);
    if (!resident) {
        toast('الشقة المحددة غير موجودة؛ حدّث القائمة ثم حاول مجدداً', 'error');
        return;
    }
    if ((purpose === 'development' && cashAccountCode !== 'development')
        || (purpose === 'emergency' && cashAccountCode !== 'emergency')) {
        toast('الغرض المحدد يتطلب صندوقه الخاص. اختر الصندوق المطابق ثم أعد المحاولة.', 'error');
        return;
    }
    if (purpose === 'settlement') {
        const remainingCents = Math.round(getSettlementRemainingAmount(settlementAdjustment) * 100);
        if (!settlementAdjustment || Math.round(Number(amount) * 100) > remainingCents) {
            toast('المبلغ أكبر من المتبقي في اتفاق التسوية أو أن الاتفاق لم يعد مفتوحًا.', 'error');
            return;
        }
    }

    const allocation = isSubscription
        ? calculateIncomeAllocationPreview(residentId, amount, month, 120, '', selectedMonths)
        : null;
    if (isSubscription && (!allocation || allocation.invalidStart)) {
        previewIncomeAllocation();
        toast('لا يمكن اختيار شهر قبل بداية محاسبة الشقة.', 'error');
        return;
    }
    if (isSubscription && (!allocation || allocation.invalid || !allocation.allocations.length || allocation.remainingCents > 0)) {
        previewIncomeAllocation();
        toast('تعذر توزيع كامل المبلغ على الشهور المختارة. راجع المعاينة أو عدّل المبلغ والشهور.', 'error');
        return;
    }
    const extraLines = getIncomeExtraLines();
    const extraValidation = validateIncomeExtraLines(extraLines);
    if (!extraValidation.valid) {
        toast(extraValidation.message, 'error');
        return;
    }
    const needsPurposeDetail = purpose === 'other' || extraLines.some(line => line.purpose === 'other');
    if (needsPurposeDetail && !notes) {
        toast('غرض «أخرى» يتطلب كتابة الغرض بالتفصيل في الملاحظات.', 'error');
        return;
    }
    const hasExtras = extraLines.length > 0;
    const allocatedCount = allocation ? allocation.allocations.length : 1;

    incomeSaving = true;
    const submit = /** @type {any} */ (document.getElementById('incomeSubmitButton'));
    if (submit) {
        submit.disabled = true;
        submit.textContent = 'جارٍ الحفظ...';
    }
    const previousState = cloneStateSnapshot();
    const paidAt = new Date().toISOString();
    const paymentReference = generateId().replace(/-/g, '').slice(0, 12).toUpperCase();
    const rows = buildIncomePaymentRows({
        residentId,
        amount,
        month,
        notes,
        paymentMethod,
        purpose,
        cashAccountCode,
        settlementAdjustmentId,
        isSubscription,
        allocation,
        extraLines,
        paidAt,
        paymentReference
    });
    rows.forEach(row => state.income.push(row));

    const collectedTotal = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    if (hasExtras) {
        const breakdown = rows.map(row =>
            `${crudIncomePurposeLabel(row.purposeCode)} ${fmtNum(row.amount)} ج.م (${crudCashAccountLabel(row.cashAccountCode)})`
        ).join(' + ');
        logAction(
            'تحصيل مختلط',
            `${resident.name} - ${fmtNum(collectedTotal)} ج.م - ${getIncomePaymentMethodLabel(paymentMethod)} - ${rows.length} بند - ${breakdown} - ${paymentReference}`
        );
    } else if (isSubscription && allocation) {
        logAction(
            'تحصيل موزع',
            `${resident.name} - ${fmtNum(amount)} ج.م - ${getIncomePaymentMethodLabel(paymentMethod)} - ${crudCashAccountLabel(cashAccountCode)} - ${allocation.allocations.length} شهر - ${paymentReference}`
        );
    } else {
        logAction(
            'تحصيل ' + crudIncomePurposeLabel(purpose),
            `${resident.name} - ${fmtNum(amount)} ج.م - ${getIncomePaymentMethodLabel(paymentMethod)} - ${crudCashAccountLabel(cashAccountCode)} - ${month}`
        );
    }

    try {
        if (!await saveWithRollback(previousState)) return;
        closeModal('incomeModal');
        resetIncomeFormFields();
        renderAll();
        toast(
            hasExtras
                ? `تم تسجيل دفعة مختلطة من ${rows.length} بندًا`
                : allocatedCount > 1
                    ? `تم توزيع التحصيل على ${allocatedCount} أشهر`
                    : 'تم تسجيل التحصيل',
            'success'
        );
        if (typeof openIncomeReceiptModal === 'function' && rows.length) openIncomeReceiptModal(rows[0].id);
    } finally {
        incomeSaving = false;
        if (submit) {
            submit.disabled = false;
            submit.textContent = hasExtras ? 'حفظ الدفعة المختلطة' : 'حفظ التحصيل وتوزيعه';
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
    /** @type {any} */ (document.getElementById('incomeEditResidentSummary')).textContent =
        crudApartmentLabel(resident.apartmentNumber) + ' · ' + resident.name;
    const monthSelect = /** @type {any} */ (document.getElementById('incomeEditMonth'));
    monthSelect.innerHTML = crudIncomeMonthLabels(resident, [payment.month])
        .map(month => '<option value="' + crudHtmlEscape(month) + '">' + crudHtmlEscape(crudIncomeMonthOptionLabel(resident, month)) + '</option>').join('');
    monthSelect.value = payment.month;
    monthSelect.disabled = Boolean(payment.settlementAdjustmentId);
    /** @type {any} */ (document.getElementById('incomeEditAmount')).value = payment.amount;
    const paymentMethodSelect = /** @type {any} */ (document.getElementById('incomeEditPaymentMethod'));
    if (typeof populatePaymentMethodOptions === 'function') {
        populatePaymentMethodOptions(paymentMethodSelect, payment.paymentMethod || '', true);
    }
    if (paymentMethodSelect) paymentMethodSelect.value = payment.paymentMethod || '';
    const cashAccountSelect = /** @type {HTMLSelectElement} */ (document.getElementById('incomeEditCashAccount'));
    if (cashAccountSelect) cashAccountSelect.value = payment.cashAccountCode || 'main';
    const purposeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('incomeEditPurpose'));
    if (purposeSelect && typeof populateIncomePurposeOptions === 'function') {
        populateIncomePurposeOptions(purposeSelect, payment.purposeCode);
    }
    syncIncomePurposeCashAccount('incomeEditPurpose', 'incomeEditCashAccount', {
        forEdit: true,
        hintId: 'incomeEditPurposeHint'
    });
    const distributionNote = String(payment.notes || '').match(/^(دفعة موزعة\s+[A-Z0-9]+\s+\(\d+\/\d+\))(?:\s+·\s+([\s\S]*))?$/i);
    const mixedBatch = isMixedIncomeBatch(payment);
    if (purposeSelect) {
        purposeSelect.disabled = Boolean(distributionNote || payment.settlementAdjustmentId);
        if (payment.settlementAdjustmentId) {
            const hint = document.getElementById('incomeEditPurposeHint');
            if (hint) hint.textContent = 'دفعة مرتبطة باتفاق تسوية؛ لا يمكن تغيير غرضها أو شهرها أو رابط التسوية.';
        } else if (distributionNote) {
            purposeSelect.value = crudIncomePurposeFormCode(payment.purposeCode);
            const hint = document.getElementById('incomeEditPurposeHint');
            if (hint) hint.textContent = mixedBatch
                ? 'هذه دفعة مختلطة؛ لا يمكن تغيير غرض البند أو صندوقه من هنا.'
                : 'هذه دفعة موزعة على أشهر الاشتراك؛ لا يمكن تغيير غرضها من هنا.';
        }
    }
    if (mixedBatch && cashAccountSelect) {
        cashAccountSelect.disabled = true;
        if (typeof cashAccountSelect.setAttribute === 'function') {
            cashAccountSelect.setAttribute('aria-disabled', 'true');
        }
    }
    /** @type {any} */ (document.getElementById('incomeEditNotes')).value = distributionNote ? (distributionNote[2] || '') : (payment.notes || '');
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
    const amount = Number(/** @type {any} */ (document.getElementById('incomeEditAmount')).value);
    const amountCents = Number.isFinite(amount) ? Math.round(amount * 100) : 0;
    const month = /** @type {any} */ (document.getElementById('incomeEditMonth')).value;
    const monthKey = monthLabelToKey(month);
    const notes = /** @type {any} */ (document.getElementById('incomeEditNotes')).value.trim();
    const paymentMethod = /** @type {any} */ (document.getElementById('incomeEditPaymentMethod')).value;
    const purpose = syncIncomePurposeCashAccount('incomeEditPurpose', 'incomeEditCashAccount', {
        forEdit: true,
        hintId: 'incomeEditPurposeHint'
    });
    const cashAccountSelect = /** @type {HTMLSelectElement} */ (document.getElementById('incomeEditCashAccount'));
    const cashAccountCode = cashAccountSelect?.value || 'main';
    const distributionMatch = String(payment.notes || '').match(/^(دفعة موزعة\s+([A-Z0-9]+)\s+\(\d+\/\d+\))(?:\s+·\s+[\s\S]*)?$/i);
    const mixedBatch = isMixedIncomeBatch(payment);
    if (mixedBatch && cashAccountSelect) {
        cashAccountSelect.disabled = true;
        if (typeof cashAccountSelect.setAttribute === 'function') {
            cashAccountSelect.setAttribute('aria-disabled', 'true');
        }
    }
    const paymentMethodEnabled = typeof isIncomePaymentMethodEnabled === 'function'
        ? isIncomePaymentMethodEnabled(paymentMethod)
        : Object.prototype.hasOwnProperty.call(INCOME_PAYMENT_METHOD_LABELS, paymentMethod);
    if (!monthKey || amountCents <= 0
        || !Object.prototype.hasOwnProperty.call(INCOME_PAYMENT_METHOD_LABELS, paymentMethod)
        || !CRUD_INCOME_PURPOSES.includes(purpose)
        || !['main', 'development', 'emergency'].includes(cashAccountCode)
        || (!paymentMethodEnabled && paymentMethod !== (payment.paymentMethod || ''))) {
        toast('اختر شهرًا صحيحًا وغرض التحصيل وطريقة الدفع والصندوق وأدخل مبلغًا أكبر من صفر.', 'error');
        return;
    }
    if ((purpose === 'development' && cashAccountCode !== 'development')
        || (purpose === 'emergency' && cashAccountCode !== 'emergency')) {
        toast('الغرض المحدد يتطلب صندوقه الخاص. اختر الصندوق المطابق ثم أعد المحاولة.', 'error');
        return;
    }
    if (distributionMatch && purpose !== crudIncomePurposeFormCode(payment.purposeCode)) {
        toast(mixedBatch
            ? 'لا يمكن تغيير غرض بند داخل دفعة مختلطة؛ احذف البند وأعد تسجيله إن لزم.'
            : 'لا يمكن تغيير غرض دفعة موزعة على أشهر الاشتراك.', 'error');
        return;
    }
    if (mixedBatch && cashAccountCode !== (payment.cashAccountCode || 'main')) {
        toast('لا يمكن تغيير صندوق بند داخل دفعة مختلطة؛ احذف البند وأعد تسجيله إن لزم.', 'error');
        return;
    }
    const createdMonth = getIncomeBillingStartKey(resident);
    if (createdMonth && monthKey.slice(0, 7) < createdMonth) {
        toast('لا يمكن تسجيل تحصيل قبل بداية محاسبة الشقة.', 'error');
        return;
    }
    if (payment.settlementAdjustmentId) {
        const settlement = (Array.isArray(state.adjustments) ? state.adjustments : [])
            .find(item => item.id === payment.settlementAdjustmentId && item.kind === 'settlement');
        const availableCents = settlement
            ? Math.round(getSettlementRemainingAmount(settlement, payment.id) * 100) : 0;
        if (purpose !== 'settlement' || month !== payment.month || !settlement || amountCents > availableCents) {
            toast('لا يمكن تغيير رابط أو شهر دفعة التسوية، ولا يجوز أن يتجاوز تعديلها المتبقي في الاتفاق.', 'error');
            return;
        }
    } else if (purpose === 'settlement') {
        toast('لا يمكن تحويل تحصيل عادي إلى سداد تسوية من شاشة التعديل. سجّل دفعة جديدة من اتفاق التسوية.', 'error');
        return;
    }
    if (purpose === 'subscription') {
        const dueCents = Math.max(0, Math.round(getSubscriptionAmountForMonth(resident, month) * 100));
        const paidByOthersCents = state.income.reduce((sum, item) => {
            if (item.id === payment.id || item.residentId !== payment.residentId || item.month !== month) return sum;
            if (!crudIsSubscriptionIncome(item)) return sum;
            const value = Number(item.amount);
            return sum + (Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0);
        }, 0);
        const adjustmentCents = typeof getAdjustmentAmountForMonth === 'function'
            ? Math.max(0, Math.round(getAdjustmentAmountForMonth(resident.id, month) * 100))
            : 0;
        const availableCents = Math.max(0, dueCents - adjustmentCents - paidByOthersCents);
        if (amountCents > availableCents) {
            toast('المبلغ أكبر من المتبقي لهذا الشهر (' + fmtNum(availableCents / 100) + ' ج.م).', 'error');
            return;
        }
    }
    if (amountCents === Math.round(Number(payment.amount) * 100)
        && month === payment.month && notes === (payment.notes || '')
        && paymentMethod === (payment.paymentMethod || '')
        && cashAccountCode === (payment.cashAccountCode || 'main')
        && purpose === crudIncomePurposeFormCode(payment.purposeCode)) {
        toast('لم يتم تغيير بيانات التحصيل.', 'info');
        return;
    }
    if (purpose === 'other' && !notes) {
        toast('غرض «أخرى» يتطلب كتابة الغرض بالتفصيل في الملاحظات.', 'error');
        return;
    }

    incomeSaving = true;
    const submit = /** @type {any} */ (document.getElementById('incomeEditSubmitButton'));
    if (submit) {
        submit.disabled = true;
        submit.textContent = 'جارٍ الحفظ...';
    }
    const previousState = cloneStateSnapshot();
    const previousAmount = Number(payment.amount) || 0;
    const previousMonth = payment.month;
    const relatedPayments = distributionMatch
        ? state.income.filter(item => item.residentId === payment.residentId
            && item.date === payment.date
            && String(item.notes || '').startsWith('دفعة موزعة ' + distributionMatch[2] + ' ('))
        : [payment];
    payment.amount = amountCents / 100;
    payment.month = month;
    relatedPayments.forEach(item => {
        item.paymentMethod = paymentMethod;
        if (!mixedBatch) {
            item.cashAccountCode = cashAccountCode;
            item.purposeCode = purpose;
        }
    });
    payment.notes = distributionMatch
        ? distributionMatch[1] + (notes ? ' · ' + notes : '')
        : notes;
    logAction('تعديل تحصيل', resident.name + ' - ' + previousMonth + ' إلى ' + month
        + ' - الغرض: ' + crudIncomePurposeLabel(purpose)
        + ' - طريقة الدفع: ' + getIncomePaymentMethodLabel(paymentMethod)
        + ' - الصندوق: ' + crudCashAccountLabel(cashAccountCode)
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
    if (!confirmRecordDeletion('هذا التحصيل')) return;
    const previousState = cloneStateSnapshot();
    state.income = state.income.filter(i => i.id !== id);
    logAction('حذف تحصيل', id);
    if (!await saveWithRollback(previousState)) return;
    toast('تم حذف التحصيل بنجاح', 'success');
}

function previewExpense() {
    const preview = /** @type {any} */ (document.getElementById('expensePreview'));
    const summary = /** @type {any} */ (document.getElementById('expensePreviewSummary'));
    const details = /** @type {any} */ (document.getElementById('expensePreviewDetails'));
    if (!preview || !summary || !details) return;

    const title = /** @type {any} */ (document.getElementById('expenseTitle'))?.value.trim() || '';
    const amount = Number(/** @type {any} */ (document.getElementById('expenseAmount'))?.value);
    const category = /** @type {any} */ (document.getElementById('expenseCategory'))?.value || '';
    const month = /** @type {any} */ (document.getElementById('expenseMonth'))?.value || '';
    const notes = /** @type {any} */ (document.getElementById('expenseNotes'))?.value.trim() || '';
    const cashAccountCode = /** @type {any} */ (document.getElementById('expenseCashAccount'))?.value || 'main';
    const editingExpense = editingExpenseId ? state.expenses.find(item => item.id === editingExpenseId) : null;
    const accountBalance = getCashAccountBalance(cashAccountCode) +
        (editingExpense && (editingExpense.cashAccountCode || 'main') === cashAccountCode ? (Number(editingExpense.amount) || 0) : 0);
    const monthFundExpenses = state.expenses
        .filter(item => item.month === month && (item.cashAccountCode || 'main') === cashAccountCode && item.id !== editingExpenseId)
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
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
        `<div class="flex justify-between gap-3"><span>الصندوق</span><strong>${esc(crudCashAccountLabel(cashAccountCode))}</strong></div>`,
        `<div class="flex justify-between gap-3"><span>مصروفات الشهر من الصندوق</span><strong>${fmtNum(monthFundExpenses)} ج.م</strong></div>`,
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
    /** @type {any} */ (document.getElementById('expenseForm'))?.reset();
    /** @type {any} */ (document.getElementById('expenseTitle')).value = '';
    /** @type {any} */ (document.getElementById('expenseAmount')).value = '';
    /** @type {any} */ (document.getElementById('expenseNotes')).value = '';
    /** @type {any} */ (document.getElementById('expenseMonth')).value = getCurrentMonth();
    /** @type {any} */ (document.getElementById('expenseCashAccount')).value = 'main';
    /** @type {any} */ (document.getElementById('expenseModalTitle')).textContent = 'مصروف جديد';
    /** @type {any} */ (document.getElementById('expenseSubmitButton')).textContent = 'حفظ المصروف';
    /** @type {any} */ (document.getElementById('expensePreview'))?.classList.add('hidden');
    openModal('expenseModal');
}

function openExpenseEditModal(id) {
    if (!requireManager()) return;
    const expense = state.expenses.find(item => item.id === id);
    if (!expense) { toast('تعذر العثور على المصروف. حدّث السجل ثم حاول مرة أخرى.', 'error'); return; }
    editingExpenseId = id;
    /** @type {any} */ (document.getElementById('expenseTitle')).value = expense.title || '';
    /** @type {any} */ (document.getElementById('expenseAmount')).value = String(expense.amount ?? '');
    /** @type {any} */ (document.getElementById('expenseCategory')).value = expense.category || 'أخرى';
    /** @type {any} */ (document.getElementById('expenseMonth')).value = expense.month || getCurrentMonth();
    /** @type {any} */ (document.getElementById('expenseCashAccount')).value = expense.cashAccountCode || 'main';
    /** @type {any} */ (document.getElementById('expenseNotes')).value = expense.notes || '';
    /** @type {any} */ (document.getElementById('expenseModalTitle')).textContent = 'تعديل المصروف';
    /** @type {any} */ (document.getElementById('expenseSubmitButton')).textContent = 'حفظ التعديل';
    openModal('expenseModal');
    previewExpense();
}

async function handleExpenseSubmit(e) {
    if (!requireManager() || expenseSaving) return;
    e.preventDefault();
    const title = /** @type {any} */ (document.getElementById('expenseTitle')).value.trim();
    const amount = Number(/** @type {any} */ (document.getElementById('expenseAmount')).value);
    const category = /** @type {any} */ (document.getElementById('expenseCategory')).value;
    const month = /** @type {any} */ (document.getElementById('expenseMonth')).value;
    const notes = /** @type {any} */ (document.getElementById('expenseNotes')).value.trim();
    const cashAccountCode = /** @type {any} */ (document.getElementById('expenseCashAccount'))?.value || 'main';
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
        toast('الرصيد المتاح في ' + crudCashAccountLabel(cashAccountCode) + ' غير كافٍ.', 'error');
        previewExpense();
        return;
    }
    expenseSaving = true;
    const submit = /** @type {any} */ (document.getElementById('expenseSubmitButton'));
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
        /** @type {any} */ (document.getElementById('expenseForm')).reset();
        /** @type {any} */ (document.getElementById('expensePreview'))?.classList.add('hidden');
        /** @type {any} */ (document.getElementById('expenseModalTitle')).textContent = 'مصروف جديد';
        renderAll();
        toast(existingExpense ? 'تم تعديل المصروف بنجاح.' : 'تم تسجيل المصروف', 'success');
    } finally {
        expenseSaving = false;
        if (submit) { submit.disabled = false; submit.textContent = 'حفظ المصروف'; }
    }
}

async function deleteExpense(id) {
    if (!requireManager()) return;
    if (!confirmRecordDeletion('هذا المصروف')) return;
    const previousState = cloneStateSnapshot();
    state.expenses = state.expenses.filter(e => e.id !== id);
    logAction('حذف مصروف', id);
    if (!await saveWithRollback(previousState)) return;
    toast('تم حذف المصروف بنجاح', 'success');
}
