// @ts-check
let ownerProvisionRequested = false;
let incomeSaving = false;
let editingIncomeId = null;
let expenseSaving = false;
let editingExpenseId = null;

const CRUD_INCOME_PURPOSES = ['subscription', 'services', 'development', 'emergency', 'penalty', 'donation', 'other'];
const CRUD_INCOME_PURPOSE_LABELS = {
    subscription: 'اشتراك شهري', services: 'خدمات ونظافة', development: 'تطوير',
    emergency: 'صيانة طارئة', penalty: 'غرامة', donation: 'تبرع', other: 'أخرى'
};

function crudIncomePurpose(purpose) {
    const value = String(purpose || '').trim();
    if (typeof normalizeIncomePurpose === 'function') return normalizeIncomePurpose(value);
    return CRUD_INCOME_PURPOSES.includes(value) ? value : 'subscription';
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
    const normalized = crudIncomePurpose(purpose);
    return normalized !== 'services' && normalized !== 'other';
}

function crudIsSubscriptionIncome(payment) {
    if (typeof isSubscriptionIncome === 'function') return isSubscriptionIncome(payment);
    return crudIncomePurpose(payment?.purposeCode) === 'subscription';
}

function crudCashAccountLabel(code) {
    return typeof getCashAccountLabel === 'function' ? getCashAccountLabel(code || 'main') : 'الخزنة الرئيسية';
}

const CRUD_EXTRA_INCOME_PURPOSES = ['services', 'development', 'emergency', 'penalty', 'donation', 'other'];

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

function addIncomeLine(purpose = 'services') {
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
    if (!element) return 'services';
    const purpose = String(element.querySelector('.income-line-purpose')?.value || 'services');
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
    const appendRow = (amount, month, purposeCode, cashAccountCode) => {
        rows.push({ amount, month, purposeCode, cashAccountCode });
    };
    if (options.isSubscription && options.allocation) {
        options.allocation.allocations.forEach(item => {
            appendRow(item.amount, item.month, 'subscription', options.cashAccountCode);
        });
    } else {
        appendRow(options.amount, options.month, options.purpose, options.cashAccountCode);
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

            <section class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button type="button" onclick="openResidentIncomeFromProfile(${residentArg})" class="min-h-11 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-3 py-3 text-xs font-bold"><i class="fa-solid fa-hand-holding-dollar ml-1"></i> تسجيل تحصيل</button>
                <button type="button" onclick="editResidentFromProfile(${residentArg})" class="min-h-11 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-3 py-3 text-xs font-bold"><i class="fa-solid fa-pen ml-1"></i> تعديل بيانات الشقة</button>
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
    amountInput.value = '';
    monthSelect.value = getCurrentMonth();
    paymentMethodSelect.value = '';
    const purposeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('incomePurpose'));
    if (purposeSelect) purposeSelect.value = 'subscription';
    if (notesInput) notesInput.value = '';
    syncIncomePurposeCashAccount('incomePurpose', 'incomeCashAccount', {
        resetUnlocked: true,
        hintId: 'incomePurposeCashHint'
    });
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
    const createdMonth = getLocalMonthKey(resident.createdAt);
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
    const amountInput = /** @type {any} */ (document.getElementById('residentAmount'));
    if (amountInput && editingResidentId === resident.id) amountInput.value = resident.monthlyAmount;
    const summary = /** @type {any} */ (document.getElementById('subscriptionRateResidentSummary'));
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
    const name = /** @type {any} */ (document.getElementById('residentName')).value.trim();
    const apartmentNumber = normalizeApartmentDigits(/** @type {any} */ (document.getElementById('residentApartment')).value);
    const floor = normalizeApartmentDigits(/** @type {any} */ (document.getElementById('residentFloor')).value);
    const phone = /** @type {any} */ (document.getElementById('residentPhone')).value.trim();
    const amountInput = /** @type {any} */ (document.getElementById('residentAmount')).value.trim();
    const monthlyAmount = amountInput === '' ? Number(state.defaultSubscription) || 0 : Number(amountInput);
    const notes = /** @type {any} */ (document.getElementById('residentNotes')).value.trim();
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

    const month = getCurrentMonth();
    const amount = getMonthOutstanding(resident, month);
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
    amountInput.value = amount.toFixed(2);
    monthSelect.value = month;
    paymentMethodSelect.value = '';
    const purposeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('incomePurpose'));
    if (purposeSelect) purposeSelect.value = 'subscription';
    if (notesInput) notesInput.value = 'دفع سريع';
    if (typeof syncIncomePurposeCashAccount === 'function') {
        syncIncomePurposeCashAccount('incomePurpose', 'incomeCashAccount', {
            resetUnlocked: true,
            hintId: 'incomePurposeCashHint'
        });
    }
    clearIncomeExtraLines();

    previewIncomeAllocation();
    openModal('incomeModal');
}

