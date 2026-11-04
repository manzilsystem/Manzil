function openNoticeModal() { if (!requireManager()) return; document.getElementById('noticeInput').value = ''; openModal('noticeModal'); }

function applyNoticeTemplate(type) {
    if (!requireManager()) return;
    const t = {
        monthly_sub: `السادة سكان العمارة،\nنذكركم بضرورة سداد اشتراك شهر ${getCurrentMonth()} وقدره ${fmtNum(state.defaultSubscription)} جنيه.\nشاكرين تعاونكم.`,
        cleaning: `إعلان هام:\nسيتم عمل حملة نظافة للعمارة يوم ____ القادم.\nنرجو التعاون وإزالة أي عوائق من أمام الأبواب.`,
        elevator: `إعلان:\nنظراً لأعمال الصيانة الدورية، سيكون الأسانسير متوقفاً يوم ____ من الساعة __ إلى __.\nنعتذر عن الإزعاج.`,
        eid: `كل عام وأنتم بخير بمناسبة ____.\nأعاده الله عليكم باليمن والبركات.\nإدارة العمارة.`
    };
    document.getElementById('noticeInput').value = t[type] || '';
}

async function handleNoticeSubmit() {
    if (!requireManager()) return;
    const text = document.getElementById('noticeInput').value.trim();
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
    if (!confirm('حذف هذا الإعلان؟')) return;
    const previousState = cloneStateSnapshot();
    state.notices = state.notices.filter(n => n.id !== id);
    logAction('حذف إعلان', notice?.text || id);
    if (!await saveWithRollback(previousState)) return;
    renderNotices();
    toast('تم حذف الإعلان', 'info');
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
    const r = state.residents.find(x => x.id === residentId); if (!r) return;
    const d = calculateCumulativeDebt(residentId);
    const phone = cleanPhone(r.phone);
    if (!phone) { toast('أضف رقم هاتف الساكن أولاً لإرسال التذكير','error'); return; }
    const msg = `مرحباً ${r.name}،\nنذكركم بسداد اشتراك شهر ${getCurrentMonth()} للعمارة.\n${d.count>0?`إجمالي المتأخرات: ${fmtNum(d.totalDebt)} ج.م (${d.count} شهر)\n`:''}شكراً لتعاونكم.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
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
        toast('أضف رقم هاتف الساكن أولاً لإرسال الإيصال.', 'error');
        return;
    }

    const referenceMatch = String(payment.notes || '').match(/دفعة موزعة\s+([A-Z0-9]+)/i);
    const reference = referenceMatch?.[1] || String(payment.id).replace(/[^a-z0-9]/gi, '').slice(0, 12).toUpperCase();
    const relatedPayments = referenceMatch
        ? state.income.filter(item =>
            item.residentId === payment.residentId &&
            item.date === payment.date &&
            String(item.notes || '').includes(reference)
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
    const details = relatedPayments.map(item =>
        `• ${item.month}: ${fmtNum(item.amount)} ج.م`
    ).join('\n');
    const message = [
        `إيصال استلام — ${state.buildingName || 'العمارة'}`,
        '',
        `مرحباً ${resident.name || 'بكم'}،`,
        'نؤكد استلام دفعة الاشتراك بنجاح.',
        `الشقة: ${resident.apartmentNumber || '—'}`,
        `المبلغ المستلم: ${fmtNum(total)} ج.م`,
        `طريقة الدفع: ${getIncomePaymentMethodLabel(payment.paymentMethod)}`,
        'تفاصيل السداد:',
        details,
        `تاريخ الاستلام: ${formatDate(payment.date)}`,
        `رقم الإيصال: ${reference}`,
        '',
        getReceiptThankYouMessage()
    ].join('\n');

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}
