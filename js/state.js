// @ts-check
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

function formatApartmentLabel(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return 'شقة —';
    return /^شقة(?:\s|$)/.test(raw) ? raw : `شقة ${raw}`;
}

function stripIncomeBatchNote(notes) {
    const text = String(notes || '').trim();
    const match = text.match(/^دفعة موزعة\s+[A-Z0-9]+\s+\(\d+\/\d+\)(?:\s*·\s*([\s\S]*))?$/i);
    return match ? String(match[1] || '').trim() : text;
}

function sortMonthLabels(labels) {
    return Array.from(new Set((labels || []).filter(Boolean))).sort((a, b) => {
        const keyA = monthLabelToKey(a) || '';
        const keyB = monthLabelToKey(b) || '';
        return keyA.localeCompare(keyB);
    });
}

const INCOME_PAYMENT_METHOD_LABELS = Object.freeze({
    cash: 'نقدًا',
    wallet: 'محفظة إلكترونية',
    instapay: 'InstaPay',
    bank_transfer: 'تحويل بنكي'
});

const INCOME_PURPOSE_LABELS = Object.freeze({
    subscription: 'اشتراك شهري',
    services: 'أخرى',
    development: 'تطوير',
    emergency: 'صيانة طارئة',
    penalty: 'أخرى',
    donation: 'أخرى',
    other: 'أخرى',
    settlement: 'سداد تسوية'
});

const INCOME_PURPOSE_FORM_CODES = Object.freeze(['subscription', 'development', 'emergency', 'settlement', 'other']);

const INCOME_PURPOSE_DEFAULT_CASH_ACCOUNT = Object.freeze({
    subscription: 'main',
    services: 'main',
    development: 'development',
    emergency: 'emergency',
    penalty: 'main',
    donation: 'main',
    other: 'main',
    settlement: 'main'
});

const INCOME_PURPOSE_LOCKED_CASH_ACCOUNT = Object.freeze({
    subscription: true,
    services: false,
    development: true,
    emergency: true,
    penalty: true,
    donation: true,
    other: false,
    settlement: false
});

function normalizeIncomePurpose(purpose) {
    const value = String(purpose || '').trim();
    return Object.prototype.hasOwnProperty.call(INCOME_PURPOSE_LABELS, value) ? value : 'subscription';
}

function getIncomePurposeLabel(purpose) {
    return INCOME_PURPOSE_LABELS[normalizeIncomePurpose(purpose)];
}

function getIncomePurposeFormCode(purpose) {
    const normalized = normalizeIncomePurpose(purpose);
    return INCOME_PURPOSE_FORM_CODES.includes(normalized) ? normalized : 'other';
}

function isSubscriptionIncome(payment) {
    return normalizeIncomePurpose(payment?.purposeCode) === 'subscription';
}

function getIncomePurposeCashAccount(purpose) {
    return INCOME_PURPOSE_DEFAULT_CASH_ACCOUNT[getIncomePurposeFormCode(purpose)];
}

function isIncomePurposeCashAccountLocked(purpose) {
    return INCOME_PURPOSE_LOCKED_CASH_ACCOUNT[getIncomePurposeFormCode(purpose)] === true;
}

function populateIncomePurposeOptions(select, selectedPurpose = '') {
    if (!select) return;
    const current = getIncomePurposeFormCode(selectedPurpose);
    select.innerHTML = INCOME_PURPOSE_FORM_CODES
        .map(purpose => '<option value="' + esc(purpose) + '">' + esc(INCOME_PURPOSE_LABELS[purpose]) + '</option>')
        .join('');
    select.value = current;
}

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

const MS_PER_DAY = 86400000;

function getSubscriptionDueDate(monthLabel) {
    const key = monthLabelToKey(monthLabel);
    if (!key) return null;
    const [year, month] = key.split('-').map(Number);
    const dueDay = Math.min(28, Math.max(1, Number(state.subscriptionDueDay) || 1));
    const due = new Date(year, month - 1, dueDay, 0, 0, 0, 0);
    return Number.isNaN(due.getTime()) ? null : due;
}