function getIncomePurposeCashHint(purpose, forEdit) {
    if (purpose === 'development') return 'غرض التطوير يُودع في صندوق التطوير فقط.';
    if (purpose === 'emergency') return 'غرض الصيانة الطارئة يُودع في صندوق الصيانة الطارئة فقط.';
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

function handleIncomePurposeChange() {
    syncIncomePurposeCashAccount('incomePurpose', 'incomeCashAccount', {
        resetUnlocked: true,
        hintId: 'incomePurposeCashHint'
    });
    previewIncomeAllocation();
}

function handleIncomeEditPurposeChange() {
    syncIncomePurposeCashAccount('incomeEditPurpose', 'incomeEditCashAccount', {
        forEdit: true,
        resetUnlocked: true,
        hintId: 'incomeEditPurposeHint'
    });
}

function resetIncomeFormFields() {
    /** @type {HTMLFormElement} */ (document.getElementById('incomeForm'))?.reset();
    const purposeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('incomePurpose'));
    if (purposeSelect) purposeSelect.value = 'subscription';
    const monthSelect = /** @type {HTMLSelectElement} */ (document.getElementById('incomeMonth'));
    const currentMonth = getCurrentMonth();
    if (monthSelect?.options && Array.from(monthSelect.options).some(option => option.value === currentMonth)) {
        monthSelect.value = currentMonth;
    }
    syncIncomePurposeCashAccount('incomePurpose', 'incomeCashAccount', {
        resetUnlocked: true,
        hintId: 'incomePurposeCashHint'
    });
    clearIncomeExtraLines();
    /** @type {HTMLElement} */ (document.getElementById('incomeAllocationPreview'))?.classList.add('hidden');
}

function openNewIncomeModal() {
    if (!requireManager()) return;
    if (typeof populateSelects === 'function') populateSelects();
    resetIncomeFormFields();
    openModal('incomeModal');
}

