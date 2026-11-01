const SUPABASE_URL = 'https://musvcrkljccubwbcrtjs.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ysHOFQfwUFZDlqT6RrOqHA_vGSHrNZs';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let activeSession = null;
let activeBuildingId = null;
let supabaseStateLoaded = false;
let authLoading = false;
let ownerMustChangePin = false;

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
    return { id: row.id, title: row.title, amount: Number(row.amount) || 0, category: row.category || 'أخرى', month: row.month, notes: row.notes || '', date: row.spent_at };
}

function mapNotice(row) {
    return { id: row.id, text: row.text, date: row.created_at };
}

function mapAudit(row) {
    return { id: row.id, action: row.action, details: row.details || '', date: row.created_at };
}

async function supabaseQuery(table, columns = '*') {
    const { data, error } = await supabaseClient.from(table).select(columns);
    if (error) throw error;
    return data || [];
}

async function loadState() {
    if (!activeSession) return false;
    const { data: membership, error: membershipError } = await supabaseClient
        .from('building_members').select('building_id, role').eq('user_id', activeSession.user.id).limit(1).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) throw new Error('لا يوجد مبنى مرتبط بهذا الحساب. اطلب من المدير ربط الحساب أولاً.');
    activeBuildingId = membership.building_id;
    currentUserRole = membership.role;
    const { data: profile, error: profileError } = await supabaseClient.from('profiles')
        .select('must_change_pin').eq('id', activeSession.user.id).maybeSingle();
    if (profileError) throw profileError;
    ownerMustChangePin = currentUserRole === 'owner' && profile?.must_change_pin === true;
    if (ownerMustChangePin) {
        state = {
            ...state, buildingName: '', managerName: '', managerPhone: '', defaultSubscription: 0,
            startingBalance: 0, residents: [], income: [], expenses: [], notices: [], auditLogs: [],
            currentTheme: 'dark', lastUpdated: Date.now()
        };
        currentResidentId = null;
        supabaseStateLoaded = false;
        clearOwnerPortal();
        renderAll();
        return true;
    }
    const { data: building, error: buildingError } = await supabaseClient.from('buildings').select('*').eq('id', activeBuildingId).single();
    if (buildingError) throw buildingError;
    const [residents, income, expenses, notices, auditLogs] = await Promise.all([
        supabaseQuery('residents'), supabaseQuery('income'), supabaseQuery('expenses'), supabaseQuery('notices'), supabaseQuery('audit_logs')
    ]);
    state = {
        ...state,
        buildingName: building.name || 'Manzil',
        managerName: building.manager_name || '',
        managerPhone: building.manager_phone || '',
        defaultSubscription: Number(building.default_subscription) || 0,
        startingBalance: Number(building.starting_balance) || 0,
        currentTheme: ['dark', 'light', 'emerald'].includes(building.current_theme) ? building.current_theme : 'dark',
        residents: residents.map(mapResident), income: income.map(mapIncome), expenses: expenses.map(mapExpense),
        notices: notices.map(mapNotice), auditLogs: auditLogs.map(mapAudit), lastUpdated: Date.now()
    };
    currentResidentId = currentUserRole === 'owner' ? state.residents[0]?.id || null : null;
    supabaseStateLoaded = true;
    return true;
}

async function deleteMissing(table, column, ids) {
    const { data, error } = await supabaseClient.from(table).select('id').eq('building_id', activeBuildingId);
    if (error) throw error;
    const keep = new Set(ids);
    const stale = (data || []).map(row => row.id).filter(id => !keep.has(id));
    if (stale.length) {
        const { error: deleteError } = await supabaseClient.from(table).delete().in('id', stale);
        if (deleteError) throw deleteError;
    }
}

