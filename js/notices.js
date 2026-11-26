// @ts-check
function openNoticeModal() { if (!requireManager()) return; /** @type {HTMLInputElement} */ (document.getElementById('noticeInput')).value = ''; openModal('noticeModal'); }

function applyNoticeTemplate(type) {
    if (!requireManager()) return;
    const t = {
        monthly_sub: `السادة ملاك العمارة،\nنذكركم بضرورة سداد اشتراك شهر ${getCurrentMonth()} وقدره ${fmtNum(state.defaultSubscription)} جنيه.\nشاكرين تعاونكم.`,
        cleaning: `إعلان هام:\nسيتم عمل حملة نظافة للعمارة يوم ____ القادم.\nنرجو التعاون وإزالة أي عوائق من أمام الأبواب.`,
        elevator: `إعلان:\nنظراً لأعمال الصيانة الدورية، سيكون الأسانسير متوقفاً يوم ____ من الساعة __ إلى __.\nنعتذر عن الإزعاج.`,
        eid: `كل عام وأنتم بخير بمناسبة ____.\nأعاده الله عليكم باليمن والبركات.\nإدارة العمارة.`
    };
    /** @type {HTMLInputElement} */ (document.getElementById('noticeInput')).value = t[type] || '';
}

async function publishNoticeWithRequestId(text, requestId = null) {
    if (!requireManager()) return;
    if (!text) { toast('اكتب نص الإعلان','error'); return; }
    const previousState = cloneStateSnapshot();
    state.notices.push({ id: generateId(), text, date: new Date().toISOString() });
    logAction('إعلان جديد', text.substring(0, 40));
    if (!await saveWithRollback(previousState, requestId)) return false;
    renderNotices();
    return true;
}

async function handleNoticeSubmit() {
    if (!requireManager()) return;
    const text = /** @type {HTMLInputElement} */ (document.getElementById('noticeInput')).value.trim();
    if (!text) { toast('اكتب نص الإعلان','error'); return; }
    if (!await publishNoticeWithRequestId(text)) return;
    closeModal('noticeModal');
    toast('تم النشر','success');
}

async function deleteNotice(id) {
    if (!requireManager()) return;
    const notice = state.notices.find(n => n.id === id); if (!notice) return;
    if (!confirmRecordDeletion('هذا الإعلان')) return;
    const previousState = cloneStateSnapshot();
    state.notices = state.notices.filter(n => n.id !== id);
    logAction('حذف إعلان', notice?.text || id);
    if (!await saveWithRollback(previousState)) return;
    renderNotices();
    toast('تم حذف الإعلان بنجاح', 'success');
}

