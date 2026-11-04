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

const INCOME_PAYMENT_METHOD_LABELS = Object.freeze({
    cash: 'نقدًا',
    wallet: 'محفظة إلكترونية',
    instapay: 'InstaPay',
    bank_transfer: 'تحويل بنكي'
});

function getIncomePaymentMethodLabel(method) {
    return INCOME_PAYMENT_METHOD_LABELS[method] || 'غير محدد';
}

let state = {
    buildingName:'', managerName:'', managerPhone:'', defaultSubscription:0, startingBalance:0,
    floorCount:0, apartmentsPerFloor:0,
    currentTheme:'dark',
    residents:[], income:[], expenses:[], notices:[], ownerNotifications:[], auditLogs:[],
    cashAccountBalances: { main: 0, development: 0, emergency: 0 }, cashTransfers: [], lastUpdated:0
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

let saveRollbackPendingCount = 0;
let saveRollbackBaseline = null;
let saveExecutionQueue = Promise.resolve();

function enqueueStateSave() {
    const queuedSave = saveExecutionQueue.then(() => saveState());
    saveExecutionQueue = queuedSave.then(() => undefined, () => undefined);
    return queuedSave;
}

async function saveWithRollback(previousState) {
    if (saveRollbackPendingCount === 0) saveRollbackBaseline = previousState;
    saveRollbackPendingCount += 1;
    const attemptedState = cloneStateSnapshot();

    let saved = false;
    try {
        saved = await enqueueStateSave();
    } catch (error) {
        console.error('Save operation failed:', error);
    }

    if (saved) {
        saveRollbackBaseline = attemptedState;
    }
    saveRollbackPendingCount -= 1;

    if (!saved && saveRollbackPendingCount === 0) {
        state = saveRollbackBaseline || previousState;
    }
    if (saveRollbackPendingCount === 0) {
        saveRollbackBaseline = null;
    }

    if (typeof renderAll === 'function') renderAll();
    return saved;
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

function calculateIncomeAllocationPreview(residentId, amount, selectedMonth, maxMonths = 120) {
    const resident = state.residents.find(item => item.id === residentId);
    const amountCents = Number.isFinite(Number(amount)) ? Math.round(Number(amount) * 100) : 0;
    const selectedKey = monthLabelToKey(selectedMonth);
    if (!resident || amountCents <= 0 || !selectedKey) {
        return { allocations: [], totalAllocated: 0, remainingAmount: Math.max(0, amountCents) / 100, remainingCents: Math.max(0, amountCents), invalid: true };
    }

    const createdAt = new Date(resident.createdAt || Date.now());
    const createdKey = Number.isNaN(createdAt.getTime())
        ? selectedKey
        : `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-01`;
    if (selectedKey < createdKey) {
        return { allocations: [], totalAllocated: 0, remainingAmount: amountCents / 100, remainingCents: amountCents, invalid: true, invalidStart: true };
    }

    const priorUnpaid = calculateCumulativeDebt(residentId).unpaidMonths
        .map(month => ({ month, key: monthLabelToKey(month) }))
        .filter(item => item.key && item.key <= selectedKey);
    const startKey = priorUnpaid[0]?.key || selectedKey;
    const [year, monthNumber] = startKey.split('-').map(Number);
    const cursor = new Date(Date.UTC(year, monthNumber - 1, 1));
    const allocations = [];
    let remainingCents = amountCents;
    const limit = Number.isInteger(maxMonths) && maxMonths > 0 ? Math.min(maxMonths, 240) : 120;

    for (let offset = 0; offset < limit && remainingCents > 0; offset += 1) {
        const monthLabel = `${monthsNames[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`;
        const outstandingCents = Math.max(0, Math.round(getMonthOutstanding(resident, monthLabel) * 100));
        if (outstandingCents > 0) {
            const allocationCents = Math.min(remainingCents, outstandingCents);
            allocations.push({ month: monthLabel, amount: allocationCents / 100, amountCents: allocationCents });
            remainingCents -= allocationCents;
        }
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return {
        allocations,
        totalAllocated: (amountCents - remainingCents) / 100,
        remainingAmount: remainingCents / 100,
        remainingCents,
        startMonth: allocations[0]?.month || null,
        invalid: false,
        horizonExceeded: remainingCents > 0
    };
}

function getArrearsBucket(monthCount) {
    if (monthCount <= 1) return 'شهر واحد';
    if (monthCount <= 3) return '2–3 أشهر';
    return '4 أشهر فأكثر';
}

function buildArrearsReport(filters = {}) {
    const residentId = String(filters.residentId || '');
    const fromKey = filters.fromMonth ? `${filters.fromMonth}-01` : '';
    const toKey = filters.toMonth ? `${filters.toMonth}-01` : '';
    const statusBuckets = {
        one: 'شهر واحد',
        two_three: '2–3 أشهر',
        four_plus: '4 أشهر فأكثر'
    };
    if (fromKey && toKey && fromKey > toKey) {
        return {
            residents: [], totalDebt: 0, overdueResidents: 0, overdueMonths: 0,
            buckets: { 'شهر واحد': 0, '2–3 أشهر': 0, '4 أشهر فأكثر': 0 },
            invalidRange: true
        };
    }

    const residents = state.residents
        .filter(resident => !residentId || resident.id === residentId)
        .map(resident => {
            const debt = calculateCumulativeDebt(resident.id);
            const unpaidMonths = debt.unpaidMonths
                .map(month => ({ month, monthKey: monthLabelToKey(month), amount: getMonthOutstanding(resident, month) }))
                .filter(item => (!fromKey || (item.monthKey && item.monthKey >= fromKey))
                    && (!toKey || (item.monthKey && item.monthKey <= toKey)))
                .map(({ month, amount }) => ({ month, amount }));
            const count = unpaidMonths.length;
            const totalCents = unpaidMonths.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
            return {
                resident,
                count,
                totalDebt: totalCents / 100,
                bucket: getArrearsBucket(count),
                unpaidMonths
            };
        })
        .filter(item => item.count > 0)
        .filter(item => !filters.status || filters.status === 'all' || item.bucket === statusBuckets[filters.status])
        .sort((a, b) => b.totalDebt - a.totalDebt || String(a.resident.apartmentNumber || '').localeCompare(String(b.resident.apartmentNumber || ''), 'ar', { numeric: true }));

    const buckets = { 'شهر واحد': 0, '2–3 أشهر': 0, '4 أشهر فأكثر': 0 };
    residents.forEach(item => { buckets[item.bucket] += 1; });
    return {
        residents,
        totalDebt: residents.reduce((sum, item) => sum + Math.round(item.totalDebt * 100), 0) / 100,
        overdueResidents: residents.length,
        overdueMonths: residents.reduce((sum, item) => sum + item.count, 0),
        buckets,
        invalidRange: false
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
