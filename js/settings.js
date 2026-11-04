const SETTINGS_TABS = ['building','payments','subscriptions','appearance','backup','receipts','reminders','account'];
function updateSettingsMessageCounter(inputId, counterId, maxLength) {
    const input = document.getElementById(inputId);
    const counter = document.getElementById(counterId);
    if (!input || !counter) return;
    const length = String(input.value || '').length;
    counter.textContent = `${length} / ${maxLength} حرف`;
    counter.classList.toggle('is-near-limit', length >= Math.ceil(maxLength * 0.9));
    counter.classList.toggle('is-at-limit', length >= maxLength);
}

function renderReceiptPreview() {
    const input = document.getElementById('settingsReceiptThankYou');
    const preview = document.getElementById('settingsReceiptPreview');
    updateSettingsMessageCounter('settingsReceiptThankYou', 'settingsReceiptCharacterCount', 180);
    if (!preview) return;
    const thankYou = String(input?.value || '').trim() || DEFAULT_RECEIPT_THANK_YOU;
    preview.textContent = [
        `إيصال استلام — ${state.buildingName || 'العمارة'}`,
        '', 'مرحباً أحمد،', 'نؤكد استلام دفعة الاشتراك بنجاح.',
        'الشقة: 12', 'المبلغ المستلم: 500 ج.م', 'طريقة الدفع: نقدًا',
        'تفاصيل السداد:', '• نوفمبر 2026: 500 ج.م',
        'تاريخ الاستلام: 04/11/2026', 'رقم الإيصال: SAMPLE-001', '', thankYou
    ].join('\n');
}
function renderReminderPreview() {
    const input = document.getElementById('settingsReminderTemplate');
    const preview = document.getElementById('settingsReminderPreview');
    updateSettingsMessageCounter('settingsReminderTemplate', 'settingsReminderCharacterCount', 500);
    if (!preview) return;
    const template = String(input?.value || '').trim() || DEFAULT_REMINDER_TEMPLATE;
    preview.textContent = renderReminderTemplate(template, {
        name: 'أحمد', building: state.buildingName || 'عمارة النور',
        apartment: '12', month: 'نوفمبر 2026', amount: '1,250',
        count: 3, months: 'سبتمبر 2026، أكتوبر 2026، نوفمبر 2026'
    });
}
const SETTINGS_THEME_NAMES = { dark:'ليلي', light:'نهاري', emerald:'زمردي', ocean:'محيطي', sand:'رملي', turquoise:'فيروزي' };
function showSettingsOverview() {
    document.getElementById('settingsOverview')?.classList.remove('hidden');
    document.getElementById('settingsSectionToolbar')?.classList.add('hidden');
    document.querySelectorAll('.settings-panel').forEach(panel => panel.classList.add('hidden'));
    document.getElementById('settingsSaveButton')?.classList.add('hidden');
    document.querySelector('.settings-footer')?.classList.add('settings-footer-overview');
    document.getElementById('settingsModalTitle').innerHTML = '<i class="fa-solid fa-gear ml-2"></i> الإعدادات';
}
function switchSettingsTab(tab) {
    if (!SETTINGS_TABS.includes(tab)) return;
    document.getElementById('settingsOverview')?.classList.add('hidden');
    document.getElementById('settingsSectionToolbar')?.classList.remove('hidden');
    document.getElementById('settingsSaveButton')?.classList.remove('hidden');
    document.querySelector('.settings-footer')?.classList.remove('settings-footer-overview');
    const titles = {
        building: 'بيانات العمارة', payments: 'طرق التحصيل', subscriptions: 'الاشتراكات',
        appearance: 'المظهر والثيمات', backup: 'النسخ الاحتياطي', receipts: 'الإيصالات',
        reminders: 'التذكيرات', account: 'الحساب والصلاحيات'
    };
    if (tab === 'backup') loadSettingsBackupSummary();
    const title = titles[tab];
    const titleNode = document.getElementById('settingsCurrentSectionTitle');
    if (titleNode) titleNode.textContent = title;
    const modalTitle = document.getElementById('settingsModalTitle');
    if (modalTitle) modalTitle.textContent = title;
    SETTINGS_TABS.forEach(name => {
        document.getElementById('settings-panel-' + name)?.classList.toggle('hidden', name !== tab);
    });
    document.getElementById('settings-content')?.scrollTo?.({ top: 0, behavior: 'auto' });
    document.getElementById('settingsSectionToolbar')?.scrollIntoView?.({ block: 'start' });
}

