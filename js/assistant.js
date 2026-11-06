// @ts-check
// عم عبده البواب — a local, deterministic assistant. It never calls the network:
// every answer is computed from `state` and the existing billing helpers.

const ASSISTANT_NAME = 'عم عبده البواب';
const ASSISTANT_TAGLINE = 'مساعد محلي يقرأ بيانات التطبيق فقط';
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

const ASSISTANT_TYPING_DELAY_MS = 260;
const ASSISTANT_HISTORY_LIMIT = 30;
const ASSISTANT_TIME_HINT = /(يناير|فبراير|مارس|ابريل|مايو|يونيو|يوليو|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر|20[0-9]{2}|الشهر|شهر|السنه|سنه|عام|كل الفتره|كل الشهور|من البدايه)/;
const ASSISTANT_RESIDENT_FOLLOWUP = /^(هو|هي|وده|دي|وكمان|ودوره|ومن زمان|ولحد دلوقتي|وعليه)/;
const ASSISTANT_CHAT_STORAGE_PREFIX = 'manzil-assistant-chat';
const ASSISTANT_CONTEXT_STORAGE_PREFIX = 'manzil-assistant-context';

const ASSISTANT_FOLLOWUPS = Object.freeze({
    summary: ['مصروفات الشهر', 'مين عليه متأخرات؟', 'رصيد الخزنة كام؟'],
    income: ['مصروفات نفس الفترة', 'الإعفاءات والتخفيضات', 'مين عليه متأخرات؟'],
    expenses: ['تحصيل نفس الفترة', 'رصيد الخزنة كام؟', 'ملخص الشهر'],
    cashbox: ['آخر الحركات', 'ملخص الشهر', 'مين عليه متأخرات؟'],
    arrears: ['الإعفاءات والتخفيضات', 'تحصيل الشهر', 'رصيد الخزنة كام؟'],
    adjustments: ['ملخص الشهر', 'مين عليه متأخرات؟'],
    recent: ['رصيد الخزنة كام؟', 'تحصيل الشهر'],
    resident: ['مين عليه متأخرات؟', 'ملخص الشهر'],
    building: ['ملخص الشهر', 'مين عليه متأخرات؟'],
    reports: ['ملخص الشهر', 'تحصيل الشهر'],
    help: ['ملخص الشهر', 'رصيد الخزنة كام؟'],
    greeting: ['ملخص الشهر', 'مين عليه متأخرات؟'],
    thanks: ['ملخص الشهر', 'رصيد الخزنة كام؟'],
    unknown: ['ملخص الشهر', 'مين عليه متأخرات؟']
});

let assistantContext = { period: null, residentId: null };
let assistantChat = [];

