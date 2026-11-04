const SETTINGS_TABS = ['building','payments','subscriptions','appearance','backup','receipts','reminders','account'];
function renderReceiptPreview() {
    const input = document.getElementById('settingsReceiptThankYou');
    const preview = document.getElementById('settingsReceiptPreview');
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
    if (!preview) return;
    const template = String(input?.value || '').trim() || DEFAULT_REMINDER_TEMPLATE;
    preview.textContent = renderReminderTemplate(template, {
        name: 'أحمد', building: state.buildingName || 'عمارة النور',
        apartment: '12', month: 'نوفمبر 2026', amount: '1,250',
        count: 3, months: 'سبتمبر 2026، أكتوبر 2026، نوفمبر 2026'
    });
}
const SETTINGS_THEME_NAMES = { dark:'ليلي', light:'نهاري', emerald:'زمردي', ocean:'محيطي', sand:'رملي' };
function switchSettingsTab(tab) {
    if (!SETTINGS_TABS.includes(tab)) return;
    SETTINGS_TABS.forEach(name => {
        const active = name === tab;
        const button = document.getElementById('settings-tab-' + name);
        const panel = document.getElementById('settings-panel-' + name);
        button?.classList.toggle('active', active);
        button?.setAttribute('aria-selected', String(active));
        button?.setAttribute('tabindex', active ? '0' : '-1');
        panel?.classList.toggle('hidden', !active);
    });
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

function openSettingsModal() {
    if (!requireManager()) return;
    document.getElementById('settingsBuildingName').value = state.buildingName||'';
    document.getElementById('settingsManagerName').value = state.managerName||'';
    document.getElementById('settingsManagerPhone').value = state.managerPhone||'';
    document.getElementById('settingsDefaultSub').value = state.defaultSubscription||'';
    document.getElementById('settingsStartingBalance').value = state.startingBalance ?? '';
    document.getElementById('settingsFloorCount').value = state.floorCount || '';
    document.getElementById('settingsApartmentsPerFloor').value = state.apartmentsPerFloor || '';

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
    document.getElementById('settingsSubscriptionDueDay').value = Number(state.subscriptionDueDay) || 1;
    document.getElementById('settingsSubscriptionGraceDays').value = Number(state.subscriptionGraceDays) || 0;
    document.getElementById('settingsPaymentAllocationPolicy').value =
        ['oldest_first', 'selected_month_first'].includes(state.paymentAllocationPolicy)
            ? state.paymentAllocationPolicy
            : 'oldest_first';

    const account = document.getElementById('settingsAccountEmail');
    if (account) account.textContent = currentUserRole === 'manager'
        ? (activeSession?.user?.email || '—')
        : 'تسجيل دخول برقم الهاتف';
    const role = document.getElementById('settingsAccountRole');
    if (role) role.textContent = currentUserRole === 'manager' ? 'مدير المبنى' : 'مالك الشقة';
    document.getElementById('settingsPasswordResetBtn')?.classList.toggle('hidden', currentUserRole !== 'manager');
    const receiptInput = document.getElementById('settingsReceiptThankYou');
    if (receiptInput) {
        try { receiptInput.value = localStorage.getItem(getReceiptSettingsKey()) || ''; }
        catch { receiptInput.value = ''; }
        receiptInput.oninput = renderReceiptPreview;
    }
    renderReceiptPreview();
    const reminderInput = document.getElementById('settingsReminderTemplate');
    if (reminderInput) {
        try { reminderInput.value = localStorage.getItem(getReminderTemplateKey()) || ''; }
        catch { reminderInput.value = ''; }
        reminderInput.oninput = renderReminderPreview;
    }
    renderReminderPreview();
    switchSettingsTab('building');
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
    let messagePreferencesSaved = true;
    try {
        if (receiptThankYou) localStorage.setItem(getReceiptSettingsKey(), receiptThankYou);
        else localStorage.removeItem(getReceiptSettingsKey());
        if (reminderTemplate) localStorage.setItem(getReminderTemplateKey(), reminderTemplate);
        else localStorage.removeItem(getReminderTemplateKey());
    } catch (error) {
        messagePreferencesSaved = false;
        console.error('Could not save message preferences:', error);
    }
    renderAll();
    updateAccessSwitchButton();
    closeModal('settingsModal');
    toast(messagePreferencesSaved
        ? 'تم حفظ إعدادات العقار والتحصيل والاشتراكات والرسائل'
        : 'تم حفظ بيانات العمارة، لكن تعذر حفظ نصوص الرسائل على هذا الجهاز.',
    messagePreferencesSaved ? 'success' : 'error');
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

