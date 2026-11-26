// @ts-check
// عم عبده البواب — a local, deterministic assistant. Answers are computed from
// `state`; authenticated sessions may optionally persist the conversation history.

const ASSISTANT_NAME = 'عم عبده البواب';
const ASSISTANT_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const ASSISTANT_CASH_LABELS = Object.freeze({
    main: 'الخزنة الرئيسية',
    development: 'صندوق التطوير',
    emergency: 'صندوق الصيانة الطارئة'
});
const ASSISTANT_TYPING_DELAY_MS = 0;
const ASSISTANT_HISTORY_LIMIT = 30;
const ASSISTANT_MAX_MESSAGE_LENGTH = 1000;
const ASSISTANT_TIME_HINT = /(يناير|فبراير|مارس|ابريل|مايو|يونيو|يوليو|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر|20[0-9]{2}|الشهر|شهر|(?:^|\s)(?:السنه|سنه|عام)(?:\s|$)|النهارده|دلوقتي|حاليا|كل الفتره|كل الفترات|كل الشهور|من البدايه|من البداية|من بداية السنه|من اول السنه|السنه اللي فاتت|العام اللي فات)/;
const ASSISTANT_DAY_WORD = /(?:النهارده|انهارده|اليوم|امبارح|الاسبوع (?:ده|دا|الحالي)|اخر (?:7|سبعه) ايام)/;
const ASSISTANT_RESIDENT_FOLLOWUP = /^(هو|هي|وده|دي|وكمان|ودوره|ومن زمان|ولحد دلوقتي|ولحد حاليا|وعليه)|(?:اخر دفع(?:ه|ات)|اخر ايصال|دفع(?:ت)? امتي).*(?:ليها|ليه|بتاعها|بتاعه)|^(?:طب\s+)?و?(?:دفع|دفعت) امتي(?:\s|$)|^(?:طب\s+)?(?:وايه|ايه) اخر دفع(?:ه|ات)(?:\s|$)/;
const ASSISTANT_PREVIOUS_MONTH = /(?:الشهر الماضي|الشهر اللي فات|الشهر اللى فات|الشهر الفات|الشهر السابق|شهر ماضي|الشهر اللي قبل|الشهر اللى قبل|(?:يناير|فبراير|مارس|ابريل|مايو|يونيو|يوليو|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر)\s+(?:الماضي|اللي فات|اللى فات|السابق))/;
const ASSISTANT_PREVIOUS_YEAR = /(?:السنه اللي فاتت|السنه اللى فاتت|العام اللي فات|العام اللى فات|السنه سابقه|العام سابق)/;
const ASSISTANT_THOUSAND_WORD = /(?<!\p{L})(?:الاف|آلاف|الف)(?!\p{L})/u;
const ASSISTANT_MILLION_WORD = /(?<!\p{L})(?:مليون|مليونات)(?!\p{L})/u;
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
    app_guide: ['إزاي أغير الإعدادات؟', 'وريني التقارير'],
    settings: ['طرق الدفع المتاحة', 'إزاي أستخدم النسخ الاحتياطي؟'],
    backup: ['بيانات العمارة', 'إزاي أستخدم التقارير؟'],
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
let assistantOperationContext = null;
let assistantMutationDraft = null;
let assistantResidentEntryDraft = null;
let assistantRemoteHydrated = false;
let assistantRemoteHydrating = false;
let assistantRemoteWriteQueue = Promise.resolve();
let assistantRemoteClearFailed = false;
let assistantChatRevision = 0;
let assistantRemoteHydrationId = 0;
let assistantViewportListenersBound = false;
const ASSISTANT_OPERATION_PAYMENT_METHODS = Object.freeze({
    cash: 'نقدي',
    wallet: 'محفظة إلكترونية',
    instapay: 'InstaPay',
    bank_transfer: 'تحويل بنكي'
});

const ASSISTANT_CONFIRM_WORDS = /^(?:اكد(?: التسجيل| الحفظ| العملية| التحصيل| المصروف)?|اعتمد(?: التسجيل| العملية)?|نفذ(?: التسجيل| العملية)?|سجلها|سجل التحصيل|سجل المصروف|احفظها|موافق(?: على التسجيل)?|موافقه|ايوه|ايوا|نعم|تمام)$/;
const ASSISTANT_CANCEL_WORDS = /^(?:الغاء|الغاء العملية|الغاء المسودة|الغاء الاعلان|الغ|لا خلاص|مش عايز|مش عاوز|بلاش|وقف)$/;
const ASSISTANT_RECONCILE_WORDS = /^(?:تحققت من السجل|تحققت من التدقيق|تحققت من العملية|راجعت السجل|راجعت التدقيق|راجعت العملية)$/;
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

function isValidAssistantIsoDate(value) {
    const date = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function parseAssistantResidentCommand(raw, normalized, now = new Date(), targetResident = null) {
    const assistantLegacyResidentWord = '\u0633\u0627\u0643\u0646';
    const hasResidentWord = normalized.includes(assistantLegacyResidentWord) || /مالك/.test(normalized);
    const hasAddUnitCommand = /(?:اضف|ضيف|ادخل|إدخل)\s+(?:شقه|وحده)/.test(normalized);
    const hasEditUnitCommand = /(?:عدل|عدّل|غير|غيّر|حدّث|حدث|تعديل|تحديث).*(?:شقه|وحده|بيانات)/.test(normalized);
    if (!/(?:اضف|ضيف|سجل|سجّل|ادخل|إدخل|عدل|عدّل|غير|غيّر|حدّث|حدث|تعديل|تحديث)/.test(normalized) || (!hasResidentWord && !hasAddUnitCommand && !hasEditUnitCommand)) return null;
    if (/(?:تحصيل|دفعة|دفعه|استلام|قبض|مصروف|فاتوره|فاتورة|اعفاء|إعفاء|تخفيض|خصم|تسويه|تسوية)/.test(normalized)) return null;
    const apartmentMatch = normalized.match(/(?:شقه|وحده)\s*(?:رقم\s*)?(\d{1,4})/);
    const nameMatch = String(raw).match(new RegExp(`(?:${assistantLegacyResidentWord}|مالك)\\s+(.+?)(?=\\s+(?:شقه|شقة|وحده|وحدة)(?:\\s|$))`, 'i'));
    const name = nameMatch ? nameMatch[1].replace(/[،,:-]+$/, '').trim() : '';
    const tenantPhoneMatch = String(raw).match(/(?:هاتف|تليفون|موبايل)\s+(?:المستأجر|المستاجر|مستأجر|مستاجر)\s*[:：-]?\s*([+\d٠-٩۰-۹][\d٠-٩۰-۹\s-]{7,})/i);
    const tenantNameMatch = String(raw).match(/اسم\s+المستأجر\s*[:：-]?\s*([^،,\n]+?)(?=\s+(?:هاتف|تليفون|موبايل|شقة|وحدة|اشتراك|شهر|بداية\s+(?:الإيجار|الايجار)|نهاية\s+(?:الإيجار|الايجار))|[،,\n]|$)/i);
    const phoneMatch = tenantPhoneMatch ? null : String(raw).match(/(?:هاتف|تليفون|موبايل|رقم\s+الموبايل)\s*[:：-]?\s*([+\d٠-٩۰-۹][\d٠-٩۰-۹\s-]{7,})/i);
    const tenantName = tenantNameMatch ? tenantNameMatch[1].replace(/[،,:؛-]+$/, '').trim() : '';
    const normalizeDateDigits = value => String(value || '').replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776));
    const leaseStartMatch = String(raw).match(/(?:بداية\s+الإيجار|بداية\s+الايجار)\s*[:：-]?\s*([^\s،,؛]+)/i);
    const leaseEndMatch = String(raw).match(/(?:نهاية\s+الإيجار|نهاية\s+الايجار)\s*[:：-]?\s*([^\s،,؛]+)/i);
    const leaseStart = leaseStartMatch ? normalizeDateDigits(leaseStartMatch[1].replace(/[.،,؛]+$/, '')) : '';
    const leaseEnd = leaseEndMatch ? normalizeDateDigits(leaseEndMatch[1].replace(/[.،,؛]+$/, '')) : '';
    const normalizePhone = value => String(value || '').replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776));
    const amountMatch = normalized.match(/(?:اشتراك|شهري|بقيمة)\s+(.+?)(?=\s+(?:جنيه|ج\.م|جم|ج)(?:\s|$))/i);
    const amount = amountMatch ? assistantParsedAmount(amountMatch[1]) : null;
    const period = resolveAssistantPeriodWithContext(raw, now);
    const isEdit = /(?:عدل|عدّل|غير|غيّر|حدّث|حدث|تعديل|تحديث)/.test(normalized);
    if (!apartmentMatch && (hasAddUnitCommand || hasEditUnitCommand)) {
        return hasEditUnitCommand
            ? {
                type: 'resident_edit', residentId: targetResident?.id || null,
                name: targetResident?.name || '', apartmentNumber: targetResident?.apartmentNumber || '',
                phone: phoneMatch ? normalizePhone(phoneMatch[1]) : '',
                tenantName,
                tenantPhone: tenantPhoneMatch ? normalizePhone(tenantPhoneMatch[1]) : '',
                leaseStart, leaseEnd,
                residentLeaseStart: targetResident?.leaseStart || '',
                residentLeaseEnd: targetResident?.leaseEnd || '',
                residentRented: targetResident?.isRented === true, amount,
                billingStartMonth: period && period.type === 'month' && hasAssistantTimeHint(raw) ? period.label : '', raw
            }
            : { type: 'resident', name: '', apartmentNumber: '', phone: '', amount: null, billingStartMonth: '', raw };
    }
    if (!apartmentMatch) return null;
    if (isEdit) {
        return {
            type: 'resident_edit', residentId: targetResident?.id || null,
            name: targetResident?.name || name, apartmentNumber: targetResident?.apartmentNumber || apartmentMatch[1],
            phone: phoneMatch ? normalizePhone(phoneMatch[1]) : '',
            tenantName,
            tenantPhone: tenantPhoneMatch ? normalizePhone(tenantPhoneMatch[1]) : '',
            leaseStart, leaseEnd,
            residentLeaseStart: targetResident?.leaseStart || '',
            residentLeaseEnd: targetResident?.leaseEnd || '',
            residentRented: targetResident?.isRented === true,
            amount, billingStartMonth: period && period.type === 'month' && hasAssistantTimeHint(raw) ? period.label : '', raw
        };
    }
    return {
        type: 'resident', name, apartmentNumber: apartmentMatch[1],
        phone: phoneMatch ? normalizePhone(phoneMatch[1]) : '',
        amount, billingStartMonth: period && period.type === 'month' ? period.label : '', raw
    };
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
    const userId = typeof activeSession !== 'undefined' && typeof activeSession?.user?.id === 'string'
        ? activeSession.user.id
        : '';
    if (typeof currentUserRole !== 'undefined' && currentUserRole === 'manager' && userId) {
        return `manager-${encodeURIComponent(userId)}`;
    }
    return 'manager';
}