function handleSettingsTabKeydown(event) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const currentIndex = SETTINGS_TABS.findIndex(name => document.activeElement?.id === 'settings-tab-' + name);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
            ? SETTINGS_TABS.length - 1
            : (currentIndex + (event.key === 'ArrowLeft' ? 1 : -1) + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    const nextTab = SETTINGS_TABS[nextIndex];
    switchSettingsTab(nextTab);
    document.getElementById('settings-tab-' + nextTab)?.focus();
}
function updateThemeSelection() {
    const theme = SETTINGS_THEME_NAMES[state.currentTheme] ? state.currentTheme : 'dark';
    document.querySelectorAll('[data-theme-option]').forEach(button => {
        const active = button.dataset.themeOption === theme;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    const label = document.getElementById('settingsCurrentTheme');
    if (label) label.textContent = SETTINGS_THEME_NAMES[theme];
}

function renderSettingsOwnerAccess() {
    const container = document.getElementById('settingsOwnerAccessList');
    if (!container) return;
    const residents = [...(state.residents || [])].sort((a, b) =>
        String(a.apartmentNumber || '').localeCompare(String(b.apartmentNumber || ''), 'ar', { numeric: true })
    );
    if (!residents.length) {
        container.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">أضف الشقق أولًا لعرض حسابات الملاك.</p>';
        return;
    }
    container.innerHTML = residents.map(resident => {
        const linked = Boolean(resident.userId);
        const hasPhone = Boolean(String(resident.phone || '').trim());
        const status = linked ? 'حساب مرتبط' : hasPhone ? 'لم يُنشأ حساب' : 'لا يوجد رقم جوال';
        const statusClass = linked ? 'text-emerald-500' : hasPhone ? 'text-amber-500' : 'text-slate-500';
        const provisionButton = hasPhone
            ? `<button type="button" class="settings-owner-action" onclick="provisionOwnerAccess('${esc(resident.id)}')">${linked ? 'إعادة إصدار PIN' : 'إنشاء حساب المالك'}</button>`
            : '';
        return `<article class="settings-owner-row">
            <div class="min-w-0"><b>شقة ${esc(resident.apartmentNumber || '—')} · ${esc(resident.name || '—')}</b>
                <p class="text-[11px] text-slate-500" dir="auto">${esc(resident.phone || 'لا يوجد رقم جوال')}</p>
                <p class="text-[11px] font-bold ${statusClass}">${status}</p>
            </div>
            <div class="settings-owner-actions">${provisionButton}
                <button type="button" class="settings-owner-action secondary" onclick="editResident('${esc(resident.id)}')">تعديل الشقة</button>
            </div>
        </article>`;
    }).join('');
}

function syncPaymentMethodDetails() {
    const methods = [
        { toggle: 'settingsPaymentWalletEnabled', details: 'settingsWalletDetails' },
        { toggle: 'settingsPaymentInstapayEnabled', details: 'settingsInstapayDetails' },
        { toggle: 'settingsPaymentBankEnabled', details: 'settingsBankDetails' }
    ];
    methods.forEach(({ toggle: toggleId, details: detailsId }) => {
        const toggle = document.getElementById(toggleId);
        const details = document.getElementById(detailsId);
        if (!toggle || !details) return;
        const enabled = toggle.checked;
        details.hidden = !enabled;
        details.classList.toggle('hidden', !enabled);
        details.setAttribute('aria-hidden', String(!enabled));
        toggle.setAttribute('aria-expanded', String(enabled));
        details.querySelectorAll('input, select, textarea').forEach(field => {
            field.disabled = !enabled;
        });
        toggle.onchange = syncPaymentMethodDetails;
        toggle.closest('.settings-payment-card')?.classList.toggle('is-disabled', !enabled);
    });
}

function renderSubscriptionRulePreview() {
    const preview = document.getElementById('settingsSubscriptionRulePreview');
    if (!preview) return;
    const dueDay = Number(document.getElementById('settingsSubscriptionDueDay')?.value);
    const graceDays = Number(document.getElementById('settingsSubscriptionGraceDays')?.value);
    const policy = document.getElementById('settingsPaymentAllocationPolicy')?.value;
    const dueLabel = Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 28
        ? `يوم ${dueDay} من كل شهر`
        : 'لم يتم تحديد يوم الاستحقاق';
    const graceLabel = Number.isInteger(graceDays) && graceDays >= 0 && graceDays <= 31
        ? (graceDays === 0 ? 'بدون فترة سماح' : `${graceDays} يوم`)
        : 'فترة السماح غير صحيحة';
    const policyLabel = policy === 'selected_month_first'
        ? 'الشهر المحدد أولًا، ثم الشهور الأقدم'
        : 'الشهور الأقدم أولًا';
    preview.textContent = [
        `موعد الاستحقاق: ${dueLabel}`,
        `فترة السماح: ${graceLabel}`,
        `توزيع الدفعات: ${policyLabel}`,
        'يبدأ التأخير بعد انتهاء يوم الاستحقاق وفترة السماح.'
    ].join('\n');
}

async function loadSettingsBackupSummary() {
    const summary = document.getElementById('settingsBackupSummaryText');
    const meta = document.getElementById('settingsBackupSummaryMeta');
    if (!summary || typeof callBackupConsole !== 'function') return;
    if (typeof requireManager === 'function' && !requireManager()) return;
    summary.textContent = 'جارٍ التحقق من حالة النسخ على الخادم...';
    if (meta) meta.textContent = '';
    try {
        const data = await callBackupConsole({ action: 'list' });
        const backups = Array.isArray(data.backups) ? data.backups : [];
        const restoreRequests = Array.isArray(data.restoreRequests) ? data.restoreRequests : [];
        const backupRequests = Array.isArray(data.backupRequests) ? data.backupRequests : [];
        const pendingRestore = restoreRequests.some(item => ['queued', 'running'].includes(item.status));
        const pendingBackup = backupRequests.some(item => ['queued', 'dispatched'].includes(item.status));
        if (pendingRestore) {
            summary.textContent = 'توجد عملية استعادة قيد التنفيذ. لا تبدأ عملية أخرى حتى تنتهي.';
        } else if (pendingBackup) {
            summary.textContent = 'طلب إنشاء نسخة احتياطية قيد التنفيذ.';
        } else if (backups.length) {
            const latest = new Date(backups[0].created_at);
            summary.textContent = Number.isNaN(latest.getTime())
                ? 'تم العثور على نسخ احتياطية محفوظة على الخادم.'
                : 'آخر نسخة ناجحة: ' + latest.toLocaleString('ar-EG');
        } else {
            summary.textContent = 'لا توجد نسخ مسجلة على الخادم حتى الآن.';
        }
        if (meta) meta.textContent = backups.length + ' نسخة متاحة للاستعادة أو التنزيل.'
            + (data.canDownload === true ? ' التنزيل الكامل متاح لهذا الحساب.' : ' التنزيل الكامل غير متاح لهذا الحساب.');
    } catch (error) {
        summary.textContent = 'تعذر جلب حالة النسخ من الخادم. استخدم زر التحديث أو افتح إدارة النسخ للمحاولة مرة أخرى.';
        if (meta) meta.textContent = 'لم يتم الاعتماد على بيانات محلية قديمة في هذا الملخص.';
        console.error('Settings backup summary error:', error);
    }
}

function renderBuildingLayoutPreview() {
    const preview = document.getElementById('settingsBuildingLayoutPreview');
    if (!preview) return;
    const floors = Number(document.getElementById('settingsFloorCount')?.value || 0);
    const apartmentsPerFloor = Number(document.getElementById('settingsApartmentsPerFloor')?.value || 0);
    if (floors === 0 && apartmentsPerFloor === 0) {
        preview.textContent = 'حدد عدد الأدوار والشقق لعرض التوزيع.';
        return;
    }
    if (!Number.isInteger(floors) || !Number.isInteger(apartmentsPerFloor)
        || floors < 1 || floors > 100 || apartmentsPerFloor < 1 || apartmentsPerFloor > 100) {
        preview.textContent = 'أدخل عدد الأدوار وعدد الشقق معًا، من 1 إلى 100 لكل قيمة.';
        return;
    }
    const total = floors * apartmentsPerFloor;
    const lastStart = total - apartmentsPerFloor + 1;
    preview.textContent = [
        `${floors} دور × ${apartmentsPerFloor} شقة = ${total} شقة`,
        `الدور الأول: الشقق 1–${apartmentsPerFloor}`,
        `الدور الأخير: الشقق ${lastStart}–${total}`
    ].join('\n');
}

function openSettingsModal() {
    if (!requireManager()) return;
    document.getElementById('settingsBuildingName').value = state.buildingName||'';
    document.getElementById('settingsManagerName').value = state.managerName||'';
    document.getElementById('settingsManagerPhone').value = state.managerPhone||'';
    document.getElementById('settingsDefaultSub').value = state.defaultSubscription||'';
    document.getElementById('settingsStartingBalance').value = state.startingBalance ?? '';
    document.getElementById('settingsFloorCount').value = state.floorCount || '';
    document.getElementById('settingsApartmentsPerFloor').value = state.apartmentsPerFloor || '';
    ['settingsFloorCount', 'settingsApartmentsPerFloor'].forEach(id => {
        const field = document.getElementById(id);
        if (!field) return;
        field.oninput = renderBuildingLayoutPreview;
        field.onchange = renderBuildingLayoutPreview;
    });
    renderBuildingLayoutPreview();

    const paymentSettings = normalizePaymentSettings(state.paymentSettings);
    document.getElementById('settingsPaymentCashEnabled').checked = paymentSettings.cash.enabled;
    document.getElementById('settingsPaymentWalletEnabled').checked = paymentSettings.wallet.enabled;
    document.getElementById('settingsWalletProvider').value = paymentSettings.wallet.provider;
    document.getElementById('settingsWalletAccountName').value = paymentSettings.wallet.accountName;
    document.getElementById('settingsWalletNumber').value = paymentSettings.wallet.number;
    document.getElementById('settingsPaymentInstapayEnabled').checked = paymentSettings.instapay.enabled;
    document.getElementById('settingsInstapayAccountName').value = paymentSettings.instapay.accountName;
    document.getElementById('settingsInstapayAddress').value = paymentSettings.instapay.address;
    document.getElementById('settingsPaymentBankEnabled').checked = paymentSettings.bank_transfer.enabled;
    document.getElementById('settingsBankName').value = paymentSettings.bank_transfer.bankName;
    document.getElementById('settingsBankAccountName').value = paymentSettings.bank_transfer.accountName;
    document.getElementById('settingsBankAccountNumber').value = paymentSettings.bank_transfer.accountNumber;
    document.getElementById('settingsBankIban').value = paymentSettings.bank_transfer.iban;
    syncPaymentMethodDetails();
    document.getElementById('settingsSubscriptionDueDay').value = Number(state.subscriptionDueDay) || 1;
    document.getElementById('settingsSubscriptionGraceDays').value = Number(state.subscriptionGraceDays) || 0;
    document.getElementById('settingsPaymentAllocationPolicy').value =
        ['oldest_first', 'selected_month_first'].includes(state.paymentAllocationPolicy)
            ? state.paymentAllocationPolicy
            : 'oldest_first';
    ['settingsSubscriptionDueDay', 'settingsSubscriptionGraceDays', 'settingsPaymentAllocationPolicy'].forEach(id => {
        const field = document.getElementById(id);
        if (!field) return;
        field.oninput = renderSubscriptionRulePreview;
        field.onchange = renderSubscriptionRulePreview;
    });
    renderSubscriptionRulePreview();

    renderSettingsOwnerAccess();
    const account = document.getElementById('settingsAccountEmail');
    if (account) account.textContent = currentUserRole === 'manager'
        ? (activeSession?.user?.email || '—')
        : 'تسجيل دخول برقم الهاتف';
    const role = document.getElementById('settingsAccountRole');
    if (role) role.textContent = currentUserRole === 'manager' ? 'مدير المبنى' : 'مالك الشقة';
    document.getElementById('settingsPasswordResetBtn')?.classList.toggle('hidden', currentUserRole !== 'manager');
    const receiptInput = document.getElementById('settingsReceiptThankYou');
    if (receiptInput) {
        try { receiptInput.value = state.receiptThankYouTemplate ?? (localStorage.getItem(getReceiptSettingsKey()) || ''); }
        catch { receiptInput.value = state.receiptThankYouTemplate || ''; }
        receiptInput.oninput = renderReceiptPreview;
    }
    renderReceiptPreview();
    const reminderInput = document.getElementById('settingsReminderTemplate');
    if (reminderInput) {
        try { reminderInput.value = state.reminderMessageTemplate ?? (localStorage.getItem(getReminderTemplateKey()) || ''); }
        catch { reminderInput.value = state.reminderMessageTemplate || ''; }
        reminderInput.oninput = renderReminderPreview;
    }
    renderReminderPreview();
    showSettingsOverview();
    updateThemeSelection();
    openModal('settingsModal');
}

async function saveSettings() {
    if (!requireManager()) return;
    const defaultSubscription = Number(document.getElementById('settingsDefaultSub').value || 0);
    const startingBalance = Number(document.getElementById('settingsStartingBalance').value || 0);
    const floorCount = Number(document.getElementById('settingsFloorCount').value || 0);
    const apartmentsPerFloor = Number(document.getElementById('settingsApartmentsPerFloor').value || 0);
    const validLayout = (floorCount === 0 && apartmentsPerFloor === 0)
        || (Number.isInteger(floorCount) && floorCount >= 1 && floorCount <= 100
            && Number.isInteger(apartmentsPerFloor) && apartmentsPerFloor >= 1 && apartmentsPerFloor <= 100);
    const subscriptionDueDay = Number(document.getElementById('settingsSubscriptionDueDay').value);
    const subscriptionGraceDays = Number(document.getElementById('settingsSubscriptionGraceDays').value);
    const paymentAllocationPolicy = document.getElementById('settingsPaymentAllocationPolicy').value;
    const validSubscriptionRules = Number.isInteger(subscriptionDueDay) && subscriptionDueDay >= 1 && subscriptionDueDay <= 28
        && Number.isInteger(subscriptionGraceDays) && subscriptionGraceDays >= 0 && subscriptionGraceDays <= 31
        && ['oldest_first', 'selected_month_first'].includes(paymentAllocationPolicy);
    const paymentSettings = normalizePaymentSettings({
        cash: { enabled: document.getElementById('settingsPaymentCashEnabled').checked },
        wallet: {
            enabled: document.getElementById('settingsPaymentWalletEnabled').checked,
            provider: document.getElementById('settingsWalletProvider').value,
            accountName: document.getElementById('settingsWalletAccountName').value,
            number: document.getElementById('settingsWalletNumber').value
        },
        instapay: {
            enabled: document.getElementById('settingsPaymentInstapayEnabled').checked,
            accountName: document.getElementById('settingsInstapayAccountName').value,
            address: document.getElementById('settingsInstapayAddress').value
        },
        bank_transfer: {
            enabled: document.getElementById('settingsPaymentBankEnabled').checked,
            bankName: document.getElementById('settingsBankName').value,
            accountName: document.getElementById('settingsBankAccountName').value,
            accountNumber: document.getElementById('settingsBankAccountNumber').value,
            iban: document.getElementById('settingsBankIban').value
        }
    });
    const hasEnabledPaymentMethod = Object.values(paymentSettings).some(method => method.enabled);
    if (!Number.isFinite(defaultSubscription) || defaultSubscription < 0
        || !Number.isFinite(startingBalance) || !validLayout) {
        toast('تحقق من قيم الاشتراك والرصيد وعدد الأدوار والشقق (من 1 إلى 100).', 'error');
        return;
    }
    if (!validSubscriptionRules) {
        toast('يجب أن يكون يوم الاستحقاق من 1 إلى 28، وفترة السماح من 0 إلى 31 يومًا.', 'error');
        return;
    }
    if (!hasEnabledPaymentMethod) {
        toast('فعّل وسيلة دفع واحدة على الأقل قبل حفظ الإعدادات.', 'error');
        return;
    }
    const receiptInput = document.getElementById('settingsReceiptThankYou');
    const receiptThankYou = String(receiptInput?.value || '').trim();
    const reminderInput = document.getElementById('settingsReminderTemplate');
    const reminderTemplate = String(reminderInput?.value || '').trim();
    if (receiptThankYou.length > 180 || reminderTemplate.length > 500) {
        toast('تحقق من طول رسالة الإيصال أو التذكير.', 'error');
        return;
    }
    const previousState = cloneStateSnapshot();
    state.buildingName = document.getElementById('settingsBuildingName').value.trim();
    state.managerName = document.getElementById('settingsManagerName').value.trim();
    state.managerPhone = document.getElementById('settingsManagerPhone').value.trim();
    state.defaultSubscription = defaultSubscription;
    state.startingBalance = startingBalance;
    state.floorCount = floorCount;
    state.apartmentsPerFloor = apartmentsPerFloor;
    state.paymentSettings = paymentSettings;
    state.subscriptionDueDay = subscriptionDueDay;
    state.subscriptionGraceDays = subscriptionGraceDays;
    state.paymentAllocationPolicy = paymentAllocationPolicy;

    logAction('تعديل إعدادات التحصيل والاشتراك',
        `طرق الدفع المفعّلة: ${Object.entries(paymentSettings).filter(([, method]) => method.enabled).map(([key]) => getIncomePaymentMethodLabel(key)).join('، ')} · الاستحقاق يوم ${subscriptionDueDay} · السماح ${subscriptionGraceDays} يوم`);

    const { data: layoutResult, error: layoutError } = await supabaseClient.rpc('set_building_apartment_layout', {
        p_building_id: activeBuildingId,
        p_floor_count: floorCount,
        p_apartments_per_floor: apartmentsPerFloor
    });
    if (layoutError || !layoutResult?.ok) {
        state = previousState;
        toast('تعذر حفظ إعدادات الأدوار والشقق. لم يتم اعتماد التغيير.', 'error');
        return;
    }
    if (!await saveWithRollback(previousState)) {
        const rollback = await supabaseClient.rpc('set_building_apartment_layout', {
            p_building_id: activeBuildingId,
            p_floor_count: previousState.floorCount || 0,
            p_apartments_per_floor: previousState.apartmentsPerFloor || 0
        });
        if (rollback.error || !rollback.data?.ok) toast('فشل حفظ الإعدادات، وتعذر التراجع عن إعدادات الأدوار. أعد تحميل المبنى للتحقق.', 'error');
        return;
    }
    const { data: messageSettingsRow, error: messageSettingsError } = await supabaseClient.from('buildings')
        .update({
            receipt_thank_you_template: receiptThankYou || null,
            arrears_reminder_template: reminderTemplate || null
        })
        .eq('id', activeBuildingId)
        .select('id')
        .maybeSingle();
    if (messageSettingsError || !messageSettingsRow?.id) {
        console.error('Could not save building message templates:', messageSettingsError || 'manager update returned no row');
        toast('تم حفظ بقية الإعدادات، لكن تعذر حفظ قوالب الرسائل على الخادم. أعد المحاولة.', 'error');
        return;
    }
    state.receiptThankYouTemplate = receiptThankYou || null;
    state.reminderMessageTemplate = reminderTemplate || null;
    try {
        localStorage.removeItem(getReceiptSettingsKey());
        localStorage.removeItem(getReminderTemplateKey());
    } catch (error) {
        console.warn('Legacy message template cleanup failed:', error);
    }
    renderAll();
    updateAccessSwitchButton();
    closeModal('settingsModal');
    toast('تم حفظ إعدادات العقار والتحصيل والاشتراكات والرسائل ومزامنتها بين الأجهزة', 'success');
}

async function sendSettingsPasswordReset() {
    if (!requireManager()) return;
    const email = activeSession?.user?.email;
    if (!email) { toast('لا يوجد بريد إلكتروني مرتبط بحساب المدير', 'error'); return; }
    const button = document.getElementById('settingsPasswordResetBtn');
    if (button) { button.disabled = true; button.textContent = 'جارٍ إرسال الرابط...'; }
    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
        if (error) throw error;
        toast('تم إرسال رابط تغيير كلمة المرور إلى بريد المدير', 'success');
    } catch (error) {
        console.error('Settings password reset error:', error);
        toast('تعذر إرسال رابط تغيير كلمة المرور', 'error');
    } finally {
        if (button) { button.disabled = false; button.textContent = 'إرسال رابط تغيير كلمة مرور المدير'; }
    }
}

