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

async function handleNoticeSubmit() {
    if (!requireManager()) return;
    const text = /** @type {HTMLInputElement} */ (document.getElementById('noticeInput')).value.trim();
    if (!text) { toast('اكتب نص الإعلان','error'); return; }
    const previousState = cloneStateSnapshot();
    state.notices.push({ id: generateId(), text, date: new Date().toISOString() });
    logAction('إعلان جديد', text.substring(0, 40));
    if (!await saveWithRollback(previousState)) return;
    closeModal('noticeModal'); renderNotices(); toast('تم النشر','success');
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

function cleanPhone(p) {
    if (!p) return '';
    let d = p.replace(/\D/g, '');
    if (d.startsWith('0')) d = '20' + d.substring(1);
    else if (d.length === 10) d = '20' + d;
    return d;
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
    return {
        residentId: resident.id,
        name: resident.name || '',
        apartment: resident.apartmentNumber || '',
        phone,
        amount: item.totalDebt,
        count: item.count,
        message,
        url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    };
}

function buildArrearsReminderMessages(report) {
    return (report?.residents || []).map(buildArrearsReminderMessage).filter(Boolean);
}

function sendBulkArrearsReminders() {
    if (!requireManager()) return;
    const report = typeof buildArrearsReport === 'function'
        ? buildArrearsReport(typeof getArrearsReportFilters === 'function' ? getArrearsReportFilters() : {})
        : { residents: [] };
    if (!report.residents.length) {
        toast('لا توجد متأخرات لإرسال تذكير بها.', 'info');
        return;
    }
    const messages = buildArrearsReminderMessages(report);
    if (!messages.length) {
        toast('لا يوجد رقم هاتف مسجّل لأي من المتأخرين المعروضين.', 'error');
        return;
    }
    const skipped = report.residents.length - messages.length;
    const note = skipped > 0 ? `\nسيتم تخطي ${fmtNum(skipped)} شقة بلا رقم هاتف.` : '';
    if (!window.confirm(`سيتم فتح ${fmtNum(messages.length)} محادثة واتساب لإرسال التذكير يدويًا.${note}\nهل تريد المتابعة؟`)) return;
    messages.forEach(item => window.open(item.url, '_blank', 'noopener,noreferrer'));
    toast(`تم فتح ${fmtNum(messages.length)} محادثة واتساب للإرسال اليدوي.`, 'success');
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
