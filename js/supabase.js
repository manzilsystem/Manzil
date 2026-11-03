const SUPABASE_URL = 'https://musvcrkljccubwbcrtjs.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ysHOFQfwUFZDlqT6RrOqHA_vGSHrNZs';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let activeSession = null;
let activeBuildingId = null;
let supabaseStateLoaded = false;
let authLoading = false;
let ownerMustChangePin = false;
let authLoginMode = 'manager';
let authGeneration = 0;
let persistedAuditLogIds = new Set();
let activeBuildingVersion = 1;
let ownerNotificationsChannel = null;
let pendingBuildingSelection = null;

function isCurrentAuthSession(session, generation) {
    return Boolean(session && activeSession && session.user?.id === activeSession.user?.id && generation === authGeneration);
}

function setAuthModal(visible, message = '') {
    const modal = document.getElementById('pinLockModal');
    if (!modal) return;
    document.body.classList.toggle('session-locked', visible);
    document.body.classList.toggle('modal-open', visible);
    modal.classList.toggle('hidden', !visible);
    modal.classList.toggle('flex', visible);
    modal.setAttribute('aria-hidden', String(!visible));
    const error = document.getElementById('pinErrorMsg');
    if (error) {
        error.textContent = message;
        error.classList.toggle('hidden', !message);
    }
    if (visible) setTimeout(() => document.getElementById('authIdentifier')?.focus(), 100);
}

function showSupabaseError(message) {
    setAuthModal(true, message);
}

function setLoginMode(mode) {
    const nextMode = mode === 'owner' ? 'owner' : 'manager';
    const changed = nextMode !== authLoginMode;
    authLoginMode = nextMode;
    const isOwner = authLoginMode === 'owner';
    const identifierLabel = document.getElementById('authIdentifierLabel');
    const passwordLabel = document.getElementById('authPasswordLabel');
    const identifier = document.getElementById('authIdentifier');
    const password = document.getElementById('authPassword');
    const title = document.getElementById('pinLockTitle');
    const hint = document.getElementById('pinLockHint');
    const ownerHelp = document.getElementById('ownerLoginHelp');
    const managerRecovery = document.getElementById('managerRecoveryBtn');

    if (identifierLabel) identifierLabel.textContent = isOwner ? 'رقم الجوال المسجل للشقة' : 'البريد الإلكتروني للمدير';
    if (passwordLabel) passwordLabel.textContent = isOwner ? 'PIN المالك' : 'كلمة مرور المدير';
    if (identifier) {
        identifier.placeholder = isOwner ? 'مثال: 01012345678' : 'name@example.com';
        identifier.setAttribute?.('aria-label', isOwner ? 'رقم الجوال المسجل للشقة' : 'البريد الإلكتروني للمدير');
        identifier.setAttribute?.('inputmode', isOwner ? 'tel' : 'email');
        identifier.setAttribute?.('autocomplete', isOwner ? 'tel' : 'username');
        identifier.setAttribute?.('type', isOwner ? 'tel' : 'email');
    }
    if (password) {
        password.placeholder = isOwner ? '6 أرقام دائم أو 8 أرقام مؤقت' : 'أدخل كلمة مرور المدير';
        password.setAttribute?.('aria-label', isOwner ? 'PIN المالك — 6 أرقام دائم أو 8 أرقام مؤقت' : 'كلمة مرور المدير');
        if (isOwner) password.setAttribute?.('inputmode', 'numeric');
        else password.removeAttribute?.('inputmode');
        if (isOwner) password.setAttribute?.('maxlength', '8');
        else password.removeAttribute?.('maxlength');
        password.setAttribute?.('autocomplete', 'current-password');
    }
    if (title) title.textContent = isOwner ? 'دخول مالك الشقة' : 'دخول مدير المبنى';
    if (hint) hint.textContent = isOwner
        ? 'استخدم الرمز المؤقت من 8 أرقام لأول دخول، ثم اختر PIN دائمًا من 6 أرقام.'
        : 'استخدم البريد الإلكتروني وكلمة مرور الحساب الإداري.';
    if (ownerHelp) ownerHelp.classList.toggle('hidden', !isOwner);
    if (managerRecovery) managerRecovery.classList.toggle('hidden', isOwner);

    for (const [id, selected] of [['loginModeManager', !isOwner], ['loginModeOwner', isOwner]]) {
        const button = document.getElementById(id);
        if (!button) continue;
        button.setAttribute('aria-pressed', String(selected));
        button.className = selected
            ? 'w-full border rounded-xl px-3 py-3 text-sm font-bold transition flex items-center justify-center gap-2 bg-indigo-600 text-white border-indigo-400 shadow-lg'
            : 'w-full app-input border border-slate-700 rounded-xl px-3 py-3 text-sm font-bold text-slate-300 transition flex items-center justify-center gap-2 hover:border-indigo-400';
    }

    if (changed) {
        if (identifier) identifier.value = '';
        if (password) password.value = '';
        const error = document.getElementById('pinErrorMsg');
        if (error) {
            error.textContent = '';
            error.classList.add('hidden');
        }
    }
    return authLoginMode;
}

