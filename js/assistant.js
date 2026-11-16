// @ts-check
// عم عبده البواب — a local, deterministic assistant. It never calls the network:
// every answer is computed from `state` and the existing billing helpers.

const ASSISTANT_NAME = 'عم عبده البواب';
const ASSISTANT_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const ASSISTANT_CASH_LABELS = Object.freeze({
    main: 'الخزنة الرئيسية',
    development: 'صندوق التطوير',
    emergency: 'صندوق الصيانة الطارئة'
});
const ASSISTANT_SUGGESTIONS = Object.freeze([
    { label: 'ملخص الشهر', query: 'ملخص الشهر' },
    { label: 'مين عليه متأخرات؟', query: 'مين عليه متأخرات؟' },
    { label: 'رصيد الخزنة', query: 'رصيد الخزنة كام؟' },
    { label: 'تحصيل الشهر', query: 'تحصيل الشهر' },
    { label: 'مصروفات الشهر', query: 'مصروفات الشهر' },
    { label: 'الإعفاءات', query: 'الإعفاءات والتخفيضات' }
]);
const ASSISTANT_SUGGESTIONS_OWNER = Object.freeze([
    { label: 'حسابي الشهر ده', query: 'عليّا كام الشهر ده؟' },
    { label: 'إيصالاتي', query: 'إيصالاتي' },
    { label: 'آخر يوم للدفع', query: 'آخر يوم للدفع كام؟' },
    { label: 'طرق الدفع', query: 'أقدر أدفع بإيه؟' },
    { label: 'إعلانات المبنى', query: 'إعلانات المبنى' },
    { label: 'أكلم المدير', query: 'رقم المدير' }
]);
const ASSISTANT_MANAGER_QUICK_ACTIONS = Object.freeze([
    { label: 'تسجيل تحصيل', query: 'سجل تحصيل' },
    { label: 'إضافة مصروف', query: 'أضف مصروف' },
    { label: 'تسجيل إعفاء', query: 'سجل إعفاء' },
    { label: 'تسجيل تسوية', query: 'اعمل تسوية' },
    { label: 'التقارير والمخرجات', query: 'التقارير المتاحة' },
    { label: 'إعداد إعلان', action: 'notice' }
]);

const ASSISTANT_TYPING_DELAY_MS = 140;
const ASSISTANT_HISTORY_LIMIT = 30;
const ASSISTANT_TIME_HINT = /(يناير|فبراير|مارس|ابريل|مايو|يونيو|يوليو|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر|20[0-9]{2}|الشهر|شهر|السنه|سنه|عام|النهارده|دلوقتي|حاليا|كل الفتره|كل الشهور|من البدايه|من بداية السنه|من اول السنه)/;
const ASSISTANT_RESIDENT_FOLLOWUP = /^(هو|هي|وده|دي|وكمان|ودوره|ومن زمان|ولحد دلوقتي|وعليه)/;
const ASSISTANT_CHAT_STORAGE_PREFIX = 'manzil-assistant-chat';
const ASSISTANT_CONTEXT_STORAGE_PREFIX = 'manzil-assistant-context';

const ASSISTANT_FOLLOWUPS = Object.freeze({
    summary: ['مصروفات الشهر', 'مين عليه متأخرات؟', 'رصيد الخزنة كام؟'],
    executive: ['مقارنة الشهر', 'أكبر المصروفات', 'مين عليه متأخرات؟'],
    change_alerts: ['ملخص الشهر', 'مقارنة الشهر', 'أكبر المصروفات'],
    income: ['مصروفات نفس الفترة', 'الإعفاءات والتخفيضات', 'مين عليه متأخرات؟'],
    expenses: ['تحصيل نفس الفترة', 'رصيد الخزنة كام؟', 'ملخص الشهر'],
    cashbox: ['آخر الحركات', 'ملخص الشهر', 'مين عليه متأخرات؟'],
    arrears: ['الإعفاءات والتخفيضات', 'تحصيل الشهر', 'رصيد الخزنة كام؟'],
    adjustments: ['ملخص الشهر', 'مين عليه متأخرات؟'],
    recent: ['رصيد الخزنة كام؟', 'تحصيل الشهر'],
    resident: ['مين عليه متأخرات؟', 'ملخص الشهر'],
    building: ['ملخص الشهر', 'مين عليه متأخرات؟'],
    reports: ['ملخص الشهر', 'تحصيل الشهر'],
    comparison: ['مصروفات الشهر', 'تحصيل الشهر'],
    notices: ['ملخص الشهر', 'آخر الحركات'],
    help: ['ملخص الشهر', 'رصيد الخزنة كام؟'],
    knowledge: ['إزاي أستخدم التقارير؟', 'مين يقدر يشوف البيانات؟'],
    greeting: ['ملخص الشهر', 'مين عليه متأخرات؟'],
    thanks: ['ملخص الشهر', 'رصيد الخزنة كام؟'],
    unknown: ['ملخص الشهر', 'مين عليه متأخرات؟']
});

const ASSISTANT_FOLLOWUPS_OWNER = Object.freeze({
    my_bill: ['إيصالاتي', 'آخر يوم للدفع كام؟', 'عليّا متأخرات؟'],
    my_receipts: ['عليّا كام الشهر ده؟', 'إعلانات المبنى'],
    my_due_date: ['عليّا كام الشهر ده؟', 'أقدر أدفع بإيه؟'],
    payment_methods: ['آخر يوم للدفع كام؟', 'رقم المدير'],
    payment_breakdown: ['تحصيل الشهر', 'مقارنة التحصيل'],
    my_notifications: ['إعلانات المبنى', 'عليّا كام الشهر ده؟'],
    notices: ['إشعاراتي', 'رقم المدير'],
    contact: ['أقدر أدفع بإيه؟', 'عليّا كام الشهر ده؟'],
    my_adjustments: ['عليّا كام الشهر ده؟', 'إيصالاتي'],
    greeting: ['عليّا كام الشهر ده؟', 'إيصالاتي'],
    thanks: ['عليّا كام الشهر ده؟', 'إعلانات المبنى'],
    help: ['عليّا كام الشهر ده؟', 'آخر يوم للدفع كام؟'],
    knowledge: ['إيصالاتي', 'رقم المدير'],
    owner_scope: ['عليّا كام الشهر ده؟', 'إيصالاتي'],
    unknown: ['عليّا كام الشهر ده؟', 'إعلانات المبنى']
});

let assistantContext = { period: null, residentId: null };
let assistantChat = [];
let assistantNoticeDraft = null;
let assistantOperationDraft = null;
const ASSISTANT_OPERATION_PAYMENT_METHODS = Object.freeze({
    cash: 'نقدي',
    wallet: 'محفظة إلكترونية',
    instapay: 'InstaPay',
    bank_transfer: 'تحويل بنكي'
});
const ASSISTANT_OPERATION_CATEGORIES = Object.freeze({
    electricity: 'كهرباء',
    elevator: 'صيانة أسانسير',
    cleaning: 'نظافة',
    plumbing: 'أعمال سباكة وصنايعي',
    other: 'أخرى'
});

function assistantGlobalFunction(name) {
    if (typeof window !== 'undefined' && typeof window[name] === 'function') return window[name];
    if (typeof globalThis !== 'undefined' && typeof globalThis[name] === 'function') return globalThis[name];
    return null;
}

function parseAssistantPaymentMethod(normalized) {
    if (/(?:نقد|كاش|كاشه|كاشي|يد بيد)/.test(normalized)) return 'cash';
    if (/(?:محفظه|فودافون|اورنج كاش|اتصالات كاش|الكتروني)/.test(normalized)) return 'wallet';
    if (/(?:انستا باي|انستاباي|instapay)/i.test(normalized)) return 'instapay';
    if (/(?:تحويل بنكي|تحويل للبنك|حساب بنكي|البنك)/.test(normalized)) return 'bank_transfer';
    return null;
}

function parseAssistantCashAccount(normalized) {
    if (/(?:صندوق التطوير|التطوير)/.test(normalized)) return 'development';
    if (/(?:صندوق الصيانه الطارئه|الصيانه الطارئه|الطوارئ|طوارئ)/.test(normalized)) return 'emergency';
    if (/(?:الخزنه الرئيسيه|الخزنه|الخزينة|الرئيسيه|الرئيسية)/.test(normalized)) return 'main';
    return null;
}

function parseAssistantExpenseCategory(normalized) {
    if (/(?:كهرب|عداد|نور)/.test(normalized)) return ASSISTANT_OPERATION_CATEGORIES.electricity;
    if (/(?:اسانسير|مصعد)/.test(normalized)) return ASSISTANT_OPERATION_CATEGORIES.elevator;
    if (/(?:نظاف|عامل النظافه)/.test(normalized)) return ASSISTANT_OPERATION_CATEGORIES.cleaning;
    if (/(?:سباك|سباگه|صنايعي)/.test(normalized)) return ASSISTANT_OPERATION_CATEGORIES.plumbing;
    return ASSISTANT_OPERATION_CATEGORIES.other;
}

function parseAssistantOperationReason(raw) {
    const match = String(raw || '').match(/(?:بسبب|علشان|عشان|السبب)\s*[:：-]?\s*(.+)$/i);
    if (!match) return '';
    return String(match[1] || '')
        .replace(/\s+(?:عن|فى|في|لشهر|شهر)\s+(?:يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)(?:\s+20\d{2})?.*$/i, '')
        .trim();
}

function parseAssistantOperationPurpose(normalized) {
    if (/(?:سداد تسويه|دفعة تسويه|تسويه|تسوية)/.test(normalized)) return 'settlement';
    if (/(?:تطوير|تحسين)/.test(normalized)) return 'development';
    if (/(?:صيانه طارئه|صيانة طارئة|طوارئ)/.test(normalized)) return 'emergency';
    if (/(?:غرض اخر|غرض تاني|اخرى|أخرى)/.test(normalized)) return 'other';
    return 'subscription';
}

function assistantIdentityKey() {
    if (typeof currentUserRole !== 'undefined' && currentUserRole === 'owner') {
        return `owner-${String(currentResidentId || 'none')}`;
    }
    return 'manager';
}

function assistantStorageKeys() {
    const building = typeof activeBuildingId === 'string' && activeBuildingId ? activeBuildingId : 'local';
    const scope = `${building}:${assistantIdentityKey()}`;
    return {
        chat: `${ASSISTANT_CHAT_STORAGE_PREFIX}:${scope}`,
        context: `${ASSISTANT_CONTEXT_STORAGE_PREFIX}:${scope}`
    };
}

function hasAssistantTimeHint(text) {
    return ASSISTANT_TIME_HINT.test(normalizeAssistantArabic(text));
}

function assistantFollowsResident(text) {
    return ASSISTANT_RESIDENT_FOLLOWUP.test(normalizeAssistantArabic(text));
}

function resolveAssistantPeriodWithContext(text, now = new Date()) {
    if (!hasAssistantTimeHint(text) && assistantContext.period) return assistantContext.period;
    return resolveAssistantPeriod(text, now);
}

