const monthsNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function fmtNum(n) { return (Number(n) || 0).toLocaleString('en-US'); }

function toCents(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function fmtMoney(value) { return `${fmtNum(value)} ج.م`; }

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

function confirmRecordDeletion(label) {
    return confirm(`سيتم حذف ${label} نهائيًا من السجلات والتقارير، ولا يمكن التراجع عن هذا الإجراء. متابعة؟`);
}

function formatDate(iso) { if (!iso) return ''; try { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}); } catch(e){ return ''; } }
function getCurrentMonth() { const d = new Date(); return `${monthsNames[d.getMonth()]} ${d.getFullYear()}`; }

const INCOME_PAYMENT_METHOD_LABELS = Object.freeze({
    cash: 'نقدًا',
    wallet: 'محفظة إلكترونية',
    instapay: 'InstaPay',
    bank_transfer: 'تحويل بنكي'
});

const DEFAULT_PAYMENT_SETTINGS = Object.freeze({
    cash: { enabled: true },
    wallet: { enabled: true, provider: '', accountName: '', number: '' },
    instapay: { enabled: true, accountName: '', address: '' },
    bank_transfer: { enabled: true, bankName: '', accountName: '', accountNumber: '', iban: '' }
});

function normalizePaymentSettings(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const text = (input, max = 120) => String(input ?? '').trim().slice(0, max);
    const method = key => source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
        ? source[key]
        : {};
    const cash = method('cash');
    const wallet = method('wallet');
    const instapay = method('instapay');
    const bank = method('bank_transfer');
    return {
        cash: { enabled: cash.enabled !== false },
        wallet: {
            enabled: wallet.enabled !== false,
            provider: text(wallet.provider, 60),
            accountName: text(wallet.accountName, 120),
            number: text(wallet.number, 32)
        },
        instapay: {
            enabled: instapay.enabled !== false,
            accountName: text(instapay.accountName, 120),
            address: text(instapay.address, 120)
        },
        bank_transfer: {
            enabled: bank.enabled !== false,
            bankName: text(bank.bankName, 100),
            accountName: text(bank.accountName, 120),
            accountNumber: text(bank.accountNumber, 48),
            iban: text(bank.iban, 64)
        }
    };
}

function getIncomePaymentMethodLabel(method) {
    return INCOME_PAYMENT_METHOD_LABELS[method] || 'غير محدد';
}

function isIncomePaymentMethodEnabled(method) {
    if (!Object.prototype.hasOwnProperty.call(INCOME_PAYMENT_METHOD_LABELS, method)) return false;
    const settings = normalizePaymentSettings(state.paymentSettings);
    return settings[method]?.enabled === true;
}

function populatePaymentMethodOptions(select, selectedMethod = '', preserveUnavailable = false) {
    if (!select) return;
    const current = String(selectedMethod || '');
    const settings = normalizePaymentSettings(state.paymentSettings);
    const options = Object.entries(INCOME_PAYMENT_METHOD_LABELS)
        .filter(([method]) => settings[method]?.enabled || (preserveUnavailable && method === current))
        .map(([method, label]) => {
            const unavailable = !settings[method]?.enabled;
            const suffix = unavailable ? ' (غير مفعّل حاليًا)' : '';
            return '<option value="' + esc(method) + '">' + esc(label + suffix) + '</option>';
        });
    select.innerHTML = '<option value="">اختر طريقة الدفع</option>' + options.join('');
    if (current && options.length) select.value = current;
}

function getSubscriptionDueDeadline(monthLabel) {
    const key = monthLabelToKey(monthLabel);
    if (!key) return null;
    const [year, month] = key.split('-').map(Number);
    const dueDay = Math.min(28, Math.max(1, Number(state.subscriptionDueDay) || 1));
    const graceDays = Math.min(31, Math.max(0, Number(state.subscriptionGraceDays) || 0));
    const deadline = new Date(year, month - 1, dueDay + graceDays + 1, 0, 0, 0, 0);
    return Number.isNaN(deadline.getTime()) ? null : deadline;
}

function isSubscriptionMonthOverdue(monthLabel, now = new Date()) {
    const deadline = getSubscriptionDueDeadline(monthLabel);
    const current = now instanceof Date ? now : new Date(now);
    return Boolean(deadline && Number.isFinite(current.getTime()) && current >= deadline);
}