async function requestManagerPasswordReset() {
    const identifier = document.getElementById('authIdentifier');
    const email = identifier?.value.trim() || '';
    if (!/^\S+@\S+\.\S+$/.test(email)) {
        showSupabaseError('اكتب بريد المدير أولًا ثم اختر «نسيت كلمة مرور المدير؟».');
        identifier?.focus();
        return;
    }
    const button = document.getElementById('managerRecoveryBtn');
    if (button) { button.disabled = true; button.textContent = 'جاري إرسال رابط الاستعادة...'; }
    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
        if (error) throw error;
        setAuthModal(true, 'تم إرسال رابط استعادة كلمة المرور إلى بريد المدير. افحص البريد الوارد والرسائل غير المرغوبة.');
    } catch {
        showSupabaseError('تعذر إرسال رابط الاستعادة. تحقق من البريد والاتصال ثم حاول مجددًا.');
    } finally {
        if (button) { button.disabled = false; button.textContent = 'نسيت كلمة مرور المدير؟ أرسل رابط استعادة إلى البريد'; }
    }
}

function normalizeOwnerPhone(input) {
    let value = normalizePinDigits(String(input || '').trim()).replace(/[\s().-]/g, '');
    if (value.startsWith('00')) value = `+${value.slice(2)}`;
    if (value.startsWith('0') && /^01\d{9}$/.test(value)) value = `+20${value.slice(1)}`;
    else if (/^1\d{9}$/.test(value)) value = `+20${value}`;
    else if (/^20\d{10}$/.test(value)) value = `+${value}`;
    else if (!value.startsWith('+')) return null;
    return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}

function ownerAuthEmail(phone) {
    return `${phone.slice(1)}@phone-login.manzil.invalid`;
}

function normalizePinDigits(input) {
    return String(input || '').replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776));
}

function toSupabaseTimestamp(value) {
    const source = value === null || value === undefined || value === '' ? Date.now() : value;
    const date = new Date(source);
    if (Number.isNaN(date.getTime())) throw new TypeError('Invalid timestamp for Supabase');
    return date.toISOString();
}

function mapResident(row) {
    return {
        id: row.id,
        userId: row.user_id || null,
        name: row.name,
        apartmentNumber: row.apartment_number,
        phone: row.phone || '',
        monthlyAmount: Number(row.monthly_amount) || 0,
        notes: row.notes || '',
        createdAt: row.created_at
    };
}

function mapIncome(row) {
    return { id: row.id, residentId: row.resident_id, amount: Number(row.amount) || 0, month: row.month, notes: row.notes || '', date: row.paid_at };
}

function mapExpense(row) {
    return {
        id: row.id, title: row.title, amount: Number(row.amount) || 0,
        category: row.category || 'أخرى', month: row.month, notes: row.notes || '',
        cashAccountCode: row.cash_account_code || 'main', date: row.spent_at
    };
}

function mapCashTransfer(row) {
    return {
        id: row.id,
        fromAccountCode: row.from_account_code,
        toAccountCode: row.to_account_code,
        amount: Number(row.amount) || 0,
        notes: row.notes || '',
        transferredAt: row.transferred_at
    };
}

async function refreshCashboxSummary() {
    if (currentUserRole !== 'manager' || !activeBuildingId) return false;
    const buildingId = activeBuildingId;
    const { data, error } = await supabaseClient.rpc('get_cashbox_summary', {
        p_building_id: buildingId
    });
    if (error) throw error;
    if (currentUserRole !== 'manager' || activeBuildingId !== buildingId) return false;

    const summary = normalizeCashboxSummary(data);
    state.cashAccountBalances = summary.balances;
    state.cashTransfers = summary.transfers.map(mapCashTransfer);
    return true;
}

function mapNotice(row) {
    return { id: row.id, text: row.text, date: row.created_at };
}

function mapNotification(row) {
    return {
        id: row.id,
        buildingId: row.building_id,
        title: row.title,
        body: row.body,
        kind: row.kind,
        severity: row.severity,
        actionPath: row.action_path || '',
        readAt: row.read_at || null,
        createdAt: row.created_at
    };
}

function mapAudit(row) {
    return { id: row.id, action: row.action, details: row.details || '', date: row.created_at };
}

async function supabaseQuery(table, columns = '*') {
    const { data, error } = await supabaseClient.from(table).select(columns);
    if (error) throw error;
    return data || [];
}

function stopOwnerNotificationsRealtime() {
    if (!ownerNotificationsChannel) return;
    const channel = ownerNotificationsChannel;
    ownerNotificationsChannel = null;
    if (typeof supabaseClient.removeChannel === 'function') {
        supabaseClient.removeChannel(channel).catch(error => {
            console.warn('Could not stop owner notification realtime channel:', error);
        });
    }
}