function shareNoticeToWhatsApp() {
    if (!requireManager()) return;
    if (!state.notices.length) { toast('لا يوجد إعلان','error'); return; }
    const n = state.notices[state.notices.length - 1];
    const text = `📢 ${state.buildingName || 'العمارة'}\n\n${n.text}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function copyNoticeToClipboard() {
    if (!requireManager()) return;
    if (!state.notices.length) { toast('لا يوجد إعلان','error'); return; }
    const n = state.notices[state.notices.length - 1];
    navigator.clipboard.writeText(n.text).then(() => toast('تم النسخ','success')).catch(() => toast('فشل النسخ','error'));
}

// Returns digits-only international number for wa.me (no +), or '' when the input is clearly junk.
// Accepts Egyptian 01XXXXXXXXX and E.164-style numbers (+ or 00 prefix, 8-15 digits); spaces, dashes and dots are ignored.
function cleanPhone(p) {
    if (!p) return '';
    let v = String(p).trim()
        .replace(/[٠-٩]/g, ch => String(ch.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, ch => String(ch.charCodeAt(0) - 1776))
        .replace(/[\s().-]/g, '');
    if (/[^\d+]/.test(v) || v.indexOf('+', 1) > 0) return '';
    if (v.startsWith('+')) v = v.slice(1);
    else if (v.startsWith('00')) v = v.slice(2);
    else if (/^01\d{9}$/.test(v)) v = '20' + v.slice(1);
    else if (/^1\d{9}$/.test(v)) v = '20' + v;
    return /^[1-9]\d{7,14}$/.test(v) ? v : '';
}

function sendWhatsAppReminder(residentId) {
    if (!requireManager()) return;
    const resident = state.residents.find(item => item.id === residentId);
    if (!resident) return;
    const debt = calculateCumulativeDebt(residentId);
    if (!debt.count || !(Number(debt.totalDebt) > 0)) {
        toast('لا توجد متأخرات مستحقة لهذا المالك.', 'info');
        return;
    }
    const phone = cleanPhone(resident.phone);
    if (!phone) {
        toast('أضف رقم هاتف المالك أولاً لإرسال التذكير', 'error');
        return;
    }
    const message = renderReminderTemplate(getReminderMessageTemplate(), {
        name: resident.name || 'بكم',
        building: state.buildingName || 'العمارة',
        apartment: resident.apartmentNumber || '—',
        month: getCurrentMonth(),
        amount: fmtNum(debt.totalDebt),
        count: debt.count,
        days: debt.daysOverdue ? String(debt.daysOverdue) : '',
        duration: typeof formatOverdueDuration === 'function' ? formatOverdueDuration(debt.daysOverdue) : '',
        months: Array.isArray(debt.unpaidMonths) ? debt.unpaidMonths.join('، ') : ''
    });
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    markArrearsReminderSent(residentId);
}

function buildArrearsReminderMessage(item) {
    const resident = item?.resident || {};
    const phone = cleanPhone(resident.phone);
    if (!phone) return null;
    const months = Array.isArray(item.unpaidMonths)
        ? item.unpaidMonths.map(month => month?.month).filter(Boolean).join('، ')
        : '';
    const message = renderReminderTemplate(getReminderMessageTemplate(), {
        name: resident.name || 'بكم',
        building: state.buildingName || 'العمارة',
        apartment: resident.apartmentNumber || '—',
        month: getCurrentMonth(),
        amount: fmtNum(item.totalDebt),
        count: item.count,
        days: item.daysOverdue ? String(item.daysOverdue) : '',
        duration: typeof formatOverdueDuration === 'function' ? formatOverdueDuration(item.daysOverdue) : '',
        months
    });
    const status = typeof getArrearsReminderStatus === 'function' ? getArrearsReminderStatus(resident.id) : { kind: 'none' };
    const finalMessage = status.kind === 'followup'
        ? 'تذكير تاني بعد رسالتنا ' + arrearsReminderDaysLabel(status.days) + '.\n' + message
        : message;
    return {
        residentId: resident.id,
        name: resident.name || '',
        apartment: resident.apartmentNumber || '',
        phone,
        amount: item.totalDebt,
        count: item.count,
        message: finalMessage,
        followUp: status.kind === 'followup',
        url: `https://wa.me/${phone}?text=${encodeURIComponent(finalMessage)}`
    };
}

function buildArrearsReminderMessages(report) {
    return (report?.residents || []).map(buildArrearsReminderMessage).filter(Boolean);
}

const ARREARS_REMINDER_PAGE_SIZE = 8;
let arrearsReminderLimit = ARREARS_REMINDER_PAGE_SIZE;
/** @type {string} */
let arrearsReminderOnly = '';
/** @type {'all' | 'new' | 'followup'} */
let arrearsReminderFilter = 'all';

function getArrearsReminderSentKey() {
    const buildingId = typeof activeBuildingId === 'undefined' ? 'default' : (activeBuildingId || 'default');
    return 'manzil:' + buildingId + ':arrears-reminders-sent';
}