function previewIncomeAllocation() {
    const purpose = syncIncomePurposeCashAccount('incomePurpose', 'incomeCashAccount', {
        hintId: 'incomePurposeCashHint'
    });
    const isSubscription = purpose === 'subscription';
    const monthLabel = document.getElementById('incomeMonthLabel');
    const monthSelect = /** @type {HTMLSelectElement} */ (document.getElementById('incomeMonth'));
    if (monthLabel) monthLabel.textContent = isSubscription ? 'شهر بداية التوزيع' : 'شهر تسجيل التحصيل';
    if (monthSelect && typeof monthSelect.setAttribute === 'function') {
        monthSelect.setAttribute('aria-label', isSubscription ? 'شهر بداية التوزيع' : 'شهر تسجيل التحصيل');
    }
    const policyHelp = /** @type {any} */ (document.getElementById('incomeAllocationPolicyHelp'));
    if (policyHelp) {
        policyHelp.textContent = isSubscription
            ? (state.paymentAllocationPolicy === 'selected_month_first'
                ? 'سيُسدد الشهر المحدد أولًا، ثم تُسوّى الشهور الأقدم، وبعدها الشهور التالية. راجع المعاينة قبل الحفظ.'
                : 'سيُسدد أقدم شهر غير مسدد أولًا، ثم الأشهر التالية بالترتيب. راجع المعاينة قبل الحفظ.')
            : 'هذا الغرض لا يُوزَّع على أشهر الاشتراك؛ يُسجل كمبلغ مستقل في الصندوق المحدد.';
    }
    const preview = /** @type {any} */ (document.getElementById('incomeAllocationPreview'));
    const summary = /** @type {any} */ (document.getElementById('incomeAllocationSummary'));
    const rows = /** @type {any} */ (document.getElementById('incomeAllocationRows'));
    const submit = /** @type {any} */ (document.getElementById('incomeSubmitButton'));
    if (!preview || !summary || !rows) return;

    const residentId = /** @type {any} */ (document.getElementById('incomeResident'))?.value || '';
    const amount = Number(/** @type {any} */ (document.getElementById('incomeAmount'))?.value);
    const month = /** @type {any} */ (document.getElementById('incomeMonth'))?.value || '';
    const outstandingHint = document.getElementById('incomeOutstandingHint');
    if (outstandingHint) {
        const resident = state.residents.find(item => item.id === residentId);
        if (!resident || !month || !isSubscription) {
            outstandingHint.textContent = '';
        } else {
            const outstanding = getMonthOutstanding(resident, month);
            const debt = calculateCumulativeDebt(resident.id);
            const parts = [outstanding > 0
                ? `المتبقي على ${resident.name} في ${month}: ${fmtNum(outstanding)} ج.م`
                : `لا يوجد متبقٍ على ${resident.name} في ${month}`];
            if (debt.count > 0) parts.push(`متأخرات سابقة: ${fmtNum(debt.totalDebt)} ج.م (${debt.count} شهر)`);
            outstandingHint.textContent = parts.join(' · ');
        }
    }
    const extraLines = getIncomeExtraLines();
    const extraValidation = validateIncomeExtraLines(extraLines);
    const hasExtras = extraLines.length > 0;
    const mixedTotal = document.getElementById('incomeMixedTotal');
    const ready = Boolean(residentId && month && Number.isFinite(amount) && amount > 0);
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
    if (!isSubscription) {
        preview.classList.remove('hidden');
        summary.textContent = hasExtras
            ? `بند أساسي «${crudIncomePurposeLabel(purpose)}» بمبلغ ${fmtNum(amount)} ج.م في ${crudCashAccountLabel(cashAccountCode)}، مع ${extraLines.length} بند إضافي. إجمالي الدفعة ${fmtNum(collectedCents / 100)} ج.م.`
            : `سيُسجل تحصيل «${crudIncomePurposeLabel(purpose)}» بمبلغ ${fmtNum(amount)} ج.م في ${crudCashAccountLabel(cashAccountCode)} دون توزيعه على أشهر الاشتراك.`;
        rows.innerHTML = `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>الغرض</span><strong>${esc(crudIncomePurposeLabel(purpose))}</strong></div>`
            + `<div class="flex justify-between items-center gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>الصندوق المستلم</span><strong class="cash-account-tag">${esc(crudCashAccountLabel(cashAccountCode))}</strong></div>`
            + extraRowsHtml + totalRowsHtml;
        if (submit) submit.disabled = hasExtras && !extraValidation.valid;
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
        : `سيتم توزيع ${fmtNum(result.totalAllocated)} ج.م على ${result.allocations.length} شهر، بدءًا من أقدم شهر غير مسدد.`
            + (hasExtras ? ` إجمالي الدفعة ${fmtNum(collectedCents / 100)} ج.م.` : '');
    rows.innerHTML = result.allocations.map(item =>
        `<div class="flex justify-between gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>${esc(item.month)}</span><strong class="text-emerald-400">${fmtNum(item.amount)} ج.م</strong></div>`
    ).join('') + extraRowsHtml
        + `<div class="flex justify-between items-center gap-3 text-[11px] border-t border-slate-700/40 pt-1.5"><span>الصندوق المستلم</span><strong class="cash-account-tag">${esc(crudCashAccountLabel(cashAccountCode))}</strong></div>`
        + totalRowsHtml;
    if (submit) submit.disabled = result.remainingCents > 0 || (hasExtras && !extraValidation.valid);
}

async function handleIncomeSubmit(e) {
    if (!requireManager() || incomeSaving) return;
    e.preventDefault();
    const residentId = /** @type {any} */ (document.getElementById('incomeResident')).value;
    const amount = Number(/** @type {any} */ (document.getElementById('incomeAmount')).value);
    const month = /** @type {any} */ (document.getElementById('incomeMonth')).value;
    const notes = /** @type {any} */ (document.getElementById('incomeNotes')).value.trim();
    const paymentMethod = /** @type {any} */ (document.getElementById('incomePaymentMethod')).value;
    const purpose = syncIncomePurposeCashAccount('incomePurpose', 'incomeCashAccount', {
        hintId: 'incomePurposeCashHint'
    });
    const cashAccountCode = /** @type {any} */ (document.getElementById('incomeCashAccount'))?.value || 'main';
    const paymentMethodEnabled = typeof isIncomePaymentMethodEnabled === 'function'
        ? isIncomePaymentMethodEnabled(paymentMethod)
        : Object.prototype.hasOwnProperty.call(INCOME_PAYMENT_METHOD_LABELS, paymentMethod);
    if (!residentId || !Number.isFinite(amount) || amount <= 0 || !month
        || !Object.prototype.hasOwnProperty.call(INCOME_PAYMENT_METHOD_LABELS, paymentMethod)
        || !CRUD_INCOME_PURPOSES.includes(purpose)
        || !['main', 'development', 'emergency'].includes(cashAccountCode)
        || !paymentMethodEnabled) {
        toast('اختر الشقة والغرض وطريقة الدفع والشهر والصندوق، وأدخل مبلغاً أكبر من صفر.', 'error');
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

    const isSubscription = purpose === 'subscription';
    const allocation = isSubscription ? calculateIncomeAllocationPreview(residentId, amount, month) : null;
    if (isSubscription && (!allocation || allocation.invalid || !allocation.allocations.length || allocation.remainingCents > 0)) {
        previewIncomeAllocation();
        toast('تعذر توزيع كامل المبلغ على فترات الاشتراك. راجع المعاينة أو قلّل المبلغ.', 'error');
        return;
    }
    const extraLines = getIncomeExtraLines();
    const extraValidation = validateIncomeExtraLines(extraLines);
    if (!extraValidation.valid) {
        toast(extraValidation.message, 'error');
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
        resident.name + ' · شقة ' + resident.apartmentNumber;
    const monthSelect = /** @type {any} */ (document.getElementById('incomeEditMonth'));
    monthSelect.innerHTML = getActiveBuildingMonths()
        .map(month => '<option value="' + esc(month) + '">' + esc(month) + '</option>').join('');
    monthSelect.value = payment.month;
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
        purposeSelect.disabled = Boolean(distributionNote);
        if (distributionNote) {
            purposeSelect.value = crudIncomePurpose(payment.purposeCode);
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
    if (distributionMatch && purpose !== crudIncomePurpose(payment.purposeCode)) {
        toast(mixedBatch
            ? 'لا يمكن تغيير غرض بند داخل دفعة مختلطة؛ احذف البند وأعد تسجيله إن لزم.'
            : 'لا يمكن تغيير غرض دفعة موزعة على أشهر الاشتراك.', 'error');
        return;
    }
    if (mixedBatch && cashAccountCode !== (payment.cashAccountCode || 'main')) {
        toast('لا يمكن تغيير صندوق بند داخل دفعة مختلطة؛ احذف البند وأعد تسجيله إن لزم.', 'error');
        return;
    }
    const createdMonth = getLocalMonthKey(resident.createdAt);
    if (createdMonth && monthKey.slice(0, 7) < createdMonth) {
        toast('لا يمكن تسجيل تحصيل قبل تاريخ إنشاء الشقة.', 'error');
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
        const availableCents = Math.max(0, dueCents - paidByOthersCents);
        if (amountCents > availableCents) {
            toast('المبلغ أكبر من المتبقي لهذا الشهر (' + fmtNum(availableCents / 100) + ' ج.م).', 'error');
            return;
        }
    }
    if (amountCents === Math.round(Number(payment.amount) * 100)
        && month === payment.month && notes === (payment.notes || '')
        && paymentMethod === (payment.paymentMethod || '')
        && cashAccountCode === (payment.cashAccountCode || 'main')
        && purpose === crudIncomePurpose(payment.purposeCode)) {
        toast('لم يتم تغيير بيانات التحصيل.', 'info');
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
