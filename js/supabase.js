let supabaseClient = null;
let supabaseProfile = null;
let supabasePendingWrite = Promise.resolve();
let supabaseAuthSubscription = null;

function isSupabaseConfigured() {
    const config = window.MANZIL_SUPABASE_CONFIG || {};
    return typeof config.url === 'string' && /^https:\/\//.test(config.url)
        && typeof config.publishableKey === 'string'
        && /^(sb_publishable_|eyJ)/.test(config.publishableKey);
}

function isSupabaseRuntimeActive() {
    return Boolean(supabaseClient && supabaseProfile && ['manager', 'owner'].includes(currentUserRole));
}

function resetAppDataInMemory() {
    state = {
        buildingName: '', managerName: '', managerPhone: '', defaultSubscription: 0, startingBalance: 0,
        pinCode: '0000', pinEnabled: false, currentTheme: 'dark',
        residents: [], income: [], expenses: [], notices: [], auditLogs: [], lastUpdated: 0
    };
    supabaseProfile = null;
    currentUserRole = null;
    currentResidentId = null;
}

function showSupabaseLogin(message = '') {
    resetAppDataInMemory();
    document.body.classList.add('session-locked');
    document.body.classList.remove('owner-mode');
    const gate = document.getElementById('authGate');
    const setup = document.getElementById('supabaseSetupNotice');
    if (gate) gate.classList.remove('hidden');
    if (setup) setup.classList.toggle('hidden', isSupabaseConfigured());
    document.getElementById('loginModeTabs')?.classList.toggle('hidden', !isSupabaseConfigured());
    document.getElementById('adminLoginForm')?.classList.toggle('hidden', !isSupabaseConfigured());
    document.getElementById('ownerLoginForm')?.classList.add('hidden');
    if (isSupabaseConfigured()) setLoginMode('admin');
    const error = document.getElementById('authError');
    if (error) {
        error.textContent = message;
        error.classList.toggle('hidden', !message);
    }
    const status = document.getElementById('syncStatus');
    if (status) status.textContent = isSupabaseConfigured() ? 'يلزم تسجيل الدخول' : 'يلزم إعداد Supabase';
    updateAccessSwitchButton();
}

function clearLegacyGitHubSecrets() {
    // Older builds stored a GitHub token in localStorage. It is not used by this
    // version and is removed rather than being exposed to an owner session.
    try {
        localStorage.removeItem('manzil_gh_token');
        localStorage.removeItem('manzil_gh_gist');
    } catch (error) {
        console.warn('تعذر إزالة إعدادات مزامنة GitHub القديمة من هذا المتصفح.');
    }
}

function throwSupabaseError(error, context) {
    if (!error) return;
    console.error(`${context}:`, error);
    throw new Error(error.message || context);
}

async function queryRows(table, columns = 'id,data') {
    const { data, error } = await supabaseClient.from(table).select(columns);
    throwSupabaseError(error, `تعذر قراءة ${table}`);
    return data || [];
}

async function loadAuthorizedAppState(expectedRole = null) {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    throwSupabaseError(sessionError, 'تعذر استعادة جلسة الدخول');
    if (!session) {
        showSupabaseLogin();
        return false;
    }

    const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('id, building_id, role, apartment_id, display_name, phone')
        .eq('id', session.user.id)
        .maybeSingle();
    throwSupabaseError(profileError, 'تعذر قراءة صلاحيات الحساب');
    if (!profile || !['admin', 'owner'].includes(profile.role) || (profile.role === 'owner' && !profile.apartment_id)) {
        await supabaseClient.auth.signOut({ scope: 'local' });
        showSupabaseLogin('الحساب غير مربوط بدور أو شقة. اطلب من المدير تفعيل الحساب.');
        return false;
    }
    if (expectedRole && profile.role !== expectedRole) {
        await supabaseClient.auth.signOut({ scope: 'local' });
        showSupabaseLogin(expectedRole === 'admin' ? 'هذا الحساب ليس حساب إدارة.' : 'هذا الحساب ليس حساب مالك.');
        return false;
    }

    supabaseProfile = profile;
    currentUserRole = profile.role === 'admin' ? 'manager' : 'owner';
    currentResidentId = profile.role === 'owner' ? profile.apartment_id : null;

    const [buildingRows, apartmentRows, incomeRows, expenseRows, noticeRows, settingsRows, auditRows] = await Promise.all([
        queryRows('buildings', 'id,name,default_subscription'),
        queryRows('apartments', 'id,data'),
        queryRows('income_records', 'id,apartment_id,data'),
        queryRows('expenses', 'id,data'),
        queryRows('building_notices', 'id,data'),
        queryRows('app_settings', 'building_id,data'),
        queryRows('audit_logs', 'id,data')
    ]);

    const building = buildingRows.find(row => row.id === profile.building_id);
    const settings = settingsRows[0]?.data || {};
    const cleanJsonRows = rows => rows.map(row => ({ ...(row.data || {}), id: row.id }));
    state = {
        buildingName: building?.name || '',
        managerName: settings.managerName || '',
        managerPhone: settings.managerPhone || '',
        defaultSubscription: Number(settings.defaultSubscription ?? building?.default_subscription) || 0,
        startingBalance: Number(settings.startingBalance) || 0,
        currentTheme: ['dark', 'light', 'emerald'].includes(settings.currentTheme) ? settings.currentTheme : 'dark',
        pinCode: '0000', pinEnabled: false,
        residents: apartmentRows.map(row => {
            const resident = { ...(row.data || {}), id: row.id };
            delete resident.ownerPin;
            delete resident.pinCode;
            return resident;
        }),
        income: incomeRows.map(row => ({ ...(row.data || {}), id: row.id, residentId: row.apartment_id })),
        expenses: cleanJsonRows(expenseRows),
        notices: noticeRows.map(row => ({ ...(row.data || {}), id: row.id })),
        auditLogs: cleanJsonRows(auditRows),
        lastUpdated: Number(settings.lastUpdated) || 0
    };

    document.body.classList.remove('session-locked');
    document.body.classList.toggle('owner-mode', currentUserRole === 'owner');
    document.querySelectorAll('.admin-only').forEach(element => element.classList.toggle('hidden', currentUserRole !== 'manager'));
    document.getElementById('authGate')?.classList.add('hidden');
    document.body.setAttribute('data-theme', state.currentTheme);
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', state.currentTheme === 'light' ? '#f1f5f9' : state.currentTheme === 'emerald' ? '#021a13' : '#090d16');

    renderAll();
    if (currentUserRole === 'owner') renderOwnerPortal();
    if (currentUserRole === 'manager') populateOwnerApartmentOptions();
    const status = document.getElementById('syncStatus');
    if (status) status.textContent = currentUserRole === 'manager' ? 'مدير — محفوظ في قاعدة البيانات' : 'مالك — قراءة فقط';
    updateAccessSwitchButton();
    return true;
}

