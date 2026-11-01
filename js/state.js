const monthsNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function fmtNum(n) { return (Number(n) || 0).toLocaleString('en-US'); }

function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function generateId() { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7); }

function toast(msg, type = 'success') {
    const colors = { success: 'bg-emerald-600 text-white border-emerald-500', error: 'bg-rose-600 text-white border-rose-500', info: 'bg-indigo-600 text-white border-indigo-500' };
    const el = document.createElement('div');
    el.className = `toast ${colors[type]||colors.info} px-5 py-3 rounded-2xl text-xs font-bold shadow-2xl border pointer-events-auto`;
    el.textContent = msg;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'all 0.3s'; setTimeout(() => el.remove(), 300); }, 2500);
}

function formatDate(iso) { if (!iso) return ''; try { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}); } catch(e){ return ''; } }
function getCurrentMonth() { const d = new Date(); return `${monthsNames[d.getMonth()]} ${d.getFullYear()}`; }

const STORAGE_KEY = 'manzil_data_v2';
let state = {
    buildingName:'', managerName:'', managerPhone:'', defaultSubscription:0, startingBalance:0,
    pinCode:'0000', pinEnabled:false, currentTheme:'dark',
    residents:[], income:[], expenses:[], notices:[], auditLogs:[], lastUpdated:0
};
let githubConfig = { token: localStorage.getItem('manzil_gh_token')||'', gistId: localStorage.getItem('manzil_gh_gist')||'' };
let editingResidentId = null;
let syncing = false;
let storageWarningShown = false;

function saveState() {
    state.lastUpdated = Date.now();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
    catch(e) {
        console.error('تعذر حفظ بيانات Manzil محلياً:', e);
        if (!storageWarningShown) { toast('تعذر حفظ التغييرات على هذا الجهاز. صدّر نسخة احتياطية أو أفرغ مساحة.','error'); storageWarningShown = true; }
        return false;
    }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('بيانات الحالة ليست كائناً');
        state = { ...state, ...saved };
        ['residents','income','expenses','notices','auditLogs'].forEach(key => {
            if (!Array.isArray(state[key])) state[key] = [];
        });
        ['defaultSubscription','startingBalance'].forEach(key => {
            const value = Number(state[key]);
            state[key] = Number.isFinite(value) ? value : 0;
        });
        if (!['dark','light','emerald'].includes(state.currentTheme)) state.currentTheme = 'dark';
        if (!/^\d{4}$/.test(String(state.pinCode || ''))) state.pinCode = '0000';
        state.pinEnabled = Boolean(state.pinEnabled);
    } catch(e) {
        console.error('تعذر قراءة بيانات Manzil المحفوظة:', e);
        toast('تعذر قراءة البيانات المحفوظة؛ لم تُحذف من الجهاز.','error');
    }
}

function logAction(action, details) {
    state.auditLogs.unshift({ id: generateId(), action, details, date: new Date().toISOString() });
    if (state.auditLogs.length > 200) state.auditLogs = state.auditLogs.slice(0, 200);
}

function clearAuditLog() {
    if (!confirm('مسح سجل التدقيق بالكامل؟')) return;
    state.auditLogs = []; saveState(); renderAuditLog(); toast('تم مسح السجل','info');
}

function getPaidAmountForMonth(residentId, month) {
    return state.income.reduce((sum, payment) => {
        if (payment.residentId !== residentId || payment.month !== month) return sum;
        const amount = Number(payment.amount);
        return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0);
}

function getMonthOutstanding(resident, month) {
    if (!resident) return 0;
    const due = Number(resident.monthlyAmount ?? state.defaultSubscription);
    return Math.max(0, (Number.isFinite(due) ? due : 0) - getPaidAmountForMonth(resident.id, month));
}

function calculateCumulativeDebt(residentId) {
    const resident = state.residents.find(r => r.id === residentId);
    if (!resident) return { count: 0, totalDebt: 0, unpaidMonths: [] };
    const start = new Date(resident.createdAt || Date.now());
    if (Number.isNaN(start.getTime())) return { count: 0, totalDebt: 0, unpaidMonths: [] };
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const now = new Date();
    const allMonths = [];
    while (cursor <= now) { allMonths.push(`${monthsNames[cursor.getMonth()]} ${cursor.getFullYear()}`); cursor.setMonth(cursor.getMonth()+1); }
    const unpaidMonths = allMonths.map(month => ({ month, amount: getMonthOutstanding(resident, month) })).filter(item => item.amount > 0);
    return { count: unpaidMonths.length, totalDebt: unpaidMonths.reduce((sum, item) => sum + item.amount, 0), unpaidMonths: unpaidMonths.map(item => item.month) };
}

function getActiveBuildingMonths() {
    const set = new Set();
    state.income.forEach(i => { if (i.month) set.add(i.month); });
    state.expenses.forEach(e => { if (e.month) set.add(e.month); });
    set.add(getCurrentMonth());
    return Array.from(set).sort((a,b) => {
        const [ma,ya] = a.split(' '); const [mb,yb] = b.split(' ');
        if (ya !== yb) return parseInt(ya) - parseInt(yb);
        return monthsNames.indexOf(ma) - monthsNames.indexOf(mb);
    });
}

function setTheme(theme) {
    if (!['dark','light','emerald'].includes(theme)) theme = 'dark';
    state.currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', theme==='light'?'#f1f5f9':theme==='emerald'?'#021a13':'#090d16');
    saveState();
}

let pinAttempts = 0, pinLockedUntil = 0;

function checkPinLockOnStart() {
    if (!state.pinEnabled) return;
    const m = document.getElementById('pinLockModal');
    m.classList.remove('hidden'); m.classList.add('flex'); m.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    setTimeout(() => document.querySelectorAll('.pin-digit')[0]?.focus(), 150);
}

function handlePinInput(el, index) {
    if (el.value.length === 1 && index < 3) document.querySelectorAll('.pin-digit')[index+1]?.focus();
    const inputs = document.querySelectorAll('.pin-digit');
    if (Array.from(inputs).every(i => i.value.length === 1)) setTimeout(verifyPinCode, 100);
}

function verifyPinCode() {
    const err = document.getElementById('pinErrorMsg');
    if (Date.now() < pinLockedUntil) {
        err.textContent = `مقفول، حاول بعد ${Math.ceil((pinLockedUntil-Date.now())/1000)} ثانية`;
        err.classList.remove('hidden'); return;
    }
    const inputs = document.querySelectorAll('.pin-digit');
    const entered = Array.from(inputs).map(i => i.value).join('');
    if (entered === state.pinCode) {
        pinAttempts = 0;
        const m = document.getElementById('pinLockModal'); m.classList.add('hidden'); m.classList.remove('flex'); m.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        toast('تم فتح النظام','success');
    } else {
        pinAttempts++;
        inputs.forEach(i => i.value = ''); inputs[0]?.focus();
        if (pinAttempts >= 3) { pinLockedUntil = Date.now()+30000; pinAttempts = 0; err.textContent = 'محاولات خاطئة كثيرة — مقفول 30 ثانية'; }
        else err.textContent = `رمز خاطئ، باقي ${3-pinAttempts} محاولات`;
        err.classList.remove('hidden');
    }
}