function assistantCurrentAuthIdentity() {
    const building = typeof activeBuildingId === 'string' && activeBuildingId ? activeBuildingId : 'local';
    const userId = typeof activeSession !== 'undefined' && typeof activeSession?.user?.id === 'string'
        ? activeSession.user.id
        : 'anonymous';
    return `${building}:${assistantIdentityKey()}:${userId}`;
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
    const normalized = normalizeAssistantArabic(text)
        .replace(/(?:شقه|وحده|رقم)\s*20[0-9]{2}/g, ' ');
    return ASSISTANT_TIME_HINT.test(normalized);
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

function assistantChatStore() {
    return typeof window !== 'undefined' && window.manzilAssistantChatStore
        ? window.manzilAssistantChatStore
        : null;
}

function persistAssistantRemoteMessage(role, body, metadata = {}) {
    const store = assistantChatStore();
    if (!store || typeof store.append !== 'function' || !assistantRemoteHydrated || metadata.greeting) return;
    const identity = assistantCurrentAuthIdentity();
    assistantRemoteWriteQueue = assistantRemoteWriteQueue.then(async () => {
        if (identity !== assistantCurrentAuthIdentity() || assistantRemoteClearFailed) return;
        await store.append(role === 'user' ? 'user' : 'assistant', body, metadata);
    }).catch(error => {
        if (identity === assistantCurrentAuthIdentity()) console.warn('Could not persist assistant chat message:', error);
    });
}

function clearAssistantRemoteHistory() {
    const store = assistantChatStore();
    if (!store || typeof store.clear !== 'function') return Promise.resolve(true);
    const identity = assistantCurrentAuthIdentity();
    assistantRemoteWriteQueue = assistantRemoteWriteQueue.then(async () => {
        if (identity !== assistantCurrentAuthIdentity()) return;
        const cleared = await store.clear();
        if (!cleared) throw new Error('Assistant chat clear was not acknowledged');
        if (identity === assistantCurrentAuthIdentity()) assistantRemoteClearFailed = false;
    }).catch(error => {
        if (identity === assistantCurrentAuthIdentity()) {
            assistantRemoteClearFailed = true;
            console.warn('Could not clear assistant chat history:', error);
        }
    });
    return assistantRemoteWriteQueue.then(() => identity !== assistantCurrentAuthIdentity() || !assistantRemoteClearFailed);
}

async function hydrateAssistantChatFromRemote() {
    const store = assistantChatStore();
    if (!store || typeof store.load !== 'function' || assistantRemoteHydrated || assistantRemoteHydrating) return false;
    assistantRemoteHydrating = true;
    const hydrationId = ++assistantRemoteHydrationId;
    const identity = assistantCurrentAuthIdentity();
    const revision = assistantChatRevision;
    try {
        const history = await store.load();
        if (!history) return false;
        if (hydrationId !== assistantRemoteHydrationId || identity !== assistantCurrentAuthIdentity() || revision !== assistantChatRevision) return false;
        const messages = Array.isArray(history.messages) ? history.messages : [];
        assistantChat = messages.map(message => ({
            role: message.sender_type === 'user' ? 'user' : 'bot',
            html: message.sender_type === 'user'
                ? formatAssistantUserText(message.body)
                : assistantStorableHtml(message.body)
        })).filter(message => message.html).slice(-ASSISTANT_HISTORY_LIMIT);
        if (history.context && typeof history.context === 'object') {
            const remoteContext = /** @type {any} */ (history.context);
            assistantContext = {
                period: remoteContext.period && Array.isArray(remoteContext.period.months) ? remoteContext.period : null,
                residentId: typeof remoteContext.residentId === 'string' ? remoteContext.residentId : null
            };
        }
        assistantRemoteHydrated = true;
        // Replacing the transcript invalidates any reply still queued from
        // before the load; otherwise it would be appended twice.
        assistantChatRevision += 1;
        persistAssistantChat();
        persistAssistantContext();
        return true;
    } catch (error) {
        if (identity === assistantCurrentAuthIdentity()) console.warn('Could not load assistant chat history:', error);
        return false;
    } finally {
        if (hydrationId === assistantRemoteHydrationId) assistantRemoteHydrating = false;
    }
}

const ASSISTANT_ALLOWED_HTML_TAGS = new Set([
    'p', 'div', 'span', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'br',
    'a', 'h4', 'section', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'
]);

function assistantAllowedHtmlAttribute(name, value) {
    const key = String(name || '').toLowerCase();
    const val = String(value || '');
    if (key === 'class') return /^[\w\s\-:]*$/.test(val);
    if (key === 'title' || key === 'alt' || key.startsWith('aria-')) return /^[^"<>]*$/.test(val);
    if (key === 'dir') return ['ltr', 'rtl', 'auto'].includes(val);
    if (key === 'role') return /^[a-z\- ]+$/i.test(val);
    if (key === 'width' || key === 'height') return /^\d{1,4}$/.test(val);
    if (key === 'decoding' || key === 'loading') return /^[a-z]+$/.test(val);
    if (key === 'href') return /^(?:https?:\/\/|tel:|mailto:|#)/i.test(val);
    if (key === 'src') return /^(?:\.\/)?icons\/[\w-]+\.png(?:\?v=[0-9a-f]+)?$/i.test(val);
    if (key === 'style') return /^\s*height:\s*\d{1,3}px;?\s*$/.test(val);
    if (key === 'onclick') {
        return /^assistantVoicePlayNote\('note-\d+'\)$/.test(val) || val === 'assistantVoiceSpeakLast()';
    }
    if (key.startsWith('data-')) return /^[\w\-]*$/.test(val);
    return false;
}

function isSafeAssistantHtml(html) {
    const value = String(html || '');
    if (/\bjavascript:/i.test(value)) return false;
    const tags = value.match(/<\s*\/?\s*[a-z][^>]*>/gi) || [];
    for (const tag of tags) {
        const name = (tag.match(/<\s*\/?\s*([a-z][\w-]*)/i) || [])[1];
        if (!name || !ASSISTANT_ALLOWED_HTML_TAGS.has(name.toLowerCase())) return false;
        const attributes = tag.match(/[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi) || [];
        for (const attribute of attributes) {
            const separator = attribute.indexOf('=');
            const key = attribute.slice(0, separator).trim();
            const rawValue = attribute.slice(separator + 1).trim();
            const val = rawValue.replace(/^["']|["']$/g, '');
            if (!assistantAllowedHtmlAttribute(key, val)) return false;
        }
    }
    return true;
}

// Live bubbles may contain review/play buttons. Those handlers are bound to
// in-memory drafts or blob URLs, so they must not survive into stored history.
// Keep the readable part of the message instead of dropping it altogether.
function assistantStorableHtml(html) {
    const value = String(html || '');
    if (isSafeAssistantHtml(value)) return value;
    const hadReviewButtons = /class=["'][^"']*assistant-action-(?:confirm|cancel)/i.test(value);
    let neutralized = value.replace(/<\s*button\b[^>]*>[\s\S]*?<\s*\/\s*button\s*>/gi, '');
    if (hadReviewButtons) {
        neutralized += '<p class="assistant-note">صلاحية أزرار المراجعة انتهت في السجل المحفوظ؛ أعد الطلب لو احتجت إتمامها.</p>';
    }
    return isSafeAssistantHtml(neutralized) ? neutralized : assistantEscape(value);
}

function restoreAssistantSession() {
    const keys = assistantStorageKeys();
    const stored = readAssistantStorage(keys.chat);
    assistantChat = Array.isArray(stored)
        ? stored.filter(item => item && (item.role === 'user' || item.role === 'bot')
            && typeof item.html === 'string')
            .map(item => ({ role: item.role, html: assistantStorableHtml(item.html) }))
            .filter(item => item.html)
            .slice(-ASSISTANT_HISTORY_LIMIT)
        : [];
    const context = readAssistantStorage(keys.context);
    assistantContext = {
        period: context && context.period && Array.isArray(context.period.months) ? context.period : null,
        residentId: context && typeof context.residentId === 'string' ? context.residentId : null
    };
}

function resetAssistantSessionForAuthChange() {
    assistantChatRevision += 1;
    assistantRemoteHydrationId += 1;
    assistantRemoteHydrated = false;
    assistantRemoteHydrating = false;
    assistantRemoteClearFailed = false;
    assistantChat = [];
    assistantContext = { period: null, residentId: null };
    assistantNoticeDraft = null;
    assistantMorningBriefDay = '';
    assistantOperationDraft = null;
    assistantMutationDraft = null;
    assistantResidentEntryDraft = null;
    clearAssistantOperationContext();
    const modal = document.getElementById('assistantModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.setAttribute('aria-hidden', 'true');
    }
    const log = document.getElementById('assistantLog');
    if (log) log.innerHTML = '';
    const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('assistantInput'));
    if (input) input.value = '';
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
    return '';
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
        .replace(/دلوقتى|دلوقتي|دلوقت/g, 'حاليا')
        .replace(/الفلوس راحت فين|فلوسنا راحت فين|الفلوس اتصرفت فين|اتصرفنا في ايه/g, 'المصاريف')
        .replace(/مين (?:لسه |برضه |برضو )?(?:ما ?|م)(?:دفع|سدد|حول|جاب)(?:ش|وش)|مين مش دافع|مين لسه (?:ما )?(?:دفع|سدد)(?:ش|وش)?|مين اتاخر في (?:ال)?(?:دفع|سداد)/g, 'مين عليه متاخرات')
        .replace(/كام في الخزنه|كام في الصندوق|الخزنه فيها كام/g, 'رصيد الخزنه')
        .replace(/دفعوا ازاي|اتدفعت بايه|دفعنا ازاي|الناس دفعت ازاي/g, 'طرق التحصيل')
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
    const normalized = replaceAssistantNumberWords(normalizeAssistantArabic(text))
        .replace(/(?:شقه|وحده|رقم)\s*20[0-9]{2}/g, ' ');
    const yearMatch = normalized.match(/(?:^|[^0-9])(20[0-9]{2})(?:[^0-9]|$)/);
    const explicitYear = yearMatch ? Number(yearMatch[1]) : null;
    const monthMatches = names.map((name, index) => ({
        index,
        position: normalized.indexOf(normalizeAssistantArabic(name))
    })).filter(item => item.position >= 0).sort((a, b) => a.position - b.position);
    let monthIndex = monthMatches.length ? monthMatches[0].index : -1;
    let year = explicitYear || now.getFullYear();

    if (monthIndex < 0) {
        const numericMonth = normalized.match(/(?:شهر|الشهر)\s*(\d{1,2})/);
        if (numericMonth) {
            const candidate = Number(numericMonth[1]);
            if (candidate >= 1 && candidate <= 12) monthIndex = candidate - 1;
        }
    }

    if (monthIndex < 0 && /(كل الفتره|كل الفترات|كل الشهور|من البدايه|من البداية|كل السنين|اجمالي عام|من اول ما بدأنا|من البداية خالص)/.test(normalized)) {
        const seen = new Set();
        (Array.isArray(state.income) ? state.income : []).forEach(row => { if (row.month) seen.add(row.month); });
        (Array.isArray(state.expenses) ? state.expenses : []).forEach(row => { if (row.month) seen.add(row.month); });
        const months = typeof sortMonthLabels === 'function' ? sortMonthLabels(Array.from(seen)) : Array.from(seen);
        return { type: 'all', label: 'كل الفترات', months, year: null, month: null };
    }

    // Relative markers apply even when the sentence also names a month. They
    // used to be skipped entirely as soon as any month name was present.
    if (ASSISTANT_PREVIOUS_MONTH.test(normalized)) {
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        if (monthIndex >= 0) {
            const candidate = new Date(year, monthIndex, 1);
            if (candidate.getTime() >= currentMonthStart) candidate.setFullYear(candidate.getFullYear() - 1);
            monthIndex = candidate.getMonth();
            year = candidate.getFullYear();
        } else {
            const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            monthIndex = previous.getMonth();
            year = explicitYear || previous.getFullYear();
        }
    } else if (ASSISTANT_PREVIOUS_YEAR.test(normalized)) {
        if (monthIndex >= 0) {
            year = (explicitYear || now.getFullYear()) - 1;
        } else {
            const previousYear = (explicitYear || now.getFullYear()) - 1;
            const months = names.map(name => `${name} ${previousYear}`);
            return { type: 'year', label: `سنة ${previousYear}`, months, year: previousYear, month: null };
        }
    }

    if (monthIndex < 0) {
        const lastN = normalized.match(/(?:^|\s)اخر\s+(شهرين|\d{1,2}\s*(?:شهور|شهر|اشهر))(?:\s|$)/);
        if (lastN) {
            const count = lastN[1].startsWith('شهرين') ? 2 : Number(lastN[1].replace(/\D/g, ''));
            if (count >= 1 && count <= 24) {
                const months = [];
                for (let step = count - 1; step >= 0; step -= 1) {
                    const date = new Date(now.getFullYear(), now.getMonth() - step, 1);
                    months.push(`${names[date.getMonth()]} ${date.getFullYear()}`);
                }
                return { type: 'all', label: `آخر ${assistantMonthsCount(count)}`, months, year: null, month: null };
            }
        }
    }

    const wantsYear = monthIndex < 0 && (
        Boolean(explicitYear) ||
        /(?:^|\s)(?:السنه|سنه|عام|خلال سنه|هذه السنه|السنه دي)(?:\s|$)/.test(normalized)
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
    const makeYearPeriod = value => ({
        type: 'year', label: `سنة ${value}`, months: names.map(name => `${name} ${value}`), year: value
    });
    if (period && period.type === 'year' && period.year) {
        const year = Number(period.year);
        return { current: makeYearPeriod(year), previous: makeYearPeriod(year - 1) };
    }
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
    const monthLabels = Array.isArray(period?.months) && period.months.length
        ? period.months : [getAssistantNowLabel(now)];
    const month = monthLabels.length === 1 ? monthLabels[0] : (period?.label || getAssistantNowLabel(now));
    const income = getAssistantIncomeSnapshot(monthLabels);
    const expenses = getAssistantExpenseSnapshot(monthLabels);
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
        let residentDue = 0;
        let residentPaid = 0;
        let residentSubscriptionPaid = 0;
        let residentSettlementPaid = 0;
        let residentAdjusted = 0;
        let residentOutstanding = 0;
        monthLabels.forEach(label => {
            const grossDue = typeof getSubscriptionAmountForMonth === 'function'
                ? Number(getSubscriptionAmountForMonth(resident, label)) || 0
                : Number(resident.monthlyAmount ?? state.defaultSubscription) || 0;
            const due = typeof getMonthlyDueAmountForMonth === 'function'
                ? Number(getMonthlyDueAmountForMonth(resident, label)) || 0 : grossDue;
            const paid = typeof getMonthlyDuePaidAmount === 'function'
                ? Number(getMonthlyDuePaidAmount(resident.id, label)) || 0
                : typeof getPaidAmountForMonth === 'function' ? Number(getPaidAmountForMonth(resident.id, label)) || 0 : 0;
            const subscriptionPaid = typeof getPaidAmountForMonth === 'function'
                ? Number(getPaidAmountForMonth(resident.id, label)) || 0 : 0;
            const settlement = typeof getSettlementAdjustmentForMonth === 'function'
                ? getSettlementAdjustmentForMonth(resident.id, label) : null;
            const settlementPaid = settlement && typeof getSettlementPaidAmount === 'function'
                ? Number(getSettlementPaidAmount(settlement.id)) || 0 : 0;
            const adjusted = Math.max(0, grossDue - due);
            const outstanding = typeof getMonthOutstanding === 'function'
                ? Number(getMonthOutstanding(resident, label)) || 0
                : Math.max(0, due - paid);
            residentDue += Math.round(grossDue * 100);
            residentPaid += Math.round(paid * 100);
            residentSubscriptionPaid += Math.round(subscriptionPaid * 100);
            residentSettlementPaid += Math.round(settlementPaid * 100);
            residentAdjusted += Math.round(adjusted * 100);
            residentOutstanding += Math.round(outstanding * 100);
        });
        dueCents += residentDue;
        paidCents += residentPaid;
        subscriptionPaidCents += residentSubscriptionPaid;
        settlementPaidCents += residentSettlementPaid;
        adjustedCents += residentAdjusted;
        outstandingCents += residentOutstanding;
        if (residentDue > 0 && residentOutstanding <= 0) paidUnits += 1;
        else if (residentPaid > 0 && residentOutstanding > 0) partialUnits += 1;
        if (residentOutstanding > 0) unpaid.push({ resident, outstanding: residentOutstanding / 100 });
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
    // Month labels are Arabic words, so a plain lexicographic sort puts
    // "أكتوبر" before "يناير". Use the application's calendar ordering.
    const chronological = months => typeof sortMonthLabels === 'function'
        ? sortMonthLabels(months)
        : months.slice().sort();
    if (typeof buildArrearsReport === 'function') {
        const report = buildArrearsReport();
        const residents = report.residents || [];
        const oldestFor = item => item.oldestMonth || (Array.isArray(item.unpaidMonths) && item.unpaidMonths[0]
            ? (typeof item.unpaidMonths[0] === 'object' ? item.unpaidMonths[0].month : item.unpaidMonths[0]) : null);
        const details = residents.flatMap(item => Array.isArray(item.unpaidMonths) ? item.unpaidMonths : []);
        const oldestMonth = chronological(residents.map(oldestFor).filter(Boolean))[0] || null;
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
        oldestMonth: chronological(residents.map(item => item.oldestMonth).filter(Boolean))[0] || null,
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


const ASSISTANT_SMALLTALK_BYE = /^(?:يلا |طيب |ok )?(?:مع السلامه|في امان الله|فى امان الله|الى اللقاء|الي اللقاء|تصبح علي خير|تصبحوا علي خير|سلام عليكم ورحمه الله|باي|سلامو عليكو|اشوفك بعدين|اشوفك على خير|يلا سلام|سلام يا (?:عم عبده|باشا))(?:\s+.*)?$/;
const ASSISTANT_SMALLTALK_ACK = /^(?:طيب |ماشي |يا رب )?(?:تمام|ماشي|حاضر|اوكي|اوك|ok|okay|طيب|حلو|جميل|كويس|عظيم|برافو|ممتاز|فهمت|وصلت|مفهوم)(?:\s+(?:يا\s+\S+|كده|خالص|جدا|الحمد لله))?$/i;
const ASSISTANT_SMALLTALK_WHO = /(?:انت مين|مين انت|انتا مين|اسمك ايه|انت ايه بالظبط|بتعمل ايه هنا|انت بتشتغل ايه)/;
const ASSISTANT_SMALLTALK_THANKS = /(?:شكرا|شكرن|تسلم|مشكور|ربنا يكرمك|الله يبارك|جزاك الله|كتر خيرك|يعطيك العافيه|ميرسي|متشكر|thanks|thank you)/i;

const ASSISTANT_SMALLTALK_HOWRU = /^(?:ازيك|ازيكم|عامل ايه|عاملين ايه|اخبارك|اخبارك ايه|ايه الاخبار|ايه اخبارك|عامل اي|ايه يا عم عبده)(?:\s+(?:يا\s+\S+(?:\s+\S+)?|النهارده|دلوقتي|حاليا))*$/;
const ASSISTANT_SMALLTALK_PRAISE = /(?:برافو|شاطر|جامد|ماشاء الله|ما شاء الله|يا معلم|عاش|كفو|تحفه|كفايه عليك|احسن واحد|بطل)/;
const ASSISTANT_SMALLTALK_SORRY = /^(?:معلش|اسف|اسفين|متزعلش|سامحني|عفوا|غلطتي)(?:\s+.*)?$/;
const ASSISTANT_SMALLTALK_WAIT = /^(?:استني|استنى|ثواني|لحظه|لحظة|دقيقه|دقيقة|ثانيه|ثانية)(?:\s+.*)?$/;
const ASSISTANT_SMALLTALK_LAUGH = /^(?:ه{2,}|هه+|ha(?:ha)+|lol|😂+|🤣+)$/i;
const ASSISTANT_SMALLTALK_COMPLAINT = /(?:مش فاهم حاجه|مش بتفهم|انت غبي|بتغلط|كلامك غلط|انت وحش|مش شغال|مفيش فايده)/;

// Same intent, a few ways to say it, so the doorman does not repeat himself word for word.
let assistantSmallTalkTurn = 0;
function assistantPick(variants) {
    const index = assistantSmallTalkTurn % variants.length;
    assistantSmallTalkTurn += 1;
    return variants[index];
}

function detectAssistantSmallTalk(normalized) {
    const text = String(normalized || '').trim();
    if (!text || text.split(/\s+/).length > 7) return null;
    if (ASSISTANT_SMALLTALK_BYE.test(text)) return 'bye';
    if (ASSISTANT_SMALLTALK_THANKS.test(text)) return 'thanks';
    if (ASSISTANT_SMALLTALK_WHO.test(text)) return 'who_are_you';
    if (ASSISTANT_SMALLTALK_HOWRU.test(text)) return 'howru';
    if (ASSISTANT_SMALLTALK_COMPLAINT.test(text)) return 'complaint';
    if (ASSISTANT_SMALLTALK_PRAISE.test(text)) return 'praise';
    if (ASSISTANT_SMALLTALK_SORRY.test(text)) return 'sorry';
    if (ASSISTANT_SMALLTALK_WAIT.test(text)) return 'wait';
    if (ASSISTANT_SMALLTALK_LAUGH.test(text)) return 'laugh';
    if (ASSISTANT_SMALLTALK_ACK.test(text)) return 'ack';
    return null;
}

// "وعليكم السلام" for salaam, "صباح النور" for good morning, and so on.
function assistantGreetingTitle(rawText) {
    const text = normalizeAssistantArabic(rawText);
    if (/صباح/.test(text)) return 'صباح النور';
    if (/مساء/.test(text)) return 'مساء النور';
    if (/السلام عليكم|سلام عليكم/.test(text)) return 'وعليكم السلام ورحمة الله';
    if (/اهلا|هاي|مرحب/.test(text)) return 'أهلاً بيك';
    return 'وعليكم السلام';
}

function buildAssistantSmallTalkAnswer(intent) {
    const address = assistantAddress();
    const owner = assistantIsOwner();
    const say = (id, title, line) => ({ id, title, html: `<p class="assistant-hello">${line}</p>` });
    switch (intent) {
        case 'bye':
            return say('bye', 'في رعاية الله', assistantPick([
                `في رعاية الله ${address}. أنا هنا لو احتجتني.`,
                `مع السلامة ${address}، ربنا يوفقك.`,
                `تمام ${address}، أشوفك على خير.`
            ]));
        case 'ack':
            return say('ack', 'تمام', assistantPick([
                `تمام ${address}. قولي لو عايز حاجة تانية.`,
                `ماشي ${address}. أنا موجود.`,
                `حاضر ${address}، تحت أمرك.`
            ]));
        case 'howru':
            return say('howru', 'الحمد لله', assistantPick([
                `الحمد لله تمام ${address}، وإنت عامل إيه؟ تحب نبدأ بإيه؟`,
                `كله تمام الحمد لله ${address}. اسألني عن أي حاجة في ${owner ? 'حسابك' : 'العمارة'}.`,
                `تمام ${address}، ربنا يكرمك. محتاج إيه النهارده؟`
            ]));
        case 'praise':
            return say('praise', 'ربنا يخليك', assistantPick([
                `ربنا يخليك ${address}، ده واجبي.`,
                `تسلم ${address}، ده من ذوقك.`,
                `الله يكرمك ${address}. أنا بعمل اللي عليا.`
            ]));
        case 'sorry':
            return say('sorry', 'ولا يهمك', assistantPick([
                `ولا يهمك ${address}، مفيش حاجة.`,
                `ولا تزعل نفسك ${address}، كمّل.`
            ]));
        case 'wait':
            return say('wait', 'خد وقتك', assistantPick([
                `خد وقتك ${address}، أنا مستنيك.`,
                `براحتك ${address}، أنا هنا.`
            ]));
        case 'laugh':
            return say('laugh', 'ربنا يضحكك', `ربنا يضحكك دايماً ${address} 😄 لو محتاج حاجة قولي.`);
        case 'complaint':
            return {
                id: 'complaint',
                title: 'معلش',
                html: `<p class="assistant-hello">معلش ${address}، يمكن مفهمتش قصدك صح.</p>${assistantNote('قولها بجملة تانية أو اكتب الشقة أو الشهر، وأنا أحاول تاني. ومش هقولك رقم من عندي.')}`
            };
        default: {
            const scope = owner
                ? 'حسابك، إيصالاتك، ميعاد الدفع وإعلانات العمارة.'
                : 'التحصيل، المتأخرات، المصروفات، الخزنة وحساب كل شقة.';
            return {
                id: 'who_are_you',
                title: 'أنا عم عبده',
                html: `<p class="assistant-hello">أنا عم عبده البواب ${address}.</p>${assistantNote('بجاوب من الأرقام اللي في التطبيق بس، ومبخمّنش.')}${assistantList([scope])}`
            };
        }
    }
}

const ASSISTANT_CLOSEST_QUESTIONS = {
    manager: [
        'ملخص الشهر', 'مين عليه متأخرات؟', 'رصيد الخزنة كام؟', 'كام اتحصل الشهر ده؟',
        'المصروفات الشهر ده', 'أكبر مصروف', 'مين هيستحق الأسبوع ده؟', 'آخر الحركات',
        'إعلانات المبنى', 'افتح تقرير المتأخرات', 'الإعفاءات والتخفيضات', 'طرق التحصيل'
    ],
    owner: [
        'عليّا كام الشهر ده؟', 'إيصالاتي', 'آخر يوم للدفع كام؟', 'طرق الدفع',
        'إعلانات المبنى', 'إشعاراتي', 'رقم مدير العمارة', 'بيانات شقتي'
    ]
};

function assistantBigrams(value) {
    const text = String(value || '').replace(/[^\u0621-\u064Aa-z0-9 ]/gi, '').replace(/\s+/g, ' ').trim();
    const grams = new Map();
    for (let i = 0; i < text.length - 1; i += 1) {
        const gram = text.slice(i, i + 2);
        grams.set(gram, (grams.get(gram) || 0) + 1);
    }
    return grams;
}

function assistantSimilarity(a, b) {
    const left = assistantBigrams(a);
    const right = assistantBigrams(b);
    let overlap = 0;
    let total = 0;
    left.forEach(count => { total += count; });
    right.forEach((count, gram) => {
        total += count;
        overlap += Math.min(count, left.get(gram) || 0);
    });
    return total ? (2 * overlap) / total : 0;
}

// Three questions closest to what was typed, so "ماوصلتش" always offers a way forward.
function assistantClosestQuestions(rawText, role = 'manager', count = 3) {
    const catalog = ASSISTANT_CLOSEST_QUESTIONS[role] || ASSISTANT_CLOSEST_QUESTIONS.manager;
    const typed = normalizeAssistantArabic(rawText);
    const ranked = catalog
        .map((question, index) => ({ question, index, score: assistantSimilarity(typed, normalizeAssistantArabic(question)) }))
        .sort((x, y) => y.score - x.score || x.index - y.index);
    return ranked.slice(0, count).map(item => item.question);
}

function buildAssistantNotUnderstoodAnswer(rawText, role) {
    const questions = assistantClosestQuestions(rawText, role);
    return {
        id: 'unknown',
        title: 'ماوصلتش للمقصود',
        html: `<p class="assistant-note">ماوصلتش للمقصود ${assistantAddress()}، ومش هخمّن وأقولك رقم غلط. تقصد واحد من دول؟</p>${assistantList(questions)}`,
        followUpQueries: questions
    };
}

function detectAssistantIntent(normalized, hasResident) {
    const smallTalk = detectAssistantSmallTalk(normalized);
    if (smallTalk) return smallTalk;
    const responseMode = detectAssistantResponseMode(normalized);
    if (responseMode === 'detailed' || responseMode === 'brief') {
        if (/(?:مصروف|مصاريف|صرف|منصرف|كهرب|نظافه|نظافة|صيانه|صيانة|مياه|ميه|حراسه|حراسة)/.test(normalized)) return 'expenses';
        if (/(?:تحصيل|تحصيلات|مدفوع|مدفوعات|دفع|دفعات|دخل|ايراد)/.test(normalized)) return 'income';
    }
    if (/(تقرير|تقارير|طباعه|تصدير|كشف)/.test(normalized) && /(?:مصروف|مصاريف|صرف|مالك|فتره|فترة|اعفاء|تخفيض|تسويه|كشف حساب|تحصيل|ايراد|متاخر|مديون|مستحق)/.test(normalized)) return 'reports';
    if (/(?:ملخص اليوم|ملخص النهارده|ملخص الصباح|بريف|ابدا يومي|اخبار النهارده|ايه الجديد النهارده)/.test(normalized)) return 'morning_brief';
    if (assistantCanWrite() && /(?:الاستحقاقات القادمه|الاستحقاق القادم|اللي هيستحق|مين هيستحق|هتستحق|هيستحقوا|قرب ميعاده|قرب موعد|استحقاق الاسبوع|استحقاقات الاسبوع|استحقاقات قريبه)/.test(normalized)) return 'upcoming_dues';
    if (hasResident) {
        if (/(السلام عليكم|سلام|صباح|مساء|ازيك|عامل ايه|اهلا)/.test(normalized)) return 'greeting';
        if (/(شكرا|تسلم|مشكور|ربنا يكرمك)/.test(normalized)) return 'thanks';
        if (/(?:ايصال|ايصالات|دفعات|دفعاته|دفعاتها|سجل (?:ال)?دفع|حركات)/.test(normalized)) return 'resident_receipts';
        return 'resident';
    }
    if (/(السلام عليكم|سلام|صباح|مساء|ازيك|عامل ايه|اهلا|هاي)/.test(normalized)) return 'greeting';
    if (/(شكرا|تسلم|مشكور|ربنا يكرمك)/.test(normalized)) return 'thanks';
    if (/(خصوصيه|بياناتي|البيانات بتتخزن|بتتخزن فين|مين يقدر يشوف|امان|امن|صلاحيات|قراءة فقط|بتعمل ايه|ازاي استخدم|ازاي اسجل|ازاي اعدل|ازاي اطبع|ازاي اصدر)/.test(normalized)) return 'knowledge';
    if (/(?:ال)?نسخه (?:ال)?احتياطيه|(?:ال)?نسخه (?:ال)?احتياطية|باك اب|backup|استعاده بيانات|استرجاع البيانات|استيراد ملف|تصدير البيانات/i.test(normalized)) return 'backup';
    if (/(اعدادات|إعدادات|ضبط|تخصيص|المظهر|الثيم|ميعاد الاستحقاق|فتره السماح|فترة السماح|طرق الدفع المفعله|رساله التذكير|نموذج الايصال)/.test(normalized)) return 'settings';
    if (/(دليل الاستخدام|خريطة التطبيق|اقسام التطبيق|أقسام التطبيق|الشاشات|الاقسام كلها|كل اقسام|كل أقسام|اعمل ايه في التطبيق)/.test(normalized)) return 'app_guide';
    if (/(سجل التدقيق|سجل العمليات|مين عمل|مين عدل|التدقيق|audit)/i.test(normalized)) return 'reports';
    if (/(مستاجر|مستأجر|عقد|ايجار|إيجار|بيانات المستأجر)/.test(normalized)) return 'building';
    if (/(سعر الاشتراك|اسعار الاشتراك|أسعار الاشتراك|تاريخ الاشتراك|ورقه الاسعار|ورقة الأسعار)/.test(normalized)) return 'building';
    if (/(مساعده|ساعدني|بتعرف|تقدر تعمل|اوامر|خيارات|ازاي|كيف|استخدمك|ممكن تساعد)/.test(normalized)) return 'help';
    if (/(تقرير|تقارير|طباعه|تصدير|كشف)/.test(normalized) && /(?:مصروف|مصاريف|صرف|مالك|فتره|فترة|اعفاء|تخفيض|تسويه|كشف حساب|تحصيل|ايراد|متاخر|مديون|مستحق)/.test(normalized)) return 'reports';
    if (parseAssistantAgedMonths(normalized)) return 'arrears_aged';
    if (/(?:نسبه التحصيل|نسبه المحصل|كام شقه دفعت|كام شقه سددت|مين (?:اللي )?(?:دفع|سدد)(?: ال)?(?:شهر|الشهر|كامل)?|موقف التحصيل|التحصيل واقف عند|دفعوا ولا لسه|سددوا ولا لسه)/.test(normalized) && !/(?:متاخر|اتذكر|النهارده|انهارده|اليوم)/.test(normalized)) return 'collection_status';
    if (/(تغير غير طبيعي|تغيير كبير|فرق كبير|محتاج مراجعه|محتاج مراجعة|زاد قوي|زادت قوي|نزل قوي|انخفض قوي|ايه اللي اتغير|ايه اللي زاد)/.test(normalized)) return 'change_alerts';
    if (/(مقارنه|قارن|مقابل|زاد|زادت|قل|قلت|اكتر من|اقل من)/.test(normalized)) return 'comparison';
    if (/(اعفاء|تخفيض|تسويه|خصم|خصومات|سامحنا)/.test(normalized)) return 'adjustments';
    if (/(قايمه متابعه|قائمه متابعه|قائمة متابعة|مهام المدير|ابدأ بايه|ابدا بايه|مين اكلمه|مين اكلم|اولويات التحصيل|اتابع مين)/.test(normalized)) return 'manager_tasks';
    if (/(?:اتذكر|اتذكروا|ذكرناه|ذكرناهم|بعتنا (?:له|لهم) تذكير|اتبعتله|اتبعتلهم|بعد التذكير|متابعه (?:ال)?تذكير|متابعه التذكيرات)/.test(normalized)) return 'reminder_followup';
    if (/(متاخر|متاخرات|مستحق|مديون|مش دفع|غير مدفوع|مش دافع|مش سدد|متاخرين|عليه فلوس)/.test(normalized)) return 'arrears';
    if (/(اكبر مصروف|اعلى مصروف|اغلى مصروف|اكبر المصروفات|المصروفات الاكبر|اكبر المصاريف|اكتر (?:مصروف|بند)|اكتر حاجه صرفنا)/.test(normalized)) return 'top_expenses';
    if (ASSISTANT_DAY_WORD.test(normalized) && /(مصروف|مصاريف|صرف|منصرف|اتصرف)/.test(normalized) && !/ملخص|متاخر/.test(normalized)) return 'window_expenses';
    if (/(مصروف|مصاريف|صرف|منصرف|اتصرف|اللي اتدفع من الخزنه)/.test(normalized)) return 'expenses';
    if (/(كهرب|نور|عداد كهرب|ميه|مياه|عداد ميه|نضافه|نظافة|نظف|صيانه|صيانة|تصليح|اسانسير|أسانسير|حراسه|حراسة|بواب|امن|أمن)/.test(normalized)) return 'expenses';
    if (ASSISTANT_DAY_WORD.test(normalized) && /(?:اتحصل|اتجمع|حصلنا|دفع|دفعوا|دخل|ايصالات|تحصيل)/.test(normalized) && !/ملخص|متاخر|مدفعش|مسددش/.test(normalized)) return 'today_income';
    if (/(طرق التحصيل|اتدفعت بايه|دفعوا ازاي|وسيله الدفع|وسائل التحصيل|حسب طريقه الدفع)/.test(normalized)) return 'payment_breakdown';
    if (/(تحصيل|تحصيلات|ايراد|دخل|وارد|دفع|مدفوع|متحصل|المتحصلات|اللي اتجمع|اتحصل|اتجمع|حصلنا|ايصالات)/.test(normalized)) return 'income';
    if (/(خزنه|صندوق|رصيد|كاش|فلوس|سيوله|الموجود في الخزنه)/.test(normalized)) return 'cashbox';
    if (/(اعلان|اعلانات|لوحه|اخبار العماره|فيه جديد)/.test(normalized)) return 'notices';
    if (/(ملخص تنفيذي|ملخص الاداره|ملخص العماره|الخلاصه السريعه)/.test(normalized)) return 'executive';
    if (/(ملخص|وضع|احوال|نظره|اجمالي|صافي|نتيجه|عاملين ايه)/.test(normalized)) return 'summary';
    if (/(اخر|احدث|حركات|عمليات|اللي حصل)/.test(normalized)) return 'recent';
    if (/(تقرير|تقارير|طباعه|تصدير|كشف)/.test(normalized)) return 'reports';
    if (/(عماره|مبني|مدير|شقق|سكان|وحدات|اسم|بيانات)/.test(normalized)) return 'building';
    return 'unknown';
}

function detectAssistantCompoundIntent(normalized) {
    const domains = [
        /(?:تحصيل|تحصيلات|ايراد|دخل|وارد|مدفوع|متحصل|المتحصلات|اللي اتجمع)/.test(normalized),
        /(?:مصروف|مصاريف|صرف|منصرف|اتصرف)/.test(normalized),
        /(?:متاخر|متاخرات|مستحق|مديون|غير مدفوع|مش سدد|عليه فلوس)/.test(normalized),
        /(?:خزنه|صندوق|رصيد|سيوله)/.test(normalized)
    ];
    return domains.filter(Boolean).length >= 2 ? 'executive' : null;
}

/** Egyptian month count: شهر، شهرين، 3 شهور (3 to 10), 11 شهر. */
function assistantMonthsCount(count) {
    const n = Math.max(0, Math.round(Number(count) || 0));
    if (n === 1) return 'شهر';
    if (n === 2) return 'شهرين';
    if (n >= 3 && n <= 10) return `${assistantNumber(n)} شهور`;
    return `${assistantNumber(n)} شهر`;
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

function parseAssistantReminderCommand(text) {
    if (!assistantCanWrite()) return null;
    const normalized = replaceAssistantNumberWords(normalizeAssistantArabic(String(text || '')));
    if (!/^(?:(?:ابعت|ابعتلي|ارسل|بعت|جهز|جهزلي|جهز لي)\s+)?(?:تذكير|تذكيرات|ذكر|ذكرني|فكرني)(?:\s|$)/.test(normalized)) return null;
    // "ذكرني بكره..." is a reminder for the manager himself, not for residents. The app has no personal reminders yet.
    if (/^(?:ذكرني|فكرني)(?:\s|$)/.test(normalized)) return { personal: true };
    if (/(?:المتاخرين|المتاخرات|الكل|كل الشقق|كل المتاخر)/.test(normalized) && !/(?:شقه|وحده)\s*\d/.test(normalized)) return { residentId: '' };
    const match = resolveAssistantResident(text);
    if (match.resident) return { residentId: match.resident.id };
    if (match.matches.length > 1) return { ambiguous: true };
    const apartment = normalized.match(/(?:شقه|وحده)\s*(\d+)/);
    if (apartment) return { notFound: apartment[1] };
    return { residentId: '' };
}

function buildAssistantReminderAnswer(request) {
    if (request.personal) {
        return {
            id: 'reminder-personal-unsupported',
            title: 'تذكير شخصي',
            html: assistantNote('التذكيرات الشخصية لنفسك لسه مش موجودة في التطبيق يا باشا، ومش هوعدك بتنبيه مش هيحصل. اللي أقدر أعمله دلوقتي تذكير الملاك المتأخرين: قولي «ذكّر المتأخرين» أو «ذكّر شقة 7».')
        };
    }
    if (request.notFound) {
        return {
            id: 'reminder-apartment-missing',
            title: 'الشقة مش موجودة',
            html: assistantNote(`مالقيتش شقة ${assistantNumber(request.notFound)} في العمارة يا باشا. اكتب رقم الشقة تاني أو قولي «ذكّر المتأخرين».`)
        };
    }
    if (request.ambiguous) {
        return {
            id: 'reminder-choice',
            title: 'أي مالك؟',
            html: assistantNote('في أكتر من مالك مطابق. حدد رقم الشقة، مثال: «ذكّر شقة 3».')
        };
    }
    const resident = request.residentId ? (state.residents || []).find(item => item.id === request.residentId) : null;
    const target = resident ? `شقة ${assistantEscape(String(resident.apartmentNumber || '—'))} · ${assistantEscape(resident.name || '')}` : 'كل المتأخرين';
    return {
        id: 'reminder-open-request',
        title: 'تذكير المتأخرات',
        html: assistantNote(`فتحت لك قائمة التذكيرات (${target}). اضغط «إرسال» جنب كل شقة ويفتح واتساب بالرسالة جاهزة، ولا يُرسل شيء قبل ما تضغط إرسال في واتساب.`),
        reminderRequest: request
    };
}

function parseAssistantNoticeCommand(text) {
    if (!assistantCanWrite()) return '';
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
            <p class="assistant-note">ده لسه مسودة ومتنشرش. راجع النص وبعدين اكتب «انشر الإعلان»، أو «إلغاء الإعلان» لو عدلت رأيك.</p></div>`
    };
}

async function confirmAssistantNotice() {
    if (!assistantCanWrite()) {
        if (typeof toast === 'function') toast('البوم مسموحش بنشر إعلانات من حساب المالك.', 'error');
        return false;
    }
    if (!assistantNoticeDraft) {
        if (typeof toast === 'function') toast('مفيش مسودة إعلان مستنية.', 'error');
        return false;
    }
    const draft = assistantNoticeDraft;
    if (typeof publishNoticeWithRequestId !== 'function') {
        if (typeof toast === 'function') toast('مقدرتش أنشر الإعلان دلوقتي، جرّب تاني.', 'error');
        return false;
    }
    const saved = await publishNoticeWithRequestId(draft.text, draft.requestId);
    if (!saved) return false;
    assistantNoticeDraft = null;
    if (typeof toast === 'function') toast('تمام، الإعلان اتنشر.', 'success');
    return true;
}

function cancelAssistantNotice(options = {}) {
    assistantNoticeDraft = null;
    if (!options.silent && typeof toast === 'function') toast('تمام، لغيت مسودة الإعلان.', 'info');
    return true;
}

function parseAssistantNumericToken(token) {
    const raw = String(token || '').replace(/[\s٬]/g, '');
    if (!raw) return null;
    const comma = raw.includes(',');
    const dot = raw.includes('.');
    let normalized = raw;
    if (comma && dot) {
        // The separator nearest the end is the decimal mark: both 1.000,50
        // and 1,000.50 mean one thousand and a half, never 1.0005.
        normalized = raw.lastIndexOf(',') > raw.lastIndexOf('.')
            ? raw.replace(/\./g, '').replace(',', '.')
            : raw.replace(/,/g, '');
    } else if (comma) {
        normalized = /,\d{1,2}$/.test(raw) ? raw.replace(',', '.') : raw.replace(/,/g, '');
    } else if (dot && /\.\d{3}$/.test(raw)) {
        normalized = raw.replace('.', '');
    }
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** @param {string} normalized @param {number} position */
function assistantAmountScale(normalized, position) {
    const tail = normalized.slice(position, position + 40);
    if (ASSISTANT_MILLION_WORD.test(tail)) return 1000000;
    if (ASSISTANT_THOUSAND_WORD.test(tail)) return 1000;
    return 1;
}

function assistantCompositeAmount(normalized) {
    // "بمليون و٥٠٠ ألف جنيه" and "مليون و٣ جنيه" are one amount, not two.
    const match = normalized.match(/(?:(\d+(?:[,.]\\d{1,3})*)\s*)?مليون(?:ات)?(?:\s*جنيه(?:ات)?)?(?:\s*و\s*(\d+(?:[,.]\\d{1,3})*)\s*(الف|الاف)?)?/);
    if (!match) return null;
    const millions = match[1] ? parseAssistantNumericToken(match[1]) : 1;
    if (millions === null) return null;
    let total = millions * 1000000;
    if (match[2]) {
        const extra = parseAssistantNumericToken(match[2]);
        if (extra !== null) total += extra * (match[3] ? 1000 : 1);
    }
    return total;
}

function assistantParsedAmount(text) {
    const normalized = normalizeAssistantArabic(text).replace(/[،٬]/g, ',');
    const composite = assistantCompositeAmount(normalized);
    if (composite !== null) return composite;
    const numberPattern = '(\\d+(?:[,.]\\d{1,3})*)';
    const currencyMatch = normalized.match(new RegExp(`${numberPattern}\\s*(?:جنيه(?:ات)?|ج\\.?م|جم|ج)(?!\\w)`));
    if (currencyMatch) {
        const amount = parseAssistantNumericToken(currencyMatch[1]);
        if (amount !== null) return amount * assistantAmountScale(normalized, currencyMatch.index);
    }
    if (/(?:نصف|نص)\s*الف/.test(normalized)) return 500;

    const candidates = [];
    const tokenPattern = new RegExp(numberPattern, 'g');
    let match;
    while ((match = tokenPattern.exec(normalized))) {
        const token = match[1];
        const before = normalized.slice(Math.max(0, match.index - 14), match.index);
        if (/20\d{2}$/.test(token) || /(?:شقه|وحده|رقم)\s*$/.test(before)) continue;
        const amount = parseAssistantNumericToken(token);
        if (amount === null) continue;
        return amount * assistantAmountScale(normalized, match.index);
    }
    if (ASSISTANT_MILLION_WORD.test(normalized)) return 1000000;
    if (ASSISTANT_THOUSAND_WORD.test(normalized)) return 1000;
    return null;
}

function parseAssistantOperationCommand(text, now = new Date()) {
    if (assistantIsOwner()) return null;
    const raw = String(text || '').trim();
    const normalized = normalizeAssistantArabic(raw);
    const amount = assistantParsedAmount(raw);
    const period = resolveAssistantPeriodWithContext(raw, now);
    const residentMatch = resolveAssistantResident(raw);
    const resident = residentMatch.matches.length === 1 ? residentMatch.matches[0] : null;
    const residentOperation = parseAssistantResidentCommand(raw, normalized, now, resident);
    if (residentOperation) return residentOperation;
    const hasIncomeVerb = /(?:سجل|سجّل|سجللي|سجلي|قيد|قيدلي|دون|دوّن|اثبت|أثبت|اضف|أضف|ضيف|ادخل|إدخل|استلم|استلمت|استلمنا|قبضت|سدد|سداد|اخدت|أخذت)/.test(normalized)
        || /(?:^|[\s،,])(?:دفعت|حولت|حصلت?|قبض)\s+(?=\d)/.test(normalized)
        || /(?:اعمل|اعمل لي|جهز|جهزلي)\s+(?:تحصيل|دفعة|دفعه|سداد)/.test(normalized);
    const hasExpenseWord = /(?:مصروف|فاتوره|فاتورة|صرف|كهرب|عداد|اسانسير|مصعد|نظاف|سباك|سباگه)/.test(normalized);
    const hasAdjustmentWord = /(?:اعفاء|إعفاء|تخفيض|خصم|تسويه|تسوية)/.test(normalized);

    if (/(?:تقرير|تقارير|كشف حساب|اطلع تقرير)/.test(normalized)) return null;
    if (hasIncomeVerb && !hasExpenseWord && !hasAdjustmentWord && /(?:تحصيل|دفعة|دفعه|دفع|استلام|استلم|قبض|حصّل|حصل|سدد|سداد|فلوس|مبلغ)/.test(normalized)) {
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
    // "صرفنا كام الشهر اللي فات؟" is a question, not an expense to record.
    const writeVerb = /(?:اعمل|سجل|سجّل|قيد|دون|دوّن|اضف|أضف|ضيف|ادفع|إدفع|جهز)/.test(normalized);
    if (!amount && !writeVerb && /(?:(?:^|\s)كام(?:\s|$)|قد ايه|اد ايه|ايه هو|اكتر|اكبر|اعلى|صرفنا عليه|؟|\?)/.test(normalized)) return null;
    if ((hasIncomeVerb || /(?:اعمل|اعمل لي|سجل|سجّل|قيد|دون|دوّن|اضف|أضف|ضيف|ادفع|إدفع|صرفت|صرفنا)/.test(normalized)) && hasExpenseWord) {
        const title = raw.replace(/^.*?(?:مصروف(?:ات)?|فاتورة|فاتوره|صرفنا|صرفت|صرف|قيد|دون|دوّن)\s*[:：-]?\s*/is, '')
            .replace(/[\d٠-٩۰-۹]+(?:[.,٫٬][\d٠-٩۰-۹]{1,3})*\s*(?:ج\.?م|جم|جنيه(?:ات)?|ج)?/gi, '')
            .replace(/(?:عن|فى|في|لشهر|شهر)\s+(?:يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)(?:\s+20\d{2})?/gi, '')
            .replace(/\s+(?:من|على)\s+(?:الخزنه|الخزينة|صندوق التطوير|صندوق الصيانه الطارئه|صندوق الصيانة الطارئة).*$/i, '')
            .replace(/^(?:ال)?(?:مصروف(?:ات)?|فاتورة|فاتوره)\s*/i, '')
            .replace(/\s+/g, ' ').replace(/^[،,:؛\s-]+|[،,:؛\s-]+$/g, '').trim();
        const explicitCash = parseAssistantCashAccount(normalized);
        return {
            type: 'expense', amount, title, month: period.label, raw,
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

function parseAssistantMutationCommand(text, now = new Date()) {
    if (assistantIsOwner()) return null;
    const raw = String(text || '').trim();
    const normalized = normalizeAssistantArabic(raw);
    const action = /(?:احذف|امسح|الغ|حذف)/.test(normalized) ? 'delete'
        : /(?:عدل|تعديل|تغيير|صحح|غير\s+(?:المبلغ|البيانات|التاريخ|الشهر|الوصف))/.test(normalized) ? 'edit' : null;
    if (!action) return null;
    const period = resolveAssistantPeriodWithContext(raw, now);
    // Reuse the shared parser so edit/delete commands understand the same
    // Arabic words and separators as create commands.
    const amount = assistantParsedAmount(raw);
    const hasRequestedMarker = /(?:إلى|الى|ليصبح|خليه|خليها)/i.test(raw);
    const requestedAmount = action === 'edit' && hasRequestedMarker
        ? assistantParsedAmount(raw.replace(/^.*?(?:إلى|الى|ليصبح|خليه|خليها)\s*/i, ''))
        : null;
    const residentMatch = resolveAssistantResident(raw);
    const periodKeys = new Set((period.months || []).map(label => typeof monthLabelToKey === 'function'
        ? String(monthLabelToKey(label) || '').slice(0, 7) : String(label).slice(0, 7)));
    let type = null;
    let candidates = [];
    if (/(?:تسويه|تسوية|اعفاء|تخفيض|خصم)/.test(normalized)) {
        type = 'adjustment';
        if (residentMatch.matches.length !== 1) return { action, type, raw, error: 'حدّد المالك أو رقم الشقة بدقة قبل المتابعة.' };
        candidates = (Array.isArray(state.adjustments) ? state.adjustments : [])
            .filter(item => item.residentId === residentMatch.resident.id && periodKeys.has(String(item.effectiveMonth || '').slice(0, 7)))
            .filter(item => !/(?:تسويه|تسوية)/.test(normalized) || item.kind === 'settlement')
            .filter(item => !/(?:اعفاء)/.test(normalized) || item.kind === 'waiver')
            .filter(item => !/(?:تخفيض|خصم)/.test(normalized) || item.kind === 'discount');
    } else if (/(?:تحصيل|دفعة|استلام)/.test(normalized)) {
        type = 'income';
        if (residentMatch.matches.length !== 1) return { action, type, raw, error: 'حدّد المالك أو رقم الشقة بدقة قبل المتابعة.' };
        candidates = (Array.isArray(state.income) ? state.income : [])
            .filter(item => item.residentId === residentMatch.resident.id && period.months.includes(item.month));
        if (amount) candidates = candidates.filter(item => Math.round(Number(item.amount) * 100) === Math.round(amount * 100));
    } else if (/(?:مصروف|فاتوره|فاتورة)/.test(normalized)) {
        type = 'expense';
        candidates = (Array.isArray(state.expenses) ? state.expenses : [])
            .filter(item => period.months.includes(item.month));
        if (amount) candidates = candidates.filter(item => Math.round(Number(item.amount) * 100) === Math.round(amount * 100));
    } else if (/(?:شقه|وحده|مستاجر)/.test(normalized)) {
        type = 'resident';
        if (residentMatch.matches.length !== 1) return { action, type, raw, error: 'حدّد رقم الشقة أو اسم المالك بدقة قبل المتابعة.' };
        candidates = residentMatch.matches;
    } else {
        return null;
    }
    if (candidates.length !== 1) return {
        action, type, raw,
        error: candidates.length > 1
            ? `وجدت ${candidates.length} سجلات مطابقة. حدّد المبلغ أو بيانات أدق حتى لا أختار سجلًا بالخطأ.`
            : 'ملقتش سجل مطابق في الفترة دي. راجع الشهر والمالك والمبلغ وقولّي تاني.'
    };
    const record = candidates[0];
    if (type === 'resident' && action === 'delete'
        && ((Array.isArray(state.income) ? state.income : []).some(item => item.residentId === record.id)
            || (Array.isArray(state.adjustments) ? state.adjustments : []).some(item => item.residentId === record.id))) {
        return { action, type, raw, error: 'لا يمكن حذف شقة لها تحصيلات أو إعفاءات/تسويات مرتبطة؛ احتفظ بالسجل المالي ولا تحذف بياناتها.' };
    }
    return { action, type, id: record.id, record, resident: type === 'resident' ? record : residentMatch.resident, raw, period: period.label, requestedAmount };
}

function parseAssistantResidentEntryCommand(text) {
    if (assistantIsOwner()) return null;
    const raw = String(text || '').trim();
    const normalized = normalizeAssistantArabic(raw);
    if (!/(?:اضف|ضيف|سجل|انشئ)/.test(normalized)
        || !/(?:شقه جديده|وحده جديده|مستاجر جديد|بيانات شقه جديده)/.test(normalized)
        || /(?:تحصيل|دفعة|مصروف|فاتوره|اعفاء|تخفيض|تسويه|اعلان)/.test(normalized)) return null;
    const number = value => value ? value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776)) : '';
    const apartmentNumber = number(raw.match(/(?:شقة|الوحدة)\s*(?:رقم\s*)?(\d+)/)?.[1] || '');
    const floor = number(raw.match(/(?:الدور|الطابق)\s*(\d+)/)?.[1] || '');
    const nameMatch = raw.match(/(?:باسم|اسم\s+المالك)\s*([\u0600-\u06FF\s]+?)(?=\s*(?:شقة|الوحدة|الدور|الطابق|هاتف|جوال|اشتراك|الإيجار|الايجار|مستأجر|المستأجر|\d{4}-\d{2}-\d{2}|$))/);
    const name = nameMatch ? nameMatch[1].replace(/[،,:؛\s]+$/g, '').trim() : '';
    const phone = raw.match(/(?:هاتف|جوال|موبايل)\s*[:：]?\s*([+\d٠-٩۰-۹\s-]{8,20})/)?.[1]?.trim() || '';
    const subscriptionMatch = raw.match(/(?:اشتراك(?:\s+شهري)?|قيمة\s+الاشتراك)\s*[:：]?\s*(\d+(?:[.,]\d{1,2})?)/);
    const rentMatch = raw.match(/(?:قيمة\s+)?(?:الإيجار|الايجار)\s*[:：]?\s*(\d+(?:[.,]\d{1,2})?)/);
    const depositMatch = raw.match(/(?:التأمين|تامين)\s*[:：]?\s*(\d+(?:[.,]\d{1,2})?)/);
    const tenantName = raw.match(/(?:اسم\s+)?المستأجر\s*[:：]?\s*([\u0600-\u06FF\s]+?)(?=\s*(?:هاتف|جوال|بداية|نهاية|الإيجار|الايجار|التأمين|تامين|شقة|الدور|اشتراك|\d{4}-\d{2}-\d{2}|$))/)?.[1]?.trim() || '';
    const tenantPhone = raw.match(/(?:هاتف|جوال)\s+المستأجر\s*[:：]?\s*([+\d٠-٩۰-۹\s-]{8,20})/)?.[1]?.trim() || '';
    const leaseStart = raw.match(/(?:بداية\s+الإيجار|بداية\s+الايجار)\s*[:：]?\s*(\d{4}-\d{2}-\d{2})/)?.[1] || '';
    const leaseEnd = raw.match(/(?:نهاية\s+الإيجار|نهاية\s+الايجار)\s*[:：]?\s*(\d{4}-\d{2}-\d{2})/)?.[1] || '';
    const subscriptionAmount = subscriptionMatch ? parseAssistantNumericToken(subscriptionMatch[1]) : null;
    const rentAmount = rentMatch ? parseAssistantNumericToken(rentMatch[1]) : null;
    const depositAmount = depositMatch ? parseAssistantNumericToken(depositMatch[1]) : null;
    const missing = [];
    if (!name) missing.push('اسم المالك');
    if (!apartmentNumber) missing.push('رقم الشقة');
    if (!floor) missing.push('الدور');
    if (missing.length) return { raw, error: `أحتاج ${missing.join(' و')} صراحةً. مثال: «أضف شقة جديدة باسم أحمد، شقة 8، الدور 2».` };
    if (!Number(state.floorCount) || !Number(state.apartmentsPerFloor)) {
        return { raw, error: 'لا أستطيع تجهيز شقة جديدة قبل ضبط عدد الأدوار والشقق لكل دور من إعدادات العقار.' };
    }
    if (!Number.isFinite(Number(apartmentNumber)) || !Number.isFinite(Number(floor))
        || (subscriptionAmount !== null && (!Number.isFinite(subscriptionAmount) || subscriptionAmount < 0))
        || (rentAmount !== null && (!Number.isFinite(rentAmount) || rentAmount < 0))
        || (depositAmount !== null && (!Number.isFinite(depositAmount) || depositAmount < 0))) {
        return { raw, error: 'راجع أرقام الشقة والدور والاشتراك والإيجار والتأمين؛ يجب أن تكون أرقامًا صحيحة وغير سالبة.' };
    }
    const floorNumber = Number(floor);
    const apartmentValue = Number(apartmentNumber);
    if (!Number.isInteger(floorNumber) || floorNumber < 1 || floorNumber > state.floorCount
        || !Number.isInteger(apartmentValue)
        || apartmentValue < (floorNumber - 1) * state.apartmentsPerFloor + 1
        || apartmentValue > floorNumber * state.apartmentsPerFloor) {
        return { raw, error: 'رقم الشقة لا يطابق الدور حسب توزيع العقار. راجع الدور ورقم الشقة قبل المتابعة.' };
    }
    const apartmentKey = value => String(value ?? '').replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776)).replace(/^0+(?=\d)/, '');
    const existing = (Array.isArray(state.residents) ? state.residents : [])
        .find(item => apartmentKey(item.apartmentNumber) === apartmentKey(apartmentNumber));
    if (existing) return { raw, error: `الشقة ${apartmentNumber} مسجلة بالفعل باسم ${assistantResidentName(existing)}. استخدم أمر تعديل بياناتها بدل إضافة سجل مكرر.` };
    const rented = Boolean(tenantName || /(?:مؤجره|مستاجر|مستاجره)/.test(normalized));
    if (rented && !tenantName) return { raw, error: 'أضف اسم المستأجر صراحةً، أو افتح نموذج الشقة وأكمل بيانات المستأجر.' };
    return { raw, name, apartmentNumber, floor, phone, subscriptionAmount, rented, tenantName, tenantPhone, leaseStart, leaseEnd, rentAmount, depositAmount };
}

function buildAssistantResidentEntryPreview(entry) {
    if (!entry) return null;
    if (entry.error) return { id: 'resident-entry-needs-clarification', title: 'بيانات الشقة ناقصة أو مش مظبوطة', html: assistantNote(entry.error) };
    if (assistantOperationContext || assistantResidentEntryDraft || assistantMutationDraft) return {
        id: 'mutation-pending', title: 'كمّل العملية الحالية الأول', html: assistantNote('فيه عملية تانية لسه مستنية أو بتتحفظ.')
    };
    assistantResidentEntryDraft = { ...entry, requestId: generateId() };
    const lines = [
        `المالك: ${entry.name}`,
        `الشقة: ${entry.apartmentNumber} · الدور ${entry.floor}`,
        `الاشتراك: ${entry.subscriptionAmount === null ? 'القيمة الافتراضية المعتمدة' : assistantMoney(entry.subscriptionAmount)}`,
        entry.rented ? `المستأجر: ${entry.tenantName}` : 'الشقة: غير مؤجرة'
    ];
    if (entry.rentAmount !== null) lines.push(`الإيجار: ${assistantMoney(entry.rentAmount)}`);
    if (entry.depositAmount !== null) lines.push(`التأمين: ${assistantMoney(entry.depositAmount)}`);
    return {
        id: 'resident-entry-preview', title: 'معاينة بيانات الشقة والمستأجر',
        html: `<div class="assistant-action-preview"><p class="assistant-notice-preview">${lines.map(assistantEscape).join('<br>')}</p>
            <p class="assistant-note">لن تُسجل البيانات الآن. افتح نموذج الشقة الرسمي لمراجعتها وإكمال أي حقول ناقصة، ثم اضغط «تأكيد الحفظ» داخله.</p>
            <div class="assistant-action-buttons" role="group" aria-label="مراجعة بيانات الشقة">
                <button type="button" class="assistant-action-confirm" onclick="openAssistantResidentEntry()">فتح النموذج الرسمي</button>
                <button type="button" class="assistant-action-cancel" onclick="cancelAssistantResidentEntry()">إلغاء</button>
            </div></div>`
    };
}

function openAssistantResidentEntry() {
    const draft = assistantResidentEntryDraft;
    if (!draft || !assistantCanWrite() || assistantOperationContext) return false;
    startAssistantOperationContext({ ...draft, type: 'resident', action: 'create', mode: 'create' });
    if (typeof window.openResidentModal !== 'function') {
        clearAssistantOperationContext();
        if (typeof toast === 'function') toast('نموذج الشقة مش بيفتح دلوقتي، جرّب تاني.', 'error');
        return false;
    }
    window.openResidentModal('add');
    const setValue = (id, value) => { const input = /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null} */ (document.getElementById(id)); if (input && value !== null && value !== undefined && value !== '') input.value = String(value); };
    const floor = /** @type {HTMLSelectElement | null} */ (document.getElementById('residentFloor'));
    if (floor) floor.value = draft.floor;
    if (typeof window.updateResidentApartmentOptions === 'function') window.updateResidentApartmentOptions(draft.apartmentNumber);
    setValue('residentName', draft.name);
    setValue('residentApartment', draft.apartmentNumber);
    setValue('residentPhone', draft.phone);
    setValue('residentAmount', draft.subscriptionAmount);
    const rented = /** @type {HTMLInputElement | null} */ (document.getElementById('residentIsRented'));
    if (rented) rented.checked = draft.rented;
    setValue('residentTenantName', draft.tenantName);
    setValue('residentTenantPhone', draft.tenantPhone);
    setValue('residentLeaseStart', draft.leaseStart);
    setValue('residentLeaseEnd', draft.leaseEnd);
    setValue('residentRentAmount', draft.rentAmount);
    setValue('residentDepositAmount', draft.depositAmount);
    if (typeof window.toggleResidentTenantFields === 'function') window.toggleResidentTenantFields();
    const submit = assistantOperationSubmitButton('resident', 'create');
    if (submit) submit.textContent = assistantOperationConfirmationLabel('resident');
    assistantResidentEntryDraft = null;
    if (typeof closeModal === 'function') closeModal('assistantModal');
    return true;
}

function cancelAssistantResidentEntry() {
    assistantResidentEntryDraft = null;
    if (typeof toast === 'function') toast('تمام، لغيت مسودة الشقة ومحفظتش حاجة.', 'info');
}

function assistantMutationRecordLabel(mutation) {
    const record = mutation.record;
    if (mutation.type === 'resident') return `الشقة ${record.apartmentNumber} · ${assistantResidentName(record)}`;
    if (mutation.type === 'income') return `تحصيل ${assistantMoney(record.amount)}${mutation.requestedAmount ? ` (من ${assistantMoney(record.amount)} إلى ${assistantMoney(mutation.requestedAmount)})` : ''} · ${assistantResidentName(mutation.resident)} · شقة ${mutation.resident.apartmentNumber} · ${record.month}`;
    if (mutation.type === 'expense') return `مصروف ${record.title} · ${assistantMoney(record.amount)}${mutation.requestedAmount ? ` (من ${assistantMoney(record.amount)} إلى ${assistantMoney(mutation.requestedAmount)})` : ''} · ${record.month}`;
    const kind = { waiver: 'إعفاء', discount: 'تخفيض', settlement: 'تسوية' }[record.kind] || 'إجراء مالي';
    return `${kind} ${assistantMoney(record.amount)}${mutation.requestedAmount ? ` (من ${assistantMoney(record.amount)} إلى ${assistantMoney(mutation.requestedAmount)})` : ''} · ${assistantResidentName(mutation.resident)} · شقة ${mutation.resident.apartmentNumber} · ${String(record.effectiveMonth || '').slice(0, 7)}`;
}

function buildAssistantMutationPreview(mutation) {
    if (!mutation) return null;
    if (mutation.error) return { id: 'mutation-needs-clarification', title: 'محتاج توضيح أكتر', html: assistantNote(mutation.error) };
    if (assistantOperationContext || assistantMutationDraft) return {
        id: 'mutation-pending', title: 'كمّل العملية الحالية الأول',
        html: assistantNote('فيه عملية تانية لسه مستنية أو بتتحفظ. كمّلها أو الغيها قبل ما نبدأ تعديل أو حذف جديد.')
    };
    assistantMutationDraft = { ...mutation, requestId: generateId(), expectedRecord: JSON.stringify(mutation.record) };
    const deleting = mutation.action === 'delete';
    return {
        id: deleting ? 'mutation-delete-preview' : 'mutation-edit-preview',
        title: deleting ? 'مراجعة حذف سجل' : 'مراجعة تعديل سجل',
        html: `<div class="assistant-action-preview"><p class="assistant-notice-preview">${assistantEscape(assistantMutationRecordLabel(assistantMutationDraft))}</p>
            <p class="assistant-note">${deleting ? 'لن يُحذف السجل إلا بعد ضغط «تأكيد الحذف» هنا، وسيُسجل الحذف في سجل العمليات. قد تمنع ضوابط النظام حذف السجلات المرتبطة.' : 'لم تتغير البيانات. افتح النموذج الرسمي وراجع الحقول ثم أكد الحفظ من داخله؛ سيُسجل التعديل في سجل العمليات.'}</p>
            <div class="assistant-action-buttons" role="group" aria-label="مراجعة التغيير الإداري">
                <button type="button" class="assistant-action-confirm" onclick="${deleting ? 'confirmAssistantMutationDelete' : 'openAssistantMutationEdit'}()">${deleting ? 'تأكيد الحذف' : 'فتح نموذج التعديل'}</button>
                <button type="button" class="assistant-action-cancel" onclick="cancelAssistantMutation()">إلغاء</button>
            </div></div>`
    };
}

function openAssistantMutationEdit() {
    const draft = assistantMutationDraft;
    if (!draft || draft.action !== 'edit' || !assistantCanWrite()) return false;
    const currentRows = draft.type === 'resident' ? state.residents
        : draft.type === 'income' ? state.income
            : draft.type === 'expense' ? state.expenses : state.adjustments;
    const currentRecord = (Array.isArray(currentRows) ? currentRows : []).find(item => item.id === draft.id);
    if (!currentRecord || JSON.stringify(currentRecord) !== draft.expectedRecord) {
        assistantMutationDraft = null;
        if (typeof toast === 'function') toast('تغير السجل منذ المعاينة. أعد تحميل البيانات ثم جهّز التعديل من جديد.', 'error');
        return false;
    }
    startAssistantOperationContext({ ...draft, mode: 'edit', action: 'edit' });
    const opener = draft.type === 'resident' ? 'editResident'
        : draft.type === 'income' ? 'openIncomeEditModal'
            : draft.type === 'expense' ? 'openExpenseEditModal' : 'openAdjustmentModal';
    if (typeof window[opener] !== 'function') {
        clearAssistantOperationContext();
        if (typeof toast === 'function') toast('نموذج التعديل مش بيفتح دلوقتي، جرّب تاني.', 'error');
        return false;
    }
    if (draft.type === 'adjustment') {
        window[opener](draft.resident.id);
        if (typeof window.editAdjustment === 'function') window.editAdjustment(draft.id);
    } else window[opener](draft.id);
    if (draft.requestedAmount && draft.type === 'income') {
        const input = /** @type {HTMLInputElement | null} */ (document.getElementById('incomeEditAmount'));
        if (input) input.value = String(draft.requestedAmount);
    } else if (draft.requestedAmount && draft.type === 'expense') {
        const input = /** @type {HTMLInputElement | null} */ (document.getElementById('expenseAmount'));
        if (input) input.value = String(draft.requestedAmount);
        if (typeof window.previewExpense === 'function') window.previewExpense();
    } else if (draft.requestedAmount && draft.type === 'adjustment') {
        const input = /** @type {HTMLInputElement | null} */ (document.getElementById('adjustmentAmount'));
        if (input) input.value = String(draft.requestedAmount);
        if (typeof window.updateAdjustmentDueHint === 'function') window.updateAdjustmentDueHint();
    }
    const submitButton = assistantOperationSubmitButton(draft.type, 'edit');
    if (submitButton) submitButton.textContent = assistantOperationConfirmationLabel(draft.type);
    assistantMutationDraft = null;
    if (typeof closeModal === 'function') closeModal('assistantModal');
    return true;
}

async function confirmAssistantMutationDelete() {
    const draft = assistantMutationDraft;
    if (!draft || draft.processing || draft.action !== 'delete' || !assistantCanWrite()) return false;
    const currentRows = draft.type === 'resident' ? state.residents
        : draft.type === 'income' ? state.income
            : draft.type === 'expense' ? state.expenses : state.adjustments;
    const currentRecord = (Array.isArray(currentRows) ? currentRows : []).find(item => item.id === draft.id);
    if (!currentRecord || JSON.stringify(currentRecord) !== draft.expectedRecord) {
        assistantMutationDraft = null;
        if (typeof toast === 'function') toast('تغير السجل منذ المعاينة. لم يُنفّذ الحذف؛ أعد المعاينة.', 'error');
        return false;
    }
    draft.processing = true;
    const type = `${draft.type}_delete`;
    startAssistantOperationContext({ ...draft, type, mode: 'delete', action: 'delete' });
    const deleter = draft.type === 'resident' ? 'deleteResident'
        : draft.type === 'income' ? 'deleteIncome'
            : draft.type === 'expense' ? 'deleteExpense' : 'deleteAdjustment';
    if (typeof window[deleter] !== 'function') {
        clearAssistantOperationContext();
        if (typeof toast === 'function') toast('مقدرتش أكمل الحذف دلوقتي، جرّب تاني.', 'error');
        return false;
    }
    let deleteError = null;
    try {
        await window[deleter](draft.id, draft.requestId);
    } catch (error) {
        deleteError = error;
    }
    const rowsAfter = draft.type === 'resident' ? state.residents
        : draft.type === 'income' ? state.income
            : draft.type === 'expense' ? state.expenses : state.adjustments;
    const stillPresent = (Array.isArray(rowsAfter) ? rowsAfter : []).some(item => item.id === draft.id);
    const context = assistantOperationContext?.requestId === draft.requestId ? assistantOperationContext : null;
    if (deleteError || stillPresent) {
        draft.processing = false;
        clearAssistantOperationContext();
        appendAssistantOperationFailure(context?.status === 'uncertain' || deleteError
            ? 'لم يتأكد حذف السجل. حدّث البيانات وراجع سجل التدقيق؛ اكتب «تحققت من السجل» لإغلاق العملية قبل أي محاولة جديدة.'
            : 'لم يُحذف السجل. راجع رسالة التحقق أو أعد المعاينة.');
        return false;
    }
    if (context) completeAssistantOperation(draft.requestId);
    assistantMutationDraft = null;
    return true;
}

function cancelAssistantMutation() {
    assistantMutationDraft = null;
    if (assistantOperationContext?.action === 'edit' && assistantOperationContext.status === 'ready') clearAssistantOperationContext();
    if (typeof toast === 'function') toast('تمام، لغيت العملية ومفيش حاجة اتغيرت.', 'info');
}

function assistantOperationMissing(operation) {
    if (!operation) return ['بيانات العملية'];
    const missing = [];
    if (operation.type === 'resident_edit') {
        if (!operation.residentId) missing.push('المالك أو رقم الشقة الصحيح');
        if (!operation.phone && !operation.tenantName && !operation.tenantPhone && !operation.leaseStart && !operation.leaseEnd && !operation.amount && !operation.billingStartMonth) missing.push('البيان المطلوب تعديله');
        if ((operation.tenantName || operation.tenantPhone || operation.leaseStart || operation.leaseEnd) && operation.residentRented !== true) missing.push('تأكيد أن الشقة مسجلة كمؤجرة');
        if (operation.leaseStart && !isValidAssistantIsoDate(operation.leaseStart)) missing.push('بداية الإيجار بصيغة YYYY-MM-DD صحيحة');
        if (operation.leaseEnd && !isValidAssistantIsoDate(operation.leaseEnd)) missing.push('نهاية الإيجار بصيغة YYYY-MM-DD صحيحة');
        const effectiveLeaseStart = operation.leaseStart || operation.residentLeaseStart;
        const effectiveLeaseEnd = operation.leaseEnd || operation.residentLeaseEnd;
        if (isValidAssistantIsoDate(effectiveLeaseStart) && isValidAssistantIsoDate(effectiveLeaseEnd)
            && effectiveLeaseEnd < effectiveLeaseStart) missing.push('نهاية الإيجار في أو بعد بدايته');
        return missing;
    }
    if (operation.type === 'resident') {
        if (!operation.name) missing.push('اسم المالك');
        if (!operation.apartmentNumber) missing.push('رقم الشقة');
        return missing;
    }
    if (!operation.amount) missing.push('المبلغ');
    if (operation.type === 'expense' && !String(operation.title || '').trim()) missing.push('وصف المصروف أو بنده');
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
        && (operation.type !== 'expense' || operation.title)
        && !assistantExpenseBalanceInfo(operation)?.fundInsufficient);
}

function assistantExpenseBalanceInfo(operation) {
    if (operation?.type !== 'expense' || typeof getCashAccountBalance !== 'function') return null;
    const cashAccountCode = ['main', 'development', 'emergency'].includes(operation.cashAccountCode)
        ? operation.cashAccountCode : 'main';
    const balance = Number(getCashAccountBalance(cashAccountCode)) || 0;
    const amount = Number(operation.amount) || 0;
    return {
        cashAccountCode,
        balance,
        balanceAfter: balance - amount,
        mainOverdraft: cashAccountCode === 'main' && amount > balance + 0.000001,
        fundInsufficient: cashAccountCode !== 'main' && amount > balance + 0.000001
    };
}

function assistantOperationFollowupPatch(text, operation) {
    if (!operation || assistantIsOwner()) return null;
    const raw = String(text || '').trim();
    const normalized = normalizeAssistantArabic(raw);
    if (/(?:سجل|سجّل|سجللي|سجلي|قيد|قيدلي|دون|دوّن|اثبت|اضف|أضف|ضيف|استلم|قبض|اعمل|طبق|انشر|اكتب)/.test(normalized)) return null;
    const patch = {};
    const method = parseAssistantPaymentMethod(normalized);
    const cashAccountCode = parseAssistantCashAccount(normalized);
    const amount = assistantParsedAmount(raw);
    const residentMatch = resolveAssistantResident(raw);
    const period = resolveAssistantPeriod(raw, new Date());
    const reason = parseAssistantOperationReason(raw);
    const hasReasonSignal = /(?:بسبب|علشان|عشان|السبب)/.test(normalized);
    const category = operation.type === 'expense' ? parseAssistantExpenseCategory(normalized) : ASSISTANT_OPERATION_CATEGORIES.other;
    const expenseTitleMatch = operation.type === 'expense' && raw.match(/(?:وصف|بند|اسم المصروف|المصروف هو)\s*[:：-]?\s*(.+)$/i);
    const hasOperationDetail = Boolean(method || cashAccountCode || amount || residentMatch.matches.length || hasReasonSignal
        || (operation.type === 'expense' && (category !== ASSISTANT_OPERATION_CATEGORIES.other || expenseTitleMatch)));
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
    if (operation.type === 'expense') {
        if (category !== ASSISTANT_OPERATION_CATEGORIES.other) {
            patch.category = category;
            if (!operation.title && !expenseTitleMatch) patch.title = category;
        }
        if (expenseTitleMatch) patch.title = expenseTitleMatch[1].trim();
    }
    if (operation.type === 'income') {
        const purpose = parseAssistantOperationPurpose(normalized);
        if (/(?:اشتراك|شهري)/.test(normalized)) patch.purpose = 'subscription';
        else if (/(?:تطوير|تحسين|صيانه طارئه|طوارئ|غرض اخر|غرض تاني|اخرى)/.test(normalized)) {
            patch.purpose = purpose;
            if (purpose === 'development') patch.cashAccountCode = 'development';
            if (purpose === 'emergency') patch.cashAccountCode = 'emergency';
        }
    }
    return Object.keys(patch).length ? patch : null;
}

function mergeAssistantOperationFollowup(text, now = new Date()) {
    const previous = assistantOperationDraft;
    const patch = assistantOperationFollowupPatch(text, previous);
    if (!patch) return null;
    const merged = {
        ...previous,
        ...patch,
        raw: `${previous.raw} · ${String(text || '').trim()}`,
        followupNote: buildAssistantOperationChangeNote(previous, patch)
    };
    return buildAssistantOperationPreview(merged, now);
}

function buildAssistantOperationChangeNote(previous, patch) {
    const changes = [];
    if (Object.prototype.hasOwnProperty.call(patch, 'amount')) changes.push(`المبلغ إلى ${assistantMoney(patch.amount)}`);
    if (Object.prototype.hasOwnProperty.call(patch, 'month')) changes.push(`الشهر إلى ${patch.month}`);
    if (Object.prototype.hasOwnProperty.call(patch, 'cashAccountCode')) changes.push(`الصندوق إلى ${ASSISTANT_CASH_LABELS[patch.cashAccountCode] || patch.cashAccountCode}`);
    if (Object.prototype.hasOwnProperty.call(patch, 'paymentMethod')) changes.push(`طريقة الدفع إلى ${ASSISTANT_OPERATION_PAYMENT_METHODS[patch.paymentMethod] || patch.paymentMethod}`);
    if (Object.prototype.hasOwnProperty.call(patch, 'resident')) changes.push(`المالك إلى ${assistantResidentName(patch.resident)} · شقة ${patch.resident.apartmentNumber || '—'}`);
    if (Object.prototype.hasOwnProperty.call(patch, 'reason')) changes.push('سبب الإجراء');
    if (Object.prototype.hasOwnProperty.call(patch, 'notes')) changes.push('الملاحظات');
    return changes.length ? `اتعدلت المسودة: ${changes.join('، ')}.` : '';
}

function buildAssistantOperationPreview(operation, now = new Date()) {
    if (!operation) return null;
    if (assistantOperationContext || assistantMutationDraft || assistantResidentEntryDraft) {
        const context = assistantOperationContext;
        return {
            id: 'operation-pending',
            title: 'هناك عملية قيد المراجعة',
            html: assistantNote(context?.status === 'uncertain'
                ? 'نتيجة الحفظ السابق غير مؤكدة. حدّث البيانات وتحقق من سجل التدقيق قبل بدء عملية جديدة.'
                : 'أكمل أو ألغِ النموذج أو المعاينة المفتوحة أولًا؛ لن أستبدل بيانات العملية الحالية.')
        };
    }
    const residentEdit = operation.type === 'resident_edit'
        ? (Array.isArray(state.residents) ? state.residents : []).find(item => item.id === operation.residentId)
        : null;
    assistantOperationDraft = {
        ...operation,
        requestId: operation.requestId || (typeof generateId === 'function' ? generateId() : `assistant-${Date.now()}`),
        ...(residentEdit ? { expectedRecord: JSON.stringify(residentEdit) } : {})
    };
    operation = assistantOperationDraft;
    const labels = { income: 'تحصيل', expense: 'مصروف', adjustment: 'إعفاء أو تخفيض أو تسوية', resident: 'بيانات الشقة', resident_edit: 'تعديل بيانات الشقة' };
    const missing = assistantOperationMissing(operation);
    if (missing.length) {
        return {
            id: 'operation-missing',
            title: `بيانات ${labels[operation.type]} ناقصة`,
            html: `${assistantNote(`أقدر أجهز ${labels[operation.type]} يا باشا، بس ناقصني: ${missing.join(' و')}.`)}${assistantNote('كمّلها في رسالة تانية، مثلًا: «نقدي في الخزنة الرئيسية» أو «السبب ظرف صحي». وبعدين راجع الملخص قبل الحفظ.')}${assistantActionButtons(operation, false)}`
        };
    }
    const adjustmentKindLabels = { waiver: 'إعفاء', discount: 'تخفيض', settlement: 'تسوية' };
    const target = operation.type === 'resident_edit'
        ? `${operation.name || '—'} · شقة ${operation.apartmentNumber || '—'}${operation.phone ? ` · هاتف المالك ${operation.phone}` : ''}${operation.tenantName ? ` · اسم المستأجر ${operation.tenantName}` : ''}${operation.tenantPhone ? ` · هاتف المستأجر ${operation.tenantPhone}` : ''}${operation.leaseStart ? ` · بداية الإيجار ${operation.leaseStart}` : ''}${operation.leaseEnd ? ` · نهاية الإيجار ${operation.leaseEnd}` : ''}${operation.amount ? ` · اشتراك ${assistantMoney(operation.amount)}` : ''}${operation.billingStartMonth ? ` · بدء ${operation.billingStartMonth}` : ''}`
        : operation.type === 'resident'
        ? `${operation.name || '—'} · شقة ${operation.apartmentNumber || '—'}${operation.amount ? ` · اشتراك ${assistantMoney(operation.amount)}` : ''}${operation.phone ? ` · ${operation.phone}` : ''}`
        : operation.type === 'expense'
        ? `${operation.title} · ${assistantMoney(operation.amount)} · ${operation.month} · ${operation.category || 'أخرى'} · ${ASSISTANT_CASH_LABELS[operation.cashAccountCode] || ASSISTANT_CASH_LABELS.main}`
        : `${operation.type === 'adjustment' ? `${adjustmentKindLabels[operation.kind] || 'إجراء'} · ` : ''}${assistantResidentName(operation.resident)} · شقة ${operation.resident.apartmentNumber} · ${assistantMoney(operation.amount)} · ${operation.month}${operation.type === 'income' ? ` · ${operation.purpose === 'subscription' ? 'اشتراك شهري' : operation.purpose} · ${ASSISTANT_OPERATION_PAYMENT_METHODS[operation.paymentMethod] || ''} · ${ASSISTANT_CASH_LABELS[operation.cashAccountCode] || ASSISTANT_CASH_LABELS.main}` : ''}`;
    const assumed = operation.cashAccountAssumed ? assistantNote('ما قلتش أنهي صندوق، فاخترت الخزنة الرئيسية. تقدر تغيّرها قبل التنفيذ.') : '';
    const balanceInfo = assistantExpenseBalanceInfo(operation);
    const balanceNotice = balanceInfo?.mainOverdraft
        ? assistantNote(`خد بالك: رصيد الخزنة الرئيسية ${assistantMoney(balanceInfo.balance)}، وهيبقى ${assistantMoney(balanceInfo.balanceAfter)} بعد المصروف. لو كتبت «أكد التسجيل» يبقى موافق على كده، وهيتسجل في سجل التدقيق.`)
        : balanceInfo?.fundInsufficient
            ? assistantNote(`رصيد ${ASSISTANT_CASH_LABELS[balanceInfo.cashAccountCode]} (${assistantMoney(balanceInfo.balance)}) مش كفاية للمصروف ده. قولّي صندوق تاني أو مبلغ أقل قبل التسجيل.`)
            : '';
    return {
        id: 'operation-preview',
        title: `معاينة ${labels[operation.type]} قبل الإدخال`,
        html: `<div class="assistant-action-preview"><p class="assistant-notice-preview">${assistantEscape(target)}</p>
            ${operation.followupNote ? `<p class="assistant-change-note" role="status">${assistantEscape(operation.followupNote)}</p>` : ''}
            ${assumed}${balanceNotice}${assistantOperationCanExecute(operation) ? '<p class="assistant-note">راجع الملخص ثم اكتب «أكد التسجيل» لإتمام الحفظ. ستبقى المحادثة مفتوحة وتُطبّق قواعد التحقق والحفظ المعتادة.</p>' : ''}
            ${assistantActionButtons(operation, assistantOperationCanExecute(operation))}</div>`
    };
}

function assistantActionButtons(operation, ready) {
    const blockedByFunds = assistantExpenseBalanceInfo(operation)?.fundInsufficient;
    const nextStep = ready
        ? 'اكتب «أكد التسجيل» بعد مراجعة البيانات لإتمام العملية.'
        : blockedByFunds
            ? 'لا يمكن تسجيل هذا المصروف من الصندوق المحدد؛ اذكر صندوقًا آخر أو مبلغًا أقل.'
            : 'أرسل البيانات الناقصة في رسالة تالية، أو اكتب «إلغاء» للتراجع.';
    const formHint = assistantOperationCanOpenForm(operation) ? ' وللمراجعة في شاشة التطبيق اكتب «افتح النموذج».' : '';
    return `<p class="assistant-note assistant-next-step" role="status">${nextStep}${formHint}</p>`;
}

function assistantOperationCanOpenForm(operation) {
    if (!operation) return false;
    if (operation.type === 'adjustment') return Boolean(operation.resident?.id);
    if (operation.type === 'resident_edit') return Boolean(operation.residentId);
    return true;
}

function assistantOperationSuccessHtml(operation) {
    const labels = { income: 'التحصيل', expense: 'المصروف', adjustment: 'الإجراء المالي', resident: 'بيانات الشقة', resident_edit: 'تعديل بيانات الشقة' };
    const kindLabels = { waiver: 'إعفاء', discount: 'تخفيض', settlement: 'تسوية' };
    const typeLabel = labels[operation?.type] || 'العملية';
    const kind = operation?.type === 'adjustment' ? ` (${kindLabels[operation.kind] || 'إجراء'})` : '';
    const target = operation?.type === 'resident_edit'
        ? `${operation.name || '—'} · شقة ${operation.apartmentNumber || '—'}${operation.phone ? ` · ${operation.phone}` : ''}${operation.tenantName ? ` · اسم المستأجر ${operation.tenantName}` : ''}${operation.tenantPhone ? ` · هاتف المستأجر ${operation.tenantPhone}` : ''}${operation.leaseStart ? ` · بداية الإيجار ${operation.leaseStart}` : ''}${operation.leaseEnd ? ` · نهاية الإيجار ${operation.leaseEnd}` : ''}${operation.amount ? ` · اشتراك ${assistantMoney(operation.amount)}` : ''}`
        : operation?.type === 'resident'
        ? `${operation.name || '—'} · شقة ${operation.apartmentNumber || '—'}${operation.phone ? ` · ${operation.phone}` : ''}${operation.amount ? ` · اشتراك ${assistantMoney(operation.amount)}` : ''}`
        : operation?.type === 'expense'
        ? `${operation.title} · ${assistantMoney(operation.amount)} · ${operation.month}`
        : `${assistantResidentName(operation?.resident)} · شقة ${operation?.resident?.apartmentNumber || '—'} · ${assistantMoney(operation?.amount)} · ${operation?.month}`;
    const nextQuery = operation?.type === 'expense' ? 'مصروفات الشهر' : operation?.type === 'resident' || operation?.type === 'resident_edit' ? 'بيانات العمارة' : 'ملخص الشهر';
    return `<div class="assistant-operation-success" role="status">
        <p class="assistant-success-title"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> تم حفظ ${assistantEscape(typeLabel)}${assistantEscape(kind)} بنجاح</p>
        <p class="assistant-success-detail">${assistantEscape(target)}</p>
        <p class="assistant-note">تمت العملية وسجلتها في سجل التدقيق. تقدر تسألني دلوقتي: «${assistantEscape(nextQuery)}» أو «آخر الحركات».</p>
    </div>`;
}

function openAssistantOperation() {
    if (!assistantOperationDraft || assistantIsOwner() || assistantOperationContext) return false;
    const draft = assistantOperationDraft;
    const opener = draft.type === 'income' ? 'openAssistantIncomeDraft'
        : draft.type === 'expense' ? 'openAssistantExpenseDraft'
            : (draft.type === 'resident' || draft.type === 'resident_edit') ? 'openAssistantResidentDraft' : 'openAssistantAdjustmentDraft';
    const openForm = assistantGlobalFunction(opener);
    if (openForm) {
        if (!assistantOperationCanOpenForm(draft)) return false;
        if (!closeAssistantForNavigation()) return false;
        let opened = false;
        try {
            opened = openForm(draft) !== false;
        } catch (error) {
            console.error('Assistant operation form failed to open.', error);
        }
        if (!opened) {
            if (typeof toast === 'function') toast('النموذج مفتحش. كمّل البيانات الناقصة هنا في الشات وجرّب تاني.', 'error');
            openAssistantModal();
            return false;
        }
        startAssistantOperationContext(draft);
        assistantOperationDraft = null;
        return true;
    }
    if (typeof toast === 'function') toast('نموذج العملية مش بيفتح دلوقتي، جرّب تاني.', 'error');
    return false;
}

function assistantOperationSubmitButton(type, mode = 'create') {
    if (typeof document === 'undefined') return null;
    if (type === 'income') return document.getElementById(mode === 'edit' ? 'incomeEditSubmitButton' : 'incomeSubmitButton');
    if (type === 'expense') return document.getElementById('expenseSubmitButton');
    if (type === 'adjustment') return document.getElementById('adjustmentSaveButton');
    if (type === 'resident') return document.querySelector('#residentForm button[type="submit"]');
    return null;
}

function assistantOperationConfirmationLabel(type) {
    if (assistantOperationContext?.action === 'edit') return ({
        income: 'تأكيد تعديل التحصيل عبر عم عبده',
        expense: 'تأكيد تعديل المصروف عبر عم عبده',
        adjustment: 'تأكيد تعديل الإجراء عبر عم عبده',
        resident: 'تأكيد تعديل بيانات الشقة عبر عم عبده'
    })[type] || 'تأكيد التعديل عبر عم عبده';
    return ({
        income: 'تأكيد وتسجيل التحصيل عبر عم عبده',
        expense: 'تأكيد وتسجيل المصروف عبر عم عبده',
        adjustment: 'تأكيد وحفظ الإجراء عبر عم عبده',
        resident: 'تأكيد حفظ بيانات الشقة عبر عم عبده'
    })[type] || 'تأكيد العملية عبر عم عبده';
}

function getAssistantOperationSubmitLabel(type, fallbackLabel) {
    return assistantOperationContext?.type === type
        ? assistantOperationConfirmationLabel(type)
        : fallbackLabel;
}

function startAssistantOperationContext(draft) {
    const type = draft.type === 'resident_edit' ? 'resident' : draft.type;
    const mode = draft.mode || (draft.type === 'resident_edit' ? 'edit' : 'create');
    const action = draft.action || (draft.type === 'resident_edit' ? 'edit' : 'create');
    const resident = draft.type === 'resident_edit'
        ? (Array.isArray(state.residents) ? state.residents : []).find(item => item.id === draft.residentId)
        : null;
    const button = assistantOperationSubmitButton(type, mode);
    const auditHost = typeof globalThis !== 'undefined' ? globalThis : null;
    const originalLogAction = auditHost && typeof auditHost.logAction === 'function' ? auditHost.logAction : null;
    const context = {
        requestId: draft.requestId,
        type,
        action,
        mode,
        recordId: draft.id || draft.residentId || null,
        expectedRecord: draft.expectedRecord || (resident ? JSON.stringify(resident) : null),
        raw: String(draft.raw || ''),
        status: 'ready',
        submitButton: button,
        originalSubmitLabel: button ? button.textContent : null,
        auditHost,
        originalLogAction,
        wrappedLogAction: null
    };
    if (originalLogAction) {
        context.wrappedLogAction = function (actionName, details, ...args) {
            return originalLogAction.call(this, actionName, assistantAuditDetails(details), ...args);
        };
        auditHost.logAction = context.wrappedLogAction;
    }
    assistantOperationContext = context;
    if (button) button.textContent = assistantOperationConfirmationLabel(type);
}

function assistantOperationRequestId(type = null) {
    if (!assistantOperationContext || (type && assistantOperationContext.type !== type)) return null;
    return assistantOperationContext.requestId;
}

function assistantAuditDetails(details) {
    if (!assistantOperationContext) return details;
    const request = String(assistantOperationContext.raw || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240);
    const base = String(details ?? '').trim();
    if (base.includes(`مرجع الطلب: ${assistantOperationContext.requestId}`)) return base;
    return `${base}${base ? ' · ' : ''}المصدر: عم عبده · مرجع الطلب: ${assistantOperationContext.requestId}${request ? ` · طلب المدير: ${request}` : ''}`;
}

function requireAssistantOperationReadyForCommit(type) {
    if (!assistantOperationContext) return true;
    if (!assistantCanWrite() || assistantOperationContext.type !== type) {
        if (typeof toast === 'function') toast('تعذر مطابقة نموذج العملية مع طلب عم عبده. ألغِ النموذج وأعد فتح الطلب الصحيح.', 'error');
        return false;
    }
    if (assistantOperationContext.status === 'saving') {
        if (typeof toast === 'function') toast('العملية بتتحفظ دلوقتي. استنى لحظة لحد ما تخلص.', 'info');
        return false;
    }
    if (assistantOperationContext.status === 'uncertain') {
        if (typeof toast === 'function') toast('نتيجة الحفظ السابق غير مؤكدة. حدّث البيانات وتحقق من سجل التدقيق قبل إعادة المحاولة لتجنب التكرار.', 'error');
        return false;
    }
    if (assistantOperationContext.action === 'edit' && assistantOperationContext.expectedRecord) {
        const recordType = String(type).replace(/_delete$/, '');
        const rows = recordType === 'resident' ? state.residents
            : recordType === 'income' ? state.income
                : recordType === 'expense' ? state.expenses : state.adjustments;
        const current = (Array.isArray(rows) ? rows : []).find(item => item.id === assistantOperationContext.recordId);
        if (!current || JSON.stringify(current) !== assistantOperationContext.expectedRecord) {
            assistantOperationContext.status = 'uncertain';
            if (typeof toast === 'function') toast('تغير السجل منذ فتح نموذج التعديل. لن أحفظ نسخة قديمة؛ حدّث البيانات وافتح التعديل من جديد.', 'error');
            return false;
        }
    }
    return true;
}

function beginAssistantOperationCommit(type) {
    if (!requireAssistantOperationReadyForCommit(type)) return false;
    if (!assistantOperationContext) return null;
    assistantOperationContext.status = 'saving';
    return assistantOperationContext.requestId;
}

function markAssistantOperationSaveUncertain(requestId) {
    if (assistantOperationContext?.requestId === requestId) assistantOperationContext.status = 'uncertain';
}

function completeAssistantOperation(requestId = null) {
    if (!assistantOperationContext || (requestId && assistantOperationContext.requestId !== requestId)) return false;
    const context = assistantOperationContext;
    assistantOperationContext = null;
    if (context.submitButton && context.originalSubmitLabel !== null) {
        context.submitButton.textContent = context.originalSubmitLabel;
    }
    if (context.auditHost && context.wrappedLogAction && context.auditHost.logAction === context.wrappedLogAction) {
        context.auditHost.logAction = context.originalLogAction;
    }
    return true;
}

function clearAssistantOperationContext() {
    if (assistantOperationContext && assistantOperationContext.status !== 'ready') {
        const context = assistantOperationContext;
        if (context.submitButton && context.originalSubmitLabel !== null) {
            context.submitButton.textContent = context.originalSubmitLabel;
        }
        context.submitButton = null;
        context.originalSubmitLabel = null;
        return true;
    }
    return completeAssistantOperation();
}

async function confirmAssistantOperation() {
    if (!assistantOperationDraft || !assistantCanWrite()) return false;
    const draft = assistantOperationDraft;
    if (!assistantOperationCanExecute(draft)) {
        if (typeof toast === 'function') toast(`لسه ناقص: ${assistantOperationMissing(draft).join(' و')}.`, 'error');
        return false;
    }
    const openerName = draft.type === 'income' ? 'openAssistantIncomeDraft'
        : draft.type === 'expense' ? 'openAssistantExpenseDraft'
            : (draft.type === 'resident' || draft.type === 'resident_edit') ? 'openAssistantResidentDraft' : 'openAssistantAdjustmentDraft';
    const handlerName = draft.type === 'income' ? 'handleIncomeSubmit'
        : draft.type === 'expense' ? 'handleExpenseSubmit'
            : (draft.type === 'resident' || draft.type === 'resident_edit') ? 'handleResidentSubmit' : 'handleAdjustmentSubmit';
    const openForm = assistantGlobalFunction(openerName);
    const submitForm = assistantGlobalFunction(handlerName);
    if (!openForm || !submitForm) {
        if (typeof toast === 'function') toast('الحفظ مش شغال دلوقتي. افتح النموذج وجرّب تاني.', 'error');
        return false;
    }
    const collectionBefore = Array.isArray(state.income) ? state.income.length : 0;
    const expenseBefore = Array.isArray(state.expenses) ? state.expenses.length : 0;
    const adjustmentBefore = Array.isArray(state.adjustments) ? state.adjustments.length : 0;
    const residentBefore = Array.isArray(state.residents) ? state.residents.length : 0;
    const residentSnapshotBefore = JSON.stringify(state.residents || []);
    if (assistantOperationContext) {
        if (typeof toast === 'function') toast('فيه عملية تانية لسه مستنية. كمّلها أو الغيها قبل ما تأكد.', 'error');
        return false;
    }
    const contextDraft = draft.type === 'resident_edit'
        ? { ...draft, type: 'resident', id: draft.residentId, mode: 'edit', action: 'edit' }
        : draft;
    startAssistantOperationContext(contextDraft);
    assistantOperationDraft = null;
    const balanceInfo = assistantExpenseBalanceInfo(draft);
    const toastHost = typeof globalThis !== 'undefined' ? globalThis : null;
    const originalToast = toastHost && typeof toastHost.toast === 'function' ? toastHost.toast : null;
    const validationMessages = [];
    if (originalToast) {
        toastHost.toast = (message, type) => {
            if (type === 'error') validationMessages.push(String(message || ''));
            return originalToast.call(toastHost, message, type);
        };
    }
    try {
        if (openForm(draft, {
            showModal: false,
            confirmMainOverdraft: Boolean(balanceInfo?.mainOverdraft)
        }) === false) throw new Error('assistant form could not be prepared');
        await submitForm({ preventDefault() {}, assistantFromChat: true });
    } catch (error) {
        assistantOperationDraft = draft;
        if (assistantOperationContext?.requestId === draft.requestId && assistantOperationContext.status === 'ready') {
            clearAssistantOperationContext();
        }
        if (typeof toast === 'function') toast('مقدرتش أشغّل الحفظ؛ لم تُسجل العملية.', 'error');
        const detail = validationMessages[validationMessages.length - 1];
        appendAssistantOperationFailure(`مقدرتش أشغّل الحفظ${detail ? `: ${String(detail).replace(/\.+$/, '')}` : ''}. العملية متسجلتش. المسودة لسه موجودة وتقدر تجرّب تاني.`);
        return false;
    } finally {
        if (originalToast) toastHost.toast = originalToast;
    }
    const collectionAfter = Array.isArray(state.income) ? state.income.length : 0;
    const expenseAfter = Array.isArray(state.expenses) ? state.expenses.length : 0;
    const adjustmentAfter = Array.isArray(state.adjustments) ? state.adjustments.length : 0;
    const residentAfter = Array.isArray(state.residents) ? state.residents.length : 0;
    const residentChanged = JSON.stringify(state.residents || []) !== residentSnapshotBefore;
    const saved = draft.type === 'income' ? collectionAfter > collectionBefore
        : draft.type === 'expense' ? expenseAfter > expenseBefore
            : (draft.type === 'resident' || draft.type === 'resident_edit') ? (draft.type === 'resident' ? residentAfter > residentBefore : residentChanged)
                : adjustmentAfter > adjustmentBefore;
    if (!saved) {
        assistantOperationDraft = draft;
        if (assistantOperationContext?.requestId === draft.requestId && assistantOperationContext.status === 'ready') {
            clearAssistantOperationContext();
        }
    }
    if (!saved) {
        if (typeof toast === 'function') toast('العملية متسجلتش. راجع الرسالة اللي ظهرت أو عدّل التفاصيل.', 'error');
        const detail = validationMessages[validationMessages.length - 1];
        appendAssistantOperationFailure(`العملية متسجلتش${detail ? `: ${String(detail).replace(/\.+$/, '')}` : ''}. عدّل التفاصيل هنا أو افتح النموذج وراجعها.`);
    }
    if (saved) {
        assistantMarkOperationDraftCompleted();
        appendAssistantMessage('bot', assistantOperationSuccessHtml(draft));
    }
    return saved;
}
function appendAssistantOperationFailure(message) {
    appendAssistantMessage('bot', `<p class="assistant-note">${assistantEscape(message)}</p>`);
}
function assistantMarkOperationDraftCompleted() {
    const completedNote = `<p class="assistant-note assistant-next-step" role="status">تم تنفيذ العملية بعد تأكيدك.</p>`;
    const actionPattern = /<p class="assistant-note assistant-next-step" role="status">[\s\S]*?<\/p>/;
    for (let index = assistantChat.length - 1; index >= 0; index -= 1) {
        const message = assistantChat[index];
        if (message.role === 'bot' && actionPattern.test(message.html)) {
            message.html = message.html.replace(actionPattern, completedNote);
            break;
        }
    }
    persistAssistantChat();
    const log = document.getElementById('assistantLog');
    const steps = log?.querySelectorAll('.assistant-action-preview .assistant-next-step');
    const lastStep = steps && steps.length ? steps[steps.length - 1] : null;
    if (lastStep) lastStep.outerHTML = completedNote;
}

function cancelAssistantOperation(options = {}) {
    const context = assistantOperationContext;
    if (context && context.status !== 'ready') {
        if (!options.silent && typeof toast === 'function') {
            toast('لا يمكن إلغاء تأكيد جارٍ أو نتيجته غير مؤكدة. حدّث البيانات وتحقق من سجل التدقيق أولًا.', 'error');
        }
        return false;
    }
    assistantOperationDraft = null;
    if (context) {
        const modalId = ({ income: 'incomeModal', expense: 'expenseModal', adjustment: 'adjustmentModal', resident: 'residentModal' })[context.type];
        completeAssistantOperation(context.requestId);
        if (modalId && typeof closeModal === 'function') closeModal(modalId);
    }
    if (!options.silent && typeof toast === 'function') toast('تمام، لغيت المسودة.', 'info');
    return true;
}

function assistantApartmentLabel(resident) {
    const raw = String(resident?.apartmentNumber ?? '').trim();
    return raw ? `شقة ${raw}` : 'شقة بدون رقم';
}

function assistantResidentName(resident) {
    return String(resident?.name || 'مالك محذوف');
}

function detectAssistantResponseMode(normalized) {
    if (/(?:مختصر|سريع|الخلاصه|الخلاصة|باختصار)/.test(normalized)) return 'brief';
    if (/(?:مفصل|مفصلة|مفصله|مفلص|تفصيل|تفاصيل|تفصيلي|بند بند)/.test(normalized)) return 'detailed';
    return 'summary';
}

function detectAssistantExpenseCategory(normalized) {
    /** @type {Array<[string, RegExp]>} */
    const categories = [
        ['كهرباء', /(?:كهرب|نور|عداد كهرب)/],
        ['مياه', /(?:ميه|مياه|عداد ميه)/],
        ['نظافة', /(?:نضافه|نظافه|نظافة|نظاف|نظف)/],
        ['صيانة', /(?:صيانه|صيانة|تصليح|اسانسير|أسانسير)/],
        ['حراسة', /(?:حراسه|حراسة|بواب|امن|أمن)/]
    ];
    return categories.find(([, pattern]) => pattern.test(normalized))?.[0] || null;
}

function buildAssistantResponseOptions(rawText, intent) {
    const normalized = normalizeAssistantArabic(rawText || '');
    const expenseCategory = intent === 'expenses' ? detectAssistantExpenseCategory(normalized) : null;
    const responseMode = detectAssistantResponseMode(normalized);
    return {
        responseMode: expenseCategory && responseMode === 'summary' ? 'detailed' : responseMode,
        expenseCategory
    };
}

function buildAssistantIncomeAnswer(period, options = {}) {
    const snapshot = getAssistantIncomeSnapshot(period.months);
    const rows = (Array.isArray(state.income) ? state.income : [])
        .filter(row => !period.months?.length || period.months.includes(row.month))
        .slice()
        .sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime());
    const title = `تحصيل ${period.label}${options.responseMode === 'detailed' ? ' · تفاصيل' : ''}`;
    let html = '';
    html += assistantRow('إجمالي التحصيل', assistantMoney(snapshot.total), snapshot.total > 0 ? 'good' : '');
    html += assistantRow('اشتراكات شهرية', assistantMoney(snapshot.subscriptionTotal));
    if (snapshot.settlementTotal > 0) html += assistantRow('دفعات تسوية', assistantMoney(snapshot.settlementTotal));
    html += assistantRow('أغراض أخرى', assistantMoney(snapshot.otherTotal));
    html += assistantRow('عدد الدفعات', assistantNumber(snapshot.count));
    if (options.responseMode === 'detailed' && rows.length) {
        html += assistantList(rows.slice(0, 8).map(row => {
            const resident = (Array.isArray(state.residents) ? state.residents : []).find(item => item.id === row.residentId);
            const date = row.date ? ` · ${assistantDateLabel(row.date)}` : '';
            const method = row.paymentMethod ? ` · ${row.paymentMethod}` : '';
            return `${assistantEscape(resident ? assistantResidentName(resident) : 'دفعة')}${date}${method} — <strong>${assistantEscape(assistantMoney(row.amount))}</strong>`;
        }));
    } else if (options.responseMode !== 'brief' && snapshot.purposes.length) {
        html += assistantList(snapshot.purposes.slice(0, 4).map(item =>
            `${assistantEscape(item.label)} — <strong>${assistantEscape(assistantMoney(item.cents / 100))}</strong>`
        ));
    } else if (!snapshot.count) {
        html += assistantNote('مفيش تحصيلات مسجلة في الفترة دي.');
    }
    html += assistantNote(options.responseMode === 'brief'
        ? 'ده ملخص سريع للتحصيل؛ اطلب «تقرير مفصل عن المدفوع» لعرض الدفعات واحدة واحدة.'
        : 'الاشتراكات منفصلة عن التحصيلات الأخرى، والملاحظات التفصيلية موجودة في سجل التحصيل.');
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
function buildAssistantExpensesAnswer(period, options = {}) {
    const snapshot = getAssistantExpenseSnapshot(period.months);
    const category = options.expenseCategory;
    const rows = category
        ? snapshot.rows.filter(row => normalizeAssistantArabic(`${row.category || ''} ${row.title || ''}`).includes(normalizeAssistantArabic(category)))
        : snapshot.rows;
    const totalCents = rows.reduce((sum, row) => sum + (typeof toCents === 'function' ? toCents(row.amount) : Math.round((Number(row.amount) || 0) * 100)), 0);
    const title = `${category ? `مصروف ${category}` : 'مصروفات'} ${period.label}${options.responseMode === 'detailed' ? ' · تفاصيل' : ''}`;
    let html = '';
    html += assistantRow('إجمالي المصروفات', assistantMoney(totalCents / 100), totalCents > 0 ? 'bad' : '');
    html += assistantRow('عدد المصروفات', assistantNumber(rows.length));
    if (options.responseMode === 'detailed' && rows.length) {
        html += assistantList(rows.slice().sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime()).slice(0, 8).map(row => {
            const label = row.title || row.category || 'مصروف';
            const date = row.date ? ` · ${assistantDateLabel(row.date)}` : '';
            return `${assistantEscape(label)}${date} — <strong>${assistantEscape(assistantMoney(row.amount))}</strong>`;
        }));
    } else if (options.responseMode !== 'brief' && !category && snapshot.categories.length) {
        html += assistantList(snapshot.categories.slice(0, 4).map(item =>
            `${assistantEscape(item.label)} — <strong>${assistantEscape(assistantMoney(item.cents / 100))}</strong>`
        ));
    } else if (!rows.length) {
        html += assistantNote('مفيش مصروفات مسجلة في الفترة دي.');
    }
    html += assistantNote(options.responseMode === 'brief'
        ? 'ده ملخص سريع للمصروفات؛ اطلب «تقرير مفصل عن المصروفات» لعرض البنود والتواريخ.'
        : 'المصروفات تشمل كل الصناديق، والتفاصيل الكاملة في قسم المصروفات والتقارير.');
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
/** Morning brief for the manager: this month's collection, late apartments, reminders ready and the cash total. Read-only, computed locally. */
function buildAssistantMorningBriefAnswer(now = new Date()) {
    const monthLabel = getAssistantNowLabel(now);
    const summary = getAssistantMonthSummary({ type: 'month', label: monthLabel, months: [monthLabel] }, now);
    const cash = getAssistantCashSnapshot();
    const arrears = getAssistantArrearsSnapshot();
    const lateWithPhone = arrears.residents.filter(item => String(item.resident?.phone || '').replace(/\D/g, '')).length;
    const name = String(state.managerName || '').trim();
    let html = `<p class="assistant-answer-subtitle">${assistantEscape(name ? 'صباح الخير ' + assistantGreetingNameRaw(name) : 'صباح الخير')} · ${assistantEscape(monthLabel)}</p>`;
    html += assistantRow('محصّل من المستحق هذا الشهر', `${assistantMoney(summary.paidDueTotal)} من ${assistantMoney(summary.dueTotal)}`, summary.unpaidUnits > 0 ? 'warn' : 'good');
    html += assistantRow('شقق لم تسدد هذا الشهر', assistantNumber(summary.unpaidUnits), summary.unpaidUnits > 0 ? 'warn' : 'good');
    html += assistantRow('المتأخرات (بعد فترة السماح)', arrears.overdueResidents > 0 ? `${assistantMoney(arrears.totalDebt)} · ${assistantNumber(arrears.overdueResidents)} شقة` : 'لا يوجد', arrears.overdueResidents > 0 ? 'bad' : 'good');
    html += assistantRow('إجمالي السيولة', assistantMoney(cash.total), cash.total >= 0 ? 'good' : 'bad');
    const upcoming = getAssistantUpcomingDuesSnapshot(now);
    if (upcoming.items.length) html += assistantRow('هتستحق خلال ٧ أيام', `${assistantMoney(upcoming.total)} · ${assistantNumber(upcoming.items.length)} شقة`, 'warn');
    if (arrears.overdueResidents > 0) {
        html += assistantNote(lateWithPhone > 0
            ? `${assistantNumber(lateWithPhone)} من المتأخرين عندهم رقم تليفون. اكتب «ذكّر المتأخرين» وأفتحلك قائمة التذكيرات.`
            : 'المتأخرين ملهمش أرقام تليفون مسجلة. ضيف الأرقام في بيانات الشقق عشان التذكير يشتغل.');
    }
    return { id: 'morning_brief', title: 'ملخص اليوم', html };
}

let assistantMorningBriefDay = '';

/** Shows the brief once per day the first time the manager opens the chat. */
function maybeAppendAssistantMorningBrief(now = new Date()) {
    if (!assistantCanWrite()) return false;
    const day = now.toISOString().slice(0, 10);
    if (assistantMorningBriefDay === day) return false;
    if (!Array.isArray(state.residents) || !state.residents.length) return false;
    assistantMorningBriefDay = day;
    const answer = buildAssistantMorningBriefAnswer(now);
    appendAssistantMessage('bot', assistantAnswerHtml(answer), null, { answerId: answer.id, source: 'local' });
    return true;
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
            return `${assistantEscape(assistantApartmentLabel(item.resident))} · ${assistantEscape(assistantResidentName(item.resident))} — <strong>${assistantEscape(assistantMoney(item.totalDebt))}</strong> (${assistantMonthsCount(item.count)}${oldest ? ` · أقدم: ${assistantEscape(oldest)}` : ''})`;
        }));
    } else {
        html += assistantNote('تمام! مفيش أي متأخرات مسجلة حاليًا.');
    }
    html += assistantNote('المتأخرات محسوبة من الاشتراكات المستحقة بعد خصم المدفوع والإعفاءات، وليس من إجمالي المصروفات.');
    return { id: 'arrears', title, html };
}

const ASSISTANT_UPCOMING_WINDOW_DAYS = 7;

/** Apartments that still owe a month which is not overdue yet (due within the window, or inside the grace period). */
function getAssistantUpcomingDuesSnapshot(now = new Date(), windowDays = ASSISTANT_UPCOMING_WINDOW_DAYS) {
    const names = getAssistantMonthNames();
    const labels = [0, 1].map(offset => {
        const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        return `${names[d.getMonth()]} ${d.getFullYear()}`;
    });
    const dayMs = 86400000;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const limit = today.getTime() + windowDays * dayMs;
    const residents = Array.isArray(state.residents) ? state.residents : [];
    const items = [];
    labels.forEach(label => {
        const dueDate = typeof getSubscriptionDueDate === 'function' ? getSubscriptionDueDate(label) : null;
        if (!dueDate) return;
        const overdue = typeof isSubscriptionMonthOverdue === 'function' ? isSubscriptionMonthOverdue(label, now) : false;
        if (overdue || dueDate.getTime() > limit) return;
        const daysLeft = Math.round((dueDate.getTime() - today.getTime()) / dayMs);
        residents.forEach(resident => {
            const outstanding = typeof getMonthOutstanding === 'function' ? Number(getMonthOutstanding(resident, label)) || 0 : 0;
            if (outstanding > 0) items.push({ resident, month: label, outstanding, daysLeft, dueDate });
        });
    });
    items.sort((a, b) => a.daysLeft - b.daysLeft || b.outstanding - a.outstanding);
    return {
        items,
        total: items.reduce((sum, item) => sum + Math.round(item.outstanding * 100), 0) / 100,
        windowDays
    };
}

function assistantDaysLeftLabel(daysLeft) {
    if (daysLeft < 0) return 'في فترة السماح';
    if (daysLeft === 0) return 'يستحق اليوم';
    if (daysLeft === 1) return 'يستحق بكرة';
    return `يستحق بعد ${assistantNumber(daysLeft)} أيام`;
}

function buildAssistantUpcomingDuesAnswer(now = new Date()) {
    const snapshot = getAssistantUpcomingDuesSnapshot(now);
    let html = '';
    if (!snapshot.items.length) {
        html += assistantNote(`مفيش اشتراكات هتستحق خلال ${assistantNumber(snapshot.windowDays)} أيام ولسه ما اتسددتش.`);
        return { id: 'upcoming_dues', title: 'الاستحقاقات القادمة', html };
    }
    html += assistantRow('شقق هتستحق قريب', assistantNumber(snapshot.items.length), 'warn');
    html += assistantRow('إجمالي المبالغ', assistantMoney(snapshot.total));
    html += assistantList(snapshot.items.slice(0, 6).map(item =>
        `${assistantEscape(assistantApartmentLabel(item.resident))} · ${assistantEscape(assistantResidentName(item.resident))} — <strong>${assistantEscape(assistantMoney(item.outstanding))}</strong> (${assistantEscape(item.month)} · ${assistantEscape(assistantDaysLeftLabel(item.daysLeft))})`));
    if (snapshot.items.length > 6) html += assistantNote(`و${assistantNumber(snapshot.items.length - 6)} شقق أخرى.`);
    html += assistantNote('دي شقق لسه ما تأخرتش بعد فترة السماح. التذكير المبكر بيقلل المتأخرات.');
    return { id: 'upcoming_dues', title: 'الاستحقاقات القادمة', html };
}

function buildAssistantManagerTasksAnswer(period) {
    const summary = getAssistantMonthSummary(period);
    const arrears = getAssistantArrearsSnapshot();
    const title = `قائمة متابعة المدير · ${period.label}`;
    let html = '<p class="assistant-answer-subtitle">ابدأ بالأولوية الأعلى ثم راجع العملية قبل تسجيلها</p>';
    html += assistantRow('أولوية المتابعة', assistantNumber(arrears.overdueResidents), arrears.overdueResidents ? 'warn' : 'good');
    html += assistantRow(`غير محصل ${summary.month}`, assistantMoney(summary.outstandingTotal), summary.outstandingTotal ? 'warn' : 'good');
    if (arrears.residents.length) {
        html += '<p class="assistant-answer-subtitle">اتصالات التحصيل المقترحة</p>';
        html += assistantList(arrears.residents.slice(0, 5).map((item, index) => {
            const resident = item.resident || {};
            const oldest = item.oldestMonth || (Array.isArray(item.unpaidMonths) ? item.unpaidMonths[0] : '');
            const oldestLabel = oldest && typeof oldest === 'object' ? oldest.month : oldest;
            return `${assistantEscape(`${index + 1}. اتصل بـ ${assistantResidentName(resident)} · ${assistantApartmentLabel(resident)}`)} — <strong>${assistantEscape(assistantMoney(item.totalDebt))}</strong>${oldestLabel ? ` · أقدم ${assistantEscape(oldestLabel)}` : ''}`;
        }));
    } else if (summary.unpaid.length) {
        html += '<p class="assistant-answer-subtitle">تحصيلات الشهر المقترحة</p>';
        html += assistantList(summary.unpaid.slice(0, 5).map((item, index) =>
            `${assistantEscape(`${index + 1}. راجع ${assistantResidentName(item.resident)} · ${assistantApartmentLabel(item.resident)}`)} — <strong>${assistantEscape(assistantMoney(item.outstanding))}</strong>`
        ));
    } else {
        html += assistantNote('مفيش متابعة مالية عاجلة ظاهرة من السجلات الحالية.');
    }
    html += assistantNote('الترتيب حسب أعلى مبلغ مستحق مسجل. القائمة اقتراح للمراجعة وليست إرسالًا تلقائيًا أو تسجيلًا لعملية.');
    html += assistantNote('لو عايز تفاصيل أوسع، اكتب «تقرير المتأخرات» أو «ملخص الشهر».');
    return { id: 'manager_tasks', title, html };
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

function buildAssistantResidentAnswer(resident, now = new Date(), period = null) {
    const monthLabel = period && period.type === 'month' && period.label
        ? period.label
        : (period && Array.isArray(period.months) && period.months.length === 1 ? period.months[0] : '');
    const snapshot = getAssistantResidentSnapshot(resident, now, monthLabel);
    const title = `${assistantApartmentLabel(resident)} · ${assistantResidentName(resident)}${monthLabel ? ` · ${monthLabel}` : ''}`;
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


function assistantResidentById(id) {
    return (Array.isArray(state.residents) ? state.residents : []).find(item => item.id === id) || null;
}

function assistantPaymentLine(payment, withName = false) {
    const dateLabel = assistantDateLabel(payment.date);
    const method = typeof getIncomePaymentMethodLabel === 'function' ? getIncomePaymentMethodLabel(payment.paymentMethod) : 'نقدًا';
    const who = withName ? `${assistantEscape(assistantResidentName(assistantResidentById(payment.residentId) || {}) || 'مالك')} · ` : '';
    return `${who}${assistantEscape(payment.month || '')}${dateLabel ? ` · ${assistantEscape(dateLabel)}` : ''} — <strong>${assistantEscape(assistantMoney(payment.amount))}</strong> · ${assistantEscape(String(method))}`;
}

// Receipts of one resident, newest first. Every number comes from the saved payments.
function buildAssistantResidentReceiptsAnswer(resident, period) {
    const allowed = period && period.type === 'month' && Array.isArray(period.months) ? new Set(period.months) : null;
    const payments = (Array.isArray(state.income) ? state.income : [])
        .filter(payment => payment.residentId === resident.id)
        .filter(payment => !allowed || allowed.has(String(payment.month || '')))
        .slice()
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    const title = `إيصالات ${assistantApartmentLabel(resident)} · ${assistantResidentName(resident)}${allowed ? ` · ${period.label}` : ''}`;
    if (!payments.length) {
        return { id: 'resident_receipts', title, html: assistantNote(`مفيش دفعات مسجلة${allowed ? ' في الشهر ده' : ''} لـ ${assistantEscape(assistantResidentName(resident))}.`) };
    }
    const totalCents = payments.reduce((sum, payment) => sum + assistantCents(payment.amount), 0);
    let html = assistantRow('عدد الإيصالات', assistantNumber(payments.length));
    html += assistantRow('إجمالي المدفوع', assistantMoney(totalCents / 100), 'good');
    html += assistantList(payments.slice(0, 6).map(payment => assistantPaymentLine(payment)));
    if (payments.length > 6) html += assistantNote(`وفي ${assistantNumber(payments.length - 6)} إيصالات أقدم في سجل المالك.`);
    return { id: 'resident_receipts', title, html };
}

// What was recorded today (device date). Never guesses: no rows means "nothing recorded yet".
/** Day window for "النهارده / امبارح / الاسبوع ده": exact dates from the saved rows, never a whole month. */
function parseAssistantDayWindow(rawText, now = new Date()) {
    const normalized = normalizeAssistantArabic(rawText || '');
    const startOfDay = (offset = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset).getTime();
    if (/امبارح/.test(normalized)) return { key: 'yesterday', word: 'امبارح', start: startOfDay(-1), end: startOfDay(0) };
    if (/(?:الاسبوع (?:ده|دا|الحالي)|اخر (?:7|سبعه) ايام)/.test(normalized)) return { key: 'week', word: 'آخر 7 أيام', start: startOfDay(-6), end: startOfDay(1) };
    return { key: 'today', word: 'النهارده', start: startOfDay(0), end: startOfDay(1) };
}

function buildAssistantTodayIncomeAnswer(now = new Date(), rawText = '') {
    const window = parseAssistantDayWindow(rawText, now);
    const inWindow = value => {
        const time = new Date(value || 0).getTime();
        return time >= window.start && time < window.end;
    };
    const rows = (Array.isArray(state.income) ? state.income : []).filter(payment => inWindow(payment.date));
    const title = `تحصيل ${window.word}`;
    if (!rows.length) return { id: 'today_income', title, html: assistantNote(window.key === 'today' ? 'لسه مفيش تحصيل متسجل النهارده.' : `مفيش تحصيل متسجل ${window.key === 'week' ? 'في آخر 7 أيام' : window.word}.`) };
    const totalCents = rows.reduce((sum, payment) => sum + assistantCents(payment.amount), 0);
    let html = assistantRow(`إجمالي ${window.word}`, assistantMoney(totalCents / 100), 'good');
    html += assistantRow('عدد الدفعات', assistantNumber(rows.length));
    html += assistantList(rows.slice(0, 6).map(payment => assistantPaymentLine(payment, true)));
    if (rows.length > 6) html += assistantNote(`وفي ${assistantNumber(rows.length - 6)} دفعات تانية في نفس الفترة.`);
    return { id: 'today_income', title, html };
}

function buildAssistantWindowExpensesAnswer(now = new Date(), rawText = '') {
    const window = parseAssistantDayWindow(rawText, now);
    const rows = (Array.isArray(state.expenses) ? state.expenses : []).filter(row => {
        const time = new Date(row.date || 0).getTime();
        return time >= window.start && time < window.end;
    });
    const title = `مصروفات ${window.word}`;
    if (!rows.length) return { id: 'window_expenses', title, html: assistantNote(`مفيش مصروفات متسجلة ${window.key === 'week' ? 'في آخر 7 أيام' : window.word}.`) };
    const totalCents = rows.reduce((sum, row) => sum + assistantCents(row.amount), 0);
    let html = assistantRow(`إجمالي ${window.word}`, assistantMoney(totalCents / 100), 'bad');
    html += assistantRow('عدد المصروفات', assistantNumber(rows.length));
    html += assistantList(rows.slice(0, 6).map(row => `${assistantEscape(row.title || row.category || 'مصروف')} — <strong>${assistantEscape(assistantMoney(row.amount))}</strong>`));
    return { id: 'window_expenses', title, html };
}


// Late apartments reminded 3+ days ago with nothing paid since. Numbers come from the saved reminders and payments.
function buildAssistantReminderFollowUpAnswer(now = new Date()) {
    const title = 'متابعة التذكيرات';
    if (typeof buildArrearsReport !== 'function' || typeof getArrearsFollowUps !== 'function') {
        return { id: 'reminder_followup', title, html: assistantNote('متابعة التذكيرات مش متاحة دلوقتي.') };
    }
    const report = buildArrearsReport({});
    const followUps = getArrearsFollowUps(report, now);
    if (!followUps.length) {
        const reminded = (report.residents || []).filter(item => getArrearsReminderStatus(item.resident?.id, now).kind !== 'none').length;
        return {
            id: 'reminder_followup',
            title,
            html: assistantNote(reminded
                ? `مفيش حد محتاج متابعة دلوقتي. اتذكّر ${assistantNumber(reminded)} شقة ولسه الفترة قصيرة أو دفعوا جزء.`
                : 'لسه ما بعتّش تذكير لحد من المتأخرين، فمفيش متابعة.')
        };
    }
    const lines = followUps.slice(0, 6).map(({ item, status }) =>
        `${assistantEscape(assistantApartmentLabel(item.resident))} · ${assistantEscape(assistantResidentName(item.resident))} — اتذكّر ${assistantEscape(arrearsReminderDaysLabel(status.days))} ولسه ما دفعش، عليه <strong>${assistantEscape(assistantMoney(item.totalDebt))}</strong>`);
    let html = assistantRow('محتاجين متابعة', assistantNumber(followUps.length), 'warn');
    html += assistantList(lines);
    if (followUps.length > 6) html += assistantNote(`وفي ${assistantNumber(followUps.length - 6)} تانيين في قايمة التذكيرات.`);
    html += assistantNote('افتح قايمة التذكيرات وهتلاقي زرار «تذكير تاني» جنب كل واحد.');
    return { id: 'reminder_followup', title, html };
}

/** "متأخر أكتر من 3 شهور": the number of unpaid months, or null when the question names none. */
function parseAssistantAgedMonths(normalized) {
    const text = String(normalized || '');
    if (!/(?:متاخر|متاخرين|متاخرات|مديون|مش دافع|مدفعش|ما دفعش|مدفعوش)/.test(text)) return null;
    if (!/(?:اكتر من|اكثر من|فوق|يزيد عن|زياده عن|من)\s*(?:\d+|شهر|شهرين|تلات|ثلاث|اربع|خمس|ست)/.test(text) && !/(?:\d+|شهرين|تلات|ثلاث|اربع|خمس|ست)\s*(?:شهور|اشهر|شهر)?\s*(?:او اكتر|فاكتر|فاكثر|واكتر)/.test(text)) return null;
    const words = { شهرين: 2, تلات: 3, ثلاث: 3, اربع: 4, خمس: 5, ست: 6 };
    const digits = text.match(/(\d+)\s*(?:شهور|اشهر|شهر)?/);
    if (digits) return Math.min(Math.max(Number(digits[1]), 1), 36);
    for (const [word, value] of Object.entries(words)) if (text.includes(word)) return value;
    if (/شهر/.test(text)) return 1;
    return null;
}

function buildAssistantAgedArrearsAnswer(minMonths) {
    const snapshot = getAssistantArrearsSnapshot();
    const title = `متأخرين ${assistantNumber(minMonths)} شهور فأكتر`;
    const aged = snapshot.residents.filter(item => (Number(item.count) || 0) >= minMonths)
        .sort((a, b) => (b.count - a.count) || (b.totalDebt - a.totalDebt));
    if (!aged.length) {
        return { id: 'arrears_aged', title, html: assistantNote(snapshot.overdueResidents
            ? `مفيش حد متأخر ${assistantNumber(minMonths)} شهور فأكتر يا باشا. المتأخرين دلوقتي ${assistantNumber(snapshot.overdueResidents)} شقة، بس أقل من كده.`
            : 'مفيش أي متأخرات مسجلة دلوقتي يا باشا.') };
    }
    const total = aged.reduce((sum, item) => sum + Math.round((Number(item.totalDebt) || 0) * 100), 0) / 100;
    let html = assistantRow('شقق متأخرة ' + assistantNumber(minMonths) + ' شهور فأكتر', assistantNumber(aged.length), 'bad');
    html += assistantRow('إجمالي مديونيتهم', assistantMoney(total), 'bad');
    html += assistantList(aged.slice(0, 6).map(item =>
        `${assistantEscape(assistantApartmentLabel(item.resident))} · ${assistantEscape(assistantResidentName(item.resident))} — متأخر ${assistantMonthsCount(item.count)}، عليه <strong>${assistantEscape(assistantMoney(item.totalDebt))}</strong>`));
    if (aged.length > 6) html += assistantNote(`وفي ${assistantNumber(aged.length - 6)} تانيين في تقرير المتأخرات.`);
    html += assistantNote('الأرقام من الاشتراكات المستحقة بعد خصم المدفوع والإعفاءات.');
    return { id: 'arrears_aged', title, html };
}

/** Who paid this month and how much of the due amount is collected, from the same month engine as the summary. */
function buildAssistantCollectionStatusAnswer(period, now = new Date()) {
    const summary = getAssistantMonthSummary(period, now);
    const title = `موقف التحصيل · ${summary.month}`;
    if (!(summary.dueTotal > 0)) {
        return { id: 'collection_status', title, html: assistantNote('مفيش اشتراكات مستحقة مسجلة للفترة دي يا باشا.') };
    }
    const collectable = summary.paidDueTotal + summary.outstandingTotal;
    const rate = collectable > 0 ? Math.round((summary.paidDueTotal / collectable) * 100) : 100;
    let html = assistantRow('نسبة التحصيل', `${assistantNumber(rate)}٪`, rate >= 90 ? 'good' : rate >= 60 ? 'warn' : 'bad');
    html += assistantRow('اتدفع من المستحق', assistantMoney(summary.paidDueTotal), 'good');
    html += assistantRow('لسه متبقي', assistantMoney(summary.outstandingTotal), summary.outstandingTotal > 0 ? 'warn' : 'good');
    html += assistantRow('شقق سددت كامل', assistantNumber(summary.paidUnits), 'good');
    if (summary.partialUnits) html += assistantRow('شقق دفعت جزء', assistantNumber(summary.partialUnits), 'warn');
    html += assistantRow('شقق لسه ما دفعتش', assistantNumber(summary.unpaidUnits - summary.partialUnits), summary.unpaidUnits - summary.partialUnits > 0 ? 'bad' : 'good');
    const pending = summary.unpaid.slice(0, 6);
    if (pending.length) {
        html += assistantList(pending.map(item =>
            `${assistantEscape(assistantApartmentLabel(item.resident))} · ${assistantEscape(assistantResidentName(item.resident))} — باقي <strong>${assistantEscape(assistantMoney(item.outstanding))}</strong>`));
        if (summary.unpaid.length > 6) html += assistantNote(`وفي ${assistantNumber(summary.unpaid.length - 6)} تانيين في تقرير المتأخرات.`);
    } else {
        html += assistantNote('تمام يا باشا، كل الشقق سددت المستحق عليها.');
    }
    html += assistantNote('النسبة = المدفوع ÷ (المدفوع + المتبقي) بعد الإعفاءات. مش بتحسب الأغراض التانية زي التطوير.');
    return { id: 'collection_status', title, html };
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
    html += assistantNote('الإعفاءات والتخفيضات بتخصم من المستحق الشهري ومش بتتحسب كتحصيل نقدي. التسوية اتفاق سداد مش إعفاء؛ دفعاتها بتتسجل كتحصيل.');
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
    // Registered apartments are not the building capacity: say which number this is.
    const capacity = (Number(state.floorCount) || 0) * (Number(state.apartmentsPerFloor) || 0);
    html += assistantRow('شقق مسجلة في التطبيق', capacity > residents.length
        ? `${assistantNumber(residents.length)} من ${assistantNumber(capacity)}`
        : assistantNumber(residents.length));
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
        'إدارة الشقق والاشتراكات وسجل الأسعار وبيانات المستأجرين.',
        'إضافة شقة جديدة وبيانات المستأجر بعد ضبط رقم الشقة والدور.',
        'تعديل أو حذف سجل محدد بعد مطابقته ومعاينة بياناته.',
        'حركات الصناديق والتحويلات بين الخزائن وطرق الدفع.',
        'تجهيز تحصيل أو مصروف أو إعفاء/تسوية ثم حفظه بعد تأكيدك الصريح.',
        'نشر إعلان بعد معاينته وتأكيد النشر.',
        'آخر الحركات وبيانات العمارة والإعدادات والنسخ الاحتياطي.',
        'التقارير التفصيلية: الملاك، الفترة، المصروفات، الإعفاءات، الإقفال، المتأخرات وسجل التدقيق.',
        'أماكن التقارير وكيف تطبع أو تصدّر CSV.'
    ])}${assistantNote('اكتب سؤالك كما تتكلم: «الفلوس راحت فين؟»، «مين متأخر؟»، «عايز كشف حساب شقة 7»، أو «أضف شقة جديدة باسم أحمد، شقة 8، الدور 2». سيعرض عم عبده معاينة لأي إدخال، ولن يحفظه إلا بعد مراجعتك وتأكيدك الصريح.')}`;
    return { id: 'help', title, html };
}

function buildAssistantAppGuideAnswer() {
    const sections = [
        '<strong>الرئيسية:</strong> ملخص التحصيل والمصروفات ونسبة السداد.',
        '<strong>التحصيلات:</strong> تسجيل الدفعات، الإيصالات، الغرض، طريقة الدفع والصندوق.',
        '<strong>المصروفات:</strong> تسجيل المصروف، التصنيف، الشهر والصندوق مع تنبيه الرصيد.',
        '<strong>الخزائن:</strong> أرصدة الصندوق الرئيسي والتطوير والطوارئ والتحويلات بينها.',
        '<strong>الشقق والملاك:</strong> الملف، الاشتراك، الأسعار التاريخية، المستأجر وبيانات التواصل.',
        '<strong>التقارير:</strong> المالك، الفترة، المصروفات، الإعفاءات، الإقفال، المتأخرات والتدقيق.',
        '<strong>الإعدادات:</strong> بيانات العمارة، الدفع، الاشتراك، المظهر، الإيصالات، التذكيرات والحساب.',
        '<strong>الحماية:</strong> النسخ الاحتياطي والاستعادة وسجل العمليات والصلاحيات.'
    ];
    return {
        id: 'app_guide',
        title: 'خريطة التطبيق',
        html: `${assistantList(sections)}${assistantNote('قل لي اسم القسم أو هدفك، وليس لازم تحفظ اسم الزر. مثال: «عايز أعرف مين ما دفعش»، «سجل كهرباء 800»، «فين نسخة احتياطية؟»، أو «وريني تقرير التدقيق».')}`
    };
}

function buildAssistantSettingsAnswer() {
    const enabledMethods = typeof normalizePaymentSettings === 'function'
        ? Object.entries(normalizePaymentSettings(state.paymentSettings || {}))
            .filter(([, method]) => method?.enabled)
            .map(([code]) => typeof getIncomePaymentMethodLabel === 'function' ? getIncomePaymentMethodLabel(code) : code)
        : [];
    let html = '';
    html += assistantRow('يوم استحقاق الاشتراك', `يوم ${assistantNumber(state.subscriptionDueDay || 1)}`);
    html += assistantRow('فترة السماح', `${assistantNumber(state.subscriptionGraceDays || 0)} يوم`);
    html += assistantRow('التوزيع الافتراضي للدفعات', state.paymentAllocationPolicy === 'selected_month_first' ? 'الشهر المحدد أولًا' : 'الأقدم أولًا');
    html += assistantRow('طرق الدفع المفعّلة', enabledMethods.length ? enabledMethods.join('، ') : 'غير محددة');
    html += assistantNote('للتعديل افتح الإعدادات ثم القسم المناسب. عم عبده يشرح الإعدادات، لكنه لا يغيّر قواعد الاشتراك أو الحسابات من تلقاء نفسه.');
    return { id: 'settings', title: 'إعدادات التطبيق', html };
}

function buildAssistantBackupAnswer() {
    return {
        id: 'backup',
        title: 'النسخ الاحتياطي والاستعادة',
        html: assistantList([
            'أنشئ نسخة احتياطية قبل الاستيراد أو أي تغيير كبير.',
            'راجع وقت النسخة وحجمها وبصمتها قبل التنزيل.',
            'الاستعادة عملية حساسة؛ لا تبدأ إلا بعد اختيار النسخة وكتابة كلمة التأكيد المطلوبة.',
            'استيراد ملف JSON المحلي يمر عبر التحقق قبل استبدال البيانات.'
        ]) + assistantNote('افتح الإعدادات ← النسخ الاحتياطي. عم عبده لا ينشئ نسخة أو يستعيدها بمجرد السؤال حفاظًا على بيانات العمارة.')
    };
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
        'صلاحيات المدير: الأسئلة والتقارير للقراءة فقط. أجهّز مسودة التحصيل أو المصروف أو بيانات الشقة/المستأجر والتعديل والحذف في معاينة؛ لا تُحفظ إلا بعد مراجعتك وضغط «تأكيد» داخل النموذج الرسمي أو كتابة «أكد التسجيل» في المحادثة. الحذف يتطلب تأكيدًا صريحًا ولا ينفذ إذا كانت البيانات غير محددة أو مرتبطة بسجل محمي.'
    ];
    return { id: 'knowledge', title, html: assistantList(items) + assistantNote(owner ? 'جرّب: «إيصالاتي» أو «آخر يوم للدفع كام؟».' : 'جرّب: «مين يقدر يشوف البيانات؟» أو «إزاي أستخدم التقارير؟».') };
}

function openAssistantReports(reportTab = 'landlord') {
    if (assistantIsOwner()) return false;
    if (!closeAssistantForNavigation()) return false;
    if (typeof switchTab === 'function') switchTab('reports');
    if (typeof switchReportTab === 'function') setTimeout(() => switchReportTab(reportTab), 0);
    return true;
}

function parseAssistantReportRequest(raw, now = new Date()) {
    if (assistantIsOwner()) return null;
    const normalized = normalizeAssistantArabic(raw);
    const period = resolveAssistantPeriodWithContext(raw, now);
    const residentMatch = resolveAssistantResident(raw);
    const hasExplicitPeriod = /(?:يناير|فبراير|مارس|ابريل|أبريل|مايو|يونيو|يوليو|اغسطس|أغسطس|سبتمبر|اكتوبر|أكتوبر|نوفمبر|ديسمبر|20\d{2}|الشهر الحالي|الشهر ده|الشهر الماضي|الشهر اللي فات|الشهر اللى فات|السنة اللي فاتت|الماضي)/.test(normalized);
    const requestsIncome = /(?:تحصيل|تحصيلات|ايراد|وارد)/.test(normalized);
    const requestsExpenses = /(?:مصروف|مصاريف|صرف)/.test(normalized);
    const requestsOtherReport = /(?:اعفاء|تخفيض|تسويه|خصم|متاخر|مديون|مستحق|كشف حساب|حساب مالك|كشف مالك)/.test(normalized);
    let tab = 'landlord';
    // The period report is the existing combined destination for collection and expenses.
    if (requestsIncome && requestsExpenses && !requestsOtherReport) tab = 'period';
    else if (requestsExpenses) tab = 'expenses';
    else if (/(اعفاء|تخفيض|تسويه|خصم)/.test(normalized)) tab = 'adjustments';
    else if (/(متاخر|مديون|مستحق)/.test(normalized)) tab = 'arrears';
    else if (requestsIncome) tab = 'income';
    else if (/(كشف حساب|حساب مالك|كشف مالك)/.test(normalized)) tab = 'statement';
    else if (/(فتره|فترة|عدة شهور|مجموعة شهور)/.test(normalized)) tab = 'period';
    return {
        tab,
        month: hasExplicitPeriod && period?.type === 'month' ? period.label : '',
        residentId: residentMatch.matches.length === 1 ? residentMatch.matches[0].id : '',
        period,
        explicitReport: /(?:تقرير|كشف|اعمل|اطلع|طلع)/.test(normalized)
            && /(?:مالي|مالك|شهري|مصاريف|مصروف|صرف|تحصيل|ايراد|متاخر|مديون|مستحق|اعفاء|تخفيض|تسويه|فتره|فترة)/.test(normalized)
    };
}
function openAssistantReportsRequest(tab = 'landlord', month = '', residentId = '') {
    if (currentUserRole !== 'manager') return false;
    const targetTab = tab === 'income' ? 'landlord' : tab;
    const reportTabs = new Set(['landlord', 'period', 'expenses', 'adjustments', 'statement', 'monthlyClose', 'arrears', 'audit']);
    if (!reportTabs.has(targetTab) || !openAssistantReports(targetTab)) return false;
    setTimeout(() => {
        const selectMonth = id => {
            const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
            if (!select || !Array.from(select.options).some(option => option.value === month)) return false;
            select.value = month;
            return true;
        };
        const selectRange = (fromId, toId) => {
            const from = /** @type {HTMLSelectElement | null} */ (document.getElementById(fromId));
            const to = /** @type {HTMLSelectElement | null} */ (document.getElementById(toId));
            if (!from || !to
                || !Array.from(from.options).some(option => option.value === month)
                || !Array.from(to.options).some(option => option.value === month)) return false;
            from.value = month;
            to.value = month;
            return true;
        };
        if (month && targetTab === 'landlord' && selectMonth('reportMonthSelect')) {
            if (typeof invalidateLandlordReportPreview === 'function') invalidateLandlordReportPreview();
        } else if (month && targetTab === 'period' && selectRange('periodReportFrom', 'periodReportTo')) {
            if (typeof onPeriodReportRangeChange === 'function') onPeriodReportRangeChange();
        } else if (month && targetTab === 'expenses' && selectRange('expensesReportFrom', 'expensesReportTo')) {
            if (typeof onExpensesReportRangeChange === 'function') onExpensesReportRangeChange();
        } else if (month && targetTab === 'adjustments' && selectRange('adjustmentsReportFrom', 'adjustmentsReportTo')) {
            if (typeof invalidateAdjustmentsReportPreview === 'function') invalidateAdjustmentsReportPreview();
        } else if (month && targetTab === 'arrears' && typeof monthLabelToKey === 'function') {
            const monthKey = monthLabelToKey(month);
            const from = /** @type {HTMLInputElement | null} */ (document.getElementById('arrearsFromMonth'));
            const to = /** @type {HTMLInputElement | null} */ (document.getElementById('arrearsToMonth'));
            if (monthKey && from && to) {
                if (typeof populateArrearsMonthSelects === 'function') populateArrearsMonthSelects();
                from.value = monthKey.slice(0, 7);
                to.value = monthKey.slice(0, 7);
                if (typeof renderArrearsReport === 'function') renderArrearsReport();
            }
        }
        if (residentId && targetTab === 'statement') {
            const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('statementResidentSelect'));
            if (select && Array.from(select.options).some(option => option.value === residentId)) {
                select.value = residentId;
                if (typeof invalidateResidentStatementPreview === 'function') invalidateResidentStatementPreview();
            }
        }
    }, 0);
    return true;
}
function closeAssistantForNavigation() {
    if (!assistantModalIsOpen()) return true;
    if (typeof closeModal !== 'function') return false;
    closeModal('assistantModal');
    return !assistantModalIsOpen();
}
function buildAssistantReportsAnswer(request = null, now = new Date()) {
    const period = request?.period || resolveAssistantPeriod('');
    if (request && request.tab === 'expenses') {
        const answer = buildAssistantExpensesAnswer(period);
        answer.id = 'reports';
        answer.title = `تقرير المصروفات · ${period.label}`;
        answer.html += assistantNote('هذا ملخص من السجل المحلي؛ اكتب «أكبر المصروفات» لعرض البنود الأعلى قيمة.');
        return answer;
    }
    if (request && request.tab === 'adjustments') {
        const answer = buildAssistantAdjustmentsAnswer(period);
        answer.id = 'reports';
        answer.title = `تقرير الإعفاءات والتخفيضات · ${period.label}`;
        return answer;
    }
    if (request && request.tab === 'income') {
        const answer = buildAssistantIncomeAnswer(period);
        answer.id = 'reports';
        answer.title = `تقرير التحصيل · ${period.label}`;
        return answer;
    }
    if (request && request.tab === 'arrears') {
        const answer = buildAssistantArrearsAnswer();
        answer.id = 'reports';
        return answer;
    }
    if (request && request.tab === 'statement' && request.residentId) {
        const resident = (Array.isArray(state.residents) ? state.residents : []).find(item => item.id === request.residentId);
        if (resident) {
            const answer = buildAssistantResidentAnswer(resident, now, period);
            answer.id = 'reports';
            answer.title = `كشف حساب · ${assistantResidentName(resident)}${period?.type === 'month' ? ` · ${period.label}` : ''}`;
            return answer;
        }
    }
    if (request && request.tab === 'period') {
        const income = buildAssistantIncomeAnswer(period);
        const expenses = buildAssistantExpensesAnswer(period);
        return { id: 'reports', title: `تقرير الفترة · ${period.label}`, html: `<section>${income.html}</section><section>${expenses.html}</section><p class="assistant-note">البيانات معروضة من السجلات المحلية.</p>` };
    }
    if (request?.explicitReport) {
        const answer = buildAssistantExecutiveAnswer(period);
        answer.id = 'reports';
        answer.title = `تقرير مالي · ${period.label}`;
        return answer;
    }
    const title = 'التقارير المتاحة';
    const html = `${assistantList([
        'تقرير المالك الشهري والفترة: التحصيل والمصروفات مع الفلاتر.',
        'تقارير المصروفات والإعفاءات والتخفيضات.',
        'كشف حساب المالك والإقفال الشهري والمتأخرات.'
    ])}${assistantNote('اطلب التقرير بصيغة طبيعية، مثل «تقرير مصروفات نوفمبر» أو «كشف حساب سارة حسن»؛ هعرضلك النتيجة هنا من بيانات المبنى المحلية. ولو عايز تطبع أو تنزّل CSV افتح شاشة التقارير بكتابة «افتح شاشة التقارير».')}`;
    return { id: 'reports', title, html };
}

const ASSISTANT_HERO_SRC = 'icons/assistant-abbah-full.png';

function assistantIsOwner() {
    return typeof currentUserRole !== 'undefined' && currentUserRole === 'owner';
}

/** Central write gate: only an authenticated manager may go past a preview. */
function assistantCanWrite() {
    return typeof currentUserRole !== 'undefined' && currentUserRole === 'manager' && !assistantIsOwner();
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

const ASSISTANT_TITLE_ABBREVIATION = /^\s*(أ|ا|إ|م|د)\s*(?:[\/\\.\-]\s*|\s+)(\S.*)$/;
const ASSISTANT_TITLE_WORD = /^\s*(أستاذ|استاذ|أستاذة|استاذة|مهندس|مهندسة|دكتور|دكتورة|حاج|حاجة)\s+(\S+)/;
const ASSISTANT_MASCULINE_TA_MARBUTA = /^(?:حمزة|اسامة|أسامة|معاوية|طلحة|قتيبة|عكاشة|ابو بكر)$/;

function assistantLooksFeminine(firstName) {
    const name = String(firstName || '').trim();
    if (!name || ASSISTANT_MASCULINE_TA_MARBUTA.test(name)) return false;
    return /(?:ة|ى|اء)$/.test(name);
}

// "أ/ سمير" -> أستاذ سمير, "م. أحمد" -> مهندس أحمد, "د/ منى" -> دكتورة منى.
// The feminine form is used only when the first name clearly ends like one (ة، ى، اء); otherwise masculine.
function assistantTitledName(rawName) {
    const raw = String(rawName || '').trim();
    if (!raw) return null;
    const word = ASSISTANT_TITLE_WORD.exec(raw);
    if (word) return { title: word[1].replace('استاذ', 'أستاذ'), first: word[2], plain: false };
    const abbreviation = ASSISTANT_TITLE_ABBREVIATION.exec(raw);
    if (!abbreviation) return null;
    const first = abbreviation[2].trim().split(/\s+/)[0];
    if (!first || /^[\/\\.\-]+$/.test(first)) return null;
    const feminine = assistantLooksFeminine(first);
    const titles = {
        'أ': feminine ? 'أستاذة' : 'أستاذ', 'ا': feminine ? 'أستاذة' : 'أستاذ', 'إ': feminine ? 'أستاذة' : 'أستاذ',
        'م': feminine ? 'مهندسة' : 'مهندس',
        'د': feminine ? 'دكتورة' : 'دكتور'
    };
    return { title: titles[abbreviation[1]], first, plain: false };
}

// How to call the user inside a sentence: "يا أستاذ سمير", "يا سمير محمد" or "يا باشا".
function assistantAddressRaw() {
    const name = assistantUserDisplayName();
    if (!name) return 'يا باشا';
    const titled = assistantTitledName(name);
    return titled ? `يا ${titled.title} ${titled.first}` : `يا ${name}`;
}

// Greeting form: "أهلاً أستاذ سمير" (no "يا" before a title), otherwise the normal address.
function assistantGreetingNameRaw(name) {
    const titled = name ? assistantTitledName(name) : null;
    return titled ? `${titled.title} ${titled.first}` : `يا ${name}`;
}

function assistantGreetingAddressRaw() {
    const name = assistantUserDisplayName();
    return name ? assistantGreetingNameRaw(name) : 'يا باشا';
}

function assistantAddress() {
    return assistantEscape(assistantAddressRaw());
}

function assistantGreetingAddress() {
    return assistantEscape(assistantGreetingAddressRaw());
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
        : overdueNow ? 'الموعد عدّى. ادفع أو كلّم المدير' : 'لسه في وقت، المتبقي ' + assistantMoney(snapshot.outstanding);
    html += assistantRow('الحالة', status, snapshot.outstanding > 0 && overdueNow ? 'bad' : snapshot.outstanding > 0 ? 'warn' : 'good');
    if (snapshot.debt.totalDebt > 0) {
        html += assistantRow('متأخرات سابقة', assistantMoney(snapshot.debt.totalDebt), 'bad');
        html += assistantNote(`عليك ${assistantMonthsCount(snapshot.debt.count)} متأخر، والمدير يقدر يوضحلك التسويات المتاحة.`);
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
    let settlementCents = 0;
    rows.forEach(adjustment => {
        const amountCents = assistantCents(adjustment.amount);
        if (amountCents <= 0) return;
        cents += amountCents;
        if (adjustment.kind === 'settlement') settlementCents += amountCents;
    });
    const waivedCents = cents - settlementCents;
    let html = '';
    html += assistantRow('إجمالي الإعفاءات والتخفيضات', assistantMoney(waivedCents / 100), waivedCents > 0 ? 'warn' : '');
    if (settlementCents > 0) html += assistantRow('اتفاقيات التسوية', assistantMoney(settlementCents / 100));
    html += assistantRow('عدد البنود', assistantNumber(rows.length));
    html += rows.length
        ? assistantList(rows.slice().sort((a, b) => String(b.effectiveMonth).localeCompare(String(a.effectiveMonth))).slice(0, 6).map(adjustment => {
            const month = typeof monthKeyToLabel === 'function' ? monthKeyToLabel(adjustment.effectiveMonth) : String(adjustment.effectiveMonth).slice(0, 7);
            return `${assistantEscape(kindLabel(adjustment.kind))} ${assistantEscape(assistantMoney(adjustment.amount))} · ${assistantEscape(month)}`;
        }))
        : assistantNote('مفيش إعفاءات أو تخفيضات مسجلة على شقتك في الفترة دي.');
    html += assistantNote('الإعفاء والتخفيض بيخصموا من المستحق ومش بيتحسبوا دفعات نقدية. التسوية اتفاق سداد مش إعفاء.');
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
    const smallTalk = detectAssistantSmallTalk(normalized);
    if (smallTalk) return smallTalk;
    if (/(السلام عليكم|سلام|صباح|مساء|ازيك|عامل ايه|اهلا|هاي)/.test(normalized)) return 'greeting';
    if (/(شكرا|تسلم|مشكور|ربنا يكرمك)/.test(normalized)) return 'thanks';
    if (/(خصوصيه|بياناتي|البيانات بتتخزن|بتتخزن فين|مين يقدر يشوف|امان|امن|صلاحيات|قراءة فقط|ازاي استخدم|ازاي اسجل|ازاي اطبع|ازاي اصدر)/.test(normalized)) return 'knowledge';
    if (/(مساعده|ساعدني|بتعرف تعمل|تقدر تعمل|اوامر|خيارات|استخدمك|بتعرف ايه)/.test(normalized)) return 'help';
    // First-person questions about the owner's own account are never about someone else.
    if (/(?:^|\s)(?:هل )?انا (?:متاخر|مديون)|(?:^|\s)(?:عليا|علياء) متاخرات|(?:الشهر ده|الشهر دا|الشهر الحالي).*دفعت|دفعت.*(?:الشهر ده|الشهر دا|الشهر الحالي)/.test(normalized)) return 'my_bill';
    if (/(مين عليه|مين عليها|مين عليهم|على مين|علي مين)/.test(normalized)) return 'owner_scope';
    if (/(?:حساب|ايصالات|ايصال|دفعات|مدفوعات|متاخرات)\s+[ء-ي]{2,}(?:\s+[ء-ي]{2,})?(?:\s+(?:كام|عليه|عليها|دفع|دفعت|متاخر|مديون))?/.test(normalized)) return 'owner_scope';
    if (/^(?:[ء-ي]{2,}\s+){1,2}(?:عليه|عليها|دفع|دفعت|متاخر|مديون)/.test(normalized)) return 'owner_scope';
    if (/(ملخص تنفيذي|ملخص الاداره|ملخص العماره|(?:تغير|اتغير)(?: بشكل)? غير طبيعي|تغيير كبير|فرق كبير|تحصيل|مصروف|مصاريف|صرف|خزنه|صندوق|سيوله|صافي|اجمالي|كل الشقق|السكان|سكان العماره|الشقق التاني|تقرير|تقارير|طابق العماره|طوابق العماره|ادوار العماره|احصائيات|لوحة تحكم|اعدادات|إعدادات|(?:ال)?نسخه (?:ال)?احتياطيه|(?:ال)?نسخه (?:ال)?احتياطية|باك اب|سجل التدقيق|سجل العمليات|المستاجرين|المستأجرين|سعر الاشتراك|ورقة الاسعار)/.test(normalized)) return 'owner_scope';
    if (/(استحقاق|اخر يوم|مهله|موعد الدفع|ميعاد الدفع|ميعاد السداد|ميعاد الاستحقاق|اخر ميعاد|اخر موعد|امتى اخر|امتى ادفع|يوم كام ادفع|قبل ما اتاخر|متاخر عن ميعاد)/.test(normalized)) return 'my_due_date';
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

function selectOwnerAssistantAnswer(intent, period, now, rawText = '') {
    switch (intent) {
        case 'greeting':
            return { id: 'greeting', title: assistantGreetingTitle(rawText), html: buildAssistantOwnerGreetingHtml(now) };
        case 'thanks':
            return { id: 'thanks', title: 'العفو', html: `<p class="assistant-hello">تحت أمرك ${assistantAddress()}. لو محتاج رقم من حسابك أو ميعاد الدفع، اسألني.</p>` };
        case 'bye':
        case 'ack':
        case 'who_are_you':
        case 'howru':
        case 'praise':
        case 'sorry':
        case 'wait':
        case 'laugh':
        case 'complaint':
            return buildAssistantSmallTalkAnswer(intent);
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
            return buildAssistantNotUnderstoodAnswer(rawText, 'owner');
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

function assistantIsConfirmation(text) {
    return ASSISTANT_CONFIRM_WORDS.test(normalizeAssistantArabic(text));
}

function assistantIsCancellation(text) {
    return ASSISTANT_CANCEL_WORDS.test(normalizeAssistantArabic(text));
}

function assistantIsNoticePublishRequest(text) {
    return /^(?:انشر|نشر|اكد نشر|اكد الاعلان|اعتمد الاعلان)(?: الاعلان)?$/.test(normalizeAssistantArabic(text));
}

function answerOwnerAssistantQuery(text, now = new Date()) {
    const plan = buildAssistantQueryPlan(text, now);
    if (plan.scopeReason === 'foreign-unit') {
        return withAssistantAnswerMeta(buildAssistantForeignUnitAnswer(), plan.period, null, text);
    }
    return withAssistantAnswerMeta(selectOwnerAssistantAnswer(plan.intentIds[0], plan.period, now, text), plan.period, null, text);
}

function assistantHeroHtml() {
    return `<img class="assistant-hero" src="${ASSISTANT_HERO_SRC}" alt="" width="74" height="74" decoding="async">`;
}

function buildAssistantGreetingHtml(now = new Date()) {
    if (assistantDataSavePending()) return buildAssistantPendingSaveAnswer().html;
    if (assistantIsOwner()) return buildAssistantOwnerGreetingHtml(now);
    const month = getAssistantNowLabel(now);
    const residents = Array.isArray(state.residents) ? state.residents : [];
    const hello = `أهلاً ${assistantGreetingAddress()}، أنا <strong>${assistantEscape(ASSISTANT_NAME)}</strong> بواب العمارة ومساعدك المحلي، تحت أمرك.`;
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
    html += assistantNote('اكتب اللي عايزه زي ما بتتكلم، مثلًا «قيد مصروف كهرباء 300 جنيه» أو «تقرير التحصيل لشهر نوفمبر».');
    return html;
}

function buildAssistantOwnerGreetingHtml(now = new Date()) {
    if (assistantDataSavePending()) return buildAssistantPendingSaveAnswer().html;
    const resident = assistantOwnerResident();
    const hello = `أهلاً ${assistantGreetingAddress()}، أنا <strong>${assistantEscape(ASSISTANT_NAME)}</strong> بواب العمارة.`;
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

const ASSISTANT_COMPARISON_REQUEST = /(?:قارن|مقارنه|مقارنة|مقابل|الفرق بين|زاد|زادت|قل|قلت|اكتر من|اقل من|أكثر من|أقل من|الشهر ده باللي قبله|الشهر الحالي بالسابق)/;
const ASSISTANT_SPECIFIC_MONEY_PHRASE = /(?:علي(?:ه|ها|هم)|عليا)\s+فلوس|الفلوس راحت فين|اتصرف في ايه|اتصرفت في ايه/g;

function assistantBlankMatches(text, pattern) {
    return String(text).replace(pattern, phrase => ' '.repeat(phrase.length));
}

function detectAssistantCompoundIntents(normalized) {
    /** @type {Array<[string, RegExp]>} */
    const candidates = [
        ['summary', /(?:ملخص|وضع|احوال|نظره|نتيجه|عاملين ايه|الدنيا ايه)/],
        ['income', /(?:(?<!طرق ال)تحصيل|تحصيلات|ايراد|دخل|وارد|دفع|مدفوع|متحصل|المتحصلات|اللي اتجمع|اللي دخل|اتجمع كام)/],
        ['arrears', /(?:متاخر|متاخرات|مستحق|مديون|مش دفع|غير مدفوع|مش دافع|مش سدد|متاخرين|عليه فلوس|لسه مادفعش|ما دفعش)/],
        ['expenses', /(?:مصروف|مصاريف|صرف|منصرف|اتصرف|اللي اتدفع من الخزنه|الفلوس راحت فين|اتصرف في ايه)/],
        ['cashbox', /(?:خزنه|صندوق|رصيد|كاش|فلوس|سيوله|الموجود في الخزنه|كام في الخزنه|كام في الصندوق)/],
        ['payment_breakdown', /(?:طرق التحصيل|اتدفعت بايه|دفعوا ازاي|دفعنا ازاي|الناس دفعت ازاي)/],
        ['manager_tasks', /(?:قايمه متابعه|قائمه متابعه|قائمة متابعة|مهام المدير|ابدأ بايه|ابدا بايه|مين اكلمه|مين اكلم|اولويات التحصيل|اتابع مين)/]
    ];
    const paymentPhrase = /(?:التحصيلات طرق التحصيل|طرق التحصيل|التحصيلات اتدفعت بايه|اتدفعت بايه|دفعوا ازاي|دفعنا ازاي|الناس دفعت ازاي)/g;
    return candidates
        .map(([intent, pattern], order) => {
            const candidateText = intent === 'cashbox'
                ? assistantBlankMatches(normalized, ASSISTANT_SPECIFIC_MONEY_PHRASE)
                : intent === 'payment_breakdown'
                    ? normalized
                    : assistantBlankMatches(normalized, paymentPhrase);
            const match = pattern.exec(candidateText);
            return match ? { intent, position: match.index, order } : null;
        })
        .filter(Boolean)
        .sort((left, right) => left.position - right.position || left.order - right.order)
        .reduce((intents, match) => {
            if (!intents.includes(match.intent)) intents.push(match.intent);
            return intents;
        }, []);
}

function buildAssistantQueryPlan(text, now = new Date()) {
    const normalized = normalizeAssistantArabic(text);
    const role = assistantIsOwner() ? 'owner' : 'manager';
    if (role === 'owner') {
        const foreignUnitRequest = assistantOwnerRequestsForeignUnit(normalized);
        const intent = detectOwnerAssistantIntent(normalized);
        const scopeViolation = foreignUnitRequest || intent === 'owner_scope';
        const resident = assistantOwnerResident();
        const period = foreignUnitRequest
            ? resolveAssistantPeriod(text, now)
            : resolveAssistantPeriodWithContext(text, now);
        return {
            role,
            scope: 'resident',
            scopeViolation,
            scopeReason: foreignUnitRequest ? 'foreign-unit' : scopeViolation ? 'role-boundary' : null,
            normalized,
            period,
            responseMode: detectAssistantResponseMode(normalized),
            expenseCategory: null,
            intentIds: [scopeViolation ? 'owner_scope' : intent],
            apartment: resident ? { id: resident.id, number: resident.apartmentNumber } : null,
            residentMatches: []
        };
    }

    const residentMatch = resolveAssistantResident(text);
    const remembered = residentMatch.matches.length === 0 && assistantFollowsResident(text)
        ? assistantRememberedResident()
        : null;
    const resident = residentMatch.resident || remembered;
    const period = residentMatch.matches.length > 1
        ? resolveAssistantPeriod(text, now)
        : resolveAssistantPeriodWithContext(text, now);
    // An explicit comparison outranks a compound list: the user wants one
    // side-by-side answer, not two unrelated sections.
    const wantsComparison = ASSISTANT_COMPARISON_REQUEST.test(normalized) && !parseAssistantAgedMonths(normalized);
    const compoundIntents = wantsComparison || resident || residentMatch.matches.length > 1
        ? []
        : detectAssistantCompoundIntents(normalized);
    const intentIds = wantsComparison
        ? ['comparison']
        : compoundIntents.length > 1
            ? compoundIntents
            : [detectAssistantIntent(normalized, Boolean(resident))];

    return {
        role,
        scope: 'building',
        scopeViolation: false,
        normalized,
        period,
        responseMode: detectAssistantResponseMode(normalized),
        expenseCategory: detectAssistantExpenseCategory(normalized),
        intentIds,
        resident,
        residentMatches: residentMatch.matches,
        apartment: resident ? { id: resident.id, number: resident.apartmentNumber } : null
    };
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
    text = expandAssistantPeriodFollowUp(text);
    if (assistantOperationContext?.status === 'uncertain' && ASSISTANT_RECONCILE_WORDS.test(normalized)) {
        completeAssistantOperation(assistantOperationContext.requestId);
        assistantOperationDraft = null;
        return withAssistantAnswerMeta({
            id: 'operation-reconciled',
            title: 'تم إغلاق متابعة العملية',
            html: assistantNote('تمام يا باشا، قفلت متابعة العملية اللي مش متأكدة بعد مراجعتك. بصّ في سجل التدقيق قبل أي تعديل أو حذف جديد.')
        }, resolveAssistantPeriod(text, now), null, text);
    }
    if ((assistantOperationDraft || assistantNoticeDraft) && assistantIsCancellation(text)) {
        const noticeCancelled = assistantNoticeDraft ? cancelAssistantNotice({ silent: true }) !== false : true;
        const operationCancelled = assistantOperationDraft ? cancelAssistantOperation({ silent: true }) !== false : true;
        const cancelled = noticeCancelled && operationCancelled;
        return withAssistantAnswerMeta({
            id: cancelled ? 'operation-cancelled' : 'operation-cancel-blocked',
            title: cancelled ? 'تم إلغاء المسودة' : 'تعذّر إلغاء العملية',
            html: assistantNote(cancelled
                ? 'تمام، محفظتش أي تغيير.'
                : 'الحفظ جارٍ أو نتيجته غير مؤكدة، فما أقدرش أأكد الإلغاء. حدّث البيانات وراجع سجل التدقيق قبل المحاولة مرة أخرى.')
        }, resolveAssistantPeriod(text, now), null, text);
    }
    if (assistantNoticeDraft && assistantIsNoticePublishRequest(text)) {
        return withAssistantAnswerMeta({ id: 'notice-confirm-request', title: 'تأكيد نشر الإعلان', html: assistantNote('تمام يا باشا، هنشر نص الإعلان اللي راجعته دلوقتي.') }, resolveAssistantPeriod(text, now), null, text);
    }
    if (assistantOperationDraft && assistantIsConfirmation(text)) {
        if (!assistantOperationCanExecute(assistantOperationDraft)) {
            return withAssistantAnswerMeta(buildAssistantOperationPreview(assistantOperationDraft, now), resolveAssistantPeriod(text, now), assistantOperationDraft.resident || null, text);
        }
        return withAssistantAnswerMeta({ id: 'operation-confirm-request', title: 'جارٍ تسجيل العملية بعد تأكيدك', html: assistantNote('لحظة يا باشا، براجع وبسجّل بالطريقة الرسمية.') }, resolveAssistantPeriod(text, now), assistantOperationDraft.resident || null, text);
    }
    if (assistantOperationDraft && /^(?:افتح النموذج|افتح شاشة الادخال|كمل في النموذج)$/.test(normalized)) {
        return withAssistantAnswerMeta({ id: 'operation-open-form-request', title: 'فتح نموذج المراجعة', html: assistantNote('حاضر يا باشا، هفتحلك الشاشة تراجع البيانات وتكمّلها.') }, resolveAssistantPeriod(text, now), assistantOperationDraft.resident || null, text);
    }
    if (/^(?:افتح|روح|اذهب الى|وديني الى)\s+(?:(?:شاشه|صفحه)\s+)?(?:التقارير|تقارير|التقرير|تقرير|كشف حساب|المتاخرات)(?:\s|$)/.test(normalized)) {
        const reportRequest = parseAssistantReportRequest(text, now);
        const reportLabel = {
            landlord: 'الملاك', income: 'التحصيل', period: 'الفترة', expenses: 'المصروفات',
            adjustments: 'الإعفاءات والتخفيضات', statement: 'كشف الحساب', arrears: 'المتأخرات'
        }[reportRequest?.tab] || 'الملاك';
        const periodLabel = reportRequest?.month ? ` لشهر ${assistantEscape(reportRequest.month)}` : '';
        return withAssistantAnswerMeta({
            id: 'reports-open-request',
            title: 'فتح التقرير المطلوب',
            html: assistantNote(`حاضر يا باشا، هفتحلك تقرير ${reportLabel}${periodLabel} في شاشة التقارير.`),
            reportRequest: reportRequest || { tab: 'landlord', month: '', residentId: '' }
        }, resolveAssistantPeriod(text, now), null, text);
    }
    const operationFollowup = mergeAssistantOperationFollowup(text, now);
    if (operationFollowup) return withAssistantAnswerMeta(operationFollowup, resolveAssistantPeriod(text, now), assistantOperationDraft?.resident || null, text);
    const reminderRequest = parseAssistantReminderCommand(text);
    if (reminderRequest) return withAssistantAnswerMeta(buildAssistantReminderAnswer(reminderRequest), resolveAssistantPeriod(text, now), null, text);
    const noticeText = parseAssistantNoticeCommand(text);
    if (noticeText) return withAssistantAnswerMeta(buildAssistantNoticePreview(noticeText), resolveAssistantPeriod(text, now), null, text);
    const residentEntry = parseAssistantResidentEntryCommand(text);
    if (residentEntry) return withAssistantAnswerMeta(buildAssistantResidentEntryPreview(residentEntry), resolveAssistantPeriod(text, now), null, text);
    const operation = parseAssistantOperationCommand(text, now);
    if (operation?.type === 'resident_edit') {
        return withAssistantAnswerMeta(buildAssistantOperationPreview(operation, now), resolveAssistantPeriod(text, now), null, text);
    }
    const mutation = parseAssistantMutationCommand(text, now);
    if (mutation) return withAssistantAnswerMeta(buildAssistantMutationPreview(mutation), resolveAssistantPeriod(text, now), mutation.resident || null, text);
    if (operation) return withAssistantAnswerMeta(buildAssistantOperationPreview(operation, now), resolveAssistantPeriod(text, now), operation.resident, text);
    const plan = buildAssistantQueryPlan(text, now);
    if (plan.residentMatches.length > 1) {
        const answer = {
            id: 'resident-choice',
            title: 'في أكتر من مالك مطابق',
            html: `${assistantList(plan.residentMatches.map(resident =>
                `${assistantEscape(assistantApartmentLabel(resident))} · ${assistantEscape(assistantResidentName(resident))}`
            ))}${assistantNote('حدد رقم الشقة في سؤالك، مثال: «شقة 3 دفع كام؟».')}`
        };
        return withAssistantAnswerMeta(answer, plan.period, null, text);
    }
    const compound = !plan.resident && buildAssistantCompoundAnswer(plan, now, text);
    if (compound) return withAssistantAnswerMeta(compound, plan.period, null, text);
    const answer = selectAssistantAnswer(plan.intentIds[0], plan.period, plan.resident, now, text);
    return withAssistantAnswerMeta(answer, plan.period, plan.resident, text);
}
function buildAssistantCompoundAnswer(plan, now, rawText = '') {
    const { period, intentIds } = plan;
    const intents = intentIds;
    if (intents.length < 2) return null;
    const sections = intents.map(intent => {
        const answer = selectAssistantAnswer(intent, period, null, now, rawText);
        return `<section class="assistant-compound-section" data-assistant-intent="${assistantEscape(intent)}"><h4>${assistantEscape(answer.title)}</h4>${answer.html}</section>`;
    }).join('');
    return {
        id: 'compound',
        title: 'إجابة مجمعة',
        html: `<p class="assistant-answer-subtitle">فهمت إنك بتسأل عن ${assistantNumber(intents.length)} نقاط في ${assistantEscape(period.label)}:</p>${sections}${assistantNote('تقدر تكمّل بسؤال متابعة طبيعي، مثل: «قارن الشهر ده باللي قبله» أو «افتح تقرير المتأخرات».')}`
    };
}
function selectAssistantAnswer(intent, period, resident, now, rawText = '') {
    switch (intent) {
        case 'greeting':
            return { id: 'greeting', title: assistantGreetingTitle(rawText), html: buildAssistantGreetingHtml(now) };
        case 'thanks':
            return { id: 'thanks', title: 'العفو', html: `<p class="assistant-hello">تحت أمرك ${assistantAddress()}. لو محتاج أي رقم أو ملخص، اسألني.</p>` };
        case 'bye':
        case 'ack':
        case 'who_are_you':
        case 'howru':
        case 'praise':
        case 'sorry':
        case 'wait':
        case 'laugh':
        case 'complaint':
            return buildAssistantSmallTalkAnswer(intent);
        case 'help':
            return buildAssistantHelpAnswer();
        case 'knowledge':
            return buildAssistantKnowledgeAnswer();
        case 'app_guide':
            return buildAssistantAppGuideAnswer();
        case 'settings':
            return buildAssistantSettingsAnswer();
        case 'backup':
            return buildAssistantBackupAnswer();
        case 'adjustments':
            return buildAssistantAdjustmentsAnswer(period);
        case 'arrears':
            return buildAssistantArrearsAnswer();
        case 'manager_tasks':
            return buildAssistantManagerTasksAnswer(period);
        case 'expenses':
            return buildAssistantExpensesAnswer(period, buildAssistantResponseOptions(rawText, intent));
        case 'top_expenses':
            return buildAssistantTopExpensesAnswer(period);
        case 'income':
            return buildAssistantIncomeAnswer(period, buildAssistantResponseOptions(rawText, intent));
        case 'payment_breakdown':
            return buildAssistantPaymentBreakdownAnswer(period);
        case 'cashbox':
            return buildAssistantCashAnswer();
        case 'summary':
            return buildAssistantSummaryAnswer(period);
        case 'morning_brief':
            return buildAssistantMorningBriefAnswer(now);
        case 'upcoming_dues':
            return buildAssistantUpcomingDuesAnswer(now);
        case 'executive':
            return buildAssistantExecutiveAnswer(period);
        case 'change_alerts':
            return buildAssistantChangeAlertsAnswer(period, now);
        case 'comparison': {
            // "الشهر ده بالشهر اللي فات" compares this month with last month. The phrase "اللي فات" must not
            // move the base month back one more step.
            const spoken = normalizeAssistantArabic(rawText);
            const namesThisMonth = /(?:الشهر ده|الشهر دا|الشهر الحالي|الشهر ده)/.test(spoken);
            const namesLastMonth = /(?:اللي فات|الماضي|السابق|اللي قبله|اللي قبل)/.test(spoken);
            return buildAssistantComparisonAnswer(namesThisMonth && namesLastMonth ? null : period, now);
        }
        case 'recent':
            return buildAssistantRecentAnswer();
        case 'reports':
            return buildAssistantReportsAnswer(parseAssistantReportRequest(rawText, now), now);
        case 'notices':
            return buildAssistantNoticesAnswer();
        case 'building':
            return buildAssistantBuildingAnswer();
        case 'reminder_followup':
            return buildAssistantReminderFollowUpAnswer(now);
        case 'arrears_aged':
            return buildAssistantAgedArrearsAnswer(parseAssistantAgedMonths(normalizeAssistantArabic(rawText)));
        case 'collection_status':
            return buildAssistantCollectionStatusAnswer(period, now);
        case 'resident_receipts':
            return resident ? buildAssistantResidentReceiptsAnswer(resident, hasAssistantTimeHint(rawText) ? period : null) : buildAssistantResidentAnswer(resident, now, period);
        case 'today_income':
            return buildAssistantTodayIncomeAnswer(now, rawText);
        case 'window_expenses':
            return buildAssistantWindowExpensesAnswer(now, rawText);
        case 'resident':
            return buildAssistantResidentAnswer(resident, now, period);
        default:
            return buildAssistantNotUnderstoodAnswer(rawText, 'manager');
    }
}

const ASSISTANT_TOPIC_PHRASES = {
    income: 'اتحصل كام', today_income: 'اتحصل كام', expenses: 'المصروفات كام', window_expenses: 'المصروفات كام', summary: 'ملخص'
};

/** "والشهر اللي فات" / "وسبتمبر" / "امبارح" alone repeats the last money question for the new period. */
function expandAssistantPeriodFollowUp(text) {
    const topic = assistantContext.topic;
    if (!topic || !ASSISTANT_TOPIC_PHRASES[topic]) return text;
    const spoken = normalizeAssistantArabic(text).replace(/^(?:طب\s+)?و?(?:ال)?/, '').trim();
    const monthNames = getAssistantMonthNames().map(name => normalizeAssistantArabic(name)).join('|');
    const periodOnly = new RegExp(`^(?:شهر (?:ده|دا|الحالي|اللي فات|الماضي|الفات|\\d{1,2})|(?:${monthNames})(?: 20\\d{2})?|اخر (?:شهرين|\\d{1,2} شهور)|امبارح|الاسبوع (?:ده|دا)|السنه (?:دي|اللي فاتت))$`);
    if (!periodOnly.test(spoken)) return text;
    const topicPhrase = ASSISTANT_TOPIC_PHRASES[topic];
    const period = /^شهر /.test(spoken) ? `ال${spoken}` : spoken;
    return `${topicPhrase} ${period}`;
}

function withAssistantAnswerMeta(answer, period, resident, text = '') {
    answer.followUps = buildAssistantFollowUps(answer.id, period, answer.followUpQueries);
    delete answer.followUpQueries;
    if (text) {
        rememberAssistantContext(text, period, resident);
        assistantContext.topic = ASSISTANT_TOPIC_PHRASES[answer.id] ? answer.id : null;
    }
    return answer;
}

function formatAssistantUserText(text) {
    return assistantEscape(text).replace(/\n/g, '<br>');
}

function assistantMessageTime() {
    try {
        return new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    } catch (error) {
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}

function updateAssistantComposerState() {
    const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('assistantInput'));
    const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('assistantSendButton'));
    const counter = document.getElementById('assistantInputCounter');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
    if (counter) counter.textContent = `${input.value.length}/${ASSISTANT_MAX_MESSAGE_LENGTH}`;
    if (button) button.disabled = Boolean(input.readOnly) || !input.value.trim();
}

function setAssistantBusy(isBusy, message = 'جارٍ التحقق والحفظ…') {
    const modal = document.getElementById('assistantModal');
    const shell = modal?.querySelector('.assistant-shell');
    const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('assistantInput'));
    const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('assistantSendButton'));
    const resetButton = /** @type {HTMLButtonElement | null} */ (modal?.querySelector('[onclick="resetAssistantChat()"]') || null);
    const status = document.getElementById('assistantStatusText');
    const statusDot = document.getElementById('assistantStatusDot');
    const visibleStatus = modal?.querySelector('.assistant-head-copy > p');
    const visibleStatusText = visibleStatus
        ? [...visibleStatus.childNodes].find(node => node.nodeType === Node.TEXT_NODE)
        : null;
    const nextStatus = isBusy ? message : 'جاهز · محادثة محلية';
    if (visibleStatusText) visibleStatusText.nodeValue = ` ${nextStatus}`;
    if (modal) modal.dataset.assistantBusy = String(isBusy);
    if (shell) {
        shell.setAttribute('aria-busy', String(isBusy));
        shell.classList.toggle('is-processing', isBusy);
    }
    if (input) input.readOnly = isBusy;
    if (resetButton) resetButton.disabled = isBusy;
    if (status) status.textContent = nextStatus;
    if (statusDot) statusDot.classList.toggle('is-working', isBusy);
    if (button) button.setAttribute('aria-label', isBusy ? 'جارٍ معالجة الطلب' : 'إرسال السؤال كتابةً');
    updateAssistantComposerState();
}

function renderAssistantMessage(role, html) {
    const log = document.getElementById('assistantLog');
    if (!log) return null;
    const message = document.createElement('div');
    message.className = `assistant-msg is-${role}`;
    message.innerHTML = `<div class="assistant-bubble">${html}<span class="assistant-message-meta">${assistantMessageTime()} <span aria-hidden="true">✓</span></span></div>`;
    log.appendChild(message);
    log.scrollTop = log.scrollHeight;
    return message;
}

function appendAssistantMessage(role, html, plainText = null, metadata = {}) {
    const storedHtml = assistantStorableHtml(html);
    assistantChat.push({ role, html: storedHtml });
    persistAssistantChat();
    if (plainText !== null || role === 'bot') {
        persistAssistantRemoteMessage(role, plainText === null ? storedHtml : plainText, metadata);
    }
    // Render the live bubble: its buttons still work until the chat is reloaded.
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
    message.innerHTML = '<div class="assistant-bubble"><span class="assistant-typing-label">عم عبده بيكتب</span><span class="assistant-typing-dot"></span><span class="assistant-typing-dot"></span><span class="assistant-typing-dot"></span></div>';
    log.appendChild(message);
    log.scrollTop = log.scrollHeight;
    return message;
}

function restoreAssistantChat() {
    restoreAssistantSession();
    if (assistantChat.length) {
        assistantChat.forEach(item => renderAssistantMessage(item.role, item.html));
        return;
    }
    appendAssistantMessage('bot', buildAssistantGreetingHtml(), null, { greeting: true });
}

function syncAssistantMobileViewport() {
    const modal = document.getElementById('assistantModal');
    if (!modal || modal.classList.contains('hidden')) return;
    const mobile = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 640px)').matches;
    const viewport = window.visualViewport;
    if (!mobile || !viewport) {
        modal.classList.remove('assistant-mobile-viewport');
        modal.style.removeProperty('--assistant-visual-top');
        modal.style.removeProperty('--assistant-visual-height');
        return;
    }
    modal.style.setProperty('--assistant-visual-top', `${Math.max(0, viewport.offsetTop)}px`);
    modal.style.setProperty('--assistant-visual-height', `${viewport.height}px`);
    modal.classList.add('assistant-mobile-viewport');
    const input = document.getElementById('assistantInput');
    if (input && document.activeElement === input) {
        requestAnimationFrame(() => {
            const log = document.getElementById('assistantLog');
            if (log) log.scrollTop = log.scrollHeight;
        });
    }
}

function bindAssistantMobileViewport() {
    if (assistantViewportListenersBound) return;
    assistantViewportListenersBound = true;
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', syncAssistantMobileViewport);
        window.visualViewport.addEventListener('scroll', syncAssistantMobileViewport);
    }
    window.addEventListener('resize', syncAssistantMobileViewport);
    window.addEventListener('orientationchange', syncAssistantMobileViewport);
}

function openAssistantModal() {
    if (typeof currentUserRole !== 'undefined' && currentUserRole !== 'manager' && currentUserRole !== 'owner') {
        if (typeof toast === 'function') toast('المساعد متاح للمدير وللمالك في حدود حسابه', 'error');
        return;
    }
    if (typeof openModal === 'function') openModal('assistantModal');
    bindAssistantMobileViewport();
    syncAssistantMobileViewport();
    syncAssistantFab();
    const log = document.getElementById('assistantLog');
    if (log && !log.children.length) {
        const identity = assistantCurrentAuthIdentity();
        void hydrateAssistantChatFromRemote().then(loaded => {
            if (identity !== assistantCurrentAuthIdentity()) return;
            if (!loaded) {
                // A message may have been sent while the load was in flight;
                // that interaction wins and must not be rendered twice.
                if (!log.children.length) restoreAssistantChat();
                return;
            }
            log.innerHTML = '';
            if (assistantChat.length) assistantChat.forEach(item => renderAssistantMessage(item.role, item.html));
            else appendAssistantMessage('bot', buildAssistantGreetingHtml(), null, { greeting: true });
        }).then(() => { maybeAppendAssistantMorningBrief(); });
    } else {
        maybeAppendAssistantMorningBrief();
    }
    requestAnimationFrame(() => {
        const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('assistantInput'));
        if (!input) return;
        input.placeholder = assistantIsOwner()
            ? 'اسألني عن حسابك، إيصالاتك، ميعاد الدفع…'
            : 'اسألني عن التحصيل، المتأخرات، الخزنة…';
        updateAssistantComposerState();
        if (typeof input.focus === 'function') input.focus();
    });
}

/** @param {Event | null} [event] @param {{ text?: string, userHtml?: string }} [options] */
function sendAssistantMessage(event, options = {}) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('assistantInput'));
    if (!input) return;
    if (document.getElementById('assistantModal')?.dataset.assistantBusy === 'true') return;
    const text = typeof options.text === 'string' ? String(options.text).trim() : String(input.value || '').trim();
    if (!text) return;
    // Any in-flight history load is now stale; the live conversation wins and
    // must be allowed to persist remotely instead of waiting for that load.
    const revision = ++assistantChatRevision;
    assistantRemoteHydrated = true;
    input.value = '';
    updateAssistantComposerState();
    const reviewedVoiceNote = typeof assistantVoiceConsumeReviewNote === 'function'
        ? assistantVoiceConsumeReviewNote(text) : null;
    const userHtml = typeof options.userHtml === 'string'
        ? options.userHtml
        : reviewedVoiceNote || formatAssistantUserText(text);
    appendAssistantMessage('user', userHtml, text);
    const localAnswer = answerAssistantQuery(text);
    const typing = showAssistantTyping();
    const deliver = answer => {
        if (revision !== assistantChatRevision) {
            if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
            return;
        }
        if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
        const botMessage = appendAssistantMessage('bot', assistantAnswerHtml(answer), null, { answerId: answer.id, source: answer.source || 'local' });
        if (typeof assistantVoiceOnBotReply === 'function') assistantVoiceOnBotReply(answer, botMessage);
        if (answer.id === 'operation-confirm-request') {
            setAssistantBusy(true);
            void confirmAssistantOperation().finally(() => setAssistantBusy(false));
        } else if (answer.id === 'notice-confirm-request') {
            setAssistantBusy(true, 'جارٍ نشر الإعلان بعد تأكيدك…');
            void confirmAssistantNotice().then(saved => {
                appendAssistantMessage('bot', assistantNote(saved
                    ? 'تم نشر الإعلان بعد تأكيدك.'
                    : 'لم يُنشر الإعلان. راجع البيانات وحاول مرة أخرى أو اكتب «إلغاء الإعلان».'));
            }).finally(() => setAssistantBusy(false));
        } else if (answer.id === 'operation-open-form-request') {
            openAssistantOperation();
        } else if (answer.id === 'reminder-open-request') {
            if (typeof closeModal === 'function') closeModal('assistantModal');
            if (typeof openArrearsRemindersList === 'function') openArrearsRemindersList(answer.reminderRequest?.residentId || '');
        } else if (answer.id === 'reports-open-request') {
            const request = answer.reportRequest || {};
            openAssistantReportsRequest(request.tab || 'landlord', request.month || '', request.residentId || '');
        }
    };
    // The optional Groq bridge only rephrases an approved answer. It never
    // computes numbers or permissions; when absent, delivery stays synchronous.
    const groqAnswer = assistantGlobalFunction('assistantGroqAnswer');
    if (typeof groqAnswer === 'function') {
        setAssistantBusy(true, 'جارٍ تجهيز الرد…');
        void Promise.resolve()
            .then(() => groqAnswer(text, localAnswer))
            .then(remote => {
                setAssistantBusy(false);
                deliver(remote && typeof remote.html === 'string' ? remote : localAnswer);
            })
            .catch(() => {
                setAssistantBusy(false);
                deliver(localAnswer);
            });
    } else if (typeof setTimeout === 'function' && ASSISTANT_TYPING_DELAY_MS > 0) {
        setTimeout(() => deliver(localAnswer), ASSISTANT_TYPING_DELAY_MS);
    } else {
        deliver(localAnswer);
    }
    if (typeof input.focus === 'function') input.focus();
}

function handleAssistantComposerKeydown(event) {
    if (!event || event.key !== 'Enter' || event.shiftKey) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    sendAssistantMessage(event);
}

function askAssistant(query) {
    const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('assistantInput'));
    if (!input) return;
    input.value = String(query || '');
    sendAssistantMessage();
}

function resetAssistantChat() {
    if (document.getElementById('assistantModal')?.dataset.assistantBusy === 'true') return;
    if (typeof assistantVoiceStop === 'function') assistantVoiceStop('cancel');
    if (typeof assistantVoiceStopSpeech === 'function') assistantVoiceStopSpeech();
    assistantChatRevision += 1;
    assistantRemoteHydrated = true;
    const remoteClear = clearAssistantRemoteHistory();
    const log = document.getElementById('assistantLog');
    if (log) log.innerHTML = '';
    assistantChat = [];
    assistantContext = { period: null, residentId: null };
    assistantNoticeDraft = null;
    assistantOperationDraft = null;
    assistantMutationDraft = null;
    assistantResidentEntryDraft = null;
    clearAssistantOperationContext();
    const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('assistantInput'));
    if (input) input.value = '';
    updateAssistantComposerState();
    persistAssistantChat();
    persistAssistantContext();
    appendAssistantMessage('bot', buildAssistantGreetingHtml(), null, { greeting: true });
    void remoteClear.then(cleared => {
        if (!cleared && typeof toast === 'function') {
            toast('تم مسح المحادثة من هذه الصفحة، لكن تعذّر مزامنة المسح. تحقق من الاتصال ثم أعد المحاولة.', 'error');
        }
    });
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

let assistantFabScrollTimer = 0;
function markAssistantFabScrolling() {
    const fab = document.getElementById('assistantFab');
    if (!fab || !fab.classList) return;
    fab.classList.add('is-scrolling');
    clearTimeout(assistantFabScrollTimer);
    assistantFabScrollTimer = setTimeout(() => fab.classList.remove('is-scrolling'), 650);
}

function handleAssistantFabScroll() {
    markAssistantFabScrolling();
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