async function saveState() {
    if (currentUserRole !== 'manager' || !activeSession || !activeBuildingId || !supabaseStateLoaded) {
        if (currentUserRole === 'owner') toast('حساب المالك للعرض فقط', 'error');
        return false;
    }
    state.lastUpdated = Date.now();
    try {
        const { error: buildingError } = await supabaseClient.from('buildings').update({
            name: state.buildingName || 'Manzil', manager_name: state.managerName || '', manager_phone: state.managerPhone || null,
            default_subscription: Number(state.defaultSubscription) || 0, starting_balance: Number(state.startingBalance) || 0,
            current_theme: state.currentTheme || 'dark'
        }).eq('id', activeBuildingId);
        if (buildingError) throw buildingError;
        const residentRows = state.residents.map(r => ({ id: r.id, building_id: activeBuildingId, user_id: r.userId || null, name: r.name, apartment_number: r.apartmentNumber, phone: r.phone || null, monthly_amount: Number(r.monthlyAmount) || 0, notes: r.notes || null, created_at: r.createdAt || new Date().toISOString() }));
        const incomeRows = state.income.map(i => ({ id: i.id, building_id: activeBuildingId, resident_id: i.residentId, amount: Number(i.amount) || 0, month: i.month, notes: i.notes || null, paid_at: i.date || new Date().toISOString(), created_by: activeSession.user.id }));
        const expenseRows = state.expenses.map(e => ({ id: e.id, building_id: activeBuildingId, title: e.title, amount: Number(e.amount) || 0, category: e.category || 'أخرى', month: e.month, notes: e.notes || null, spent_at: e.date || new Date().toISOString(), created_by: activeSession.user.id }));
        const noticeRows = state.notices.map(n => ({ id: n.id, building_id: activeBuildingId, text: n.text, created_by: activeSession.user.id, created_at: n.date || new Date().toISOString() }));
        const auditRows = state.auditLogs.map(l => ({ id: l.id, building_id: activeBuildingId, action: l.action, details: l.details || null, actor_id: activeSession.user.id, created_at: l.date || new Date().toISOString() }));
        const ownerUserIds = residentRows.map(r => r.user_id).filter(Boolean);
        if (ownerUserIds.length) {
            const { error: memberError } = await supabaseClient.from('building_members').upsert(ownerUserIds.map(user_id => ({ building_id: activeBuildingId, user_id, role: 'owner' })));
            if (memberError) throw memberError;
        }
        const { data: ownerMembers, error: ownerMembersError } = await supabaseClient.from('building_members').select('user_id').eq('building_id', activeBuildingId).eq('role', 'owner');
        if (ownerMembersError) throw ownerMembersError;
        const staleOwners = (ownerMembers || []).map(row => row.user_id).filter(user_id => !ownerUserIds.includes(user_id));
        if (staleOwners.length) {
            const { error: removeMembersError } = await supabaseClient.from('building_members').delete().eq('building_id', activeBuildingId).eq('role', 'owner').in('user_id', staleOwners);
            if (removeMembersError) throw removeMembersError;
        }
        for (const [table, rows] of [['residents', residentRows], ['income', incomeRows], ['expenses', expenseRows], ['notices', noticeRows], ['audit_logs', auditRows]]) {
            if (!rows.length) continue;
            const { error } = await supabaseClient.from(table).upsert(rows);
            if (error) throw error;
        }
        await deleteMissing('residents', 'id', residentRows.map(r => r.id));
        await deleteMissing('income', 'id', incomeRows.map(r => r.id));
        await deleteMissing('expenses', 'id', expenseRows.map(r => r.id));
        await deleteMissing('notices', 'id', noticeRows.map(r => r.id));
        toast('تم الحفظ في Supabase', 'success');
        return true;
    } catch (error) {
        console.error('Supabase save failed:', error);
        toast('تعذر حفظ البيانات في Supabase', 'error');
        return false;
    }
}