function subscribeOwnerNotificationsRealtime() {
    stopOwnerNotificationsRealtime();
    if (currentUserRole !== 'owner' || !activeSession?.user?.id || !supabaseClient.channel) return;
    const userId = activeSession.user.id;
    ownerNotificationsChannel = supabaseClient
        .channel(`owner-notifications:${userId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `target_user_id=eq.${userId}`
        }, payload => {
            const row = payload.new;
            if (!row || row.building_id !== activeBuildingId) return;
            const notification = mapNotification(row);
            const index = state.ownerNotifications.findIndex(item => item.id === notification.id);
            if (index >= 0) state.ownerNotifications[index] = notification;
            else state.ownerNotifications.unshift(notification);
            state.ownerNotifications = state.ownerNotifications.slice(0, 50);
            renderOwnerPortal();
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `target_user_id=eq.${userId}`
        }, payload => {
            const row = payload.new;
            if (!row || row.building_id !== activeBuildingId) return;
            const notification = mapNotification(row);
            const index = state.ownerNotifications.findIndex(item => item.id === notification.id);
            if (index >= 0) state.ownerNotifications[index] = notification;
            else state.ownerNotifications.unshift(notification);
            renderOwnerPortal();
        })
        .subscribe(status => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.warn('Owner notification realtime channel status:', status);
            }
        });
}

function escapeBuildingLabel(value) {
    return String(value || '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

async function chooseBuildingMembership(memberships, session, generation) {
    if (!Array.isArray(memberships) || memberships.length === 0) return null;
    if (memberships.length === 1) return memberships[0];

    const buildingIds = memberships.map(item => item.building_id);
    const { data: buildings, error } = await supabaseClient.from('buildings')
        .select('id,name').in('id', buildingIds);
    if (!isCurrentAuthSession(session, generation)) return null;
    if (error) throw error;

    const names = new Map((buildings || []).map(building => [building.id, building.name || 'مبنى بدون اسم']));
    const select = document.getElementById('buildingContextSelect');
    const modal = document.getElementById('buildingContextModal');
    if (!select || !modal) throw new Error('واجهة اختيار المبنى غير متاحة.');

    select.innerHTML = memberships.map(membership => {
        const name = names.get(membership.building_id);
        if (!name) throw new Error('تعذر تحميل اسم أحد المباني المرتبطة بالحساب.');
        const roleLabel = membership.role === 'manager' ? 'مدير' : 'مالك';
        return '<option value="' + escapeBuildingLabel(membership.building_id) + '">' +
            escapeBuildingLabel(name) + ' — ' + roleLabel + '</option>';
    }).join('');

    return new Promise(resolve => {
        pendingBuildingSelection = { memberships, session, generation, resolve };
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modal.setAttribute('aria-hidden', 'false');
        select.focus?.();
    });
}

function confirmBuildingSelection() {
    const pending = pendingBuildingSelection;
    if (!pending) return false;
    if (!isCurrentAuthSession(pending.session, pending.generation)) {
        pendingBuildingSelection = null;
        const modal = document.getElementById('buildingContextModal');
        modal?.classList.add('hidden');
        modal?.classList.remove('flex');
        modal?.setAttribute('aria-hidden', 'true');
        pending.resolve(null);
        return false;
    }
    const selectedId = document.getElementById('buildingContextSelect')?.value;
    const membership = pending.memberships.find(item => item.building_id === selectedId);
    if (!membership) return false;

    pendingBuildingSelection = null;
    const modal = document.getElementById('buildingContextModal');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
    modal?.setAttribute('aria-hidden', 'true');
    pending.resolve(membership);
    return true;
}

async function loadState() {
    const session = activeSession;
    const generation = authGeneration;
    if (!session) return false;
    const { data: memberships, error: membershipError } = await supabaseClient
        .from('building_members').select('building_id, role').eq('user_id', session.user.id).order('building_id');
    if (!isCurrentAuthSession(session, generation)) return false;
    if (membershipError) throw membershipError;
    if (!memberships?.length) throw new Error('لا يوجد مبنى مرتبط بهذا الحساب. اطلب من المدير ربط الحساب أولاً.');
    const membership = await chooseBuildingMembership(memberships, session, generation);
    if (!membership || !isCurrentAuthSession(session, generation)) return false;
    const { data: profile, error: profileError } = await supabaseClient.from('profiles')
        .select('must_change_pin').eq('id', session.user.id).maybeSingle();
    if (!isCurrentAuthSession(session, generation)) return false;
    if (profileError) throw profileError;
    activeBuildingId = membership.building_id;
    activeBuildingVersion = 1;
    currentUserRole = membership.role;
    ownerMustChangePin = currentUserRole === 'owner' && profile?.must_change_pin === true;
    if (ownerMustChangePin) {
        stopOwnerNotificationsRealtime();
        state = {
            ...state, buildingName: '', managerName: '', managerPhone: '', defaultSubscription: 0,
            startingBalance: 0, residents: [], income: [], expenses: [], notices: [], ownerNotifications: [], auditLogs: [],
            cashAccountBalances: { main: 0, development: 0, emergency: 0 }, cashTransfers: [],
            currentTheme: 'dark', lastUpdated: Date.now()
        };
        persistedAuditLogIds = new Set();
        currentResidentId = null;
        supabaseStateLoaded = false;
        clearOwnerPortal();
        renderAll();
        return true;
    }
    const { data: building, error: buildingError } = await supabaseClient.from('buildings').select('*').eq('id', activeBuildingId).single();
    if (!isCurrentAuthSession(session, generation)) return false;
    if (buildingError) throw buildingError;
    activeBuildingVersion = Number(building.state_version) || 1;
    const ownerNotificationsQuery = currentUserRole === 'owner'
        ? supabaseClient.from('notifications')
            .select('id,building_id,target_user_id,target_resident_id,kind,title,body,severity,action_path,read_at,created_at')
            .eq('building_id', activeBuildingId)
            .eq('target_user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null });
    const cashboxSummaryQuery = currentUserRole === 'manager'
        ? supabaseClient.rpc('get_cashbox_summary', { p_building_id: activeBuildingId })
        : Promise.resolve({ data: null, error: null });
    const [residents, income, expenses, notices, auditLogs, residentNotes, ownerNotificationsResult, cashboxSummaryResult] = await Promise.all([
        supabaseQuery('residents'), supabaseQuery('income'), supabaseQuery('expenses'), supabaseQuery('notices'), supabaseQuery('audit_logs'),
        currentUserRole === 'manager' ? supabaseQuery('resident_internal_notes', 'resident_id,notes') : Promise.resolve([]),
        ownerNotificationsQuery, cashboxSummaryQuery
    ]);
    if (!isCurrentAuthSession(session, generation)) return false;
    if (ownerNotificationsResult.error) throw ownerNotificationsResult.error;
    if (cashboxSummaryResult.error) throw cashboxSummaryResult.error;
    const cashboxSummary = currentUserRole === 'manager'
        ? normalizeCashboxSummary(cashboxSummaryResult.data)
        : { balances: { main: 0, development: 0, emergency: 0 }, transfers: [] };
    state = {
        ...state,
        buildingName: building.name || 'Manzil',
        managerName: building.manager_name || '',
        managerPhone: building.manager_phone || '',
        defaultSubscription: Number(building.default_subscription) || 0,
        startingBalance: Number(building.starting_balance) || 0,
        currentTheme: ['dark', 'light', 'emerald', 'ocean', 'sand'].includes(building.current_theme) ? building.current_theme : 'dark',
        residents: residents.map(mapResident), income: income.map(mapIncome), expenses: expenses.map(mapExpense),
        notices: notices.map(mapNotice), ownerNotifications: (ownerNotificationsResult.data || []).map(mapNotification),
        auditLogs: auditLogs.map(mapAudit),
        cashAccountBalances: cashboxSummary.balances,
        cashTransfers: cashboxSummary.transfers.map(mapCashTransfer),
        lastUpdated: Date.now()
    };
    if (currentUserRole === 'manager') {
        const notesByResident = new Map(residentNotes.map(row => [row.resident_id, row.notes || '']));
        state.residents.forEach(resident => {
            resident.notes = notesByResident.get(resident.id) || '';
        });
    }
    persistedAuditLogIds = new Set(auditLogs.map(row => row.id));
    currentResidentId = currentUserRole === 'owner' ? state.residents[0]?.id || null : null;
    if (currentUserRole === 'manager' && typeof initializeCashboxAccountingSnapshot === 'function') {
        initializeCashboxAccountingSnapshot();
    }
    supabaseStateLoaded = true;
    subscribeOwnerNotificationsRealtime();
    return true;
}

async function saveState() {
    if (currentUserRole !== 'manager' || !activeSession || !activeBuildingId || !supabaseStateLoaded) {
        if (currentUserRole === 'owner') toast('حساب المالك للعرض فقط', 'error');
        return false;
    }

    state.lastUpdated = Date.now();
    const requestId = generateId();
    let payload;
    try {
        payload = {
        building: {
            name: state.buildingName || 'Manzil',
            manager_name: state.managerName || '',
            manager_phone: state.managerPhone || null,
            default_subscription: Number(state.defaultSubscription) || 0,
            starting_balance: Number(state.startingBalance) || 0,
            current_theme: state.currentTheme || 'dark'
        },
        residents: state.residents.map(r => ({
            id: r.id, user_id: r.userId || null, name: r.name,
            apartment_number: r.apartmentNumber, phone: r.phone || null,
            monthly_amount: Number(r.monthlyAmount) || 0, notes: r.notes || null,
            created_at: toSupabaseTimestamp(r.createdAt)
        })),
        income: state.income.map(i => ({
            id: i.id, resident_id: i.residentId, amount: Number(i.amount) || 0,
            month: i.month, notes: i.notes || null, paid_at: toSupabaseTimestamp(i.date)
        })),
        expenses: state.expenses.map(e => ({
            id: e.id, title: e.title, amount: Number(e.amount) || 0,
            category: e.category || 'أخرى', month: e.month, notes: e.notes || null,
            cash_account_code: e.cashAccountCode || 'main', spent_at: toSupabaseTimestamp(e.date)
        })),
        notices: state.notices.map(n => ({
            id: n.id, text: n.text, created_at: toSupabaseTimestamp(n.date)
        })),
        audit_logs: state.auditLogs.filter(l => !persistedAuditLogIds.has(l.id)).map(l => ({
            id: l.id, action: l.action, details: l.details || null,
            created_at: toSupabaseTimestamp(l.date)
        })),
        subscription_rates: state.residents.flatMap(resident =>
            (Array.isArray(resident.subscriptionRates) ? resident.subscriptionRates : []).map(rate => ({
                resident_id: resident.id,
                effective_month: rate.effectiveMonth,
                monthly_amount: Number(rate.monthlyAmount)
            }))
        )
        };
    } catch (error) {
        console.error('Could not prepare Supabase snapshot:', error);
        toast('تعذر تجهيز البيانات للحفظ. راجع التواريخ والحقول ثم حاول مجددًا.', 'error');
        return false;
    }

    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const { data, error } = await supabaseClient.rpc('persist_building_snapshot', {
                p_building_id: activeBuildingId,
                p_expected_version: activeBuildingVersion,
                p_request_id: requestId,
                p_payload: payload
            });
            if (error) throw error;
            if (data?.conflict) {
                toast('تم اكتشاف تعديل أحدث من نافذة أخرى. أعد تحميل البيانات قبل الحفظ لتجنب استبدال تغييرات الآخرين.', 'error');
                return false;
            }
            if (!data?.ok || !Number.isInteger(Number(data.version))) {
                throw new Error('Invalid persistence response');
            }
            activeBuildingVersion = Number(data.version);
            payload.audit_logs.forEach(row => persistedAuditLogIds.add(row.id));
            if (typeof syncCashboxBalancesAfterSnapshot === 'function') {
                syncCashboxBalancesAfterSnapshot();
            }
            return true;
        } catch (error) {
            lastError = error;
            if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 350));
        }
    }

    console.error('Atomic Supabase save failed:', lastError);
    toast('تعذر تأكيد الحفظ. أعد تحميل البيانات للتحقق من آخر نسخة محفوظة قبل إعادة المحاولة.', 'error');
    return false;
}

function clearAuthenticatedState() {
    stopOwnerNotificationsRealtime();
    authGeneration += 1;
    if (pendingBuildingSelection) {
        const pending = pendingBuildingSelection;
        pendingBuildingSelection = null;
        pending.resolve(null);
    }
    const buildingModal = document.getElementById('buildingContextModal');
    if (buildingModal) {
        buildingModal.classList.add('hidden');
        buildingModal.classList.remove('flex');
        buildingModal.setAttribute('aria-hidden', 'true');
    }
    activeSession = null;
    activeBuildingId = null;
    activeBuildingVersion = 1;
    supabaseStateLoaded = false;
    authLoading = false;
    ownerMustChangePin = false;
    currentUserRole = null;
    currentResidentId = null;
    persistedAuditLogIds = new Set();
    state = {
        ...state,
        buildingName: '', managerName: '', managerPhone: '', defaultSubscription: 0,
        startingBalance: 0, residents: [], income: [], expenses: [], notices: [], ownerNotifications: [], auditLogs: [],
        cashAccountBalances: { main: 0, development: 0, emergency: 0 }, cashTransfers: [],
        currentTheme: 'dark', lastUpdated: 0
    };
    document.body.classList.remove('owner-mode');
    clearOwnerPortal();
    const pinChangeModal = document.getElementById('ownerPinChangeModal');
    if (pinChangeModal) {
        pinChangeModal.classList.add('hidden');
        pinChangeModal.classList.remove('flex');
    }
    const tempPinModal = document.getElementById('ownerTempPinModal');
    if (tempPinModal) {
        tempPinModal.classList.add('hidden');
        tempPinModal.classList.remove('flex');
    }
    for (const id of ['authIdentifier', 'authPassword', 'currentOwnerPin', 'newOwnerPin', 'confirmOwnerPin', 'ownerTempPinValue']) {
        const input = document.getElementById(id);
        if (input) input.value = '';
    }
    setLoginMode('manager');
    try { renderAll(); } catch (error) { console.error('Could not clear rendered session data:', error); }
    const status = document.getElementById('syncStatus');
    if (status) status.textContent = 'الجلسة مقفلة';
    updateAccessSwitchButton();
}

async function signOutLocally() {
    try {
        const { error } = await supabaseClient.auth.signOut({ scope: 'local' });
        return error || null;
    } catch (error) {
        return error;
    }
}

async function submitSupabaseLogin(event) {
    event.preventDefault();
    if (authLoading) return;
    authLoading = true;
    const previousUserId = activeSession?.user?.id || null;
    const button = event.submitter || event.target.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    setAuthModal(true, 'جاري التحقق...');
    let authRequestFailed = false;
    try {
        const identifier = document.getElementById('authIdentifier').value.trim();
        let password = document.getElementById('authPassword').value;
        const isManagerEmail = identifier.includes('@');
        if (authLoginMode === 'manager' && !isManagerEmail) {
            showSupabaseError('دخول المدير يحتاج البريد الإلكتروني وكلمة المرور. اختر «مالك الشقة» إذا كان لديك رقم جوال وPIN.');
            return;
        }
        if (authLoginMode === 'owner' && isManagerEmail) {
            showSupabaseError('دخول مالك الشقة يستخدم رقم الجوال المسجل، وليس البريد الإلكتروني.');
            return;
        }
        const phone = isManagerEmail ? null : normalizeOwnerPhone(identifier);
        if (!isManagerEmail) password = normalizePinDigits(password);
        if (!isManagerEmail && !phone) {
            showSupabaseError('اكتب رقم جوال مصري صحيحًا أو بريد المدير.');
            return;
        }
        if (authLoginMode === 'owner' && !/^(?:\d{6}|\d{8})$/.test(password)) {
            showSupabaseError('PIN المالك يجب أن يتكون من 6 أرقام أو 8 أرقام للرمز المؤقت.');
            return;
        }
        let data;
        let error;
        if (isManagerEmail) {
            authRequestFailed = true;
            ({ data, error } = await supabaseClient.auth.signInWithPassword({ email: identifier, password }));
            authRequestFailed = false;
        } else {
            authRequestFailed = true;
            const response = await supabaseClient.functions.invoke('owner-login', {
                body: { phone, pin: password }
            });
            authRequestFailed = false;
            data = response.data;
            error = response.error;
            if (error) {
                let details = data || {};
                if (error.context && typeof error.context.clone === 'function') {
                    try { details = await error.context.clone().json(); } catch {}
                }
                if (details?.error === 'rate_limited') {
                    const retrySeconds = Math.max(1, Number(details.retry_after_seconds) || 900);
                    const retryMinutes = Math.ceil(retrySeconds / 60);
                    showSupabaseError(`تم إيقاف محاولات الدخول مؤقتًا بسبب تكرار PIN غير صحيح. حاول بعد ${retryMinutes} دقيقة.`);
                } else if (details?.error === 'login_unavailable') {
                    showSupabaseError('خدمة دخول المالك غير متاحة مؤقتًا. حاول لاحقًا.');
                } else {
                    showSupabaseError('رقم الجوال أو PIN غير صحيح.');
                }
                return;
            }
            if (!data?.session?.access_token || !data?.session?.refresh_token) {
                showSupabaseError('لم تُنشأ جلسة دخول للمالك. حاول مجددًا.');
                return;
            }
            const sessionResult = await supabaseClient.auth.setSession({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token
            });
            if (sessionResult.error || !sessionResult.data?.session) {
                showSupabaseError('تعذر إنشاء جلسة المالك. تحقق من الاتصال وحاول مجددًا.');
                return;
            }
            data = sessionResult.data;
            error = null;
        }
        if (error) {
            showSupabaseError('بيانات الدخول غير صحيحة أو الحساب غير مرتبط بمبنى.');
            return;
        }
        if (previousUserId && previousUserId !== data?.session?.user?.id) {
            clearAuthenticatedState();
        }
        activeSession = data?.session || null;
        if (!activeSession) {
            showSupabaseError('لم تُنشأ جلسة دخول. تحقق من بيانات الحساب وحاول مجددًا.');
            return;
        }
        const session = activeSession;
        const generation = authGeneration;
        const loaded = await loadState();
        if (!loaded || !isCurrentAuthSession(session, generation)) {
            clearAuthenticatedState();
            setAuthModal(true);
            return;
        }
        if (ownerMustChangePin) {
            setAuthModal(false);
            showFirstOwnerPinChange();
            return;
        }
        await openAuthenticatedApp();
    } catch (loadError) {
        await signOutLocally();
        clearAuthenticatedState();
        const message = authRequestFailed
            ? 'تعذر الاتصال بخدمة المصادقة. تحقق من الاتصال وحاول مجددًا.'
            : loadError?.message || 'تعذر تحميل بيانات المبنى. تحقق من الاتصال وحاول مجددًا.';
        showSupabaseError(message);
    } finally {
        authLoading = false;
        if (button) button.disabled = false;
    }
}

function showFirstOwnerPinChange(message = '') {
    const modal = document.getElementById('ownerPinChangeModal');
    const error = document.getElementById('ownerPinChangeError');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (error) {
        error.textContent = message;
        error.classList.toggle('hidden', !message);
    }
    setTimeout(() => document.getElementById('currentOwnerPin')?.focus(), 100);
}

async function submitFirstOwnerPinChange(event) {
    event.preventDefault();
    const currentPin = normalizePinDigits(document.getElementById('currentOwnerPin').value);
    const pin = normalizePinDigits(document.getElementById('newOwnerPin').value);
    const confirmPin = normalizePinDigits(document.getElementById('confirmOwnerPin').value);
    if (!/^(?:\d{6}|\d{8})$/.test(currentPin)) return showFirstOwnerPinChange('أدخل PIN الحالي من 6 أرقام أو 8 أرقام إذا كان مؤقتًا.');
    if (!/^\d{6}$/.test(pin)) return showFirstOwnerPinChange('PIN يجب أن يتكون من 6 أرقام.');
    if (pin !== confirmPin) return showFirstOwnerPinChange('الرمزان غير متطابقين.');
    if (pin === currentPin) return showFirstOwnerPinChange('اختر PIN جديدًا يختلف عن الرمز الحالي.');

    const button = event.submitter || event.target.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    let data;
    let error;
    try {
        ({ data, error } = await supabaseClient.functions.invoke('complete-owner-pin-change', {
            body: { current_pin: currentPin, new_pin: pin }
        }));
    } catch {
        if (button) button.disabled = false;
        showFirstOwnerPinChange('تعذر الاتصال بخدمة تغيير PIN. تحقق من الاتصال وحاول مجددًا.');
        return;
    }
    if (error || !data?.ok) {
        if (button) button.disabled = false;
        let errorDetails = data || {};
        if (error?.context && typeof error.context.clone === 'function') {
            try { errorDetails = await error.context.clone().json(); } catch {}
        }
        const errorCode = errorDetails?.error || data?.error;
        if (errorCode === 'rate_limited') {
            const retryMinutes = Math.ceil(Math.max(1, Number(errorDetails.retry_after_seconds) || 900) / 60);
            showFirstOwnerPinChange(`تم إيقاف المحاولات مؤقتًا بسبب تكرار PIN غير صحيح. حاول بعد ${retryMinutes} دقيقة.`);
            return;
        }
        if (errorCode === 'pin_updated_retry_required') {
            const session = activeSession;
            const generation = authGeneration;
            try {
                const loaded = await loadState();
                if (!loaded || !isCurrentAuthSession(session, generation)) {
                    clearAuthenticatedState();
                    setAuthModal(true);
                    return;
                }
                if (!ownerMustChangePin) {
                    const modal = document.getElementById('ownerPinChangeModal');
                    modal?.classList.add('hidden');
                    modal?.classList.remove('flex');
                    event.target.reset();
                    await openAuthenticatedApp();
                    return;
                }
            } catch (stateError) {
                console.warn('Could not verify owner PIN completion state:', stateError);
            }
            document.getElementById('currentOwnerPin').value = pin;
            document.getElementById('newOwnerPin').value = '';
            document.getElementById('confirmOwnerPin').value = '';
            showFirstOwnerPinChange('تم تحديث PIN، لكن تعذر تأكيد فتح الحساب. جرّب إكمال الدخول باستخدام PIN الجديد.');
            return;
        }
        if (errorCode === 'pin_update_status_unknown') {
            document.getElementById('currentOwnerPin').value = pin;
            document.getElementById('newOwnerPin').value = '';
            document.getElementById('confirmOwnerPin').value = '';
            showFirstOwnerPinChange('تعذر التأكد من نتيجة تحديث PIN. جرّب PIN الجديد كرمز حالي؛ وإذا لم يقبله النظام، أدخل PIN السابق. لن تُفتح البيانات قبل اكتمال التحقق.');
            return;
        }
        if (errorCode === 'pin_update_failed') {
            showFirstOwnerPinChange('لم يتم تغيير PIN. تحقق من الرمز الحالي وحاول مرة أخرى.');
            return;
        }
        showFirstOwnerPinChange('تعذر التحقق من PIN الحالي أو إكمال التغيير. راجع الرمز وحاول مجددًا.');
        return;
    }
    const session = activeSession;
    const generation = authGeneration;
    let loaded;
    try {
        loaded = await loadState();
    } catch {
        try { await supabaseClient.auth.signOut(); } catch {}
        clearAuthenticatedState();
        document.getElementById('ownerPinChangeModal').classList.add('hidden');
        document.getElementById('ownerPinChangeModal').classList.remove('flex');
        event.target.reset();
        setAuthModal(true, 'تم تغيير PIN. سجّل الدخول بالرمز الجديد لإكمال فتح الحساب.');
        return;
    }
    if (!loaded || !isCurrentAuthSession(session, generation)) {
        clearAuthenticatedState();
        setAuthModal(true);
        return;
    }
    ownerMustChangePin = false;
    document.getElementById('ownerPinChangeModal').classList.add('hidden');
    document.getElementById('ownerPinChangeModal').classList.remove('flex');
    event.target.reset();
    await openAuthenticatedApp();
}

async function openAuthenticatedApp() {
    if (!activeSession) {
        setAuthModal(true);
        return;
    }
    setAuthModal(false);
    document.body.classList.remove('owner-mode');
    const theme = ['dark', 'light', 'emerald', 'ocean', 'sand'].includes(state.currentTheme) ? state.currentTheme : 'dark';
    const themeColors = { dark:'#0b1020', light:'#f3f6fc', emerald:'#071c18', ocean:'#071827', sand:'#211b16' };
    document.body.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[theme]);
    renderAll();
    if (currentUserRole === 'owner') {
        document.body.classList.add('owner-mode');
        renderOwnerPortal();
    }
    updateAccessSwitchButton();
    const status = document.getElementById('syncStatus');
    if (status) status.textContent = currentUserRole === 'manager' ? 'Supabase — مدير' : 'Supabase — مالك للعرض فقط';
}

async function lockCurrentSession() {
    clearAuthenticatedState();
    setAuthModal(true, 'جاري قفل الجلسة...');
    const error = await signOutLocally();
    setAuthModal(true, error ? 'تم قفل الواجهة، لكن تعذر إنهاء جلسة Supabase المحلية. أعد الاتصال ثم سجّل الخروج مرة أخرى.' : '');
}

function updateAccessSwitchButton() {
    const button = document.getElementById('accessSwitchBtn');
    if (button) button.classList.toggle('hidden', !activeSession);
}

function checkPinLockOnStart() { setAuthModal(!activeSession); }
function verifyPinCode() { return submitSupabaseLogin(event); }
function handlePinInput() {}

async function initSupabaseApp() {
    document.body.classList.add('session-locked');
    supabaseClient.auth.onAuthStateChange((event, session) => {
        const previousUserId = activeSession?.user?.id || null;
        const nextUserId = session?.user?.id || null;
        const userChanged = Boolean(previousUserId && nextUserId && previousUserId !== nextUserId);
        const loginInProgress = authLoading;
        const shouldLoadSession = Boolean(
            session && !loginInProgress &&
            (userChanged || (event === 'SIGNED_IN' && !previousUserId))
        );

        if (!session || userChanged) {
            authGeneration += 1;
            setAuthModal(true, userChanged ? 'جاري تبديل الحساب...' : '');
        }

        setTimeout(async () => {
            if (!session) {
                clearAuthenticatedState();
                setAuthModal(true);
                return;
            }

            if (shouldLoadSession) {
                clearAuthenticatedState();
                activeSession = session;
                const generation = authGeneration;
                try {
                    const loaded = await loadState();
                    if (!loaded || !isCurrentAuthSession(session, generation)) {
                        clearAuthenticatedState();
                        setAuthModal(true);
                        return;
                    }
                    if (ownerMustChangePin) {
                        setAuthModal(false);
                        showFirstOwnerPinChange();
                    } else {
                        await openAuthenticatedApp();
                    }
                } catch (loadError) {
                    await signOutLocally();
                    clearAuthenticatedState();
                    showSupabaseError(loadError?.message || 'تعذر تحميل بيانات المبنى.');
                }
                return;
            }

            activeSession = session;
        }, 0);
    });
    let data;
    let error;
    try {
        ({ data, error } = await supabaseClient.auth.getSession());
    } catch {
        clearAuthenticatedState();
        showSupabaseError('تعذر الاتصال بخدمة المصادقة. تحقق من الاتصال ثم أعد المحاولة.');
        return;
    }
    if (error) {
        clearAuthenticatedState();
        showSupabaseError('تعذر الاتصال بخدمة المصادقة. تحقق من الاتصال ثم أعد المحاولة.');
        return;
    }
    activeSession = data.session;
    if (activeSession) {
        const session = activeSession;
        const generation = authGeneration;
        try {
            const loaded = await loadState();
            if (!loaded || !isCurrentAuthSession(session, generation)) {
                clearAuthenticatedState();
                setAuthModal(true);
                return;
            }
            if (ownerMustChangePin) { setAuthModal(false); showFirstOwnerPinChange(); }
            else await openAuthenticatedApp();
        }
        catch (loadError) {
            await signOutLocally();
            clearAuthenticatedState();
            showSupabaseError(loadError?.message || 'تعذر تحميل بيانات المبنى.');
        }
    } else {
        clearAuthenticatedState();
        setAuthModal(true);
    }
}
