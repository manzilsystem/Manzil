// تسجيل مدير جديد + تفعيل من المدير العام.
// لا طلبات شبكة قبل تسجيل الدخول (تجنبًا لأخطاء 401 في الكونسول)؛ كل الفحوصات تتم بعد الدخول وتفشل بصمت.
// كل طلب مُفعّل ينشئ مبنى جديدًا. الانضمام لمبنى قائم دعوة منفصلة.
const MANAGER_SIGNUP_PENDING_KEY = 'manzil.managerSignupPending';
let managerSignupBusy = false;

function managerSignupMessage(text, tone = 'error') {
    const box = document.getElementById('managerSignupMessage');
    if (!box) return;
    box.textContent = text;
    box.classList.toggle('hidden', !text);
    box.classList.toggle('text-rose-400', tone === 'error');
    box.classList.toggle('text-emerald-400', tone !== 'error');
}

function openManagerSignup() {
    const modal = document.getElementById('managerSignupModal');
    if (!modal) return;
    managerSignupMessage('');
    document.getElementById('managerSignupForm')?.classList.remove('hidden');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => document.getElementById('signupFullName')?.focus(), 100);
}

function closeManagerSignup() {
    const modal = document.getElementById('managerSignupModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.setAttribute('aria-hidden', 'true');
}

function validateManagerSignupInput(input) {
    if (input.fullName.length < 2) return ['signupFullName', 'اكتب اسمك.'];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return ['signupEmail', 'اكتب بريد إلكتروني صحيح.'];
    if (!input.phone) return ['signupPhone', 'رقم الجوال غير صحيح. اكتب رقمًا مصريًا (01012345678) أو دوليًا يبدأ بـ +'];
    if (input.buildingName.length < 2) return ['signupBuildingName', 'اكتب اسم المبنى.'];
    if (input.password.length < 8) return ['signupPassword', 'كلمة المرور 8 حروف على الأقل.'];
    if (input.password !== input.passwordConfirm) return ['signupPasswordConfirm', 'كلمتا المرور مش متطابقتين.'];
    return null;
}

function readManagerSignupInput() {
    const val = id => String(/** @type {any} */ (document.getElementById(id))?.value || '').trim();
    const rawPhone = val('signupPhone');
    return {
        fullName: val('signupFullName'),
        email: val('signupEmail').toLowerCase(),
        phone: typeof normalizeOwnerPhone === 'function' ? normalizeOwnerPhone(rawPhone) : '',
        buildingName: val('signupBuildingName'),
        password: String(/** @type {any} */ (document.getElementById('signupPassword'))?.value || ''),
        passwordConfirm: String(/** @type {any} */ (document.getElementById('signupPasswordConfirm'))?.value || '')
    };
}

async function insertManagerSignupRequest(userId, input) {
    const { error } = await supabaseClient.from('manager_signup_requests').insert({
        user_id: userId, full_name: input.fullName, phone: input.phone, building_name: input.buildingName
    });
    return error;
}

async function submitManagerSignup(event) {
    event.preventDefault();
    if (managerSignupBusy) return;
    const input = readManagerSignupInput();
    const problem = validateManagerSignupInput(input);
    if (problem) {
        managerSignupMessage(problem[1]);
        document.getElementById(problem[0])?.focus();
        return;
    }
    managerSignupBusy = true;
    const button = /** @type {any} */ (document.getElementById('managerSignupSubmit'));
    if (button) button.disabled = true;
    managerSignupMessage('');
    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email: input.email, password: input.password, options: { data: { full_name: input.fullName } }
        });
        if (error) {
            managerSignupMessage(/registered|already/i.test(String(error.message || ''))
                ? 'الإيميل ده مسجل قبل كده. جرّب تسجّل دخول.'
                : 'تعذر إنشاء الحساب. راجع البيانات وحاول تاني.');
            return;
        }
        // إيميل مسجل من قبل: Supabase يرجع مستخدمًا بلا هويات ولا جلسة.
        if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            managerSignupMessage('الإيميل ده مسجل قبل كده. جرّب تسجّل دخول.');
            return;
        }
        let done = 'وصلنا طلبك. حسابك بانتظار التفعيل، هنتواصل معاك أول ما يتفعّل.';
        if (data?.session && data.user) {
            const insertError = await insertManagerSignupRequest(data.user.id, input);
            if (insertError) {
                managerSignupMessage('اتعمل الحساب لكن تعذر إرسال الطلب. سجّل دخول وهنكمل الطلب تلقائيًا.');
                rememberPendingManagerSignup(input);
            }
            await supabaseClient.auth.signOut({ scope: 'local' });
        } else {
            rememberPendingManagerSignup(input);
            done = 'تأكد من إيميلك ثم انتظر تفعيل الحساب.';
        }
        document.getElementById('managerSignupForm')?.classList.add('hidden');
        managerSignupMessage(done, 'ok');
    } catch (error) {
        managerSignupMessage('تعذر الاتصال. تحقق من الإنترنت وحاول تاني.');
    } finally {
        managerSignupBusy = false;
        if (button) button.disabled = false;
    }
}

