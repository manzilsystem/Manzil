const SETTINGS_TABS = ['building','appearance','backup','account'];
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
    const account = document.getElementById('settingsAccountEmail');
    if (account) account.textContent = currentUserRole === 'manager'
        ? (activeSession?.user?.email || '—')
        : 'تسجيل دخول برقم الهاتف';
    const role = document.getElementById('settingsAccountRole');
    if (role) role.textContent = currentUserRole === 'manager' ? 'مدير المبنى' : 'مالك الشقة';
    document.getElementById('settingsPasswordResetBtn')?.classList.toggle('hidden', currentUserRole !== 'manager');
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
    if (!Number.isFinite(defaultSubscription) || defaultSubscription < 0
        || !Number.isFinite(startingBalance) || !validLayout) {
        toast('تحقق من قيم الاشتراك والرصيد وعدد الأدوار والشقق (من 1 إلى 100).', 'error');
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
        if (rollback.error) toast('فشل حفظ الإعدادات، وتعذر التراجع عن إعدادات الأدوار. أعد تحميل المبنى للتحقق.', 'error');
        return;
    }
    renderAll(); updateAccessSwitchButton(); closeModal('settingsModal'); toast('تم حفظ إعدادات العقار', 'success');
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