let state = {
    buildingName:'', managerName:'', managerPhone:'', defaultSubscription:0, startingBalance:0,
    floorCount:0, apartmentsPerFloor:0,
    paymentSettings: normalizePaymentSettings(DEFAULT_PAYMENT_SETTINGS),
    subscriptionDueDay:1, subscriptionGraceDays:0, paymentAllocationPolicy:'oldest_first',
    currentTheme:'dark',
    residents:[], income:[], expenses:[], notices:[], ownerNotifications:[], auditLogs:[],
    cashAccountBalances: { main: 0, development: 0, emergency: 0 }, cashTransfers: [], lastUpdated:0
};
const DEFAULT_RECEIPT_THANK_YOU = 'شكراً لالتزامكم، ونسعد دائماً بخدمتكم.';
// NULL means the building has not migrated its legacy device-only value yet.
state.receiptThankYouTemplate = state.receiptThankYouTemplate ?? null;
state.reminderMessageTemplate = state.reminderMessageTemplate ?? null;
function getReceiptSettingsKey() {
    const buildingId = typeof activeBuildingId === 'undefined' ? 'default' : (activeBuildingId || 'default');
    return `manzil:${buildingId}:receipt-thank-you`;
}
function getReceiptThankYouMessage() {
    if (state.receiptThankYouTemplate !== null && state.receiptThankYouTemplate !== undefined) {
        return String(state.receiptThankYouTemplate).trim() || DEFAULT_RECEIPT_THANK_YOU;
    }
    try { return String(localStorage.getItem(getReceiptSettingsKey()) || '').trim() || DEFAULT_RECEIPT_THANK_YOU; }
    catch { return DEFAULT_RECEIPT_THANK_YOU; }
}

const DEFAULT_REMINDER_TEMPLATE = 'مرحباً {name}،\nنذكركم بسداد مستحقات العمارة {building}.\nإجمالي المتأخرات: {amount} ج.م ({count} شهر).\nالشهور المستحقة: {months}\nشكراً لتعاونكم.';
function getReminderTemplateKey() {
    const buildingId = typeof activeBuildingId === 'undefined' ? 'default' : (activeBuildingId || 'default');
    return 'manzil:' + buildingId + ':arrears-reminder-template';
}
function getReminderMessageTemplate() {
    if (state.reminderMessageTemplate !== null && state.reminderMessageTemplate !== undefined) {
        return String(state.reminderMessageTemplate).trim().slice(0, 500) || DEFAULT_REMINDER_TEMPLATE;
    }
    try {
        const value = String(localStorage.getItem(getReminderTemplateKey()) || '').trim();
        return value.slice(0, 500) || DEFAULT_REMINDER_TEMPLATE;
    } catch {
        return DEFAULT_REMINDER_TEMPLATE;
    }
}
function renderReminderTemplate(template, values) {
    return String(template || DEFAULT_REMINDER_TEMPLATE).replace(/\{([a-z_]+)\}/gi, (match, key) =>
        Object.prototype.hasOwnProperty.call(values, key.toLowerCase()) ? String(values[key.toLowerCase()] ?? '') : ''
    );
}

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
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const unpaidMonths = allMonths
        .map(month => ({ month, key: monthLabelToKey(month), amount: getMonthOutstanding(resident, month) }))
        .filter(item => item.amount > 0 && (
            (item.key || '').slice(0, 7) < currentMonthKey
            || isSubscriptionMonthOverdue(item.month, now)
        ));
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
    const allocations = [];
    let remainingCents = amountCents;
    const limit = Number.isInteger(maxMonths) && maxMonths > 0 ? Math.min(maxMonths, 240) : 120;
    const monthKeys = [];

    if (state.paymentAllocationPolicy === 'selected_month_first') {
        monthKeys.push(selectedKey);
        priorUnpaid
            .filter(item => item.key < selectedKey)
            .sort((a, b) => a.key.localeCompare(b.key))
            .forEach(item => monthKeys.push(item.key));
        const [year, monthNumber] = selectedKey.split('-').map(Number);
        const cursor = new Date(Date.UTC(year, monthNumber - 1, 1));
        for (let offset = 0; offset < limit; offset += 1) {
            const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
            if (key !== selectedKey) monthKeys.push(key);
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }
    } else {
        const [year, monthNumber] = startKey.split('-').map(Number);
        const cursor = new Date(Date.UTC(year, monthNumber - 1, 1));
        for (let offset = 0; offset < limit; offset += 1) {
            monthKeys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }
    }

    for (const key of monthKeys) {
        if (remainingCents <= 0) break;
        const [year, monthNumber] = key.split('-').map(Number);
        const monthLabel = `${monthsNames[monthNumber - 1]} ${year}`;
        const outstandingCents = Math.max(0, Math.round(getMonthOutstanding(resident, monthLabel) * 100));
        if (outstandingCents > 0) {
            const allocationCents = Math.min(remainingCents, outstandingCents);
            allocations.push({ month: monthLabel, amount: allocationCents / 100, amountCents: allocationCents });
            remainingCents -= allocationCents;
        }
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
    if (!['dark','light','emerald','ocean','sand','turquoise'].includes(theme)) theme = 'dark';
    const previousState = cloneStateSnapshot();
    state.currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    const themeColors = { dark:'#0b1020', light:'#f3f6fc', emerald:'#071c18', ocean:'#071827', sand:'#211b16', turquoise:'#071f27' };
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[theme]);
    updateThemeSelection();
    if (!await saveWithRollback(previousState)) {
        document.body.setAttribute('data-theme', state.currentTheme);
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[state.currentTheme] || themeColors.dark);
        updateThemeSelection();
    }
}