// Overdue days are counted from the month label plus the due day plus the grace
// period (never from the payment date), so every screen shows the same figure.
function getSubscriptionOverdueDays(monthLabel, now = new Date()) {
    const deadline = getSubscriptionDueDeadline(monthLabel);
    const current = now instanceof Date ? now : new Date(now);
    if (!deadline || !Number.isFinite(current.getTime()) || current < deadline) return 0;
    return Math.floor((current.getTime() - deadline.getTime()) / MS_PER_DAY) + 1;
}

function formatOverdueDuration(days) {
    const value = Math.max(0, Math.floor(Number(days) || 0));
    if (value <= 0) return '';
    if (value === 1) return 'يوم واحد';
    if (value === 2) return 'يومان';
    if (value <= 10) return `${value} أيام`;
    return `${value} يومًا`;
}

const MANZIL_THEME_LIST = ['dark', 'light', 'emerald', 'ocean', 'sand', 'turquoise'];
const MANZIL_THEME_NAMES = { dark:'ليلي', light:'نهاري', emerald:'زمردي', ocean:'محيطي', sand:'رملي', turquoise:'فيروزي' };
const MANZIL_THEME_COLORS = { dark:'#0b1020', light:'#f3f6fc', emerald:'#071c18', ocean:'#071827', sand:'#211b16', turquoise:'#071f27' };

function normalizeThemeName(value) {
    return MANZIL_THEME_LIST.includes(value) ? value : null;
}

function resolveUserTheme(buildingTheme, profileTheme, role) {
    if (role === 'owner') {
        const own = normalizeThemeName(profileTheme);
        if (own) return own;
    }
    return normalizeThemeName(buildingTheme) || 'dark';
}

function applyThemeToDocument(theme) {
    const next = normalizeThemeName(theme) || 'dark';
    document.body.setAttribute('data-theme', next);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', MANZIL_THEME_COLORS[next]);
    return next;
}