function readAssistantStorage(key) {
    try {
        const raw = sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function persistAssistantContext() {
    const keys = assistantStorageKeys();
    const period = assistantContext.period;
    try {
        sessionStorage.setItem(keys.context, JSON.stringify({
            period: period ? { type: period.type, label: period.label, months: period.months } : null,
            residentId: assistantContext.residentId
        }));
    } catch {
        /* a full quota or private mode must never break the chat */
    }
}

function persistAssistantChat() {
    const keys = assistantStorageKeys();
    try {
        sessionStorage.setItem(keys.chat, JSON.stringify(assistantChat.slice(-ASSISTANT_HISTORY_LIMIT)));
    } catch {
        /* same: the assistant keeps working from memory */
    }
}

function isSafeAssistantHtml(html) {
    return !/<\s*(script|iframe|object|embed)/i.test(html) && !/\son\w+\s*=/i.test(html);
}

function restoreAssistantSession() {
    const keys = assistantStorageKeys();
    const stored = readAssistantStorage(keys.chat);
    assistantChat = Array.isArray(stored)
        ? stored.filter(item => item && (item.role === 'user' || item.role === 'bot')
            && typeof item.html === 'string' && isSafeAssistantHtml(item.html)).slice(-ASSISTANT_HISTORY_LIMIT)
        : [];
    const context = readAssistantStorage(keys.context);
    assistantContext = {
        period: context && context.period && Array.isArray(context.period.months) ? context.period : null,
        residentId: context && typeof context.residentId === 'string' ? context.residentId : null
    };
}

function rememberAssistantContext(text, period, resident) {
    if (hasAssistantTimeHint(text)) assistantContext.period = period;
    assistantContext.residentId = resident ? resident.id : null;
    persistAssistantContext();
}

function buildAssistantFollowUps(answerId, period, customQueries = null) {
    const map = assistantIsOwner() ? ASSISTANT_FOLLOWUPS_OWNER : ASSISTANT_FOLLOWUPS;
    const queries = Array.isArray(customQueries) && customQueries.length ? customQueries : (map[answerId] || map.unknown);
    const label = period && period.type === 'month' ? period.label : null;
    return queries.slice(0, 3).map(query => {
        const scoped = query.replace(/(نفس الفترة|الشهر)/, label || 'الشهر');
        return { label: scoped, query: scoped };
    });
}

function assistantFollowUpsHtml(answerId, period, customQueries = null) {
    const items = buildAssistantFollowUps(answerId, period, customQueries);
    if (!items.length) return '';
    return `<div class="assistant-followups" aria-label="متابعة مقترحة">${items.map(item =>
        `<button type="button" class="assistant-chip is-followup" data-assistant-query="${assistantEscape(item.query)}">${assistantEscape(item.label)}</button>`
    ).join('')}</div>`;
}

function getAssistantMonthNames() {
    return Array.isArray(monthsNames) && monthsNames.length === 12 ? monthsNames : ASSISTANT_MONTHS;
}

function normalizeAssistantArabic(value) {
    return String(value ?? '')
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
        .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
        .replace(/[\u200e\u200f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function assistantEscape(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}

const ASSISTANT_NUMBER_WORDS = Object.freeze({
    'واحد': '1', 'واحدة': '1', 'اول': '1', 'أول': '1',
    'اتنين': '2', 'اثنين': '2', 'تنين': '2',
    'تلاته': '3', 'ثلاثه': '3', 'ثلاثة': '3',
    'اربعه': '4', 'أربعه': '4', 'اربعة': '4',
    'خمسه': '5', 'خمسة': '5', 'سته': '6', 'ستة': '6',
    'سبعه': '7', 'سبعة': '7', 'تمانيه': '8', 'ثمانيه': '8', 'ثمانية': '8',
    'تسعه': '9', 'تسعة': '9', 'عشره': '10', 'عشرة': '10',
    'حداشر': '11', 'اتناشر': '12', 'اثناشر': '12'
});

function replaceAssistantNumberWords(value) {
    return String(value || '').replace(/\S+/g, word => ASSISTANT_NUMBER_WORDS[word] || word);
}

function assistantMoney(value) {
    const amount = Number(value);
    const safe = Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
    return typeof fmtMoney === 'function' ? fmtMoney(safe) : `${safe} ج.م`;
}

function assistantNumber(value) {
    const amount = Number(value);
    const safe = Number.isFinite(amount) ? amount : 0;
    return typeof fmtNum === 'function' ? fmtNum(safe) : String(safe);
}

function getAssistantNowLabel(now = new Date()) {
    const names = getAssistantMonthNames();
    return `${names[now.getMonth()]} ${now.getFullYear()}`;
}

function resolveAssistantPeriod(text, now = new Date()) {
    const names = getAssistantMonthNames();
    const normalized = replaceAssistantNumberWords(normalizeAssistantArabic(text));
    const yearMatch = normalized.match(/(?:^|[^0-9])(20[0-9]{2})(?:[^0-9]|$)/);
    const explicitYear = yearMatch ? Number(yearMatch[1]) : null;
    const monthMatches = names.map((name, index) => ({
        index,
        position: normalized.indexOf(normalizeAssistantArabic(name))
    })).filter(item => item.position >= 0).sort((a, b) => a.position - b.position);
    let monthIndex = monthMatches.length ? monthMatches[0].index : -1;
    let year = explicitYear || now.getFullYear();

    if (monthIndex < 0 && /(الشهر الماضي|الشهر اللي فات|الشهر السابق|شهر ماضي|الشهر اللي قبل)/.test(normalized)) {
        const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        monthIndex = previous.getMonth();
        year = explicitYear || previous.getFullYear();
    }

    if (monthIndex < 0) {
        const numericMonth = normalized.match(/(?:شهر|الشهر)\s*(\d{1,2})/);
        if (numericMonth) {
            const candidate = Number(numericMonth[1]);
            if (candidate >= 1 && candidate <= 12) monthIndex = candidate - 1;
        }
    }

    if (monthIndex < 0 && /(كل الفتره|كل الشهور|من البدايه|كل السنين|اجمالي عام)/.test(normalized)) {
        const seen = new Set();
        (Array.isArray(state.income) ? state.income : []).forEach(row => { if (row.month) seen.add(row.month); });
        (Array.isArray(state.expenses) ? state.expenses : []).forEach(row => { if (row.month) seen.add(row.month); });
        const months = typeof sortMonthLabels === 'function' ? sortMonthLabels(Array.from(seen)) : Array.from(seen);
        return { type: 'all', label: 'كل الفترات', months, year: null, month: null };
    }

    const wantsYear = monthIndex < 0 && (
        Boolean(explicitYear) ||
        /(السنه|سنه|عام|خلال سنه|هذه السنه|السنه دي)/.test(normalized)
    );

    if (wantsYear) {
        const months = names.map(name => `${name} ${year}`);
        return { type: 'year', label: `سنة ${year}`, months, year, month: null };
    }

    if (monthIndex < 0) monthIndex = now.getMonth();
    const month = `${names[monthIndex]} ${year}`;
    return { type: 'month', label: month, months: [month], year, month };
}

function getAssistantIncomeSnapshot(months) {
    const allowed = new Set(Array.isArray(months) ? months : []);
    const rows = (Array.isArray(state.income) ? state.income : []).filter(row => !allowed.size || allowed.has(row.month));
    let cents = 0;
    let subscriptionCents = 0;
    let settlementCents = 0;
    const purposes = new Map();
    rows.forEach(row => {
        const amountCents = typeof toCents === 'function' ? toCents(row.amount) : Math.round((Number(row.amount) || 0) * 100);
        if (amountCents <= 0) return;
        cents += amountCents;
        const code = row.purposeCode || 'subscription';
        const isSubscription = typeof isSubscriptionIncome === 'function' ? isSubscriptionIncome(row) : code === 'subscription';
        if (isSubscription) subscriptionCents += amountCents;
        if (code === 'settlement') settlementCents += amountCents;
        purposes.set(code, (purposes.get(code) || 0) + amountCents);
    });
    const purposeRows = Array.from(purposes.entries())
        .map(([code, value]) => ({
            code,
            label: typeof getIncomePurposeLabel === 'function' ? getIncomePurposeLabel(code) : code,
            cents: value
        }))
        .sort((a, b) => b.cents - a.cents);
    return {
        rows,
        count: rows.length,
        cents,
        total: cents / 100,
        subscriptionCents,
        subscriptionTotal: subscriptionCents / 100,
        settlementCents,
        settlementTotal: settlementCents / 100,
        otherTotal: (cents - subscriptionCents - settlementCents) / 100,
        purposes: purposeRows
    };
}

function getAssistantPaymentMethodSnapshot(months) {
    const allowed = new Set(Array.isArray(months) ? months : []);
    const methods = new Map();
    (Array.isArray(state.income) ? state.income : [])
        .filter(row => !allowed.size || allowed.has(row.month))
        .forEach(row => {
            const amountCents = typeof toCents === 'function' ? toCents(row.amount) : Math.round((Number(row.amount) || 0) * 100);
            if (amountCents <= 0) return;
            const code = String(row.paymentMethod || 'unknown');
            methods.set(code, (methods.get(code) || 0) + amountCents);
        });
    return Array.from(methods.entries())
        .map(([code, cents]) => ({
            code,
            label: typeof getIncomePaymentMethodLabel === 'function' ? getIncomePaymentMethodLabel(code) : code,
            cents
        }))
        .sort((a, b) => b.cents - a.cents);
}

function getAssistantExpenseSnapshot(months) {
    const allowed = new Set(Array.isArray(months) ? months : []);
    const rows = (Array.isArray(state.expenses) ? state.expenses : []).filter(row => !allowed.size || allowed.has(row.month));
    let cents = 0;
    const categories = new Map();
    rows.forEach(row => {
        const amountCents = typeof toCents === 'function' ? toCents(row.amount) : Math.round((Number(row.amount) || 0) * 100);
        if (amountCents <= 0) return;
        cents += amountCents;
        const category = String(row.category || 'أخرى');
        categories.set(category, (categories.get(category) || 0) + amountCents);
    });
    const categoryRows = Array.from(categories.entries())
        .map(([label, value]) => ({ label, cents: value }))
        .sort((a, b) => b.cents - a.cents);
    return { rows, count: rows.length, cents, total: cents / 100, categories: categoryRows };
}

function getAssistantComparisonPeriods(period, now = new Date()) {
    const names = getAssistantMonthNames();
    let year = now.getFullYear();
    let monthIndex = now.getMonth();
    if (period && period.type === 'month' && period.label) {
        const match = String(period.label).match(/^(.*?)\s+(20\d{2})$/);
        if (match) {
            const found = names.findIndex(name => normalizeAssistantArabic(name) === normalizeAssistantArabic(match[1]));
            if (found >= 0) monthIndex = found;
            year = Number(match[2]);
        }
    }
    const current = new Date(year, monthIndex, 1);
    const previous = new Date(year, monthIndex - 1, 1);
    const makePeriod = date => {
        const label = `${names[date.getMonth()]} ${date.getFullYear()}`;
        return { type: 'month', label, months: [label], year: date.getFullYear(), month: label };
    };
    return { current: makePeriod(current), previous: makePeriod(previous) };
}

function assistantComparisonLine(label, current, previous) {
    const delta = Math.round((current - previous) * 100) / 100;
    const direction = delta > 0 ? 'زيادة' : delta < 0 ? 'انخفاض' : 'بدون تغيير';
    const value = delta === 0 ? direction : `${direction} ${assistantMoney(Math.abs(delta))}`;
    return assistantRow(label, `${assistantMoney(current)} مقابل ${assistantMoney(previous)} · ${value}`, delta > 0 ? 'warn' : delta < 0 ? 'good' : '');
}

function buildAssistantComparisonAnswer(period, now = new Date()) {
    const periods = getAssistantComparisonPeriods(period, now);
    const currentIncome = getAssistantIncomeSnapshot(periods.current.months).total;
    const previousIncome = getAssistantIncomeSnapshot(periods.previous.months).total;
    const currentExpenses = getAssistantExpenseSnapshot(periods.current.months).total;
    const previousExpenses = getAssistantExpenseSnapshot(periods.previous.months).total;
    const currentNet = currentIncome - currentExpenses;
    const previousNet = previousIncome - previousExpenses;
    let html = assistantComparisonLine('التحصيل', currentIncome, previousIncome);
    html += assistantComparisonLine('المصروفات', currentExpenses, previousExpenses);
    html += assistantComparisonLine('الصافي', currentNet, previousNet);
    html += assistantNote(`المقارنة بين ${periods.current.label} و${periods.previous.label} من السجلات المسجلة فقط.`);
    return { id: 'comparison', title: `مقارنة ${periods.current.label} و${periods.previous.label}`, html };
}

function getAssistantMonthSummary(period, now = new Date()) {
    const month = period && period.type === 'month' && period.label
        ? period.label
        : getAssistantNowLabel(now);
    const income = getAssistantIncomeSnapshot(period.months);
    const expenses = getAssistantExpenseSnapshot(period.months);
    const residents = Array.isArray(state.residents) ? state.residents : [];
    let dueCents = 0;
    let paidCents = 0;
    let subscriptionPaidCents = 0;
    let settlementPaidCents = 0;
    let adjustedCents = 0;
    let outstandingCents = 0;
    let paidUnits = 0;
    let partialUnits = 0;
    const unpaid = [];
    residents.forEach(resident => {
        const grossDue = typeof getSubscriptionAmountForMonth === 'function'
            ? Number(getSubscriptionAmountForMonth(resident, month)) || 0
            : Number(resident.monthlyAmount ?? state.defaultSubscription) || 0;
        const due = typeof getMonthlyDueAmountForMonth === 'function'
            ? Number(getMonthlyDueAmountForMonth(resident, month)) || 0 : grossDue;
        const paid = typeof getMonthlyDuePaidAmount === 'function'
            ? Number(getMonthlyDuePaidAmount(resident.id, month)) || 0
            : typeof getPaidAmountForMonth === 'function' ? Number(getPaidAmountForMonth(resident.id, month)) || 0 : 0;
        const subscriptionPaid = typeof getPaidAmountForMonth === 'function'
            ? Number(getPaidAmountForMonth(resident.id, month)) || 0 : 0;
        const settlement = typeof getSettlementAdjustmentForMonth === 'function'
            ? getSettlementAdjustmentForMonth(resident.id, month) : null;
        const settlementPaid = settlement && typeof getSettlementPaidAmount === 'function'
            ? Number(getSettlementPaidAmount(settlement.id)) || 0 : 0;
        const adjusted = Math.max(0, grossDue - due);
        const outstanding = typeof getMonthOutstanding === 'function'
            ? Number(getMonthOutstanding(resident, month)) || 0
            : Math.max(0, due - paid);
        dueCents += Math.round(grossDue * 100);
        paidCents += Math.round(paid * 100);
        subscriptionPaidCents += Math.round(subscriptionPaid * 100);
        settlementPaidCents += Math.round(settlementPaid * 100);
        adjustedCents += Math.round(adjusted * 100);
        outstandingCents += Math.round(outstanding * 100);
        if (due > 0 && outstanding <= 0) paidUnits += 1;
        else if (paid > 0 && outstanding > 0) partialUnits += 1;
        if (outstanding > 0) unpaid.push({ resident, outstanding });
    });
    unpaid.sort((a, b) => b.outstanding - a.outstanding);
    return {
        month,
        income,
        expenses,
        net: (income.cents - expenses.cents) / 100,
        dueTotal: dueCents / 100,
        paidSubscriptionTotal: subscriptionPaidCents / 100,
        paidSettlementTotal: settlementPaidCents / 100,
        paidDueTotal: paidCents / 100,
        adjustmentsTotal: adjustedCents / 100,
        outstandingTotal: outstandingCents / 100,
        paidUnits,
        partialUnits,
        unpaidUnits: unpaid.length,
        unpaid
    };
}

function getAssistantArrearsSnapshot() {
    if (typeof buildArrearsReport === 'function') {
        const report = buildArrearsReport();
        const residents = report.residents || [];
        const oldestFor = item => item.oldestMonth || (Array.isArray(item.unpaidMonths) && item.unpaidMonths[0]
            ? (typeof item.unpaidMonths[0] === 'object' ? item.unpaidMonths[0].month : item.unpaidMonths[0]) : null);
        const details = residents.flatMap(item => Array.isArray(item.unpaidMonths) ? item.unpaidMonths : []);
        const oldestMonth = residents.map(oldestFor).filter(Boolean).sort()[0] || null;
        return {
            totalDebt: Number(report.totalDebt) || 0,
            overdueResidents: Number(report.overdueResidents) || 0,
            overdueMonths: Number(report.overdueMonths) || 0,
            oldestMonth,
            maxDaysOverdue: Math.max(...residents.map(item => Number(item.daysOverdue) || 0), ...details.map(item => Number(item.daysOverdue) || 0), 0),
            residents,
            buckets: report.buckets || {}
        };
    }
    const residents = (Array.isArray(state.residents) ? state.residents : []).map(resident => {
        const debt = typeof calculateCumulativeDebt === 'function' ? calculateCumulativeDebt(resident.id) : { count: 0, totalDebt: 0, unpaidMonths: [] };
        return { resident, count: debt.count, totalDebt: debt.totalDebt, unpaidMonths: debt.unpaidMonths, oldestMonth: debt.oldestMonth, daysOverdue: debt.daysOverdue, bucket: 'شهر واحد' };
    }).filter(item => item.count > 0).sort((a, b) => b.totalDebt - a.totalDebt);
    return {
        totalDebt: residents.reduce((sum, item) => sum + Math.round(item.totalDebt * 100), 0) / 100,
        overdueResidents: residents.length,
        overdueMonths: residents.reduce((sum, item) => sum + item.count, 0),
        oldestMonth: residents.map(item => item.oldestMonth).filter(Boolean).sort()[0] || null,
        maxDaysOverdue: residents.reduce((max, item) => Math.max(max, Number(item.daysOverdue) || 0), 0),
        residents,
        buckets: {}
    };
}

function getAssistantCashSnapshot() {
    const codes = ['main', 'development', 'emergency'];
    const balances = codes.map(code => {
        const raw = Number(state.cashAccountBalances?.[code]);
        const label = typeof getCashAccountLabel === 'function' ? getCashAccountLabel(code) : ASSISTANT_CASH_LABELS[code];
        return { code, label, amount: Number.isFinite(raw) ? raw : 0 };
    });
    return { balances, total: balances.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100 };
}

function resolveAssistantResident(text) {
    const normalized = replaceAssistantNumberWords(normalizeAssistantArabic(text));
    const residents = Array.isArray(state.residents) ? state.residents : [];
    const apartmentMatch = normalized.match(/(?:شقه|وحده|ساكن|رقم)\s*(\d{1,4})/);
    if (apartmentMatch) {
        const apartment = apartmentMatch[1];
        const matches = residents.filter(resident => String(resident.apartmentNumber ?? '').trim() === apartment);
        return { resident: matches.length === 1 ? matches[0] : null, matches };
    }
    const words = new Set(normalized.split(' '));
    const matches = residents.filter(resident => {
        const name = normalizeAssistantArabic(resident.name || '');
        if (name.length < 3) return false;
        if (normalized.includes(name)) return true;
        return name.split(' ').some(token => token.length >= 3 && words.has(token));
    });
    return { resident: matches.length === 1 ? matches[0] : null, matches };
}

function getAssistantResidentSnapshot(resident, now = new Date(), monthLabel = '') {
    const month = monthLabel || getAssistantNowLabel(now);
    const grossSubscription = typeof getSubscriptionAmountForMonth === 'function'
        ? Number(getSubscriptionAmountForMonth(resident, month)) || 0
        : Number(resident.monthlyAmount ?? state.defaultSubscription) || 0;
    const settlement = typeof getSettlementAdjustmentForMonth === 'function'
        ? getSettlementAdjustmentForMonth(resident.id, month) : null;
    const monthlyDue = typeof getMonthlyDueAmountForMonth === 'function'
        ? Number(getMonthlyDueAmountForMonth(resident, month)) || 0 : grossSubscription;
    const subscription = settlement ? monthlyDue : grossSubscription;
    const paid = typeof getMonthlyDuePaidAmount === 'function'
        ? Number(getMonthlyDuePaidAmount(resident.id, month)) || 0
        : typeof getPaidAmountForMonth === 'function'
            ? Number(getPaidAmountForMonth(resident.id, month)) || 0 : 0;
    const adjusted = Math.max(0, Math.round((grossSubscription - monthlyDue) * 100)) / 100;
    const settlementPaid = settlement && typeof getSettlementPaidAmount === 'function'
        ? Number(getSettlementPaidAmount(settlement.id)) || 0 : 0;
    const settlementRemaining = settlement && typeof getSettlementRemainingAmount === 'function'
        ? Number(getSettlementRemainingAmount(settlement)) || 0 : 0;
    const outstanding = typeof getMonthOutstanding === 'function'
        ? Number(getMonthOutstanding(resident, month)) || 0
        : Math.max(0, subscription - paid);
    const debt = typeof calculateCumulativeDebt === 'function'
        ? calculateCumulativeDebt(resident.id)
        : { count: 0, totalDebt: 0, unpaidMonths: [] };
    const payments = (Array.isArray(state.income) ? state.income : [])
        .filter(payment => payment.residentId === resident.id)
        .slice()
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    const monthPayments = payments.filter(payment => payment.month === month);
    return {
        month,
        subscription,
        grossSubscription,
        paid,
        adjusted,
        settlement,
        settlementPaid,
        settlementRemaining,
        outstanding,
        debt,
        lastPayment: payments[0] || null,
        monthPayments
    };
}

function detectAssistantIntent(normalized, hasResident) {
    if (hasResident) {
        if (/(السلام عليكم|سلام|صباح|مساء|ازيك|عامل ايه|اهلا)/.test(normalized)) return 'greeting';
        if (/(شكرا|تسلم|مشكور|ربنا يكرمك)/.test(normalized)) return 'thanks';
        return 'resident';
    }
    if (/(السلام عليكم|سلام|صباح|مساء|ازيك|عامل ايه|اهلا|هاي)/.test(normalized)) return 'greeting';
    if (/(شكرا|تسلم|مشكور|ربنا يكرمك)/.test(normalized)) return 'thanks';
    if (/(خصوصيه|بياناتي|البيانات بتتخزن|بتتخزن فين|مين يقدر يشوف|امان|امن|صلاحيات|قراءة فقط|بتعمل ايه|ازاي استخدم|ازاي اسجل|ازاي اعدل|ازاي اطبع|ازاي اصدر)/.test(normalized)) return 'knowledge';
    if (/(مساعده|ساعدني|بتعرف|تقدر تعمل|اوامر|خيارات|ازاي|كيف|استخدمك|ممكن تساعد)/.test(normalized)) return 'help';
    if (/(تغير غير طبيعي|تغيير كبير|فرق كبير|محتاج مراجعه|محتاج مراجعة|زاد قوي|زادت قوي|نزل قوي|انخفض قوي|ايه اللي اتغير|ايه اللي زاد)/.test(normalized)) return 'change_alerts';
    if (/(مقارنه|قارن|مقابل|زاد|زادت|قل|قلت|اكتر من|اقل من)/.test(normalized)) return 'comparison';
    if (/(اعفاء|تخفيض|تسويه|خصم|خصومات|سامحنا)/.test(normalized)) return 'adjustments';
    if (/(متاخر|متاخرات|مستحق|مديون|مش دفع|غير مدفوع|مش دافع|مش سدد|متاخرين|عليه فلوس)/.test(normalized)) return 'arrears';
    if (/(اكبر مصروف|اعلى مصروف|اغلى مصروف|اكبر المصروفات|المصروفات الاكبر|اكبر المصاريف)/.test(normalized)) return 'top_expenses';
    if (/(مصروف|مصاريف|صرف|منصرف|اتصرف|اللي اتدفع من الخزنه)/.test(normalized)) return 'expenses';
    if (/(طرق التحصيل|اتدفعت بايه|دفعوا ازاي|وسيله الدفع|وسائل التحصيل|حسب طريقه الدفع)/.test(normalized)) return 'payment_breakdown';
    if (/(تحصيل|تحصيلات|ايراد|دخل|وارد|دفع|مدفوع|متحصل|المتحصلات|اللي اتجمع)/.test(normalized)) return 'income';
    if (/(خزنه|صندوق|رصيد|كاش|فلوس|سيوله|الموجود في الخزنه)/.test(normalized)) return 'cashbox';
    if (/(اعلان|اعلانات|لوحه|اخبار العماره|فيه جديد)/.test(normalized)) return 'notices';
    if (/(ملخص تنفيذي|ملخص الاداره|ملخص العماره|الخلاصه السريعه)/.test(normalized)) return 'executive';
    if (/(ملخص|وضع|احوال|نظره|اجمالي|صافي|نتيجه|عاملين ايه)/.test(normalized)) return 'summary';
    if (/(اخر|احدث|حركات|عمليات|اللي حصل)/.test(normalized)) return 'recent';
    if (/(تقرير|تقارير|طباعه|تصدير|كشف)/.test(normalized)) return 'reports';
    if (/(عماره|مبني|مدير|شقق|سكان|وحدات|اسم|بيانات)/.test(normalized)) return 'building';
    return 'unknown';
}

function assistantRow(label, value, tone = '') {
    const className = tone ? ` is-${tone}` : '';
    return `<div class="assistant-row${className}"><span>${assistantEscape(label)}</span><strong>${assistantEscape(value)}</strong></div>`;
}

function assistantList(items) {
    if (!items.length) return '';
    return `<ul class="assistant-list">${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
}

function assistantNote(text) {
    return `<p class="assistant-note">${assistantEscape(text)}</p>`;
}

function parseAssistantNoticeCommand(text) {
    if (assistantIsOwner()) return '';
    const raw = String(text || '').trim();
    const normalized = normalizeAssistantArabic(raw);
    if (!/(?:اعمل|اكتب|انشر|جهز|جهزلي|جهز لي)/.test(normalized) || !/اعلان/.test(normalized)) return '';
    return raw.replace(/^.*?إعلان\s*[:：-]?\s*/is, '').replace(/^.*?اعلان\s*[:：-]?\s*/i, '').trim();
}

function buildAssistantNoticePreview(text) {
    const noticeText = String(text || '').trim();
    if (!noticeText) return null;
    assistantNoticeDraft = { text: noticeText, requestId: generateId() };
    return {
        id: 'notice-preview',
        title: 'معاينة إعلان قبل النشر',
        html: `<div class="assistant-action-preview"><p class="assistant-notice-preview">${assistantEscape(noticeText).replace(/\n/g, '<br>')}</p>
            <p class="assistant-note">الإعلان لم يُحفظ بعد. راجعه ثم أكد النشر صراحة.</p>
            <div class="assistant-action-buttons" role="group" aria-label="تأكيد نشر الإعلان">
                <button type="button" class="assistant-action-confirm" onclick="confirmAssistantNotice()">تأكيد النشر</button>
                <button type="button" class="assistant-action-cancel" onclick="cancelAssistantNotice()">إلغاء</button>
            </div></div>`
    };
}

async function confirmAssistantNotice() {
    if (!assistantNoticeDraft) {
        if (typeof toast === 'function') toast('لا توجد مسودة إعلان معلقة.', 'error');
        return false;
    }
    const draft = assistantNoticeDraft;
    if (typeof publishNoticeWithRequestId !== 'function') {
        if (typeof toast === 'function') toast('مسار نشر الإعلان غير متاح الآن.', 'error');
        return false;
    }
    const saved = await publishNoticeWithRequestId(draft.text, draft.requestId);
    if (!saved) return false;
    assistantNoticeDraft = null;
    if (typeof toast === 'function') toast('تم نشر الإعلان بعد التأكيد.', 'success');
    return true;
}

function cancelAssistantNotice() {
    assistantNoticeDraft = null;
    if (typeof toast === 'function') toast('تم إلغاء مسودة الإعلان.', 'info');
}

function assistantParsedAmount(text) {
    const normalized = normalizeAssistantArabic(text).replace(/،/g, ',');
    const match = normalized.match(/(?:^|\s)(\d+(?:[.,]\d{1,2})?)(?=\s|$|ج| جنيه)/);
    if (!match) return null;
    const amount = Number(match[1].replace(',', '.'));
    return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseAssistantOperationCommand(text, now = new Date()) {
    if (assistantIsOwner()) return null;
    const raw = String(text || '').trim();
    const normalized = normalizeAssistantArabic(raw);
    const amount = assistantParsedAmount(raw);
    const period = resolveAssistantPeriodWithContext(raw, now);
    const residentMatch = resolveAssistantResident(raw);
    const resident = residentMatch.matches.length === 1 ? residentMatch.matches[0] : null;
    const hasIncomeVerb = /(?:سجل|سجّل|اضف|أضف|ضيف|استلم|قبض)/.test(normalized);
    const hasExpenseWord = /(?:مصروف|فاتوره|فاتورة|صرف)/.test(normalized);
    const hasAdjustmentWord = /(?:اعفاء|إعفاء|تخفيض|خصم|تسويه|تسوية)/.test(normalized);
    if (hasIncomeVerb && !hasExpenseWord && !hasAdjustmentWord && /(?:تحصيل|دفعة|دفعه|استلام|استلم|قبض|حصّل|حصل)/.test(normalized)) {
        const purpose = parseAssistantOperationPurpose(normalized);
        const explicitCash = parseAssistantCashAccount(normalized);
        const cashAccountCode = explicitCash || (purpose === 'development' ? 'development' : purpose === 'emergency' ? 'emergency' : 'main');
        return {
            type: 'income', amount, resident, residentMatches: residentMatch.matches, month: period.label, raw,
            purpose, paymentMethod: parseAssistantPaymentMethod(normalized), cashAccountCode,
            cashAccountAssumed: !explicitCash,
            notes: parseAssistantOperationReason(raw)
        };
    }
    if ((hasIncomeVerb || /(?:سجل|سجّل|اضف|أضف|ضيف|ادفع|إدفع)/.test(normalized)) && hasExpenseWord) {
        const title = raw.replace(/^.*?(?:مصروف|فاتورة|فاتوره)\s*[:：-]?\s*/is, '')
            .replace(/\b\d+(?:[.,]\d{1,2})?\s*(?:ج\.?م|جنيه|جنيهات)?\b/gi, '')
            .replace(/(?:عن|فى|في|لشهر|شهر)\s+(?:يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)(?:\s+20\d{2})?/gi, '')
            .trim();
        const explicitCash = parseAssistantCashAccount(normalized);
        return {
            type: 'expense', amount, title: title || 'مصروف من طلب المدير', month: period.label, raw,
            category: parseAssistantExpenseCategory(normalized),
            cashAccountCode: explicitCash || 'main',
            cashAccountAssumed: !explicitCash,
            notes: parseAssistantOperationReason(raw)
        };
    }
    if ((hasIncomeVerb || /(?:اعمل|اعمل لي|طبق|سجل|سجّل|اضف|أضف)/.test(normalized)) && hasAdjustmentWord) {
        const kind = /(?:تسويه|تسوية)/.test(normalized) ? 'settlement' : /(?:تخفيض|خصم)/.test(normalized) ? 'discount' : 'waiver';
        return {
            type: 'adjustment', kind, amount, resident, residentMatches: residentMatch.matches, month: period.label, raw,
            reason: parseAssistantOperationReason(raw)
        };
    }
    return null;
}

function assistantOperationMissing(operation) {
    if (!operation) return ['بيانات العملية'];
    const missing = [];
    if (!operation.amount) missing.push('المبلغ');
    if (operation.type !== 'expense' && !operation.resident) {
        missing.push(operation.residentMatches?.length > 1 ? 'رقم الشقة لتحديد المالك' : 'المالك أو رقم الشقة');
    }
    if (operation.type === 'income' && !operation.paymentMethod) missing.push('طريقة الدفع');
    if (operation.type === 'income' && operation.purpose === 'other' && !operation.notes) missing.push('تفاصيل الغرض في الملاحظات');
    if (operation.type === 'income' && operation.purpose === 'settlement') missing.push('اتفاق التسوية المفتوح');
    if (operation.type === 'adjustment' && !operation.reason) missing.push('سبب الإجراء');
    return Array.from(new Set(missing));
}

function assistantOperationCanExecute(operation) {
    return Boolean(operation && assistantOperationMissing(operation).length === 0
        && (operation.type !== 'expense' || operation.title));
}

function assistantOperationFollowupPatch(text, operation) {
    if (!operation || assistantIsOwner()) return null;
    const raw = String(text || '').trim();
    const normalized = normalizeAssistantArabic(raw);
    if (/(?:سجل|سجّل|اضف|أضف|ضيف|استلم|قبض|اعمل|طبق|انشر|اكتب|مصروف|اعفاء|إعفاء|تخفيض|خصم)/.test(normalized)) return null;
    const patch = {};
    const method = parseAssistantPaymentMethod(normalized);
    const cashAccountCode = parseAssistantCashAccount(normalized);
    const amount = assistantParsedAmount(raw);
    const residentMatch = resolveAssistantResident(raw);
    const period = resolveAssistantPeriod(raw, new Date());
    const reason = parseAssistantOperationReason(raw);
    const hasReasonSignal = /(?:بسبب|علشان|عشان|السبب)/.test(normalized);
    const hasOperationDetail = Boolean(method || cashAccountCode || amount || residentMatch.matches.length || hasReasonSignal);
    if (!hasOperationDetail) return null;
    if (method) patch.paymentMethod = method;
    if (cashAccountCode) patch.cashAccountCode = cashAccountCode;
    if (amount) patch.amount = amount;
    if (residentMatch.matches.length === 1) {
        patch.resident = residentMatch.matches[0];
        patch.residentMatches = residentMatch.matches;
    }
    if (hasAssistantTimeHint(raw)) patch.month = period.label;
    if (reason) {
        if (operation.type === 'adjustment') patch.reason = reason;
        else patch.notes = reason;
    }
    return Object.keys(patch).length ? patch : null;
}

function mergeAssistantOperationFollowup(text, now = new Date()) {
    const patch = assistantOperationFollowupPatch(text, assistantOperationDraft);
    if (!patch) return null;
    const merged = { ...assistantOperationDraft, ...patch, raw: `${assistantOperationDraft.raw} · ${String(text || '').trim()}` };
    return buildAssistantOperationPreview(merged, now);
}

function buildAssistantOperationPreview(operation, now = new Date()) {
    if (!operation) return null;
    assistantOperationDraft = operation;
    const labels = { income: 'تحصيل', expense: 'مصروف', adjustment: 'إعفاء أو تخفيض أو تسوية' };
    const missing = assistantOperationMissing(operation);
    if (missing.length) {
        return {
            id: 'operation-missing',
            title: `بيانات ${labels[operation.type]} ناقصة`,
            html: `${assistantNote(`أقدر أجهز ${labels[operation.type]}، لكن ناقص: ${missing.join(' و')}.`)}${assistantNote('كمّلها في رسالة تالية — مثال: «نقدي في الخزنة الرئيسية» أو «السبب ظرف صحي». ثم راجع الملخص قبل الحفظ.')}${assistantActionButtons(operation, false)}`
        };
    }
    const adjustmentKindLabels = { waiver: 'إعفاء', discount: 'تخفيض', settlement: 'تسوية' };
    const target = operation.type === 'expense'
        ? `${operation.title} · ${assistantMoney(operation.amount)} · ${operation.month} · ${operation.category || 'أخرى'} · ${ASSISTANT_CASH_LABELS[operation.cashAccountCode] || ASSISTANT_CASH_LABELS.main}`
        : `${operation.type === 'adjustment' ? `${adjustmentKindLabels[operation.kind] || 'إجراء'} · ` : ''}${assistantResidentName(operation.resident)} · شقة ${operation.resident.apartmentNumber} · ${assistantMoney(operation.amount)} · ${operation.month}${operation.type === 'income' ? ` · ${operation.purpose === 'subscription' ? 'اشتراك شهري' : operation.purpose} · ${ASSISTANT_OPERATION_PAYMENT_METHODS[operation.paymentMethod] || ''} · ${ASSISTANT_CASH_LABELS[operation.cashAccountCode] || ASSISTANT_CASH_LABELS.main}` : ''}`;
    const assumed = operation.cashAccountAssumed ? assistantNote('لم تذكر الصندوق؛ استخدمت الخزنة الرئيسية كافتراض قابل للتعديل قبل التنفيذ.') : '';
    return {
        id: 'operation-preview',
        title: `معاينة ${labels[operation.type]} قبل الإدخال`,
        html: `<div class="assistant-action-preview"><p class="assistant-notice-preview">${assistantEscape(target)}</p>
            ${assumed}<p class="assistant-note">لم تُحفظ البيانات بعد. «تنفيذ وحفظ» يمررها للنموذج الرسمي ويشغّل كل قواعد التحقق، ويمكنك فتح النموذج لتعديل أي تفصيلة.</p>
            ${assistantActionButtons(operation, true)}</div>`
    };
}

function assistantActionButtons(operation, ready) {
    const execute = ready && assistantOperationCanExecute(operation)
        ? '<button type="button" class="assistant-action-confirm" onclick="confirmAssistantOperation()">تنفيذ وحفظ</button>'
        : '';
    const openLabel = ready ? 'فتح النموذج للمراجعة' : 'فتح النموذج لاستكمالها';
    return `<div class="assistant-action-buttons" role="group" aria-label="مراجعة عملية المدير">${execute}<button type="button" class="assistant-action-secondary" onclick="openAssistantOperation()">${openLabel}</button><button type="button" class="assistant-action-cancel" onclick="cancelAssistantOperation()">إلغاء</button></div>`;
}

function openAssistantOperation() {
    if (!assistantOperationDraft || assistantIsOwner()) return false;
    const draft = assistantOperationDraft;
    const opener = draft.type === 'income' ? 'openAssistantIncomeDraft'
        : draft.type === 'expense' ? 'openAssistantExpenseDraft' : 'openAssistantAdjustmentDraft';
    const openForm = assistantGlobalFunction(opener);
    if (openForm) {
        openForm(draft);
        assistantOperationDraft = null;
        return true;
    }
    if (typeof toast === 'function') toast('نموذج العملية غير متاح الآن.', 'error');
    return false;
}

async function confirmAssistantOperation() {
    if (!assistantOperationDraft || assistantIsOwner()) return false;
    const draft = assistantOperationDraft;
    if (!assistantOperationCanExecute(draft)) {
        if (typeof toast === 'function') toast(`لسه ناقص: ${assistantOperationMissing(draft).join(' و')}.`, 'error');
        return false;
    }
    const openerName = draft.type === 'income' ? 'openAssistantIncomeDraft'
        : draft.type === 'expense' ? 'openAssistantExpenseDraft' : 'openAssistantAdjustmentDraft';
    const handlerName = draft.type === 'income' ? 'handleIncomeSubmit'
        : draft.type === 'expense' ? 'handleExpenseSubmit' : 'handleAdjustmentSubmit';
    const openForm = assistantGlobalFunction(openerName);
    const submitForm = assistantGlobalFunction(handlerName);
    if (!openForm || !submitForm) {
        if (typeof toast === 'function') toast('مسار الحفظ الرسمي غير متاح الآن؛ افتح النموذج وحاول مرة أخرى.', 'error');
        return false;
    }
    if (typeof closeModal === 'function') closeModal('assistantModal');
    const collectionBefore = Array.isArray(state.income) ? state.income.length : 0;
    const expenseBefore = Array.isArray(state.expenses) ? state.expenses.length : 0;
    const adjustmentBefore = Array.isArray(state.adjustments) ? state.adjustments.length : 0;
    assistantOperationDraft = null;
    try {
        if (openForm(draft) === false) throw new Error('assistant form did not open');
        await submitForm({ preventDefault() {} });
    } catch (error) {
        assistantOperationDraft = draft;
        if (typeof toast === 'function') toast('تعذر تشغيل مسار الحفظ الرسمي؛ لم تُحفظ العملية.', 'error');
        return false;
    }
    const collectionAfter = Array.isArray(state.income) ? state.income.length : 0;
    const expenseAfter = Array.isArray(state.expenses) ? state.expenses.length : 0;
    const adjustmentAfter = Array.isArray(state.adjustments) ? state.adjustments.length : 0;
    const saved = draft.type === 'income' ? collectionAfter > collectionBefore
        : draft.type === 'expense' ? expenseAfter > expenseBefore
            : adjustmentAfter > adjustmentBefore;
    if (!saved) assistantOperationDraft = draft;
    if (!saved && typeof toast === 'function') toast('لم يتم الحفظ. راجع الحقول أو رسالة التحقق في النموذج.', 'error');
    return saved;
}

function cancelAssistantOperation() {
    assistantOperationDraft = null;
    if (typeof toast === 'function') toast('تم إلغاء مسودة العملية.', 'info');
}

function assistantApartmentLabel(resident) {
    const raw = String(resident?.apartmentNumber ?? '').trim();
    return raw ? `شقة ${raw}` : 'شقة بدون رقم';
}

function assistantResidentName(resident) {
    return String(resident?.name || 'مالك محذوف');
}

function buildAssistantIncomeAnswer(period) {
    const snapshot = getAssistantIncomeSnapshot(period.months);
    const title = `تحصيل ${period.label}`;
    let html = '';
    html += assistantRow('إجمالي التحصيل', assistantMoney(snapshot.total), snapshot.total > 0 ? 'good' : '');
    html += assistantRow('اشتراكات شهرية', assistantMoney(snapshot.subscriptionTotal));
    if (snapshot.settlementTotal > 0) html += assistantRow('دفعات تسوية', assistantMoney(snapshot.settlementTotal));
    html += assistantRow('أغراض أخرى', assistantMoney(snapshot.otherTotal));
    html += assistantRow('عدد الدفعات', assistantNumber(snapshot.count));
    if (snapshot.purposes.length) {
        html += assistantList(snapshot.purposes.slice(0, 4).map(item =>
            `${assistantEscape(item.label)} — <strong>${assistantEscape(assistantMoney(item.cents / 100))}</strong>`
        ));
    } else {
        html += assistantNote('مفيش تحصيلات مسجلة في الفترة دي.');
    }
    html += assistantNote('الاشتراكات منفصلة عن التحصيلات الأخرى، والملاحظات التفصيلية موجودة في سجل التحصيل.');
    return { id: 'income', title, html };
}

function buildAssistantPaymentBreakdownAnswer(period) {
    const allowed = new Set(Array.isArray(period.months) ? period.months : []);
    const rows = (Array.isArray(state.income) ? state.income : []).filter(row => !allowed.size || allowed.has(row.month));
    const totals = new Map();
    let cents = 0;
    rows.forEach(row => {
        const amountCents = typeof toCents === 'function' ? toCents(row.amount) : Math.round((Number(row.amount) || 0) * 100);
        if (amountCents <= 0) return;
        const code = String(row.paymentMethod || 'unknown');
        totals.set(code, (totals.get(code) || 0) + amountCents);
        cents += amountCents;
    });
    const methods = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
    const labelFor = code => typeof getIncomePaymentMethodLabel === 'function'
        ? getIncomePaymentMethodLabel(code)
        : ({ cash: 'نقدي', wallet: 'محفظة إلكترونية', instapay: 'إنستاباي', bank_transfer: 'تحويل بنكي' }[code] || 'غير محددة');
    const title = `طرق تحصيل ${period.label}`;
    let html = assistantRow('إجمالي التحصيل', assistantMoney(cents / 100), cents > 0 ? 'good' : '');
    html += assistantRow('عدد الدفعات', assistantNumber(rows.length));
    if (methods.length) {
        html += assistantList(methods.map(([code, value]) =>
            `${assistantEscape(labelFor(code))} — <strong>${assistantEscape(assistantMoney(value / 100))}</strong>`
        ));
    } else {
        html += assistantNote('مفيش تحصيلات مسجلة في الفترة دي.');
    }
    html += assistantNote('التقرير تجميعي للقراءة فقط؛ التفاصيل الكاملة موجودة في سجل التحصيل ويمكن فلترتها بطريقة الدفع.');
    return { id: 'payment_breakdown', title, html };
}
function buildAssistantTopExpensesAnswer(period) {
    const snapshot = getAssistantExpenseSnapshot(period.months);
    const rows = snapshot.rows.slice().filter(row => {
        const amount = typeof toCents === 'function' ? toCents(row.amount) : Math.round((Number(row.amount) || 0) * 100);
        return amount > 0;
    }).sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)).slice(0, 5);
    const title = `أكبر المصروفات · ${period.label}`;
    let html = assistantRow('إجمالي المصروفات', assistantMoney(snapshot.total), snapshot.total > 0 ? 'bad' : '');
    html += assistantRow('المعروض', `${assistantNumber(rows.length)} من ${assistantNumber(snapshot.count)}`);
    if (rows.length) {
        html += assistantList(rows.map(row => {
            const label = row.title || row.category || 'مصروف';
            const category = row.category ? ` · ${row.category}` : '';
            return `${assistantEscape(label)}${assistantEscape(category)} — <strong>${assistantEscape(assistantMoney(row.amount))}</strong>`;
        }));
    } else {
        html += assistantNote('مفيش مصروفات مسجلة في الفترة دي.');
    }
    html += assistantNote('الترتيب حسب قيمة المصروف، والتفاصيل الكاملة موجودة في قسم المصروفات والتقارير.');
    return { id: 'top_expenses', title, html };
}
function buildAssistantExpensesAnswer(period) {
    const snapshot = getAssistantExpenseSnapshot(period.months);
    const title = `مصروفات ${period.label}`;
    let html = '';
    html += assistantRow('إجمالي المصروفات', assistantMoney(snapshot.total), snapshot.total > 0 ? 'bad' : '');
    html += assistantRow('عدد المصروفات', assistantNumber(snapshot.count));
    if (snapshot.categories.length) {
        html += assistantList(snapshot.categories.slice(0, 4).map(item =>
            `${assistantEscape(item.label)} — <strong>${assistantEscape(assistantMoney(item.cents / 100))}</strong>`
        ));
    } else {
        html += assistantNote('مفيش مصروفات مسجلة في الفترة دي.');
    }
    html += assistantNote('المصروفات تشمل كل الصناديق، والتفاصيل الكاملة في قسم المصروفات والتقارير.');
    return { id: 'expenses', title, html };
}

function buildAssistantSummaryAnswer(period) {
    const summary = getAssistantMonthSummary(period);
    const title = `ملخص ${period.label}`;
    let html = '';
    html += assistantRow('التحصيل المسجل', assistantMoney(summary.income.total), summary.income.total > 0 ? 'good' : '');
    html += assistantRow('المصروفات المسجلة', assistantMoney(summary.expenses.total), summary.expenses.total > 0 ? 'bad' : '');
    html += assistantRow('الصافي', assistantMoney(summary.net), summary.net >= 0 ? 'good' : 'bad');
    html += assistantRow(`مستحق ${summary.month}`, assistantMoney(summary.dueTotal));
    html += assistantRow(`غير محصل ${summary.month}`, assistantMoney(summary.outstandingTotal), summary.outstandingTotal > 0 ? 'warn' : 'good');
    html += assistantRow('وحدات متأخرة هذا الشهر', `${assistantNumber(summary.unpaidUnits)} من ${assistantNumber(Array.isArray(state.residents) ? state.residents.length : 0)}`);
    if (summary.unpaid.length) {
        html += assistantList(summary.unpaid.slice(0, 5).map(item =>
            `${assistantEscape(assistantApartmentLabel(item.resident))} · ${assistantEscape(assistantResidentName(item.resident))} — <strong>${assistantEscape(assistantMoney(item.outstanding))}</strong>`
        ));
    }
    html += assistantNote('الصافي = التحصيل ناقص المصروفات المسجلة خلال الفترة، وليس رصيد الخزائن. المتأخرات المتراكمة تظهر في سؤال «مين عليه متأخرات؟».');
    return { id: 'summary', title, html };
}

function buildAssistantChangeAlertsAnswer(period, now = new Date()) {
    const periods = getAssistantComparisonPeriods(period, now);
    const currentIncomeSnapshot = getAssistantIncomeSnapshot(periods.current.months);
    const previousIncomeSnapshot = getAssistantIncomeSnapshot(periods.previous.months);
    const currentExpenseSnapshot = getAssistantExpenseSnapshot(periods.current.months);
    const previousExpenseSnapshot = getAssistantExpenseSnapshot(periods.previous.months);
    const currentIncome = currentIncomeSnapshot.total;
    const previousIncome = previousIncomeSnapshot.total;
    const currentExpenses = currentExpenseSnapshot.total;
    const previousExpenses = previousExpenseSnapshot.total;
    const currentNet = currentIncome - currentExpenses;
    const previousNet = previousIncome - previousExpenses;
    const metrics = [
        ['التحصيل', currentIncome, previousIncome],
        ['المصروفات', currentExpenses, previousExpenses],
        ['الصافي', currentNet, previousNet]
    ];
    const notable = metrics.filter(([, current, previous]) => {
        const currentValue = Number(current);
        const previousValue = Number(previous);
        const delta = Math.abs(currentValue - previousValue);
        return delta > 0 && (previousValue === 0 || delta / Math.max(Math.abs(previousValue), 1) >= 0.25);
    });
    const followUpQueries = [];
    if (notable.some(([label]) => label === 'التحصيل')) followUpQueries.push(`تحصيل ${periods.current.label}`);
    if (notable.some(([label]) => label === 'المصروفات')) followUpQueries.push(`أكبر المصروفات ${periods.current.label}`);
    if (notable.some(([label]) => label === 'الصافي')) followUpQueries.push(`ملخص ${periods.current.label}`);
    followUpQueries.push(`مقارنة ${periods.current.label}`);
    const title = `تغيرات تستحق المراجعة · ${periods.current.label}`;
    let html = `<p class="assistant-answer-subtitle">مقارنة مع ${assistantEscape(periods.previous.label)}</p>`;
    if (notable.length) {
        html += assistantList(notable.map(([label, current, previous]) => {
            const currentValue = Number(current);
            const previousValue = Number(previous);
            const delta = currentValue - previousValue;
            const direction = delta > 0 ? 'زيادة' : 'انخفاض';
            return `${assistantEscape(label)}: ${assistantEscape(assistantMoney(currentValue))} مقابل ${assistantEscape(assistantMoney(previousValue))} · <strong>${direction} ${assistantEscape(assistantMoney(Math.abs(delta)))}</strong>`;
        }));
        if (notable.some(([label]) => label === 'التحصيل')) {
            const previousMethods = new Map(getAssistantPaymentMethodSnapshot(periods.previous.months).map(item => [item.code, item]));
            const methods = getAssistantPaymentMethodSnapshot(periods.current.months);
            if (methods.length) {
                html += assistantNote(`تفصيل التحصيل في ${periods.current.label}:`);
                html += assistantList(methods.slice(0, 3).map(item => {
                    const previous = previousMethods.get(item.code);
                    const previousValue = previous ? previous.cents / 100 : 0;
                    return `${assistantEscape(item.label)} — <strong>${assistantEscape(assistantMoney(item.cents / 100))}</strong> مقابل ${assistantEscape(assistantMoney(previousValue))} سابقًا`;
                }));
            }
        }
        if (notable.some(([label]) => label === 'المصروفات')) {
            const currentTop = currentExpenseSnapshot.categories[0];
            const previousTop = previousExpenseSnapshot.categories[0];
            if (currentTop || previousTop) {
                html += assistantNote('أكبر بند مصروف للمساعدة في فهم التغير:');
                html += assistantList([
                    `الحالي: ${assistantEscape(currentTop ? currentTop.label : 'مفيش بند مسجل')} — <strong>${assistantEscape(assistantMoney(currentTop ? currentTop.cents / 100 : 0))}</strong>`,
                    `السابق: ${assistantEscape(previousTop ? previousTop.label : 'مفيش بند مسجل')} — <strong>${assistantEscape(assistantMoney(previousTop ? previousTop.cents / 100 : 0))}</strong>`
                ]);
            }
        }
        html += assistantNote(`مصدر الأرقام: سجل التحصيلات وسجل المصروفات للفترتين. الصافي محسوب من التحصيل ناقص المصروفات المسجلة، ودي مؤشرات للمراجعة وليست حكمًا بوجود خطأ.`);
    } else {
        html += assistantNote('مفيش تغير كبير ظاهر في التحصيل أو المصروفات أو الصافي مقارنة بالشهر السابق.');
    }
    return { id: 'change_alerts', title, html, followUpQueries };
}
function buildAssistantExecutiveAnswer(period) {
    const summary = getAssistantMonthSummary(period);
    const cash = getAssistantCashSnapshot();
    const arrears = getAssistantArrearsSnapshot();
    const title = `ملخص تنفيذي · ${period.label}`;
    let html = '<p class="assistant-answer-subtitle">لقطة سريعة للإدارة</p>';
    html += assistantRow('التحصيل', assistantMoney(summary.income.total), summary.income.total > 0 ? 'good' : '');
    html += assistantRow('المصروفات', assistantMoney(summary.expenses.total), summary.expenses.total > 0 ? 'bad' : '');
    html += assistantRow('الصافي', assistantMoney(summary.net), summary.net >= 0 ? 'good' : 'bad');
    html += assistantRow('إجمالي السيولة', assistantMoney(cash.total), cash.total >= 0 ? 'good' : 'bad');
    html += assistantRow('المتأخرات المتراكمة', assistantMoney(arrears.totalDebt), arrears.totalDebt > 0 ? 'warn' : 'good');
    html += assistantRow('شقق عليها متأخرات', assistantNumber(arrears.overdueResidents), arrears.overdueResidents > 0 ? 'warn' : 'good');
    html += assistantNote('التحصيل والمصروفات والصافي تخص الفترة المحددة، بينما السيولة والمتأخرات أرقام تراكمية من السجل المتاح.');
    return { id: 'executive', title, html };
}
function buildAssistantArrearsAnswer() {
    const snapshot = getAssistantArrearsSnapshot();
    const title = 'المتأخرات المتراكمة';
    let html = '';
    html += assistantRow('إجمالي المتأخرات', assistantMoney(snapshot.totalDebt), snapshot.totalDebt > 0 ? 'bad' : 'good');
    html += assistantRow('شقق عليها متأخرات', assistantNumber(snapshot.overdueResidents));
    html += assistantRow('عدد الشهور المتأخرة', assistantNumber(snapshot.overdueMonths));
    if (snapshot.oldestMonth) html += assistantRow('أقدم شهر غير مسدد', snapshot.oldestMonth, 'warn');
    if (snapshot.maxDaysOverdue > 0) html += assistantRow('أطول مدة تأخر', `${assistantNumber(snapshot.maxDaysOverdue)} يومًا`, 'warn');
    if (snapshot.residents.length) {
        html += assistantList(snapshot.residents.slice(0, 6).map(item => {
            const rawOldest = item.oldestMonth || (Array.isArray(item.unpaidMonths) ? item.unpaidMonths[0] : '');
            const oldest = rawOldest && typeof rawOldest === 'object' ? rawOldest.month : rawOldest;
            return `${assistantEscape(assistantApartmentLabel(item.resident))} · ${assistantEscape(assistantResidentName(item.resident))} — <strong>${assistantEscape(assistantMoney(item.totalDebt))}</strong> (${assistantNumber(item.count)} شهر${oldest ? ` · أقدم: ${assistantEscape(oldest)}` : ''})`;
        }));
    } else {
        html += assistantNote('تمام! مفيش أي متأخرات مسجلة حاليًا.');
    }
    html += assistantNote('المتأخرات محسوبة من الاشتراكات المستحقة بعد خصم المدفوع والإعفاءات، وليس من إجمالي المصروفات.');
    return { id: 'arrears', title, html };
}

function buildAssistantCashAnswer() {
    const snapshot = getAssistantCashSnapshot();
    const title = 'أرصدة الخزائن';
    let html = snapshot.balances.map(item =>
        assistantRow(item.label, assistantMoney(item.amount), item.amount < 0 ? 'bad' : '')
    ).join('');
    html += assistantRow('إجمالي السيولة', assistantMoney(snapshot.total), snapshot.total >= 0 ? 'good' : 'bad');
    html += assistantNote('الأرصدة دي محسوبة من الخادم بعد كل عملية حفظ، وبتشمل التحصيلات والمصروفات والتحويلات بين الصناديق.');
    return { id: 'cashbox', title, html };
}

function buildAssistantResidentAnswer(resident, now = new Date()) {
    const snapshot = getAssistantResidentSnapshot(resident, now);
    const title = `${assistantApartmentLabel(resident)} · ${assistantResidentName(resident)}`;
    let html = '';
    if (snapshot.settlement) {
        html += assistantRow('الاشتراك قبل التسوية', assistantMoney(snapshot.grossSubscription));
        html += assistantRow('قيمة اتفاق التسوية', assistantMoney(snapshot.subscription));
        html += assistantRow('المسدد من التسوية', assistantMoney(snapshot.settlementPaid), snapshot.settlementPaid > 0 ? 'good' : '');
        html += assistantRow('المتبقي من التسوية', assistantMoney(snapshot.settlementRemaining), snapshot.settlementRemaining > 0 ? 'warn' : 'good');
    } else {
        html += assistantRow('اشتراك الشهر', assistantMoney(snapshot.subscription));
        html += assistantRow('مدفوع هذا الشهر', assistantMoney(snapshot.paid), snapshot.paid > 0 ? 'good' : '');
        if (snapshot.adjusted > 0) html += assistantRow('إعفاء / تخفيض الشهر', assistantMoney(snapshot.adjusted), 'warn');
        html += assistantRow('المتبقي هذا الشهر', assistantMoney(snapshot.outstanding), snapshot.outstanding > 0 ? 'bad' : 'good');
    }
    html += assistantRow('إجمالي المتأخرات', assistantMoney(snapshot.debt.totalDebt), snapshot.debt.totalDebt > 0 ? 'bad' : 'good');
    html += assistantRow('شهور متأخرة', assistantNumber(snapshot.debt.count));
    if (snapshot.lastPayment) {
        const last = snapshot.lastPayment;
        const purpose = typeof getIncomePurposeLabel === 'function' ? getIncomePurposeLabel(last.purposeCode) : (last.purposeCode || 'تحصيل');
        const dateLabel = typeof formatDate === 'function' ? formatDate(last.date) : String(last.date || '');
        html += assistantRow('آخر دفعة', `${assistantMoney(last.amount)} · ${purpose}${dateLabel ? ` · ${dateLabel}` : ''}`);
    } else {
        html += assistantNote('مفيش دفعات مسجلة للمالك ده حتى الآن.');
    }
    if (snapshot.monthPayments.length > 1) {
        html += assistantNote(`في ${assistantNumber(snapshot.monthPayments.length)} دفعات مسجلة على شهر ${snapshot.month}.`);
    }
    return { id: 'resident', title, html };
}

function buildAssistantAdjustmentsAnswer(period) {
    const allowed = new Set(period.months);
    const rows = (Array.isArray(state.adjustments) ? state.adjustments : []).filter(adjustment => {
        const key = String(adjustment.effectiveMonth || '');
        if (!/^\d{4}-\d{2}-01$/.test(key)) return false;
        const label = typeof monthKeyToLabel === 'function'
            ? monthKeyToLabel(key)
            : `${getAssistantMonthNames()[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
        return allowed.has(label);
    });
    const kindLabel = kind => typeof getAdjustmentKindLabel === 'function'
        ? getAdjustmentKindLabel(kind)
        : ({ waiver: 'إعفاء', discount: 'تخفيض', settlement: 'تسوية' }[kind] || 'تسوية');
    const totals = { waiver: 0, discount: 0, settlement: 0 };
    let cents = 0;
    rows.forEach(adjustment => {
        const amountCents = typeof toCents === 'function' ? toCents(adjustment.amount) : Math.round((Number(adjustment.amount) || 0) * 100);
        if (amountCents <= 0) return;
        cents += amountCents;
        totals[adjustment.kind] = (totals[adjustment.kind] || 0) + amountCents;
    });
    const title = `الإعفاءات والتخفيضات · ${period.label}`;
    let html = '';
    html += assistantRow('إجمالي الإعفاءات', assistantMoney(totals.waiver / 100), totals.waiver > 0 ? 'warn' : '');
    html += assistantRow('إجمالي التخفيضات', assistantMoney(totals.discount / 100), totals.discount > 0 ? 'warn' : '');
    if (totals.settlement > 0) html += assistantRow('تسويات', assistantMoney(totals.settlement / 100));
    html += assistantRow('الإجمالي', assistantMoney(cents / 100));
    html += assistantRow('عدد البنود', assistantNumber(rows.length));
    if (rows.length) {
        const residentById = new Map((Array.isArray(state.residents) ? state.residents : []).map(resident => [resident.id, resident]));
        const list = rows.slice().sort((a, b) => String(b.effectiveMonth).localeCompare(String(a.effectiveMonth))).slice(0, 6);
        html += assistantList(list.map(adjustment => {
            const resident = residentById.get(adjustment.residentId);
            const month = typeof monthKeyToLabel === 'function' ? monthKeyToLabel(adjustment.effectiveMonth) : String(adjustment.effectiveMonth).slice(0, 7);
            return `${assistantEscape(assistantApartmentLabel(resident))} · ${assistantEscape(assistantResidentName(resident))} — ${assistantEscape(kindLabel(adjustment.kind))} ${assistantEscape(assistantMoney(adjustment.amount))} · ${assistantEscape(month)}`;
        }));
    } else {
        html += assistantNote('مفيش إعفاءات أو تخفيضات مسجلة في الفترة دي.');
    }
    html += assistantNote('الإعفاءات بتخصم من المستحق الشهري ومش بتتحسب كتحصيل نقدي.');
    return { id: 'adjustments', title, html };
}

function buildAssistantRecentAnswer() {
    const sortByDate = (a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime();
    const payments = (Array.isArray(state.income) ? state.income : []).slice().sort(sortByDate).slice(0, 5);
    const expenses = (Array.isArray(state.expenses) ? state.expenses : []).slice().sort(sortByDate).slice(0, 5);
    const residentById = new Map((Array.isArray(state.residents) ? state.residents : []).map(resident => [resident.id, resident]));
    let html = '';
    html += '<p class="assistant-answer-subtitle">آخر التحصيلات</p>';
    if (payments.length) {
        html += assistantList(payments.map(payment => {
            const resident = residentById.get(payment.residentId);
            const purpose = typeof getIncomePurposeLabel === 'function' ? getIncomePurposeLabel(payment.purposeCode) : (payment.purposeCode || 'تحصيل');
            return `${assistantEscape(assistantApartmentLabel(resident))} · ${assistantEscape(assistantResidentName(resident))} — <strong>${assistantEscape(assistantMoney(payment.amount))}</strong> · ${assistantEscape(payment.month || '')} · ${assistantEscape(purpose)}`;
        }));
    } else {
        html += assistantNote('مفيش تحصيلات مسجلة.');
    }
    html += '<p class="assistant-answer-subtitle">آخر المصروفات</p>';
    if (expenses.length) {
        html += assistantList(expenses.map(expense =>
            `${assistantEscape(expense.title || 'مصروف')} — <strong>${assistantEscape(assistantMoney(expense.amount))}</strong> · ${assistantEscape(expense.month || '')}${expense.category ? ` · ${assistantEscape(expense.category)}` : ''}`
        ));
    } else {
        html += assistantNote('مفيش مصروفات مسجلة.');
    }
    return { id: 'recent', title: 'آخر الحركات', html };
}

function buildAssistantBuildingAnswer() {
    const residents = Array.isArray(state.residents) ? state.residents : [];
    let html = '';
    html += assistantRow('العمارة', String(state.buildingName || 'بدون اسم'));
    html += assistantRow('مدير المبنى', String(state.managerName || 'غير مسجل'));
    html += assistantRow('عدد الشقق', assistantNumber(residents.length));
    html += assistantRow('الأدوار', assistantNumber(state.floorCount || 0));
    html += assistantRow('شقق لكل دور', assistantNumber(state.apartmentsPerFloor || 0));
    html += assistantRow('الاشتراك الافتراضي', assistantMoney(state.defaultSubscription || 0));
    html += assistantRow('رصيد البداية', assistantMoney(state.startingBalance || 0));
    if (state.lastUpdated) {
        const updated = typeof formatDate === 'function' ? formatDate(new Date(state.lastUpdated).toISOString()) : '';
        if (updated) html += assistantRow('آخر تحديث', updated);
    }
    return { id: 'building', title: 'بيانات العمارة', html };
}

function buildAssistantHelpAnswer() {
    const title = 'أنا أقدر أساعدك في إيه؟';
    const html = `${assistantList([
        'ملخص الشهر: التحصيل والمصروفات والصافي والمتبقي.',
        'المتأخرات: مين عليه كام وعدد الشهور.',
        'تحصيل أو مصروفات شهر معين، أو سنة كاملة.',
        'رصيد الخزنة الرئيسية وصندوق التطوير وصندوق الطوارئ.',
        'حساب مالك بالاسم أو برقم الشقة.',
        'الإعفاءات والتخفيضات المسجلة.',
        'تجهيز تحصيل أو مصروف أو إعفاء/تسوية ثم حفظه بعد تأكيدك الصريح.',
        'نشر إعلان بعد معاينته وتأكيد النشر.',
        'آخر الحركات وبيانات العمارة.',
        'أماكن التقارير وكيف تطبع أو تصدّر CSV.'
    ])}${assistantNote('اكتب سؤالك بالعامية أو بالفصحى. في أي عملية مالية سيعرض عم عبده الملخص أولًا، ولن يحفظها إلا بعد ضغط «تنفيذ وحفظ».')}`;
    return { id: 'help', title, html };
}

function buildAssistantKnowledgeAnswer() {
    const owner = assistantIsOwner();
    const title = owner ? 'إزاي تستخدم عم عبده؟' : 'مركز معرفة عم عبده';
    const items = owner ? [
        'اسألني عن حساب شقتك، إيصالاتك، المتأخرات، ميعاد الدفع وطرق الدفع المفعّلة.',
        'أقدر أعرض إعلانات المبنى وإشعاراتك ورقم المدير.',
        'بيانات الشقق الأخرى وأرصدة العمارة تخص الإدارة ومش متاحة في حساب المالك.',
        'إجاباتي قراءة فقط؛ لا أضيف ولا أعدّل ولا أحذف أي بيانات.'
    ] : [
        'اسألني بالعامية أو بالفصحى عن التحصيلات والمصروفات والمتأخرات والخزائن والتقارير.',
        'أقدر أشرح بيانات العمارة وأعرض آخر الحركات والإعفاءات والتخفيضات.',
        'الإجابات والتقارير قراءة فقط؛ لا يتغير السجل إلا من مسار تنفيذ واضح بعد تأكيد المدير.',
        'بيانات العمارة وإجراءاتها لا تظهر إلا للمستخدم ذي صلاحيات المدير.',
        'إجاباتي تُحسب محليًا من بيانات الجلسة ولا أرسل المحادثة أو بيانات العمارة لخدمة خارجية.',
        'أقدر أجهز إضافة تحصيل أو مصروف أو تسوية، لكن الحفظ لا يحدث إلا بعد مراجعتك وضغط «تنفيذ وحفظ»؛ الحذف والتعديل يظلّان من شاشات التطبيق.'
    ];
    return { id: 'knowledge', title, html: assistantList(items) + assistantNote(owner ? 'جرّب: «إيصالاتي» أو «آخر يوم للدفع كام؟».' : 'جرّب: «مين يقدر يشوف البيانات؟» أو «إزاي أستخدم التقارير؟».') };
}

function openAssistantReports(reportTab = 'landlord') {
    if (assistantIsOwner()) return false;
    if (typeof switchTab === 'function') switchTab('reports');
    if (typeof switchReportTab === 'function') setTimeout(() => switchReportTab(reportTab), 0);
    return true;
}

function buildAssistantReportsAnswer() {
    const title = 'التقارير المتاحة';
    const html = `${assistantList([
        'تقرير المالك الشهري: تحصيل ومصروفات الشهر مع فلاتر الغرض والصندوق وطريقة الدفع والشقة.',
        'تقرير فترة: مقارنة مجموعة شهور مع فلاتر.',
        'تقرير المصروفات: حسب الفترة والصندوق والتصنيف.',
        'تقرير الإعفاءات والتخفيضات: حسب الفترة والشقة والنوع.',
        'كشف حساب مالك: حركات الشهر والمستحق والمتأخرات.',
        'الإقفال الشهري والمتأخرات وسجل التدقيق.'
    ])}${assistantNote('افتح قسم «التقارير» من الشريط السفلي، وكل تقرير له معاينة وطباعة وتصدير CSV.')}
        <div class="assistant-action-buttons" role="group" aria-label="فتح التقارير">
            <button type="button" class="assistant-action-confirm" onclick="openAssistantReports('landlord')">فتح تقرير المالك</button>
            <button type="button" class="assistant-action-secondary" onclick="openAssistantReports('period')">فتح تقرير الفترة</button>
        </div>`;
    return { id: 'reports', title, html };
}

const ASSISTANT_HERO_SRC = 'icons/assistant-abbah-full.png';

function assistantIsOwner() {
    return typeof currentUserRole !== 'undefined' && currentUserRole === 'owner';
}

function assistantOwnerResident() {
    const residents = Array.isArray(state.residents) ? state.residents : [];
    if (!residents.length || !currentResidentId) return null;
    return residents.find(resident => resident.id === currentResidentId) || null;
}

function assistantUserDisplayName() {
    if (assistantIsOwner()) return String(assistantOwnerResident()?.name || '').trim();
    return String(typeof currentProfileName === 'string' ? currentProfileName : '').trim();
}

function assistantAddress() {
    const name = assistantUserDisplayName();
    return name ? `يا ${assistantEscape(name)}` : 'يا أستاذ';
}

function assistantCents(value) {
    return typeof toCents === 'function' ? toCents(value) : Math.round((Number(value) || 0) * 100);
}

function assistantDateLabel(value) {
    if (!value) return '';
    return typeof formatDate === 'function' ? String(formatDate(value) || '') : String(value);
}

function assistantDueRows(monthLabel, outstanding, now = new Date()) {
    if (typeof getSubscriptionDueDeadline !== 'function') return '';
    const deadline = getSubscriptionDueDeadline(monthLabel);
    if (!deadline) return '';
    const dueDay = Math.min(28, Math.max(1, Number(state.subscriptionDueDay) || 1));
    const graceDays = Math.min(31, Math.max(0, Number(state.subscriptionGraceDays) || 0));
    const late = Number(outstanding) > 0 && new Date(now || Date.now()).getTime() >= deadline.getTime();
    let html = assistantRow('ميعاد المستحق', `يوم ${assistantNumber(dueDay)} من كل شهر`);
    html += assistantRow('فترة السماح', `${assistantNumber(graceDays)} يوم`);
    const deadlineLabel = assistantDateLabel(deadline);
    if (deadlineLabel) html += assistantRow('آخر موعد للدفع', deadlineLabel, late ? 'bad' : '');
    return html;
}

function buildAssistantOwnerMissingAnswer() {
    return {
        id: 'owner_scope',
        title: 'مفيش شقة على حسابك',
        html: assistantNote('لسه مفيش شقة مرتبطة بحسابك. اطلب من مدير العمارة ربط الحساب، وبعدها أقدر أقولك حسابك وإيصالاتك وميعاد الدفع.')
    };
}

function buildAssistantOwnerBillAnswer(period, now = new Date()) {
    const resident = assistantOwnerResident();
    if (!resident) return buildAssistantOwnerMissingAnswer();
    const month = period && period.type === 'month' ? period.label : getAssistantNowLabel(now);
    const snapshot = getAssistantResidentSnapshot(resident, now, month);
    let html = '';
    html += assistantRow('شقتك', assistantApartmentLabel(resident));
    html += assistantRow('اشتراك الشهر', assistantMoney(snapshot.subscription));
    html += assistantRow('المدفوع في الشهر ده', assistantMoney(snapshot.paid), snapshot.paid > 0 ? 'good' : '');
    if (snapshot.adjusted > 0) html += assistantRow('إعفاء / تخفيض', assistantMoney(snapshot.adjusted), 'warn');
    html += assistantRow('المتبقي عليك', assistantMoney(snapshot.outstanding), snapshot.outstanding > 0 ? 'bad' : 'good');
    html += assistantRow('متأخرات على شقتك', assistantMoney(snapshot.debt.totalDebt), snapshot.debt.totalDebt > 0 ? 'bad' : 'good');
    html += assistantDueRows(month, snapshot.outstanding, now);
    if (snapshot.lastPayment) {
        const dateLabel = assistantDateLabel(snapshot.lastPayment.date);
        html += assistantRow('آخر دفعة', `${assistantMoney(snapshot.lastPayment.amount)}${dateLabel ? ` · ${dateLabel}` : ''}`);
    }
    html += snapshot.outstanding <= 0 && snapshot.debt.totalDebt <= 0
        ? assistantNote('حسابك تمام — مفيش حاجة عليك دلوقتي.')
        : assistantNote('الأرقام دي من سجل العمارة لشقتك أنت؛ لو دفعة مش ظاهرة كلم مدير العمارة.');
    return { id: 'my_bill', title: `حسابك · ${month}`, html };
}

function buildAssistantOwnerReceiptsAnswer(period, now = new Date()) {
    const resident = assistantOwnerResident();
    if (!resident) return buildAssistantOwnerMissingAnswer();
    const allowed = period && period.type !== 'all' && Array.isArray(period.months) ? new Set(period.months) : null;
    const payments = (Array.isArray(state.income) ? state.income : [])
        .filter(payment => payment.residentId === resident.id)
        .filter(payment => !allowed || allowed.has(String(payment.month || '')))
        .slice()
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    const title = `إيصالاتك · ${allowed ? period.label : 'كل الفترات'}`;
    if (!payments.length) return { id: 'my_receipts', title, html: assistantNote('مفيش دفعات مسجلة على شقتك في الفترة دي.') };
    const totalCents = payments.reduce((sum, payment) => sum + assistantCents(payment.amount), 0);
    let html = assistantRow('عدد الإيصالات', assistantNumber(payments.length));
    html += assistantRow('إجمالي اللي دفعته', assistantMoney(totalCents / 100), 'good');
    html += assistantList(payments.slice(0, 6).map(payment => {
        const dateLabel = assistantDateLabel(payment.date);
        const method = typeof getIncomePaymentMethodLabel === 'function'
            ? getIncomePaymentMethodLabel(payment.paymentMethod)
            : 'نقدًا';
        return `${assistantEscape(payment.month || '')}${dateLabel ? ` · ${assistantEscape(dateLabel)}` : ''} — <strong>${assistantEscape(assistantMoney(payment.amount))}</strong> · ${assistantEscape(method)}`;
    }));
    if (payments.length > 6) html += assistantNote(`وفي ${assistantNumber(payments.length - 6)} إيصالات أقدم؛ كاملها في بوابة المالك.`);
    html += assistantNote('كل دفعة ليها إيصال في بوابة المالك، ولو ناقصك نسخة اطلبها من المدير.');
    return { id: 'my_receipts', title, html };
}

function buildAssistantOwnerDueAnswer(now = new Date()) {
    const resident = assistantOwnerResident();
    if (!resident) return buildAssistantOwnerMissingAnswer();
    const month = getAssistantNowLabel(now);
    const snapshot = getAssistantResidentSnapshot(resident, now, month);
    let html = assistantDueRows(month, snapshot.outstanding, now);
    const overdueNow = typeof isSubscriptionMonthOverdue === 'function' ? isSubscriptionMonthOverdue(month, now) : false;
    const status = snapshot.outstanding <= 0
        ? 'مفيش عليك حاجة في الشهر ده'
        : overdueNow ? 'الموعد عدّى — يُرجى الدفع وتوضيح المدير' : 'لسه في وقت، المتبقي ' + assistantMoney(snapshot.outstanding);
    html += assistantRow('الحالة', status, snapshot.outstanding > 0 && overdueNow ? 'bad' : snapshot.outstanding > 0 ? 'warn' : 'good');
    if (snapshot.debt.totalDebt > 0) {
        html += assistantRow('متأخرات سابقة', assistantMoney(snapshot.debt.totalDebt), 'bad');
        html += assistantNote(`عليك ${assistantNumber(snapshot.debt.count)} شهر متأخر، والمدير يقدر يوضحلك التسويات المتاحة.`);
    }
    return { id: 'my_due_date', title: `ميعاد الدفع · ${month}`, html };
}

function buildAssistantOwnerPaymentMethodsAnswer() {
    const settings = typeof normalizePaymentSettings === 'function'
        ? normalizePaymentSettings(state.paymentSettings)
        : (state.paymentSettings || {});
    const labels = typeof INCOME_PAYMENT_METHOD_LABELS !== 'undefined' ? INCOME_PAYMENT_METHOD_LABELS : {};
    const rows = Object.keys(labels)
        .filter(method => settings[method]?.enabled)
        .map(method => {
            const detail = settings[method] || {};
            const parts = [];
            if (method === 'wallet') {
                if (detail.provider) parts.push(`الشركة: ${detail.provider}`);
                if (detail.accountName) parts.push(`صاحب المحفظة: ${detail.accountName}`);
            } else if (method === 'instapay') {
                if (detail.accountName) parts.push(`صاحب الحساب: ${detail.accountName}`);
                if (detail.address) parts.push(`عنوان الدفع: ${detail.address}`);
            } else if (method === 'bank_transfer') {
                if (detail.bankName) parts.push(`البنك: ${detail.bankName}`);
                if (detail.accountName) parts.push(`صاحب الحساب: ${detail.accountName}`);
            } else {
                parts.push('تسليم نقدي لمدير العمارة.');
            }
            return `<strong>${assistantEscape(labels[method])}</strong>${parts.length ? ` — ${assistantEscape(parts.join(' · '))}` : ''}`;
        });
    const html = rows.length
        ? assistantList(rows) + assistantNote('البيانات دي زي ما المدير مسجلها في إعدادات الدفع، والدفع نفسه بيتسجل عند المدير.')
        : assistantNote('مفيش طرق دفع مفعّلة حاليًا؛ الدفع نقدًا لمدير العمارة.');
    return { id: 'payment_methods', title: 'طرق الدفع المتاحة', html };
}

function buildAssistantOwnerNotificationsAnswer() {
    const notifications = (Array.isArray(state.ownerNotifications) ? state.ownerNotifications : [])
        .slice()
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const unread = notifications.filter(notification => !notification.readAt).length;
    let html = assistantRow('إشعاراتك', assistantNumber(notifications.length));
    html += assistantRow('غير المقروء', assistantNumber(unread), unread > 0 ? 'warn' : 'good');
    html += notifications.length
        ? assistantList(notifications.slice(0, 5).map(notification => {
            const dateLabel = assistantDateLabel(notification.createdAt);
            return `${assistantEscape(notification.title || 'إشعار')}${dateLabel ? ` · ${assistantEscape(dateLabel)}` : ''}${notification.readAt ? '' : ' · <strong>جديد</strong>'}`;
        }))
        : assistantNote('مفيش إشعارات على حسابك حاليًا.');
    if (unread > 0) html += assistantNote('افتح الإشعار من بوابة المالك وحدده كمقروء.');
    return { id: 'my_notifications', title: 'إشعارات حسابك', html };
}

function buildAssistantNoticesAnswer() {
    const notices = (Array.isArray(state.notices) ? state.notices : [])
        .slice()
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    let html = '';
    if (notices.length) {
        html += assistantList(notices.slice(0, 3).map(notice => {
            const dateLabel = assistantDateLabel(notice.date);
            return `${assistantEscape(String(notice.text || '').slice(0, 140))}${dateLabel ? ` — <em>${assistantEscape(dateLabel)}</em>` : ''}`;
        }));
        if (notices.length > 3) html += assistantNote(`و${assistantNumber(notices.length - 3)} إعلان أقدم موجود في بوابة المالك.`);
    } else {
        html += assistantNote('مفيش إعلانات منشورة حاليًا.');
    }
    return { id: 'notices', title: 'إعلانات المبنى', html };
}

function buildAssistantManagerContactAnswer() {
    const name = String(state.managerName || '').trim();
    const phone = String(state.managerPhone || '').trim();
    let html = '';
    html += assistantRow('مدير العمارة', name || 'غير مسجل');
    html += assistantRow('رقم التواصل', phone || 'غير مسجل');
    if (phone) {
        html += `<p class="assistant-note">تقدر تتصل بالمدير مباشرة: <a href="tel:${assistantEscape(phone.replace(/[^\d+]/g, ''))}" class="assistant-link">${assistantEscape(phone)}</a></p>`;
    }
    html += assistantNote('أي تعديل في الاشتراك أو تسوية أو إيصال بيتسجل عن طريق مدير العمارة.');
    return { id: 'contact', title: 'تواصل مع المدير', html };
}

function buildAssistantOwnerApartmentAnswer(now = new Date()) {
    const resident = assistantOwnerResident();
    if (!resident) return buildAssistantOwnerMissingAnswer();
    const month = getAssistantNowLabel(now);
    const snapshot = getAssistantResidentSnapshot(resident, now, month);
    let html = '';
    html += assistantRow('شقتك', assistantApartmentLabel(resident));
    if (state.buildingName) html += assistantRow('العمارة', String(state.buildingName));
    if (resident.floor) html += assistantRow('الدور', String(resident.floor));
    html += assistantRow('اشتراك الشهر الحالي', assistantMoney(snapshot.subscription));
    html += assistantRow('المتبقي ' + month, assistantMoney(snapshot.outstanding), snapshot.outstanding > 0 ? 'bad' : 'good');
    html += assistantRow('متأخرات على شقتك', assistantMoney(snapshot.debt.totalDebt), snapshot.debt.totalDebt > 0 ? 'bad' : 'good');
    html += assistantNote('بيانات الشقق التانية وسجلات العمارة مش متاحة في حسابك.');
    return { id: 'my_apartment', title: 'بيانات شقتك', html };
}

function buildAssistantOwnerAdjustmentsAnswer(period, now = new Date()) {
    const resident = assistantOwnerResident();
    if (!resident) return buildAssistantOwnerMissingAnswer();
    const allowed = new Set(period && Array.isArray(period.months) ? period.months : []);
    const rows = (Array.isArray(state.adjustments) ? state.adjustments : []).filter(adjustment => {
        if (adjustment.residentId !== resident.id) return false;
        const key = String(adjustment.effectiveMonth || '');
        if (!/^\d{4}-\d{2}-01$/.test(key)) return false;
        const label = typeof monthKeyToLabel === 'function'
            ? monthKeyToLabel(key)
            : `${getAssistantMonthNames()[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
        return allowed.has(label);
    });
    const kindLabel = kind => typeof getAdjustmentKindLabel === 'function'
        ? getAdjustmentKindLabel(kind)
        : ({ waiver: 'إعفاء', discount: 'تخفيض', settlement: 'تسوية' }[kind] || 'تسوية');
    let cents = 0;
    rows.forEach(adjustment => {
        const amountCents = assistantCents(adjustment.amount);
        if (amountCents > 0) cents += amountCents;
    });
    let html = '';
    html += assistantRow('إجمالي الإعفاءات والتخفيضات', assistantMoney(cents / 100), cents > 0 ? 'warn' : '');
    html += assistantRow('عدد البنود', assistantNumber(rows.length));
    html += rows.length
        ? assistantList(rows.slice().sort((a, b) => String(b.effectiveMonth).localeCompare(String(a.effectiveMonth))).slice(0, 6).map(adjustment => {
            const month = typeof monthKeyToLabel === 'function' ? monthKeyToLabel(adjustment.effectiveMonth) : String(adjustment.effectiveMonth).slice(0, 7);
            return `${assistantEscape(kindLabel(adjustment.kind))} ${assistantEscape(assistantMoney(adjustment.amount))} · ${assistantEscape(month)}`;
        }))
        : assistantNote('مفيش إعفاءات أو تخفيضات مسجلة على شقتك في الفترة دي.');
    html += assistantNote('الإعفاء والتخفيض بيخصموا من المستحق ومش بيتحسبوا دفعات نقدية.');
    return { id: 'my_adjustments', title: `إعفاءات شقتك · ${period ? period.label : ''}`.trim(), html };
}

function buildAssistantOwnerHelpAnswer() {
    const html = `${assistantList([
        'حسابك في أي شهر: الاشتراك، المدفوع، المتبقي والمتأخرات.',
        'إيصالاتك: كل دفعة بتاريخها وطريقة الدفع.',
        'ميعاد الدفع: يوم الاستحقاق، فترة السماح وآخر موعد.',
        'طرق الدفع المفعّلة في العمارة.',
        'إشعاراتك وإعلانات المبنى.',
        'إعفاءات وتخفيضات شقتك، ورقم مدير العمارة.'
    ])}${assistantNote('اكتب بالعامية أو بالفصحى. مثال: «عليّا كام في نوفمبر؟»، «إيصالاتي»، «آخر يوم للدفع كام؟».')}`;
    return { id: 'help', title: 'أنا أقدر أساعدك في إيه؟', html };
}

function buildAssistantOwnerScopeAnswer() {
    const html = `${assistantNote('الحسابات دي تخص إدارة العمارة ومش بتظهر في حسابك. اللي أقدر أقوله لك:')}${assistantList([
        'حسابك في أي شهر والمتأخرات على شقتك.',
        'إيصالاتك، إعفاءات شقتك وطرق الدفع المفعّلة.',
        'ميعاد الدفع وآخر موعد.',
        'إعلانات المبنى، إشعاراتك ورقم المدير.'
    ])}`;
    return { id: 'owner_scope', title: 'ده يخص الإدارة', html };
}

function detectOwnerAssistantIntent(normalized) {
    if (/(السلام عليكم|سلام|صباح|مساء|ازيك|عامل ايه|اهلا|هاي)/.test(normalized)) return 'greeting';
    if (/(شكرا|تسلم|مشكور|ربنا يكرمك)/.test(normalized)) return 'thanks';
    if (/(خصوصيه|بياناتي|البيانات بتتخزن|بتتخزن فين|مين يقدر يشوف|امان|امن|صلاحيات|قراءة فقط|ازاي استخدم|ازاي اسجل|ازاي اطبع|ازاي اصدر)/.test(normalized)) return 'knowledge';
    if (/(مساعده|ساعدني|بتعرف تعمل|تقدر تعمل|اوامر|خيارات|استخدمك|بتعرف ايه)/.test(normalized)) return 'help';
    if (/(مين عليه|مين عليها|مين عليهم|على مين|علي مين)/.test(normalized)) return 'owner_scope';
    if (/(?:حساب|ايصال|دفعات|مدفوعات|متاخرات)\s+[ء-ي]{2,}(?:\s+[ء-ي]{2,})?(?:\s+(?:كام|عليه|عليها|دفع|دفعت|متاخر|مديون))?/.test(normalized)) return 'owner_scope';
    if (/^(?:[ء-ي]{2,}\s+){1,2}(?:عليه|عليها|دفع|دفعت|متاخر|مديون)/.test(normalized)) return 'owner_scope';
    if (/(ملخص تنفيذي|ملخص الاداره|ملخص العماره|(?:تغير|اتغير)(?: بشكل)? غير طبيعي|تغيير كبير|فرق كبير|تحصيل|مصروف|مصاريف|صرف|خزنه|صندوق|سيوله|صافي|اجمالي|كل الشقق|السكان|سكان العماره|الشقق التاني|تقرير|تقارير|طابق العماره|طوابق العماره|ادوار العماره|احصائيات|لوحة تحكم)/.test(normalized)) return 'owner_scope';
    if (/(استحقاق|اخر يوم|مهله|موعد الدفع|امتى ادفع|يوم كام ادفع|قبل ما اتاخر|متاخر عن ميعاد)/.test(normalized)) return 'my_due_date';
    if (/(طرق الدفع|وسائل الدفع|ادفع باي|ادفع ازاي|ازاي ادفع|تحويل بنكي|انستاباي|انستا باي|محفزه|فيزا|بطاقه)/.test(normalized)) return 'payment_methods';
    if (/(ايصال|دفعاتي|مدفوعات|حركاتي|دفعت|استلمت)/.test(normalized)) return 'my_receipts';
    if (/(اشعار|تنبيه|الرسائل اللي وصلت)/.test(normalized)) return 'my_notifications';
    if (/(اعلان|اعلانات|لوحة|اخبار العماره|فيه جديد)/.test(normalized)) return 'notices';
    if (/(اعفاء|تخفيض|تسويه|خصم)/.test(normalized)) return 'my_adjustments';
    if (/(مدير|رقم|تليفون|موبايل|اكلم|اتصل|شكوى|شكاوي)/.test(normalized)) return 'contact';
    if (/(شقتي|وحدتي|بيانات حسابي|عمارتنا|مبنيانا)/.test(normalized)) return 'my_apartment';
    if (/(حسابي|عليا|علياء|مستحق|متبقي|كام الشهر|ادفع كام|ادفع قد ايه|الفاتوره|فاتوره|اشتراك|متاخر|مديون|مش دفع|غير مدفوع|ملخص|وضع|احوال|نظره)/.test(normalized)) return 'my_bill';
    return 'unknown';
}

function selectOwnerAssistantAnswer(intent, period, now) {
    switch (intent) {
        case 'greeting':
            return { id: 'greeting', title: 'وعليكم السلام', html: buildAssistantOwnerGreetingHtml(now) };
        case 'thanks':
            return { id: 'thanks', title: 'العفو', html: `<p class="assistant-hello">تحت أمرك ${assistantAddress()}. لو محتاج رقم من حسابك أو ميعاد الدفع، اسألني.</p>` };
        case 'help':
            return buildAssistantOwnerHelpAnswer();
        case 'knowledge':
            return buildAssistantKnowledgeAnswer();
        case 'my_bill':
            return buildAssistantOwnerBillAnswer(period, now);
        case 'my_receipts':
            return buildAssistantOwnerReceiptsAnswer(period, now);
        case 'my_due_date':
            return buildAssistantOwnerDueAnswer(now);
        case 'payment_methods':
            return buildAssistantOwnerPaymentMethodsAnswer();
        case 'my_notifications':
            return buildAssistantOwnerNotificationsAnswer();
        case 'notices':
            return buildAssistantNoticesAnswer();
        case 'my_adjustments':
            return buildAssistantOwnerAdjustmentsAnswer(period, now);
        case 'contact':
            return buildAssistantManagerContactAnswer();
        case 'my_apartment':
            return buildAssistantOwnerApartmentAnswer(now);
        case 'owner_scope':
            return buildAssistantOwnerScopeAnswer();
        default:
            return {
                id: 'unknown',
                title: 'مش لاقي إجابة واضحة',
                html: `<p class="assistant-note">معلش ${assistantAddress()}، السؤال ده مش واضح بالنسبة لي. جرّب تسألني عن:</p>${assistantList([
                    'كام عليك في الشهر ده.',
                    'إيصالاتك في شهر معين.',
                    'آخر يوم للدفع وفترة السماح.',
                    'طرق الدفع المفعّلة.',
                    'إعلانات المبنى وإشعاراتك.'
                ])}`
            };
    }
}

function assistantOwnerRequestsForeignUnit(normalized) {
    const owner = assistantOwnerResident();
    const ownerApartment = normalizeAssistantArabic(owner?.apartmentNumber || '').match(/[0-9]+/)?.[0] || null;
    const requestedApartments = Array.from(normalized.matchAll(/(?:شقه|وحده)\s*(?:رقم\s*)?([0-9]{1,4})/g), match => match[1]);
    if (requestedApartments.some(apartment => !ownerApartment || apartment !== ownerApartment)) return true;

    const ownerId = owner?.id || null;
    const residents = Array.isArray(state.residents) ? state.residents : [];
    return residents.some(resident => {
        if (!resident || resident.id === ownerId) return false;
        const name = normalizeAssistantArabic(resident.name || '').trim();
        return name.length >= 4 && normalized.includes(name);
    });
}

function buildAssistantForeignUnitAnswer() {
    return {
        id: 'owner_scope',
        title: 'بيانات شقتك فقط',
        html: assistantNote('ما أقدرش أراجع بيانات شقة غير المرتبطة بحسابك. اسألني عن شقتك المسجلة أو تواصل مع مدير العمارة.')
    };
}

function buildAssistantPendingSaveAnswer() {
    return {
        id: 'pending-save',
        title: 'الحفظ لم يكتمل بعد',
        html: assistantNote('في عملية حفظ جارية؛ مش هعرض أرقامًا قبل تأكيد حفظها. جرّب سؤالك مرة تانية بعد ما العملية تخلص.')
    };
}

function assistantDataSavePending() {
    return typeof hasPendingStateSave === 'function' && hasPendingStateSave();
}

function answerOwnerAssistantQuery(text, now = new Date()) {
    const normalized = normalizeAssistantArabic(text);
    if (assistantOwnerRequestsForeignUnit(normalized)) {
        return withAssistantAnswerMeta(buildAssistantForeignUnitAnswer(), resolveAssistantPeriod(text, now), null, text);
    }
    const intent = detectOwnerAssistantIntent(normalized);
    const period = resolveAssistantPeriodWithContext(text, now);
    return withAssistantAnswerMeta(selectOwnerAssistantAnswer(intent, period, now), period, null, text);
}

function assistantHeroHtml() {
    return `<img class="assistant-hero" src="${ASSISTANT_HERO_SRC}" alt="" width="74" height="74" decoding="async">`;
}

function buildAssistantGreetingHtml(now = new Date()) {
    if (assistantDataSavePending()) return buildAssistantPendingSaveAnswer().html;
    if (assistantIsOwner()) return buildAssistantOwnerGreetingHtml(now);
    const month = getAssistantNowLabel(now);
    const residents = Array.isArray(state.residents) ? state.residents : [];
    const hello = `أهلاً ${assistantAddress()}، أنا <strong>${assistantEscape(ASSISTANT_NAME)}</strong> بواب العمارة ومساعدك المحلي.`;
    if (!residents.length) {
        return `${assistantHeroHtml()}<p class="assistant-hello">${hello}</p>
            <p class="assistant-note">لسه مفيش شقق مسجلة. أضف الشقق والاشتراكات، وبعدها أقدر أقولك تحصيل الشهر والمتأخرات وأرصدة الخزائن.</p>`;
    }
    const summary = getAssistantMonthSummary({ type: 'month', label: month, months: [month] }, now);
    const arrears = getAssistantArrearsSnapshot();
    let html = `${assistantHeroHtml()}<p class="assistant-hello">${hello}</p>`;
    html += assistantRow('احنا في شهر', month);
    html += assistantRow('تحصيل الشهر', assistantMoney(summary.income.total));
    html += assistantRow('غير محصل الشهر', assistantMoney(summary.outstandingTotal), summary.outstandingTotal > 0 ? 'warn' : 'good');
    html += assistantRow('إجمالي المتأخرات', assistantMoney(arrears.totalDebt), arrears.totalDebt > 0 ? 'bad' : 'good');
    html += assistantNote('اسألني عن أي شهر أو شقة، أو اختار من الأسئلة المقترحة تحت.');
    return html;
}

function buildAssistantOwnerGreetingHtml(now = new Date()) {
    if (assistantDataSavePending()) return buildAssistantPendingSaveAnswer().html;
    const resident = assistantOwnerResident();
    const hello = `أهلاً ${assistantAddress()}، أنا <strong>${assistantEscape(ASSISTANT_NAME)}</strong> بواب العمارة.`;
    if (!resident) {
        return `${assistantHeroHtml()}<p class="assistant-hello">${hello}</p>${buildAssistantOwnerMissingAnswer().html}`;
    }
    const month = getAssistantNowLabel(now);
    const snapshot = getAssistantResidentSnapshot(resident, now, month);
    let html = `${assistantHeroHtml()}<p class="assistant-hello">${hello}</p>`;
    html += assistantRow('شقتك', assistantApartmentLabel(resident));
    html += assistantRow('اشتراك ' + month, assistantMoney(snapshot.subscription));
    html += assistantRow('المتبقي ' + month, assistantMoney(snapshot.outstanding), snapshot.outstanding > 0 ? 'warn' : 'good');
    html += assistantRow('متأخرات على شقتك', assistantMoney(snapshot.debt.totalDebt), snapshot.debt.totalDebt > 0 ? 'bad' : 'good');
    const unread = (Array.isArray(state.ownerNotifications) ? state.ownerNotifications : [])
        .filter(notification => !notification.readAt).length;
    if (unread) html += assistantRow('إشعارات جديدة', assistantNumber(unread), 'warn');
    html += assistantNote('اسألني عن حسابك، إيصالاتك، ميعاد الدفع، طرق الدفع أو إعلانات المبنى.');
    return html;
}

function assistantRememberedResident() {
    if (!assistantContext.residentId) return null;
    return (Array.isArray(state.residents) ? state.residents : [])
        .find(resident => resident.id === assistantContext.residentId) || null;
}

function answerAssistantQuery(text, now = new Date()) {
    if (!['manager', 'owner'].includes(currentUserRole)) {
        return { id: 'access-denied', title: 'غير مصرح', html: assistantNote('المساعد متاح للمدير والمالك فقط.') };
    }
    if (assistantDataSavePending()) return buildAssistantPendingSaveAnswer();
    const normalized = normalizeAssistantArabic(text);
    if (assistantIsOwner()) {
        if (!normalized) return withAssistantAnswerMeta(buildAssistantOwnerHelpAnswer(), resolveAssistantPeriod(text, now), null);
        return answerOwnerAssistantQuery(text, now);
    }
    if (!normalized) return withAssistantAnswerMeta(buildAssistantHelpAnswer(), resolveAssistantPeriod(text, now), null);
    if (assistantOperationDraft && /^(?:الغاء|إلغاء|لا خلاص|مش عايز|بلاش)$/.test(normalized)) {
        cancelAssistantOperation();
        return withAssistantAnswerMeta({ id: 'operation-cancelled', title: 'تم إلغاء المسودة', html: assistantNote('تمام، لم يتم حفظ أي تغيير.') }, resolveAssistantPeriod(text, now), null, text);
    }
    const operationFollowup = mergeAssistantOperationFollowup(text, now);
    if (operationFollowup) return withAssistantAnswerMeta(operationFollowup, resolveAssistantPeriod(text, now), assistantOperationDraft?.resident || null, text);
    const noticeText = parseAssistantNoticeCommand(text);
    if (noticeText) return withAssistantAnswerMeta(buildAssistantNoticePreview(noticeText), resolveAssistantPeriod(text, now), null, text);
    const operation = parseAssistantOperationCommand(text, now);
    if (operation) return withAssistantAnswerMeta(buildAssistantOperationPreview(operation, now), resolveAssistantPeriod(text, now), operation.resident, text);
    const residentMatch = resolveAssistantResident(text);
    if (residentMatch.matches.length > 1) {
        const answer = {
            id: 'resident-choice',
            title: 'في أكتر من مالك مطابق',
            html: `${assistantList(residentMatch.matches.map(resident =>
                `${assistantEscape(assistantApartmentLabel(resident))} · ${assistantEscape(assistantResidentName(resident))}`
            ))}${assistantNote('حدد رقم الشقة في سؤالك، مثال: «شقة 3 دفع كام؟».')}`
        };
        return withAssistantAnswerMeta(answer, resolveAssistantPeriod(text, now), null, text);
    }
    const remembered = assistantFollowsResident(text) ? assistantRememberedResident() : null;
    const resident = residentMatch.resident || remembered;
    const intent = detectAssistantIntent(normalized, Boolean(resident));
    const period = resolveAssistantPeriodWithContext(text, now);
    const answer = selectAssistantAnswer(intent, period, resident, now);
    return withAssistantAnswerMeta(answer, period, resident, text);
}

function selectAssistantAnswer(intent, period, resident, now) {
    switch (intent) {
        case 'greeting':
            return { id: 'greeting', title: 'وعليكم السلام', html: buildAssistantGreetingHtml(now) };
        case 'thanks':
            return { id: 'thanks', title: 'العفو', html: `<p class="assistant-hello">تحت أمرك ${assistantAddress()}. لو محتاج أي رقم أو ملخص، اسألني.</p>` };
        case 'help':
            return buildAssistantHelpAnswer();
        case 'knowledge':
            return buildAssistantKnowledgeAnswer();
        case 'adjustments':
            return buildAssistantAdjustmentsAnswer(period);
        case 'arrears':
            return buildAssistantArrearsAnswer();
        case 'expenses':
            return buildAssistantExpensesAnswer(period);
        case 'top_expenses':
            return buildAssistantTopExpensesAnswer(period);
        case 'income':
            return buildAssistantIncomeAnswer(period);
        case 'payment_breakdown':
            return buildAssistantPaymentBreakdownAnswer(period);
        case 'cashbox':
            return buildAssistantCashAnswer();
        case 'summary':
            return buildAssistantSummaryAnswer(period);
        case 'executive':
            return buildAssistantExecutiveAnswer(period);
        case 'change_alerts':
            return buildAssistantChangeAlertsAnswer(period, now);
        case 'comparison':
            return buildAssistantComparisonAnswer(period, now);
        case 'recent':
            return buildAssistantRecentAnswer();
        case 'reports':
            return buildAssistantReportsAnswer();
        case 'notices':
            return buildAssistantNoticesAnswer();
        case 'building':
            return buildAssistantBuildingAnswer();
        case 'resident':
            return buildAssistantResidentAnswer(resident, now);
        default:
            return {
                id: 'unknown',
                title: 'مش لاقي إجابة واضحة',
                html: `<p class="assistant-note">معلش ${assistantAddress()}، السؤال ده مش واضح بالنسبة لي. جرّب تسألني عن:</p>${assistantList([
                    'ملخص الشهر أو تحصيل شهر معين.',
                    'مين عليه متأخرات.',
                    'رصيد الخزنة.',
                    'حساب مالك بالاسم أو رقم الشقة.',
                    'الإعفاءات والتخفيضات.'
                ])}`
            };
    }
}

function withAssistantAnswerMeta(answer, period, resident, text = '') {
    answer.followUps = buildAssistantFollowUps(answer.id, period, answer.followUpQueries);
    answer.html += assistantFollowUpsHtml(answer.id, period, answer.followUpQueries);
    delete answer.followUpQueries;
    if (text) rememberAssistantContext(text, period, resident);
    return answer;
}

function formatAssistantUserText(text) {
    return assistantEscape(text).replace(/\n/g, '<br>');
}

function renderAssistantMessage(role, html) {
    const log = document.getElementById('assistantLog');
    if (!log) return null;
    const message = document.createElement('div');
    message.className = `assistant-msg is-${role}`;
    message.innerHTML = `<div class="assistant-bubble">${html}</div>`;
    log.appendChild(message);
    log.scrollTop = log.scrollHeight;
    return message;
}

function appendAssistantMessage(role, html) {
    assistantChat.push({ role, html });
    persistAssistantChat();
    return renderAssistantMessage(role, html);
}

function assistantAnswerHtml(answer) {
    return `<p class="assistant-answer-title">${assistantEscape(answer.title)}</p>${answer.html}`;
}

function showAssistantTyping() {
    const log = document.getElementById('assistantLog');
    if (!log) return null;
    const message = document.createElement('div');
    message.className = 'assistant-msg is-bot is-typing';
    message.setAttribute('aria-hidden', 'true');
    message.innerHTML = '<div class="assistant-bubble"><span class="assistant-typing-dot"></span><span class="assistant-typing-dot"></span><span class="assistant-typing-dot"></span></div>';
    log.appendChild(message);
    log.scrollTop = log.scrollHeight;
    return message;
}

function populateAssistantSuggestions() {
    const container = document.getElementById('assistantSuggestions');
    if (!container || container.children.length) return;
    const suggestions = assistantIsOwner() ? ASSISTANT_SUGGESTIONS_OWNER : ASSISTANT_SUGGESTIONS;
    container.innerHTML = suggestions.map(item =>
        `<button type="button" class="assistant-chip" data-assistant-query="${assistantEscape(item.query)}">${assistantEscape(item.label)}</button>`
    ).join('');
}

function populateAssistantQuickActions() {
    const section = document.getElementById('assistantQuickActions');
    const container = document.getElementById('assistantQuickActionButtons');
    const isManager = !assistantIsOwner();
    if (section) section.hidden = !isManager;
    if (!container || !isManager) return;
    container.innerHTML = ASSISTANT_MANAGER_QUICK_ACTIONS.map(item =>
        `<button type="button" class="assistant-quick-action" ${item.action ? `data-assistant-action="${assistantEscape(item.action)}"` : `data-assistant-query="${assistantEscape(item.query)}"`}>${assistantEscape(item.label)}<span aria-hidden="true">${item.action ? '↗' : '＋'}</span></button>`
    ).join('');
}

function runAssistantQuickAction(action) {
    if (assistantIsOwner()) return false;
    if (action === 'notice' && typeof openNoticeModal === 'function') {
        openNoticeModal();
        return true;
    }
    return false;
}

function restoreAssistantChat() {
    restoreAssistantSession();
    if (assistantChat.length) {
        assistantChat.forEach(item => renderAssistantMessage(item.role, item.html));
        return;
    }
    appendAssistantMessage('bot', buildAssistantGreetingHtml());
}

function openAssistantModal() {
    if (typeof currentUserRole !== 'undefined' && currentUserRole !== 'manager' && currentUserRole !== 'owner') {
        if (typeof toast === 'function') toast('المساعد متاح للمدير وللمالك في حدود حسابه', 'error');
        return;
    }
    if (typeof openModal === 'function') openModal('assistantModal');
    syncAssistantFab();
    populateAssistantQuickActions();
    populateAssistantSuggestions();
    const log = document.getElementById('assistantLog');
    if (log && !log.children.length) restoreAssistantChat();
    requestAnimationFrame(() => {
        const input = /** @type {HTMLInputElement | null} */ (document.getElementById('assistantInput'));
        if (!input) return;
        input.placeholder = assistantIsOwner()
            ? 'اسألني عن حسابك، إيصالاتك، ميعاد الدفع…'
            : 'اسألني عن التحصيل، المتأخرات، الخزنة…';
        if (typeof input.focus === 'function') input.focus();
    });
}

function sendAssistantMessage(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById('assistantInput'));
    if (!input) return;
    const text = String(input.value || '').trim();
    if (!text) return;
    input.value = '';
    appendAssistantMessage('user', formatAssistantUserText(text));
    const answer = answerAssistantQuery(text);
    const typing = showAssistantTyping();
    const deliver = () => {
        if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
        appendAssistantMessage('bot', assistantAnswerHtml(answer));
    };
    if (typeof setTimeout === 'function' && ASSISTANT_TYPING_DELAY_MS > 0) setTimeout(deliver, ASSISTANT_TYPING_DELAY_MS);
    else deliver();
    if (typeof input.focus === 'function') input.focus();
}

function askAssistant(query) {
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById('assistantInput'));
    if (!input) return;
    input.value = String(query || '');
    sendAssistantMessage();
}

function handleAssistantSuggestion(event) {
    const target = event?.target;
    const actionButton = target && typeof target.closest === 'function' ? target.closest('[data-assistant-action]') : null;
    if (actionButton) {
        runAssistantQuickAction(actionButton.getAttribute('data-assistant-action') || '');
        return;
    }
    const chip = target && typeof target.closest === 'function' ? target.closest('[data-assistant-query]') : null;
    if (!chip) return;
    askAssistant(chip.getAttribute('data-assistant-query') || '');
}

function resetAssistantChat() {
    const log = document.getElementById('assistantLog');
    if (log) log.innerHTML = '';
    assistantChat = [];
    assistantContext = { period: null, residentId: null };
    persistAssistantChat();
    persistAssistantContext();
    appendAssistantMessage('bot', buildAssistantGreetingHtml());
}

const ASSISTANT_FAB_SCROLL_DEADZONE = 8;
const ASSISTANT_FAB_TOP_REVEAL = 48;
let assistantFabLastScrollY = 0;
let assistantFabCompactByScroll = false;
let assistantFabGreetingPending = false;

function assistantModalIsOpen() {
    const modal = document.getElementById('assistantModal');
    return Boolean(modal && !modal.classList.contains('hidden'));
}

function isAssistantFabAllowed() {
    if (typeof currentUserRole !== 'undefined' && currentUserRole !== 'manager' && currentUserRole !== 'owner') return false;
    if (document.body.classList.contains('session-locked')) return false;
    return !assistantModalIsOpen();
}

function applyAssistantFabState(hidden, compact) {
    const fab = document.getElementById('assistantFab');
    if (!fab) return;
    fab.classList.toggle('is-hidden', hidden);
    fab.classList.toggle('is-compact', compact && !hidden);
}

function showAssistantGreeting() {
    const fab = document.getElementById('assistantFab');
    if (!fab || !fab.classList) return;
    // Drop and re-add the class so the CSS greeting animation replays after a
    // chat session closes instead of staying faded out.
    fab.classList.remove('is-greeting');
    const arm = () => fab.classList.add('is-greeting');
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(arm);
    else arm();
}

function syncAssistantFab() {
    if (!isAssistantFabAllowed()) {
        if (assistantModalIsOpen()) assistantFabGreetingPending = true;
        applyAssistantFabState(true, false);
        return;
    }
    applyAssistantFabState(false, assistantFabCompactByScroll);
    if (assistantFabGreetingPending) {
        assistantFabGreetingPending = false;
        showAssistantGreeting();
    }
}

function handleAssistantFabScroll() {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const delta = y - assistantFabLastScrollY;
    if (Math.abs(delta) < ASSISTANT_FAB_SCROLL_DEADZONE) return;
    assistantFabLastScrollY = y;
    assistantFabCompactByScroll = delta > 0 && y > ASSISTANT_FAB_TOP_REVEAL;
    syncAssistantFab();
}

function initAssistantFab() {
    assistantFabLastScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const modal = document.getElementById('assistantModal');
    if (modal && typeof MutationObserver === 'function') {
        new MutationObserver(() => syncAssistantFab()).observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('scroll', handleAssistantFabScroll, { passive: true });
    window.addEventListener('resize', syncAssistantFab);
    syncAssistantFab();
    showAssistantGreeting();
}

document.addEventListener('DOMContentLoaded', initAssistantFab);