function setLoginMode(mode) {
    const isOwner = mode === 'owner';
    document.getElementById('adminLoginForm')?.classList.toggle('hidden', isOwner);
    document.getElementById('ownerLoginForm')?.classList.toggle('hidden', !isOwner);
    const adminTab = document.getElementById('adminLoginTab');
    const ownerTab = document.getElementById('ownerLoginTab');
    adminTab?.classList.toggle('bg-indigo-600', !isOwner);
    adminTab?.classList.toggle('text-white', !isOwner);
    ownerTab?.classList.toggle('bg-indigo-600', isOwner);
    ownerTab?.classList.toggle('text-white', isOwner);
}

function normalizeOwnerPhone(value) {
    return String(value || '').replace(/[\s().-]/g, '');
}

async function handleSupabaseLogin(event) {
    event.preventDefault();
    if (!supabaseClient) return;
    const isOwner = event.currentTarget.id === 'ownerLoginForm';
    const expectedRole = isOwner ? 'owner' : 'admin';
    const phone = normalizeOwnerPhone(document.getElementById('ownerPhoneLogin').value);
    const email = document.getElementById('adminEmail').value.trim();
    const password = isOwner ? document.getElementById('ownerPinLogin').value : document.getElementById('adminPassword').value;
    const button = document.getElementById(isOwner ? 'ownerLoginButton' : 'adminLoginButton');
    const errorBox = document.getElementById('authError');
    button.disabled = true;
    button.textContent = 'جارٍ التحقق…';
    errorBox.classList.add('hidden');
    try {
        if (isOwner && !/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('أدخل رقم الهاتف بصيغته الدولية، مثل ‎+201xxxxxxxxx.');
        const credentials = isOwner ? { phone, password } : { email, password };
        const { error } = await supabaseClient.auth.signInWithPassword(credentials);
        throwSupabaseError(error, 'تعذر تسجيل الدخول');
        const loaded = await loadAuthorizedAppState(expectedRole);
        if (loaded) event.currentTarget.reset();
    } catch (error) {
        errorBox.textContent = error.message.includes('Invalid login credentials') ? 'بيانات الدخول غير صحيحة.' : error.message;
        errorBox.classList.remove('hidden');
    } finally {
        button.disabled = false;
        button.textContent = isOwner ? 'دخول المالك' : 'دخول الإدارة';
    }
}

function populateOwnerApartmentOptions() {
    const select = document.getElementById('ownerProvisionApartment');
    if (!select) return;
    const previous = select.value;
    select.replaceChildren(new Option('اختر الشقة', ''));
    state.residents.forEach(resident => {
        const label = `شقة ${resident.apartmentNumber || resident.id} — ${resident.name || ''}`;
        select.add(new Option(label, resident.id));
    });
    if (state.residents.some(resident => resident.id === previous)) select.value = previous;
}

async function provisionOwnerAccount() {
    if (!isSupabaseRuntimeActive() || currentUserRole !== 'manager') {
        toast('إنشاء حساب المالك متاح للإدارة فقط.', 'error');
        return;
    }
    const apartmentId = document.getElementById('ownerProvisionApartment').value;
    const phone = normalizeOwnerPhone(document.getElementById('ownerProvisionPhone').value);
    const resident = state.residents.find(item => item.id === apartmentId);
    const status = document.getElementById('ownerProvisionStatus');
    const button = document.getElementById('ownerProvisionButton');
    const link = document.getElementById('ownerWhatsappLink');
    const pinOutput = document.getElementById('ownerGeneratedPin');
    link.classList.add('hidden');
    pinOutput.classList.add('hidden');
    status.classList.remove('hidden');
    if (!resident) { status.textContent = 'اختر شقة موجودة أولاً.'; return; }
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) { status.textContent = 'أدخل رقمًا دوليًا صحيحًا، مثل ‎+201xxxxxxxxx.'; return; }

    button.disabled = true;
    status.textContent = 'جارٍ إنشاء الحساب وحفظه…';
    try {
        const { data, error } = await supabaseClient.functions.invoke('provision-owner', {
            body: { phone, apartmentId, displayName: resident.name || '' }
        });
        throwSupabaseError(error, 'تعذر إنشاء حساب المالك');
        if (!data?.pin || !data?.phone) throw new Error(data?.error || 'لم تصل بيانات الحساب من خدمة التهيئة.');
        const message = `مرحباً ${resident.name || ''}، تم تجهيز دخولك لعمارة ${state.buildingName || 'Manzil'}، الشقة ${resident.apartmentNumber || ''}. رقم هاتف الدخول: ${data.phone}\nPIN: ${data.pin}\nافتح التطبيق واختر «الملاك» للدخول. يرجى عدم مشاركة الرمز.`;
        const waPhone = data.phone.replace(/\D/g, '');
        link.href = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
        link.classList.remove('hidden');
        pinOutput.textContent = `PIN: ${data.pin}`;
        pinOutput.classList.remove('hidden');
        status.textContent = 'تم إنشاء الحساب وتخزين بياناته في Supabase Auth. أرسل الرسالة بعد التأكد من الرقم.';
        document.getElementById('ownerProvisionPhone').value = '';
    } catch (error) {
        console.error('تعذر تجهيز حساب المالك:', error);
        status.textContent = error.message || 'تعذر إنشاء الحساب. تحقق من رقم الهاتف وإعداد Edge Function.';
    } finally {
        button.disabled = false;
    }
}