let state = {
    buildingName:'', managerName:'', managerPhone:'', defaultSubscription:0, startingBalance:0,
    floorCount:0, apartmentsPerFloor:0,
    paymentSettings: normalizePaymentSettings(DEFAULT_PAYMENT_SETTINGS),
    subscriptionDueDay:1, subscriptionGraceDays:0, paymentAllocationPolicy:'oldest_first',
    currentTheme:'dark',
    residents:[], income:[], expenses:[], notices:[], ownerNotifications:[], managerNotifications:[], auditLogs:[],
    adjustments: [],
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
var currentProfileName = null;

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
        if (!isSubscriptionIncome(payment)) return sum;
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

function monthKeyToLabel(monthKey) {
    const [year, month] = String(monthKey || '').split('-').map(Number);
    if (!year || !month || month < 1 || month > 12) return '';
    return `${monthsNames[month - 1]} ${year}`;
}

function normalizeBillingStartMonth(value) {
    const match = String(value || '').trim().match(/^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/);
    return match ? `${match[1]}-${match[2]}-01` : null;
}

function getResidentBillingStartKey(resident) {
    const stored = normalizeBillingStartMonth(resident?.billingStartMonth);
    if (stored) return stored;
    const created = new Date(resident?.createdAt || Date.now());
    if (Number.isNaN(created.getTime())) return null;
    return `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-01`;
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

function getSettlementAdjustmentForMonth(residentId, month) {
    const monthKey = monthLabelToKey(month);
    if (!residentId || !monthKey) return null;
    return (Array.isArray(state.adjustments) ? state.adjustments : []).find(adjustment =>
        adjustment.residentId === residentId
        && adjustment.effectiveMonth === monthKey
        && adjustment.kind === 'settlement'
    ) || null;
}

function getSettlementPaidAmount(adjustmentId, excludeIncomeId = '') {
    if (!adjustmentId) return 0;
    const paidCents = (Array.isArray(state.income) ? state.income : []).reduce((sum, payment) => {
        if (payment.id === excludeIncomeId
            || payment.purposeCode !== 'settlement'
            || payment.settlementAdjustmentId !== adjustmentId) return sum;
        const amount = Number(payment.amount);
        return sum + (Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0);
    }, 0);
    return paidCents / 100;
}

function getSettlementRemainingAmount(adjustment, excludeIncomeId = '') {
    if (!adjustment || adjustment.kind !== 'settlement') return 0;
    const totalCents = Math.max(0, Math.round((Number(adjustment.amount) || 0) * 100));
    const paidCents = Math.round(getSettlementPaidAmount(adjustment.id, excludeIncomeId) * 100);
    return Math.max(0, totalCents - paidCents) / 100;
}

function getMonthlyDueAmountForMonth(resident, month) {
    if (!resident) return 0;
    const settlement = getSettlementAdjustmentForMonth(resident.id, month);
    if (settlement) return Math.max(0, Number(settlement.amount) || 0);
    const due = Number(getSubscriptionAmountForMonth(resident, month)) || 0;
    const adjusted = Number(getAdjustmentAmountForMonth(resident.id, month)) || 0;
    return Math.max(0, Math.round((due - adjusted) * 100)) / 100;
}

function getMonthlyDuePaidAmount(residentId, month) {
    const settlement = getSettlementAdjustmentForMonth(residentId, month);
    return settlement
        ? getSettlementPaidAmount(settlement.id)
        : getPaidAmountForMonth(residentId, month);
}

function getAdjustmentAmountForMonth(residentId, month) {
    const monthKey = monthLabelToKey(month);
    if (!residentId || !monthKey) return 0;
    const adjustments = Array.isArray(state.adjustments) ? state.adjustments : [];
    const adjustedCents = adjustments.reduce((sum, adjustment) => {
        if (adjustment.residentId !== residentId || adjustment.effectiveMonth !== monthKey
            || !['waiver', 'discount'].includes(adjustment.kind)) return sum;
        const amount = Number(adjustment.amount);
        return sum + (Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0);
    }, 0);
    return adjustedCents / 100;
}

function getMonthOutstanding(resident, month) {
    if (!resident) return 0;
    const dueCents = Math.round(getMonthlyDueAmountForMonth(resident, month) * 100);
    const paidCents = Math.round(getMonthlyDuePaidAmount(resident.id, month) * 100);
    return Math.max(0, dueCents - paidCents) / 100;
}

function calculateCumulativeDebt(residentId) {
    const resident = state.residents.find(r => r.id === residentId);
    if (!resident) return { count: 0, totalDebt: 0, unpaidMonths: [], unpaidMonthDetails: [], daysOverdue: 0, oldestMonth: null };
    const startKey = getResidentBillingStartKey(resident);
    if (!startKey) return { count: 0, totalDebt: 0, unpaidMonths: [], unpaidMonthDetails: [], daysOverdue: 0, oldestMonth: null };
    const [startYear, startMonth] = startKey.split('-').map(Number);
    const cursor = new Date(startYear, startMonth - 1, 1);
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
    const unpaidMonthDetails = unpaidMonths.map(item => ({
        month: item.month,
        monthKey: item.key,
        amount: item.amount,
        daysOverdue: getSubscriptionOverdueDays(item.month, now)
    }));
    const totalDebtCents = unpaidMonths.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
    const daysOverdue = unpaidMonthDetails.reduce((max, item) => Math.max(max, item.daysOverdue), 0);
    return {
        count: unpaidMonths.length,
        totalDebt: totalDebtCents / 100,
        unpaidMonths: unpaidMonthDetails.map(item => item.month),
        unpaidMonthDetails,
        daysOverdue,
        oldestMonth: unpaidMonthDetails[0]?.month || null
    };
}

function calculateSelectedMonthsAllocation(residentId, selectedMonths, amount, futureMonths = 12) {
    const resident = state.residents.find(item => item.id === residentId);
    const amountCents = Number.isFinite(Number(amount)) ? Math.round(Number(amount) * 100) : 0;
    const invalid = { allocations: [], totalAllocated: 0, remainingAmount: Math.max(0, amountCents) / 100, remainingCents: Math.max(0, amountCents), invalid: true };
    if (!resident || amountCents <= 0 || !Array.isArray(selectedMonths) || !selectedMonths.length) {
        return invalid;
    }
    const createdKey = getResidentBillingStartKey(resident);
    const selectedKeys = [];
    for (const month of selectedMonths) {
        const key = monthLabelToKey(month);
        if (!key || selectedKeys.includes(key)) continue;
        if (createdKey && key < createdKey) {
            return { allocations: [], totalAllocated: 0, remainingAmount: amountCents / 100, remainingCents: amountCents, invalid: true, invalidStart: true };
        }
        selectedKeys.push(key);
    }
    if (!selectedKeys.length) return invalid;
    selectedKeys.sort((a, b) => a.localeCompare(b));

    const targets = selectedKeys.slice();
    const futureLimit = Math.min(24, Math.max(0, Number(futureMonths) || 0));
    const [lastYear, lastMonth] = selectedKeys[selectedKeys.length - 1].split('-').map(Number);
    const cursor = new Date(Date.UTC(lastYear, lastMonth - 1, 1));
    for (let offset = 0; offset < futureLimit; offset += 1) {
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-01`;
        if (!targets.includes(key)) targets.push(key);
    }

    const allocations = [];
    let remainingCents = amountCents;
    for (const key of targets) {
        if (remainingCents <= 0) break;
        const [year, monthNumber] = key.split('-').map(Number);
        const monthLabel = `${monthsNames[monthNumber - 1]} ${year}`;
        const outstandingCents = Math.max(0, Math.round(getMonthOutstanding(resident, monthLabel) * 100));
        if (outstandingCents <= 0 || getSettlementAdjustmentForMonth(resident.id, monthLabel)) continue;
        const allocationCents = Math.min(remainingCents, outstandingCents);
        allocations.push({ month: monthLabel, amount: allocationCents / 100, amountCents: allocationCents });
        remainingCents -= allocationCents;
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

function calculateIncomeAllocationPreview(residentId, amount, selectedMonth, maxMonths = 120, policyOverride = '', selectedMonths = null) {
    if (Array.isArray(selectedMonths) && selectedMonths.length) {
        return calculateSelectedMonthsAllocation(residentId, selectedMonths, amount, 12);
    }
    const resident = state.residents.find(item => item.id === residentId);
    const amountCents = Number.isFinite(Number(amount)) ? Math.round(Number(amount) * 100) : 0;
    const selectedKey = monthLabelToKey(selectedMonth);
    if (!resident || amountCents <= 0 || !selectedKey) {
        return { allocations: [], totalAllocated: 0, remainingAmount: Math.max(0, amountCents) / 100, remainingCents: Math.max(0, amountCents), invalid: true };
    }

    const createdKey = getResidentBillingStartKey(resident) || selectedKey;
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

    const allocationPolicy = policyOverride || state.paymentAllocationPolicy;
    if (allocationPolicy === 'selected_month_first') {
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
        if (outstandingCents > 0 && !getSettlementAdjustmentForMonth(resident.id, monthLabel)) {
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
            const unpaidMonths = (debt.unpaidMonthDetails || [])
                .map(item => ({
                    month: item.month,
                    monthKey: item.monthKey || monthLabelToKey(item.month),
                    amount: item.amount,
                    daysOverdue: item.daysOverdue || 0
                }))
                .filter(item => (!fromKey || (item.monthKey && item.monthKey >= fromKey))
                    && (!toKey || (item.monthKey && item.monthKey <= toKey)))
                .map(({ month, amount, daysOverdue }) => ({ month, amount, daysOverdue }));
            const count = unpaidMonths.length;
            const totalCents = unpaidMonths.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
            const daysOverdue = unpaidMonths.reduce((max, item) => Math.max(max, item.daysOverdue), 0);
            return {
                resident,
                count,
                totalDebt: totalCents / 100,
                daysOverdue,
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
    const set = new Set([getCurrentMonth()]);
    state.income.forEach(i => { if (i.month) set.add(i.month); });
    state.expenses.forEach(e => { if (e.month) set.add(e.month); });
    return sortMonthLabels(Array.from(set));
}

function getRecentMonthLabels(count = 12) {
    const total = Math.max(1, Number(count) || 1);
    const cursor = new Date();
    cursor.setDate(1);
    const labels = [];
    for (let offset = 0; offset < total; offset += 1) {
        labels.unshift(`${monthsNames[cursor.getMonth()]} ${cursor.getFullYear()}`);
        cursor.setMonth(cursor.getMonth() - 1);
    }
    return labels;
}

function getBuildingMonthOptions(count = 12) {
    return sortMonthLabels(getActiveBuildingMonths().concat(getRecentMonthLabels(count)));
}

function getIncomeMonthLabels(resident, includeMonths = []) {
    const set = new Set(getActiveBuildingMonths());
    getRecentMonthLabels(12).forEach(month => set.add(month));
    includeMonths.filter(Boolean).forEach(month => set.add(month));
    if (!resident) return sortMonthLabels(Array.from(set));

    state.income
        .filter(payment => payment.residentId === resident.id && payment.month)
        .forEach(payment => set.add(payment.month));

    const candidates = [];
    const billingStartKey = getResidentBillingStartKey(resident);
    if (billingStartKey) {
        const [year, month] = billingStartKey.split('-').map(Number);
        candidates.push(new Date(year, month - 1, 1));
    }
    (Array.isArray(resident.subscriptionRates) ? resident.subscriptionRates : []).forEach(rate => {
        const [year, month] = String(rate.effectiveMonth || '').split('-').map(Number);
        if (year && month) candidates.push(new Date(year, month - 1, 1));
    });
    if (!candidates.length) return sortMonthLabels(Array.from(set));

    const now = new Date();
    const oldestAllowed = new Date(now.getFullYear(), now.getMonth() - 119, 1);
    let start = new Date(Math.min(...candidates.map(date => date.getTime())));
    if (start < oldestAllowed) start = oldestAllowed;
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= now) {
        set.add(`${monthsNames[cursor.getMonth()]} ${cursor.getFullYear()}`);
        cursor.setMonth(cursor.getMonth() + 1);
    }
    return sortMonthLabels(Array.from(set));
}

function getIncomeCollectionMonthLabels(resident, futureMonths = 12, includeMonths = []) {
    if (!resident) return sortMonthLabels(Array.isArray(includeMonths) ? includeMonths.filter(Boolean) : []);
    const now = new Date();
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let start = currentStart;
    const billingStartKey = getResidentBillingStartKey(resident);
    if (billingStartKey) {
        const [year, month] = billingStartKey.split('-').map(Number);
        const billingStart = new Date(year, month - 1, 1);
        if (billingStart < start) start = billingStart;
    }
    let firstUnpaid = null;
    const scan = new Date(start);
    while (scan < currentStart) {
        const label = `${monthsNames[scan.getMonth()]} ${scan.getFullYear()}`;
        if (getMonthOutstanding(resident, label) > 0) { firstUnpaid = new Date(scan); break; }
        scan.setMonth(scan.getMonth() + 1);
    }
    start = firstUnpaid || currentStart;
    const future = Math.min(24, Math.max(0, Number(futureMonths) || 0));
    const end = new Date(now.getFullYear(), now.getMonth() + future, 1);
    const labels = [];
    const cursor = new Date(start);
    while (cursor <= end) {
        labels.push(`${monthsNames[cursor.getMonth()]} ${cursor.getFullYear()}`);
        cursor.setMonth(cursor.getMonth() + 1);
    }
    (Array.isArray(includeMonths) ? includeMonths : []).filter(Boolean).forEach(month => labels.push(month));
    return sortMonthLabels(labels);
}

function getIncomeMonthOptionLabel(resident, month) {
    if (!resident || !month) return month || '';
    const outstanding = getMonthOutstanding(resident, month);
    if (outstanding <= 0) return `${month} · مسدد`;
    const key = monthLabelToKey(month);
    const currentKey = monthLabelToKey(getCurrentMonth());
    const overdue = isSubscriptionMonthOverdue(month) || Boolean(key && currentKey && key < currentKey);
    return `${month} · ${overdue ? 'متأخر' : 'مستحق'} ${fmtNum(outstanding)} ج.م`;
}

function getResidentCollectionSummary(resident) {
    if (!resident) return null;
    const debt = calculateCumulativeDebt(resident.id);
    const currentMonth = getCurrentMonth();
    const lastPayment = state.income
        .filter(payment => payment.residentId === resident.id)
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())[0] || null;
    return {
        debt,
        currentMonth,
        currentSubscription: getSubscriptionAmountForMonth(resident, currentMonth),
        currentOutstanding: getMonthOutstanding(resident, currentMonth),
        lastPayment
    };
}

async function setTheme(theme) {
    if (currentUserRole !== 'manager') { toast('تغيير الإعدادات متاح للمدير فقط','error'); return; }
    const next = normalizeThemeName(theme) || 'dark';
    const previousState = cloneStateSnapshot();
    state.currentTheme = next;
    applyThemeToDocument(next);
    updateThemeSelection();
    if (!await saveWithRollback(previousState)) {
        applyThemeToDocument(state.currentTheme);
        updateThemeSelection();
    }
}