function rememberPendingManagerSignup(input) {
    try {
        localStorage.setItem(MANAGER_SIGNUP_PENDING_KEY + ':' + input.email, JSON.stringify({
            fullName: input.fullName, phone: input.phone, buildingName: input.buildingName
        }));
    } catch (error) { /* التخزين غير متاح */ }
}

// يُستدعى عندما يدخل مستخدم بلا أي مبنى. يرجع رسالة واضحة أو '' ليبقى الخطأ الأصلي.
async function resolveMemberlessSignupMessage(session) {
    try {
        const userId = session?.user?.id;
        if (!userId) return '';
        // بعد الرفض يمكن إعادة التقديم، فنقرأ أحدث طلب فقط.
        const { data: requests, error } = await supabaseClient.from('manager_signup_requests')
            .select('id,status').eq('user_id', userId).order('created_at', { ascending: false }).limit(1);
        if (error) return '';
        let request = Array.isArray(requests) ? requests[0] : null;
        if (!request) {
            const email = String(session.user.email || '').toLowerCase();
            let saved = null;
            try { saved = JSON.parse(localStorage.getItem(MANAGER_SIGNUP_PENDING_KEY + ':' + email) || 'null'); } catch (e) { saved = null; }
            if (!saved) return '';
            const insertError = await insertManagerSignupRequest(userId, saved);
            if (insertError) return '';
            try { localStorage.removeItem(MANAGER_SIGNUP_PENDING_KEY + ':' + email); } catch (e) { /* ignore */ }
            request = { status: 'pending' };
        }
        if (request.status === 'pending') return 'حسابك بانتظار التفعيل';
        if (request.status === 'rejected') return 'طلب التسجيل اترفض. تواصل مع الإدارة لو محتاج توضيح.';
    } catch (error) { /* يبقى الخطأ الأصلي */ }
    return '';
}

// ---- شاشة طلبات التسجيل (للمدير العام فقط) ----
async function refreshSignupAdminEntry() {
    const button = document.getElementById('signupAdminBtn');
    if (!button) return;
    let isAdmin = false;
    try {
        const userId = activeSession?.user?.id;
        if (userId) {
            const { data, error } = await supabaseClient.from('profiles').select('is_super_admin').eq('id', userId).maybeSingle();
            isAdmin = !error && data?.is_super_admin === true;
        }
    } catch (error) { isAdmin = false; }
    button.classList.toggle('hidden', !isAdmin);
}

function renderSignupRequests(rows) {
    const list = document.getElementById('signupRequestsList');
    if (!list) return;
    if (!rows.length) { list.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">لا توجد طلبات حاليًا</p>'; return; }
    list.innerHTML = rows.map(row => `
        <div class="app-input border rounded-2xl p-3 space-y-2" data-request-id="${esc(row.id)}">
            <div class="min-w-0">
                <p class="text-sm font-bold truncate">${esc(row.full_name || '—')}</p>
                <p class="text-xs text-slate-400 truncate">${esc(row.building_name || '—')} · <span dir="ltr">${esc(row.phone || '—')}</span></p>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <button type="button" onclick="decideSignupRequest('${esc(row.id)}','activate')" class="min-h-11 rounded-xl bg-emerald-600 text-white text-xs font-bold">تفعيل</button>
                <button type="button" onclick="decideSignupRequest('${esc(row.id)}','reject')" class="min-h-11 rounded-xl border border-rose-500/40 text-rose-400 text-xs font-bold">رفض</button>
            </div>
        </div>`).join('');
}

async function openSignupRequests() {
    if (typeof requireManager === 'function' && !requireManager()) return;
    openModal('signupRequestsModal');
    await loadSignupRequests();
}

async function loadSignupRequests() {
    const list = document.getElementById('signupRequestsList');
    if (list) list.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">جاري التحميل...</p>';
    const { data, error } = await supabaseClient.from('manager_signup_requests')
        .select('id,full_name,phone,building_name,created_at').eq('status', 'pending').order('created_at', { ascending: true });
    if (error) { if (list) list.innerHTML = '<p class="text-xs text-rose-400 text-center py-4">تعذر تحميل الطلبات.</p>'; return; }
    renderSignupRequests(data || []);
}

async function decideSignupRequest(requestId, action) {
    if (managerSignupBusy) return;
    const activate = action === 'activate';
    if (!confirm(activate ? 'هيتعمل مبنى جديد لصاحب الطلب ويبقى مديره. متابعة؟' : 'هيتم رفض الطلب. متابعة؟')) return;
    managerSignupBusy = true;
    try {
        const { error } = await supabaseClient.rpc(activate ? 'activate_manager_signup' : 'reject_manager_signup', { request_id: requestId });
        if (error) { toast('تعذر تنفيذ القرار. حدّث القائمة وحاول تاني.', 'error'); }
        else toast(activate ? 'تم التفعيل وإنشاء المبنى' : 'تم رفض الطلب');
    } finally {
        managerSignupBusy = false;
        await loadSignupRequests();
    }
}
