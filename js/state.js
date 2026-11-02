const monthsNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function fmtNum(n) { return (Number(n) || 0).toLocaleString('en-US'); }

function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();

    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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

let state = {
    buildingName:'', managerName:'', managerPhone:'', defaultSubscription:0, startingBalance:0,
    currentTheme:'dark',
    residents:[], income:[], expenses:[], notices:[], auditLogs:[], lastUpdated:0
};
let editingResidentId = null;
var currentUserRole = null;
var currentResidentId = null;

function logAction(action, details) {
    state.auditLogs.unshift({ id: generateId(), action, details, date: new Date().toISOString() });
    if (state.auditLogs.length > 200) state.auditLogs = state.auditLogs.slice(0, 200);
}

function cloneStateSnapshot() {
    return JSON.parse(JSON.stringify(state));
}

async function saveWithRollback(previousState) {
    const saved = await saveState();
    if (saved) {
        if (typeof renderAll === 'function') renderAll();
        return true;
    }
    state = previousState;
    if (typeof renderAll === 'function') renderAll();
    return false;
}

async function clearAuditLog() {
    if (!requireManager()) return;
    toast('سجل التدقيق محفوظ للمراجعة ولا يمكن مسحه من التطبيق.', 'info');
}

function getPaidAmountForMonth(residentId, month) {
    const paidCents = state.income.reduce((sum, payment) => {
        if (payment.residentId !== residentId || payment.month !== month) return sum;
        const amount = Number(payment.amount);
        return sum + (Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0);
    }, 0);
    return paidCents / 100;
}
function monthLabelToKey(month) {
    const [name, year] = String(month || '').trim().split(/\s+/);
    const index = monthsNames.indexOf(name);
    if (index < 0 || !/^\d{4}$/.test(year || '')) return null;
    return `${year}-${String(index + 1).padStart(2, '0')}-01`;
}

function getSubscriptionAmountForMonth(resident, month) {
    if (!resident) return 0;
    const monthKey = monthLabelToKey(month);
    const rates = Array.isArray(resident.subscriptionRates) ? resident.subscriptionRates : [];
    if (!monthKey || !rates.length) return Number(resident.monthlyAmount ?? state.defaultSubscription) || 0;
    const applicable = rates
        .filter(rate => /^\d{4}-\d{2}-01$/.test(rate.effectiveMonth) && rate.effectiveMonth <= monthKey)
        .sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
    return applicable.length
        ? Math.max(0, Number(applicable[applicable.length - 1].monthlyAmount) || 0)
        : 0;
}

function getMonthOutstanding(resident, month) {
    if (!resident) return 0;
    const due = getSubscriptionAmountForMonth(resident, month);
    const dueCents = Number.isFinite(due) ? Math.round(due * 100) : 0;
    const paidCents = Math.round(getPaidAmountForMonth(resident.id, month) * 100);
    return Math.max(0, dueCents - paidCents) / 100;
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
    const totalDebtCents = unpaidMonths.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
    return { count: unpaidMonths.length, totalDebt: totalDebtCents / 100, unpaidMonths: unpaidMonths.map(item => item.month) };
}

function getArrearsBucket(monthCount) {
    if (monthCount <= 1) return 'شهر واحد';
    if (monthCount <= 3) return '2–3 أشهر';
    return '4 أشهر فأكثر';
}

function buildArrearsReport() {
    const residents = state.residents.map(resident => {
        const debt = calculateCumulativeDebt(resident.id);
        const unpaidMonths = debt.unpaidMonths.map(month => ({ month, amount: getMonthOutstanding(resident, month) }));
        return {
            resident,
            count: debt.count,
            totalDebt: debt.totalDebt,
            bucket: getArrearsBucket(debt.count),
            unpaidMonths
        };
    }).filter(item => item.count > 0).sort((a, b) => b.totalDebt - a.totalDebt || String(a.resident.apartmentNumber || '').localeCompare(String(b.resident.apartmentNumber || ''), 'ar', { numeric: true }));

    const buckets = { 'شهر واحد': 0, '2–3 أشهر': 0, '4 أشهر فأكثر': 0 };
    residents.forEach(item => { buckets[item.bucket] += 1; });
    return {
        residents,
        totalDebt: residents.reduce((sum, item) => sum + Math.round(item.totalDebt * 100), 0) / 100,
        overdueResidents: residents.length,
        overdueMonths: residents.reduce((sum, item) => sum + item.count, 0),
        buckets
    };
}

function getActiveBuildingMonths() {
    const set = new Set();
    state.income.forEach(i => { if (i.month) set.add(i.month); });
    state.expenses.forEach(e => { if (e.month) set.add(e.month); });
    // Keep five years selectable so late payments and historical adjustments can be recorded.
    const cursor = new Date();
    cursor.setDate(1);
    for (let offset = 0; offset < 60; offset++) {
        set.add(`${monthsNames[cursor.getMonth()]} ${cursor.getFullYear()}`);
        cursor.setMonth(cursor.getMonth() - 1);
    }
    return Array.from(set).sort((a,b) => {
        const [ma,ya] = a.split(' '); const [mb,yb] = b.split(' ');
        if (ya !== yb) return parseInt(ya) - parseInt(yb);
        return monthsNames.indexOf(ma) - monthsNames.indexOf(mb);
    });
}

async function setTheme(theme) {
    if (currentUserRole !== 'manager') { toast('تغيير الإعدادات متاح للمدير فقط','error'); return; }
    if (!['dark','light','emerald','ocean','sand'].includes(theme)) theme = 'dark';
    const previousState = cloneStateSnapshot();
    state.currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    const themeColors = { dark:'#0b1020', light:'#f3f6fc', emerald:'#071c18', ocean:'#071827', sand:'#211b16' };
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[theme]);
    updateThemeSelection();
    if (!await saveWithRollback(previousState)) {
        document.body.setAttribute('data-theme', state.currentTheme);
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[state.currentTheme] || themeColors.dark);
        updateThemeSelection();
    }
}