async function submitSupabaseLogin(event) {
    event.preventDefault();
    if (authLoading) return;
    authLoading = true;
    const identifier = document.getElementById('authIdentifier').value.trim();
    let password = document.getElementById('authPassword').value;
    const button = event.submitter || event.target.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    setAuthModal(true, 'جاري التحقق...');
    const isManagerEmail = identifier.includes('@');
    const phone = isManagerEmail ? null : normalizeOwnerPhone(identifier);
    if (!isManagerEmail) password = normalizePinDigits(password);
    if (!isManagerEmail && !phone) {
        authLoading = false;
        if (button) button.disabled = false;
        showSupabaseError('اكتب رقم جوال مصري صحيحًا أو بريد المدير.');
        return;
    }
    const credentials = isManagerEmail ? { email: identifier, password } : { email: ownerAuthEmail(phone), password };
    const { data, error } = await supabaseClient.auth.signInWithPassword(credentials);
    if (error) {
        authLoading = false;
        if (button) button.disabled = false;
        showSupabaseError('بيانات الدخول غير صحيحة أو الحساب غير مرتبط بمبنى.');
        return;
    }
    activeSession = data.session;
    try {
        await loadState();
        if (ownerMustChangePin) {
            setAuthModal(false);
            showFirstOwnerPinChange();
            return;
        }
        await openAuthenticatedApp();
    } catch (loadError) {
        await supabaseClient.auth.signOut();
        activeSession = null;
        showSupabaseError(loadError.message || 'تعذر تحميل بيانات المبنى.');
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
    if (!/^\d{6}$/.test(currentPin)) return showFirstOwnerPinChange('أدخل PIN الحالي المكوّن من 6 أرقام.');
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
        let errorCode = data?.error;
        if (error?.context && typeof error.context.clone === 'function') {
            try { errorCode = (await error.context.clone().json())?.error || errorCode; } catch {}
        }
        if (errorCode === 'pin_updated_retry_required') {
            document.getElementById('currentOwnerPin').value = pin;
            document.getElementById('newOwnerPin').value = '';
            document.getElementById('confirmOwnerPin').value = '';
            showFirstOwnerPinChange('تم تغيير PIN لكن تعذر إنهاء الحساب. اختر PIN جديدًا آخر باستخدام الرمز الجديد كرمز حالي.');
            return;
        }
        showFirstOwnerPinChange('تعذر التحقق من PIN الحالي أو إكمال التغيير. راجع الرمز وحاول مجددًا.');
        return;
    }
    try {
        await loadState();
    } catch {
        try { await supabaseClient.auth.signOut(); } catch {}
        activeSession = null;
        activeBuildingId = null;
        supabaseStateLoaded = false;
        currentUserRole = null;
        currentResidentId = null;
        document.getElementById('ownerPinChangeModal').classList.add('hidden');
        document.getElementById('ownerPinChangeModal').classList.remove('flex');
        event.target.reset();
        setAuthModal(true, 'تم تغيير PIN. سجّل الدخول بالرمز الجديد لإكمال فتح الحساب.');
        return;
    }
    ownerMustChangePin = false;
    document.getElementById('ownerPinChangeModal').classList.add('hidden');
    document.getElementById('ownerPinChangeModal').classList.remove('flex');
    event.target.reset();
    await openAuthenticatedApp();
}

async function openAuthenticatedApp() {
    setAuthModal(false);
    document.body.classList.remove('owner-mode');
    const theme = ['dark', 'light', 'emerald'].includes(state.currentTheme) ? state.currentTheme : 'dark';
    document.body.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', theme === 'light' ? '#f1f5f9' : theme === 'emerald' ? '#021a13' : '#090d16');
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
    await supabaseClient.auth.signOut();
    activeSession = null; activeBuildingId = null; supabaseStateLoaded = false;
    currentUserRole = null; currentResidentId = null;
    clearOwnerPortal();
    setAuthModal(true);
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
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) { showSupabaseError('تعذر الاتصال بخدمة المصادقة.'); return; }
    activeSession = data.session;
    if (activeSession) {
        try {
            await loadState();
            if (ownerMustChangePin) { setAuthModal(false); showFirstOwnerPinChange(); }
            else await openAuthenticatedApp();
        }
        catch (loadError) { await supabaseClient.auth.signOut(); activeSession = null; showSupabaseError(loadError.message || 'تعذر تحميل بيانات المبنى.'); }
    } else {
        setAuthModal(true);
    }
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        setTimeout(async () => {
            activeSession = session;
            if (!session) setAuthModal(true);
        }, 0);
    });
}
