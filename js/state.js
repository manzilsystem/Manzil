const monthsNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function fmtNum(n) { return (Number(n) || 0).toLocaleString('en-US'); }

function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function generateId() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2, 7); }

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
    if (saved) return true;
    state = previousState;
    if (typeof renderAll === 'function') renderAll();
    return false;
}

async function clearAuditLog() {
    if (!requireManager()) return;
    if (!confirm('مسح سجل التدقيق بالكامل؟')) return;
    const previousState = cloneStateSnapshot();
    state.auditLogs = [];
    if (!await saveWithRollback(previousState)) return;
    renderAuditLog();
    toast('تم مسح السجل','info');
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
        totalDebt: residents.reduce((sum, item) => sum + item.totalDebt, 0),
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
    if (!['dark','light','emerald'].includes(theme)) theme = 'dark';
    const previousState = cloneStateSnapshot();
    state.currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', theme==='light'?'#f1f5f9':theme==='emerald'?'#021a13':'#090d16');
    if (!await saveWithRollback(previousState)) {
        document.body.setAttribute('data-theme', state.currentTheme);
        document.querySelector('meta[name="theme-color"]').setAttribute('content', state.currentTheme==='light'?'#f1f5f9':state.currentTheme==='emerald'?'#021a13':'#090d16');
    }
}