function assistantStorageKeys() {
    const building = typeof activeBuildingId === 'string' && activeBuildingId ? activeBuildingId : 'local';
    return {
        chat: `${ASSISTANT_CHAT_STORAGE_PREFIX}:${building}`,
        context: `${ASSISTANT_CONTEXT_STORAGE_PREFIX}:${building}`
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

function buildAssistantFollowUps(answerId, period) {
    const queries = ASSISTANT_FOLLOWUPS[answerId] || ASSISTANT_FOLLOWUPS.unknown;
    const label = period && period.type === 'month' ? period.label : null;
    return queries.slice(0, 3).map(query => {
        const scoped = query.replace(/(نفس الفترة|الشهر)/, label || 'الشهر');
        return { label: scoped, query: scoped };
    });
}

function assistantFollowUpsHtml(answerId, period) {
    const items = buildAssistantFollowUps(answerId, period);
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
    const normalized = normalizeAssistantArabic(text);
    const yearMatch = normalized.match(/(?:^|[^0-9])(20[0-9]{2})(?:[^0-9]|$)/);
    const explicitYear = yearMatch ? Number(yearMatch[1]) : null;
    let monthIndex = names.findIndex(name => normalized.includes(normalizeAssistantArabic(name)));
    let year = explicitYear || now.getFullYear();

    if (monthIndex < 0 && /(الشهر الماضي|الشهر اللي فات|الشهر السابق|شهر ماضي|الشهر اللي قبل)/.test(normalized)) {
        const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        monthIndex = previous.getMonth();
        year = explicitYear || previous.getFullYear();
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
    const purposes = new Map();
    rows.forEach(row => {
        const amountCents = typeof toCents === 'function' ? toCents(row.amount) : Math.round((Number(row.amount) || 0) * 100);
        if (amountCents <= 0) return;
        cents += amountCents;
        const isSubscription = typeof isSubscriptionIncome === 'function' ? isSubscriptionIncome(row) : row.purposeCode === 'subscription';
        if (isSubscription) subscriptionCents += amountCents;
        const code = row.purposeCode || (isSubscription ? 'subscription' : 'other');
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
        otherTotal: (cents - subscriptionCents) / 100,
        purposes: purposeRows
    };
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

function getAssistantMonthSummary(period, now = new Date()) {
    const month = getAssistantNowLabel(now);
    const income = getAssistantIncomeSnapshot(period.months);
    const expenses = getAssistantExpenseSnapshot(period.months);
    const residents = Array.isArray(state.residents) ? state.residents : [];
    let dueCents = 0;
    let paidCents = 0;
    let adjustedCents = 0;
    let outstandingCents = 0;
    let paidUnits = 0;
    let partialUnits = 0;
    const unpaid = [];
    residents.forEach(resident => {
        const due = typeof getSubscriptionAmountForMonth === 'function'
            ? Number(getSubscriptionAmountForMonth(resident, month)) || 0
            : Number(resident.monthlyAmount ?? state.defaultSubscription) || 0;
        const paid = typeof getPaidAmountForMonth === 'function' ? Number(getPaidAmountForMonth(resident.id, month)) || 0 : 0;
        const adjusted = typeof getAdjustmentAmountForMonth === 'function' ? Number(getAdjustmentAmountForMonth(resident.id, month)) || 0 : 0;
        const outstanding = typeof getMonthOutstanding === 'function'
            ? Number(getMonthOutstanding(resident, month)) || 0
            : Math.max(0, due - adjusted - paid);
        dueCents += Math.round(due * 100);
        paidCents += Math.round(paid * 100);
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
        paidSubscriptionTotal: paidCents / 100,
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
        return {
            totalDebt: Number(report.totalDebt) || 0,
            overdueResidents: Number(report.overdueResidents) || 0,
            overdueMonths: Number(report.overdueMonths) || 0,
            residents: report.residents || [],
            buckets: report.buckets || {}
        };
    }
    const residents = (Array.isArray(state.residents) ? state.residents : []).map(resident => {
        const debt = typeof calculateCumulativeDebt === 'function' ? calculateCumulativeDebt(resident.id) : { count: 0, totalDebt: 0, unpaidMonths: [] };
        return { resident, count: debt.count, totalDebt: debt.totalDebt, unpaidMonths: debt.unpaidMonths, bucket: 'شهر واحد' };
    }).filter(item => item.count > 0).sort((a, b) => b.totalDebt - a.totalDebt);
    return {
        totalDebt: residents.reduce((sum, item) => sum + Math.round(item.totalDebt * 100), 0) / 100,
        overdueResidents: residents.length,
        overdueMonths: residents.reduce((sum, item) => sum + item.count, 0),
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
    const normalized = normalizeAssistantArabic(text);
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

function getAssistantResidentSnapshot(resident, now = new Date()) {
    const month = getAssistantNowLabel(now);
    const subscription = typeof getSubscriptionAmountForMonth === 'function'
        ? Number(getSubscriptionAmountForMonth(resident, month)) || 0
        : Number(resident.monthlyAmount ?? state.defaultSubscription) || 0;
    const paid = typeof getPaidAmountForMonth === 'function' ? Number(getPaidAmountForMonth(resident.id, month)) || 0 : 0;
    const adjusted = typeof getAdjustmentAmountForMonth === 'function' ? Number(getAdjustmentAmountForMonth(resident.id, month)) || 0 : 0;
    const outstanding = typeof getMonthOutstanding === 'function'
        ? Number(getMonthOutstanding(resident, month)) || 0
        : Math.max(0, subscription - adjusted - paid);
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
        paid,
        adjusted,
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
    if (/(مساعده|ساعدني|بتعرف|تقدر تعمل|اوامر|خيارات|ازاي|كيف|استخدمك)/.test(normalized)) return 'help';
    if (/(اعفاء|تخفيض|تسويه|خصم)/.test(normalized)) return 'adjustments';
    if (/(متاخر|متاخرات|مستحق|مديون|مش دفع|غير مدفوع|مش دافع|مش سدد)/.test(normalized)) return 'arrears';
    if (/(مصروف|مصاريف|صرف|منصرف)/.test(normalized)) return 'expenses';
    if (/(تحصيل|تحصيلات|ايراد|دخل|وارد|دفع|مدفوع|متحصل)/.test(normalized)) return 'income';
    if (/(خزنه|صندوق|رصيد|كاش|فلوس|سيوله)/.test(normalized)) return 'cashbox';
    if (/(ملخص|وضع|احوال|نظره|اجمالي|صافي|نتيجه)/.test(normalized)) return 'summary';
    if (/(اخر|احدث|حركات|عمليات)/.test(normalized)) return 'recent';
    if (/(تقرير|تقارير|طباعه|تصدير|كشف)/.test(normalized)) return 'reports';
    if (/(عماره|مبني|مدير|شقق|سكان|وحدات|اسم)/.test(normalized)) return 'building';
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

function assistantApartmentLabel(resident) {
    const raw = String(resident?.apartmentNumber ?? '').trim();
    return raw ? `شقة ${raw}` : 'شقة بدون رقم';
}

function assistantResidentName(resident) {
    return String(resident?.name || 'ساكن محذوف');
}

function buildAssistantIncomeAnswer(period) {
    const snapshot = getAssistantIncomeSnapshot(period.months);
    const title = `تحصيل ${period.label}`;
    let html = '';
    html += assistantRow('إجمالي التحصيل', assistantMoney(snapshot.total), snapshot.total > 0 ? 'good' : '');
    html += assistantRow('اشتراكات شهرية', assistantMoney(snapshot.subscriptionTotal));
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

function buildAssistantArrearsAnswer() {
    const snapshot = getAssistantArrearsSnapshot();
    const title = 'المتأخرات المتراكمة';
    let html = '';
    html += assistantRow('إجمالي المتأخرات', assistantMoney(snapshot.totalDebt), snapshot.totalDebt > 0 ? 'bad' : 'good');
    html += assistantRow('شقق عليها متأخرات', assistantNumber(snapshot.overdueResidents));
    html += assistantRow('عدد الشهور المتأخرة', assistantNumber(snapshot.overdueMonths));
    if (snapshot.residents.length) {
        html += assistantList(snapshot.residents.slice(0, 6).map(item =>
            `${assistantEscape(assistantApartmentLabel(item.resident))} · ${assistantEscape(assistantResidentName(item.resident))} — <strong>${assistantEscape(assistantMoney(item.totalDebt))}</strong> (${assistantNumber(item.count)} شهر)`
        ));
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
    html += assistantRow('اشتراك الشهر', assistantMoney(snapshot.subscription));
    html += assistantRow('مدفوع هذا الشهر', assistantMoney(snapshot.paid), snapshot.paid > 0 ? 'good' : '');
    if (snapshot.adjusted > 0) html += assistantRow('إعفاء / تخفيض الشهر', assistantMoney(snapshot.adjusted), 'warn');
    html += assistantRow('المتبقي هذا الشهر', assistantMoney(snapshot.outstanding), snapshot.outstanding > 0 ? 'bad' : 'good');
    html += assistantRow('إجمالي المتأخرات', assistantMoney(snapshot.debt.totalDebt), snapshot.debt.totalDebt > 0 ? 'bad' : 'good');
    html += assistantRow('شهور متأخرة', assistantNumber(snapshot.debt.count));
    if (snapshot.lastPayment) {
        const last = snapshot.lastPayment;
        const purpose = typeof getIncomePurposeLabel === 'function' ? getIncomePurposeLabel(last.purposeCode) : (last.purposeCode || 'تحصيل');
        const dateLabel = typeof formatDate === 'function' ? formatDate(last.date) : String(last.date || '');
        html += assistantRow('آخر دفعة', `${assistantMoney(last.amount)} · ${purpose}${dateLabel ? ` · ${dateLabel}` : ''}`);
    } else {
        html += assistantNote('مفيش دفعات مسجلة للساكن ده حتى الآن.');
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
        'حساب ساكن بالاسم أو برقم الشقة.',
        'الإعفاءات والتخفيضات المسجلة.',
        'آخر الحركات وبيانات العمارة.',
        'أماكن التقارير وكيف تطبع أو تصدّر CSV.'
    ])}${assistantNote('اكتب سؤالك بالعامية أو بالفصحى. مثال: «تحصيل يناير 2025»، «مين عليه متأخرات؟»، «شقة 3 دفع كام؟».')}`;
    return { id: 'help', title, html };
}

function buildAssistantReportsAnswer() {
    const title = 'التقارير المتاحة';
    const html = `${assistantList([
        'تقرير المالك الشهري: تحصيل ومصروفات الشهر مع فلاتر الغرض والصندوق وطريقة الدفع والشقة.',
        'تقرير فترة: مقارنة مجموعة شهور مع فلاتر.',
        'تقرير المصروفات: حسب الفترة والصندوق والتصنيف.',
        'تقرير الإعفاءات والتخفيضات: حسب الفترة والشقة والنوع.',
        'كشف حساب ساكن: حركات الشهر والمستحق والمتأخرات.',
        'الإقفال الشهري والمتأخرات وسجل التدقيق.'
    ])}${assistantNote('افتح قسم «التقارير» من الشريط السفلي، وكل تقرير له معاينة وطباعة وتصدير CSV.')}`;
    return { id: 'reports', title, html };
}

const ASSISTANT_HERO_SRC = 'icons/assistant-abbah-full.png';

function assistantHeroHtml() {
    return `<img class="assistant-hero" src="${ASSISTANT_HERO_SRC}" alt="" width="74" height="74" decoding="async">`;
}

function buildAssistantGreetingHtml(now = new Date()) {
    const month = getAssistantNowLabel(now);
    const residents = Array.isArray(state.residents) ? state.residents : [];
    if (!residents.length) {
        return `${assistantHeroHtml()}<p class="assistant-hello">أهلاً يا أستاذ، أنا <strong>${assistantEscape(ASSISTANT_NAME)}</strong> بواب العمارة ومساعدك المحلي.</p>
            <p class="assistant-note">لسه مفيش شقق مسجلة. أضف الشقق والاشتراكات، وبعدها أقدر أقولك تحصيل الشهر والمتأخرات وأرصدة الخزائن.</p>`;
    }
    const summary = getAssistantMonthSummary({ type: 'month', label: month, months: [month] }, now);
    const arrears = getAssistantArrearsSnapshot();
    let html = `${assistantHeroHtml()}<p class="assistant-hello">أهلاً يا أستاذ، أنا <strong>${assistantEscape(ASSISTANT_NAME)}</strong> بواب العمارة ومساعدك المحلي.</p>`;
    html += assistantRow('احنا في شهر', month);
    html += assistantRow('تحصيل الشهر', assistantMoney(summary.income.total));
    html += assistantRow('غير محصل الشهر', assistantMoney(summary.outstandingTotal), summary.outstandingTotal > 0 ? 'warn' : 'good');
    html += assistantRow('إجمالي المتأخرات', assistantMoney(arrears.totalDebt), arrears.totalDebt > 0 ? 'bad' : 'good');
    html += assistantNote('اسألني عن أي شهر أو شقة، أو اختار من الأسئلة المقترحة تحت.');
    return html;
}

function assistantRememberedResident() {
    if (!assistantContext.residentId) return null;
    return (Array.isArray(state.residents) ? state.residents : [])
        .find(resident => resident.id === assistantContext.residentId) || null;
}

function answerAssistantQuery(text, now = new Date()) {
    const normalized = normalizeAssistantArabic(text);
    if (!normalized) return withAssistantAnswerMeta(buildAssistantHelpAnswer(), resolveAssistantPeriod(text, now), null);
    const residentMatch = resolveAssistantResident(text);
    if (residentMatch.matches.length > 1) {
        const answer = {
            id: 'resident-choice',
            title: 'في أكتر من ساكن مطابق',
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
            return { id: 'thanks', title: 'العفو يا أستاذ', html: '<p class="assistant-hello">تحت أمرك في أي وقت. لو محتاج أي رقم أو ملخص، اسألني.</p>' };
        case 'help':
            return buildAssistantHelpAnswer();
        case 'adjustments':
            return buildAssistantAdjustmentsAnswer(period);
        case 'arrears':
            return buildAssistantArrearsAnswer();
        case 'expenses':
            return buildAssistantExpensesAnswer(period);
        case 'income':
            return buildAssistantIncomeAnswer(period);
        case 'cashbox':
            return buildAssistantCashAnswer();
        case 'summary':
            return buildAssistantSummaryAnswer(period);
        case 'recent':
            return buildAssistantRecentAnswer();
        case 'reports':
            return buildAssistantReportsAnswer();
        case 'building':
            return buildAssistantBuildingAnswer();
        case 'resident':
            return buildAssistantResidentAnswer(resident, now);
        default:
            return {
                id: 'unknown',
                title: 'مش لاقي إجابة واضحة',
                html: `${assistantNote('معلش يا أستاذ، السؤال ده مش واضح بالنسبة لي. جرّب تسألني عن:')}${assistantList([
                    'ملخص الشهر أو تحصيل شهر معين.',
                    'مين عليه متأخرات.',
                    'رصيد الخزنة.',
                    'حساب ساكن بالاسم أو رقم الشقة.',
                    'الإعفاءات والتخفيضات.'
                ])}`
            };
    }
}

function withAssistantAnswerMeta(answer, period, resident, text = '') {
    answer.followUps = buildAssistantFollowUps(answer.id, period);
    answer.html += assistantFollowUpsHtml(answer.id, period);
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
    container.innerHTML = ASSISTANT_SUGGESTIONS.map(item =>
        `<button type="button" class="assistant-chip" data-assistant-query="${assistantEscape(item.query)}">${assistantEscape(item.label)}</button>`
    ).join('');
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
    if (typeof requireManager === 'function' && !requireManager()) return;
    if (typeof openModal === 'function') openModal('assistantModal');
    syncAssistantFab();
    populateAssistantSuggestions();
    const log = document.getElementById('assistantLog');
    if (log && !log.children.length) restoreAssistantChat();
    requestAnimationFrame(() => {
        const input = document.getElementById('assistantInput');
        if (input && typeof input.focus === 'function') input.focus();
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
let assistantFabHiddenByScroll = false;

function assistantModalIsOpen() {
    const modal = document.getElementById('assistantModal');
    return Boolean(modal && !modal.classList.contains('hidden'));
}

function isAssistantFabAllowed() {
    if (typeof currentUserRole !== 'undefined' && currentUserRole !== 'manager') return false;
    if (document.body.classList.contains('session-locked')) return false;
    return !assistantModalIsOpen();
}

function applyAssistantFabVisibility(hidden) {
    const fab = document.getElementById('assistantFab');
    if (!fab) return;
    fab.classList.toggle('is-hidden', hidden);
}

function syncAssistantFab() {
    if (!isAssistantFabAllowed()) {
        applyAssistantFabVisibility(true);
        return;
    }
    applyAssistantFabVisibility(assistantFabHiddenByScroll);
}

function handleAssistantFabScroll() {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const delta = y - assistantFabLastScrollY;
    if (Math.abs(delta) < ASSISTANT_FAB_SCROLL_DEADZONE) return;
    assistantFabLastScrollY = y;
    assistantFabHiddenByScroll = delta > 0 && y > ASSISTANT_FAB_TOP_REVEAL;
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
}

document.addEventListener('DOMContentLoaded', initAssistantFab);