async function signOutSupabaseSession(automatic = false) {
    if (!supabaseClient) return;
    try {
        // Local-scope sign-out also works when the device is offline and clears
        // the browser's refresh token before another household member uses it.
        const { error } = await supabaseClient.auth.signOut({ scope: 'local' });
        if (error) console.warn('تعذر إنهاء الجلسة على الخادم:', error.message);
    } finally {
        showSupabaseLogin(automatic ? 'انتهت الجلسة بعد عدم النشاط. سجّل الدخول للمتابعة.' : 'تم تسجيل الخروج.');
    }
}

async function persistStateToSupabase() {
    if (!isSupabaseRuntimeActive() || currentUserRole !== 'manager') {
        throw new Error('الحفظ متاح للمدير المسجل فقط.');
    }
    const safeState = JSON.parse(JSON.stringify(state));
    delete safeState.pinCode;
    delete safeState.pinEnabled;
    safeState.residents = safeState.residents.map(resident => {
        const clean = { ...resident };
        delete clean.ownerPin;
        delete clean.pinCode;
        return clean;
    });
    const { error } = await supabaseClient.rpc('replace_building_state', { p_state: safeState });
    throwSupabaseError(error, 'فشل حفظ البيانات');
}

async function flushSupabaseWrites() {
    await supabasePendingWrite;
}

async function initializeSupabaseApplication() {
    clearLegacyGitHubSecrets();
    document.body.classList.add('supabase-mode', 'session-locked');
    if (!isSupabaseConfigured()) {
        showSupabaseLogin();
        return;
    }
    if (!window.supabase?.createClient) {
        showSupabaseLogin('تعذر تحميل مكتبة تسجيل الدخول. تحقق من الاتصال ثم أعد المحاولة.');
        return;
    }

    try {
        const config = window.MANZIL_SUPABASE_CONFIG;
        supabaseClient = window.supabase.createClient(config.url, config.publishableKey, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'manzil_supabase_session' }
        });
        document.getElementById('loginModeTabs')?.classList.remove('hidden');
        document.getElementById('adminLoginForm')?.addEventListener('submit', handleSupabaseLogin);
        document.getElementById('ownerLoginForm')?.addEventListener('submit', handleSupabaseLogin);
        setLoginMode('admin');
        supabaseAuthSubscription = supabaseClient.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') setTimeout(() => showSupabaseLogin(), 0);
        }).data.subscription;
        showSupabaseLogin();
        await loadAuthorizedAppState();
    } catch (error) {
        console.error('تعذر تهيئة تطبيق Manzil عبر Supabase:', error);
        showSupabaseLogin('تعذر تحميل بيانات الحساب. تحقق من إعداد قاعدة البيانات وسياسات الوصول ثم أعد المحاولة.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('authRetryButton')?.addEventListener('click', () => window.location.reload());
});