/** @returns {Record<string, string>} resident id -> date (YYYY-MM-DD) the manager last opened WhatsApp for them */
function readArrearsReminderSent() {
    try {
        const parsed = JSON.parse(localStorage.getItem(getArrearsReminderSentKey()) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
}

function markArrearsReminderSent(residentId) {
    const sent = readArrearsReminderSent();
    sent[residentId] = new Date().toISOString().slice(0, 10);
    try { localStorage.setItem(getArrearsReminderSentKey(), JSON.stringify(sent)); } catch { /* storage full or blocked: the mark is only a convenience */ }
}

const ARREARS_FOLLOWUP_DAYS = 3;

/**
 * Where one late apartment stands after the last reminder, from what the app already knows:
 * none (never reminded), waiting (reminded less than 3 days ago), followup (3+ days, nothing paid since),
 * partial (paid something since the reminder, still late). Payments dated after the reminder day count as "since".
 */
function getArrearsReminderStatus(residentId, now = new Date()) {
    const last = readArrearsReminderSent()[residentId];
    if (!last) return { kind: 'none', days: 0, last: '' };
    const todayKey = now.toISOString().slice(0, 10);
    const days = Math.max(0, Math.round((Date.parse(todayKey) - Date.parse(last)) / 86400000));
    const paidSince = (Array.isArray(state.income) ? state.income : []).some(row =>
        row.residentId === residentId && String(row.date || '').slice(0, 10) > last);
    if (paidSince) return { kind: 'partial', days, last };
    return { kind: days >= ARREARS_FOLLOWUP_DAYS ? 'followup' : 'waiting', days, last };
}

function arrearsReminderDaysLabel(days) {
    if (days <= 0) return 'النهارده';
    if (days === 1) return 'من يوم';
    if (days === 2) return 'من يومين';
    return 'من ' + fmtNum(days) + ' أيام';
}

/** Late apartments that were reminded 3+ days ago and have paid nothing since. */
function getArrearsFollowUps(report, now = new Date()) {
    return (report?.residents || [])
        .map(item => ({ item, status: getArrearsReminderStatus(item.resident?.id, now) }))
        .filter(entry => entry.status.kind === 'followup')
        .sort((a, b) => b.status.days - a.status.days);
}

function arrearsReminderTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function hasCustomReminderTemplate() {
    if (state.reminderMessageTemplate !== null && state.reminderMessageTemplate !== undefined) return String(state.reminderMessageTemplate).trim() !== '';
    try { return String(localStorage.getItem(getReminderTemplateKey()) || '').trim() !== ''; } catch { return false; }
}

/** Tone picker above the list: three buttons, disabled while a custom message from Settings is in use. */
function renderArrearsReminderTonePicker() {
    const host = document.getElementById('arrearsReminderTone');
    if (!host) return;
    const custom = hasCustomReminderTemplate();
    const current = getReminderTone();
    const buttons = Object.keys(REMINDER_TONES).map(key => {
        const tone = REMINDER_TONES[key];
        const active = !custom && key === current;
        return '<button type="button" role="radio" aria-checked="' + (active ? 'true' : 'false') + '" data-reminder-tone="' + key + '"' + (custom ? ' disabled' : '')
            + ' onclick="setArrearsReminderTone(\'' + key + '\')" class="min-h-11 rounded-xl border text-xs font-bold px-2 ' + (active ? 'bg-emerald-600 text-white border-emerald-500' : 'app-input') + (custom ? ' opacity-50' : '') + '">'
            + esc(tone.label) + '<span class="block text-[10px] font-normal opacity-75">' + esc(tone.hint) + '</span></button>';
    }).join('');
    host.innerHTML = '<p class="text-xs font-bold mb-1">نبرة الرسالة</p><div role="radiogroup" aria-label="نبرة الرسالة" class="grid grid-cols-3 gap-2">' + buttons + '</div>'
        + (custom ? '<p class="text-[11px] text-amber-400 mt-1">عندك رسالة مخصصة في الإعدادات، وهي اللي بتتبعت. امسحها عشان تختار نبرة.</p>' : '');
}

function setArrearsReminderTone(tone) {
    if (!requireManager()) return;
    if (hasCustomReminderTemplate()) return;
    if (!setReminderTone(tone)) {
        toast('تعذر حفظ النبرة على الجهاز.', 'error');
        return;
    }
    renderArrearsReminderRows();
}

function renderArrearsReminderFilters(counts, visible) {
    const host = document.getElementById('arrearsReminderFilters');
    if (!host) return;
    if (!visible) { host.innerHTML = ''; return; }
    const chips = [['all', 'كلهم'], ['new', 'لسه ما اتذكّروش'], ['followup', 'محتاجين متابعة']].map(([key, label]) => {
        const active = arrearsReminderFilter === key;
        return '<button type="button" role="radio" aria-checked="' + (active ? 'true' : 'false') + '" data-reminder-filter="' + key + '" onclick="setArrearsReminderFilter(\'' + key + '\')" class="min-h-11 rounded-xl border text-xs font-bold px-1 ' + (active ? 'bg-emerald-600 text-white border-emerald-500' : 'app-input') + '">'
            + esc(label) + ' <span class="opacity-75">' + fmtNum(counts[key] || 0) + '</span></button>';
    }).join('');
    host.innerHTML = '<div role="radiogroup" aria-label="تصفية التذكيرات" class="grid grid-cols-3 gap-2">' + chips + '</div>';
}

function setArrearsReminderFilter(filter) {
    if (!['all', 'new', 'followup'].includes(filter)) return;
    arrearsReminderFilter = filter;
    arrearsReminderLimit = ARREARS_REMINDER_PAGE_SIZE;
    renderArrearsReminderRows();
}

function renderArrearsReminderRows() {
    renderArrearsReminderTonePicker();
    const host = document.getElementById('arrearsRemindersList');
    const summary = document.getElementById('arrearsRemindersSummary');
    if (!host) return;
    const report = typeof buildArrearsReport === 'function'
        ? buildArrearsReport(typeof getArrearsReportFilters === 'function' ? getArrearsReportFilters() : {})
        : { residents: [] };
    const scoped = (report.residents || []).filter(item => !arrearsReminderOnly || item.resident?.id === arrearsReminderOnly);
    const statusOf = item => getArrearsReminderStatus(item.resident?.id);
    const counts = {
        all: scoped.length,
        new: scoped.filter(item => statusOf(item).kind === 'none').length,
        followup: scoped.filter(item => statusOf(item).kind === 'followup').length
    };
    renderArrearsReminderFilters(counts, !arrearsReminderOnly);
    const items = scoped.filter(item => {
        if (arrearsReminderOnly || arrearsReminderFilter === 'all') return true;
        const kind = statusOf(item).kind;
        return arrearsReminderFilter === 'new' ? kind === 'none' : kind === 'followup';
    });
    const sent = readArrearsReminderSent();
    const today = arrearsReminderTodayKey();
    if (summary) {
        const withPhone = items.filter(item => cleanPhone(item.resident?.phone)).length;
        summary.textContent = items.length
            ? arrearsLateApartmentsLabel(items.length) + ' · ' + (withPhone === items.length ? 'كلهم برقم هاتف' : fmtNum(withPhone) + ' برقم هاتف')
            : '';
    }
    if (!items.length) {
        const emptyText = arrearsReminderFilter === 'followup' && scoped.length ? 'مفيش حد محتاج متابعة دلوقتي.'
            : arrearsReminderFilter === 'new' && scoped.length ? 'كلهم اتذكّروا.'
                : 'لا توجد متأخرات لإرسال تذكير بها.';
        host.innerHTML = '<p class="text-xs text-slate-500 text-center py-6">' + esc(emptyText) + '</p>';
        return;
    }
    const shown = items.slice(0, arrearsReminderLimit);
    host.innerHTML = shown.map(item => {
        const built = buildArrearsReminderMessage(item);
        const resident = item.resident || {};
        const id = esc(String(resident.id || ''));
        const title = esc(resident.name || 'مالك') + ' · شقة ' + esc(String(resident.apartmentNumber || '—'));
        const meta = fmtNum(item.totalDebt) + ' ج.م · ' + fmtNum(item.count) + ' شهر';
        const doneToday = sent[resident.id] === today;
        const reminded = statusOf(item);
        const status = doneToday ? '<span class="text-emerald-400 text-xs font-bold">أُرسل اليوم</span>'
            : reminded.kind === 'followup' ? '<span class="text-amber-400 text-xs font-bold">اتذكّر ' + esc(arrearsReminderDaysLabel(reminded.days)) + ' ولسه ما دفعش</span>'
                : reminded.kind === 'partial' ? '<span class="text-sky-400 text-xs font-bold">دفع جزء بعد التذكير</span>'
                    : sent[resident.id] ? '<span class="text-slate-500 text-xs">اتذكّر ' + esc(arrearsReminderDaysLabel(reminded.days)) + '</span>' : '';
        const action = built
            ? '<button type="button" data-reminder-send="' + id + '" onclick="sendArrearsReminderFor(\'' + id + '\')" class="min-h-11 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold"><i class="fa-brands fa-whatsapp ml-1" aria-hidden="true"></i>' + (reminded.kind === 'followup' ? 'تذكير تاني' : doneToday ? 'إعادة' : 'إرسال') + '</button>'
            : '<span class="text-xs text-amber-400">بلا رقم هاتف</span>';
        const preview = built
            ? '<button type="button" onclick="toggleArrearsReminderPreview(this)" aria-expanded="false" class="min-h-11 min-w-11 rounded-xl app-input border text-xs" aria-label="عرض نص الرسالة"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>'
            : '';
        return '<div class="arrears-reminder-row app-input border rounded-2xl p-3" data-reminder-row="' + id + '">'
            + '<div class="flex items-center gap-2 justify-between">'
            + '<div class="min-w-0"><p class="text-sm font-bold truncate">' + title + '</p><p class="text-xs text-slate-400">' + meta + ' ' + status + '</p></div>'
            + '<div class="flex items-center gap-2 shrink-0">' + preview + action + '</div></div>'
            + (built ? '<pre class="arrears-reminder-text hidden mt-2 text-xs whitespace-pre-wrap leading-relaxed text-slate-300 font-sans">' + esc(built.message) + '</pre>' : '')
            + '</div>';
    }).join('');
    const rest = items.length - shown.length;
    if (rest > 0) {
        host.insertAdjacentHTML('beforeend', '<button type="button" onclick="showMoreArrearsReminders()" class="min-h-11 w-full rounded-xl app-input border text-xs font-bold">عرض ' + fmtNum(rest) + ' أخرى</button>');
    }
}

/** Dashboard card: shows from the first overdue day (due day + grace) when late apartments exist. */
/** "شقة متأخرة" in speech form: شقة، شقتين، 3 شقق (3 to 10), 11 شقة. */
function arrearsLateApartmentsLabel(count) {
    const n = Math.max(0, Math.round(Number(count) || 0));
    if (n === 1) return 'شقة متأخرة';
    if (n === 2) return 'شقتين متأخرتين';
    if (n >= 3 && n <= 10) return fmtNum(n) + ' شقق متأخرة';
    return fmtNum(n) + ' شقة متأخرة';
}

function renderDashboardRemindersCard() {
    const card = document.getElementById('dashboardRemindersCard');
    if (!card) return;
    const text = document.getElementById('dashboardRemindersText');
    const report = currentUserRole === 'manager' && typeof buildArrearsReport === 'function' ? buildArrearsReport({}) : { residents: [] };
    const everyone = report.residents || [];
    if (!everyone.length) { card.classList.add('hidden'); return; }
    const late = everyone.filter(item => cleanPhone(item.resident?.phone));
    const noPhone = everyone.length - late.length;
    const sent = readArrearsReminderSent();
    const today = arrearsReminderTodayKey();
    const pending = late.filter(item => sent[item.resident?.id] !== today).length;
    const followUps = late.filter(item => getArrearsReminderStatus(item.resident?.id).kind === 'followup').length;
    if (text) {
        // The count is every late apartment, the same number the reminders list shows. Apartments
        // with no phone number cannot be reminded, so they are called out instead of silently dropped.
        const parts = [arrearsLateApartmentsLabel(everyone.length)];
        parts.push(late.length
            ? (pending ? fmtNum(pending) + ' لم يُرسل لها تذكير اليوم' : 'تم إرسال تذكير للجميع اليوم')
            : 'مفيش رقم هاتف مسجل لأي منهم');
        if (followUps) parts.push(fmtNum(followUps) + ' محتاجين متابعة');
        if (noPhone && late.length) parts.push(fmtNum(noPhone) + ' بلا رقم هاتف');
        text.textContent = parts.join(' · ');
    }
    card.classList.remove('hidden');
}

function toggleArrearsReminderPreview(button) {
    const row = button.closest('[data-reminder-row]');
    const text = row?.querySelector('.arrears-reminder-text');
    if (!text) return;
    const open = text.classList.toggle('hidden') === false;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function showMoreArrearsReminders() {
    arrearsReminderLimit += ARREARS_REMINDER_PAGE_SIZE;
    renderArrearsReminderRows();
}

/** One-tap send: opens WhatsApp with the filled message for one apartment. Nothing is sent until the manager presses send inside WhatsApp. */
function sendArrearsReminderFor(residentId) {
    if (!requireManager()) return;
    const report = typeof buildArrearsReport === 'function'
        ? buildArrearsReport(typeof getArrearsReportFilters === 'function' ? getArrearsReportFilters() : {})
        : { residents: [] };
    const item = (report.residents || []).find(entry => entry.resident?.id === residentId);
    const built = item ? buildArrearsReminderMessage(item) : null;
    if (!built) {
        toast('تعذر تجهيز الرسالة: لا توجد متأخرات أو رقم هاتف لهذه الشقة.', 'error');
        return;
    }
    window.open(built.url, '_blank', 'noopener,noreferrer');
    markArrearsReminderSent(residentId);
    renderArrearsReminderRows();
    renderDashboardRemindersCard();
}

/** Opens the reminders list for every late apartment, or only for one when residentId is given. */
function openArrearsRemindersList(residentId = '') {
    if (!requireManager()) return false;
    arrearsReminderOnly = String(residentId || '');
    arrearsReminderFilter = 'all';
    arrearsReminderLimit = ARREARS_REMINDER_PAGE_SIZE;
    renderArrearsReminderRows();
    openModal('arrearsRemindersModal');
    return true;
}

function sendBulkArrearsReminders() {
    openArrearsRemindersList('');
}


function sendIncomeReceiptOnWhatsApp(incomeId) {
    if (!requireManager()) return;
    const payment = state.income.find(item => item.id === incomeId);
    if (!payment) {
        toast('تعذر العثور على التحصيل. حدّث السجل ثم حاول مرة أخرى.', 'error');
        return;
    }
    const resident = state.residents.find(item => item.id === payment.residentId);
    if (!resident) {
        toast('بيانات الشقة غير متاحة لهذا التحصيل.', 'error');
        return;
    }
    const phone = cleanPhone(resident.phone);
    if (!phone) {
        toast('أضف رقم هاتف المالك أولاً لإرسال الإيصال.', 'error');
        return;
    }

    const referenceMatch = String(payment.notes || '').match(/دفعة موزعة\s+([A-Z0-9]+)/i);
    const reference = referenceMatch?.[1] || String(payment.id).replace(/[^a-z0-9]/gi, '').slice(0, 12).toUpperCase();
    const relatedPayments = referenceMatch
        ? state.income.filter(item =>
            item.residentId === payment.residentId &&
            item.date === payment.date &&
            String(item.notes || '').startsWith('دفعة موزعة ' + reference + ' (')
        )
        : [payment];
    relatedPayments.sort((a, b) => {
        const order = item => {
            const match = String(item.notes || '').match(/\((\d+)\//);
            return Number(match?.[1] || 0);
        };
        return order(a) - order(b);
    });

    const total = relatedPayments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const purposeLabelFor = item => typeof getIncomePurposeLabel === 'function'
        ? getIncomePurposeLabel(item.purposeCode)
        : 'اشتراك شهري';
    const cashAccountLabelFor = item => typeof getCashAccountLabel === 'function'
        ? getCashAccountLabel(item.cashAccountCode || 'main')
        : '';
    const purposeLabels = Array.from(new Set(relatedPayments.map(purposeLabelFor)));
    const purposeLabel = purposeLabels.length === 1 ? purposeLabels[0] : 'دفعة مختلطة';
    const cashAccountLabels = Array.from(new Set(relatedPayments.map(cashAccountLabelFor))).filter(Boolean);
    const details = relatedPayments.map(item =>
        `• ${purposeLabelFor(item)} · ${item.month}: ${fmtNum(item.amount)} ج.م`
    ).join('\n');
    const apartmentLabel = typeof formatApartmentLabel === 'function'
        ? formatApartmentLabel(resident.apartmentNumber)
        : (() => {
            const raw = String(resident.apartmentNumber ?? '').trim();
            if (!raw) return 'شقة —';
            return /^شقة(?:\s|$)/.test(raw) ? raw : `شقة ${raw}`;
        })();
    const notes = Array.from(new Set(relatedPayments
        .map(item => {
            if (typeof stripIncomeBatchNote === 'function') return stripIncomeBatchNote(item.notes);
            const text = String(item.notes || '').trim();
            const match = text.match(/^دفعة موزعة\s+[A-Z0-9]+\s+\(\d+\/\d+\)(?:\s*·\s*([\s\S]*))?$/i);
            return match ? String(match[1] || '').trim() : text;
        })
        .filter(Boolean)));
    const message = [
        `إيصال استلام — ${state.buildingName || 'العمارة'}`,
        '',
        `مرحباً ${resident.name || 'بكم'}،`,
        `نؤكد استلام تحصيل «${purposeLabel}» بنجاح.`,
        `الشقة: ${apartmentLabel}`,
        `المبلغ المستلم: ${fmtNum(total)} ج.م`,
        `طريقة الدفع: ${getIncomePaymentMethodLabel(payment.paymentMethod)}`,
        ...(cashAccountLabels.length ? [`الصندوق: ${cashAccountLabels.join('، ')}`] : []),
        'تفاصيل التحصيل:',
        details,
        ...(notes.length ? [`ملاحظات الدفع: ${notes.join(' · ')}`] : []),
        `تاريخ الاستلام: ${formatDate(payment.date)}`,
        `رقم الإيصال: ${reference}`,
        '',
        getReceiptThankYouMessage()
    ].join('\n');

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}
