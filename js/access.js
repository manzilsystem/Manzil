// @ts-check
function requireManager(message = 'هذه الصلاحية متاحة للمدير فقط') {
    if (currentUserRole === 'manager') return true;
    toast(message, 'error');
    return false;
}

function clearOwnerPortal() {
    const portal = document.getElementById('ownerPortal');
    if (!portal) return;
    portal.innerHTML = '';
    portal.classList.add('hidden');
    portal.setAttribute('aria-hidden', 'true');
}


function groupOwnerPaymentsIntoReceipts(residentId) {
    const groups = new Map();
    (Array.isArray(state.income) ? state.income : [])
        .filter(payment => payment.residentId === residentId)
        .forEach(payment => {
            const match = String(payment.notes || '').match(/دفعة موزعة\s+([A-Z0-9]+)/i);
            const reference = match?.[1]
                || String(payment.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 12).toUpperCase();
            const key = match
                ? `${payment.date || ''}:${residentId}:${reference}`
                : `single:${payment.id}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    id: key,
                    reference,
                    date: payment.date || '',
                    paymentMethod: payment.paymentMethod || '',
                    payments: []
                });
            }
            groups.get(key).payments.push(payment);
        });

    return Array.from(groups.values()).map(receipt => {
        const payments = receipt.payments.slice().sort((a, b) => {
            const order = item => Number(String(item.notes || '').match(/\((\d+)\//)?.[1] || 0);
            return order(a) - order(b);
        });
        const totalCents = payments.reduce((sum, payment) => {
            const amount = Number(payment.amount);
            return sum + (Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0);
        }, 0);
        const purposeLabels = Array.from(new Set(payments.map(ownerPaymentPurposeLabel)));
        const cashboxLabels = Array.from(new Set(payments.map(ownerPaymentCashLabel))).filter(Boolean);
        return {
            ...receipt,
            payments,
            totalAmount: totalCents / 100,
            purposeSummary: purposeLabels.length === 1 ? purposeLabels[0] : 'دفعة مختلطة',
            cashboxSummary: cashboxLabels.join('، ')
        };
    }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
}

function ownerPaymentPurposeLabel(payment) {
    if (typeof getIncomePurposeLabel === 'function') return getIncomePurposeLabel(payment?.purposeCode);
    return 'اشتراك شهري';
}

function ownerPaymentCashLabel(payment) {
    if (typeof getCashAccountLabel === 'function') return getCashAccountLabel(payment?.cashAccountCode || 'main');
    return '';
}

function receiptPaymentNotes(payment) {
    if (typeof stripIncomeBatchNote === 'function') return stripIncomeBatchNote(payment?.notes);
    const text = String(payment?.notes || '').trim();
    const match = text.match(/^دفعة موزعة\s+[A-Z0-9]+\s+\(\d+\/\d+\)(?:\s*·\s*([\s\S]*))?$/i);
    return match ? String(match[1] || '').trim() : text;
}

function receiptNotesForPayments(payments) {
    return Array.from(new Set((payments || []).map(receiptPaymentNotes).filter(Boolean)));
}

function receiptApartmentLabel(resident) {
    if (typeof formatApartmentLabel === 'function') return formatApartmentLabel(resident?.apartmentNumber);
    const raw = String(resident?.apartmentNumber ?? '').trim();
    if (!raw) return 'شقة —';
    return /^شقة(?:\s|$)/.test(raw) ? raw : `شقة ${raw}`;
}

function buildReceiptDocument(receipt, resident, source = 'owner') {
    const rows = receipt.payments.map(payment => `
        <tr>
            <td>${esc(ownerPaymentPurposeLabel(payment))}</td>
            <td>${esc(payment.month || '—')}</td>
            <td>${esc(ownerPaymentCashLabel(payment) || '—')}</td>
            <td>${fmtNum(payment.amount)} ج.م</td>
        </tr>`).join('');
    const notes = receiptNotesForPayments(receipt.payments);
    const notesHtml = notes.length
        ? `<section class="notes"><div class="label">ملاحظات الدفع</div>${notes.map(note => `<p>${esc(note)}</p>`).join('')}</section>`
        : '';
    const thankYou = typeof getReceiptThankYouMessage === 'function'
        ? getReceiptThankYouMessage()
        : 'شكراً لالتزامكم، ونسعد دائماً بخدمتكم.';
    const sourceText = source === 'manager'
        ? 'تم إصدار هذا الإيصال من لوحة إدارة Manzil.'
        : 'تم إصدار هذا الإيصال من بوابة المالك في Manzil.';
    return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>إيصال ${esc(receipt.reference)} - Manzil</title>
    <style>
        * { box-sizing:border-box; }
        body { margin:0; padding:24px; background:#f1f5f9; color:#0f172a; font-family:Tahoma,Arial,sans-serif; }
        .receipt { max-width:720px; margin:0 auto; padding:28px; background:#fff; border:1px solid #cbd5e1; border-radius:16px; }
        header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding-bottom:18px; border-bottom:2px solid #334155; }
        h1 { margin:0; font-size:22px; } .brand { font-size:18px; font-weight:900; }
        .number { margin-top:8px; color:#475569; font-size:12px; }
        .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:22px 0; }
        .field { padding:11px; border:1px solid #e2e8f0; border-radius:10px; min-width:0; }
        .label { color:#64748b; font-size:11px; } .value { margin-top:6px; font-size:13px; font-weight:700; overflow-wrap:anywhere; }
        table { width:100%; border-collapse:collapse; margin-top:16px; }
        th,td { padding:12px 10px; text-align:right; border-bottom:1px solid #e2e8f0; font-size:12px; }
        th { color:#475569; background:#f8fafc; }
        .notes { margin-top:16px; padding:12px; border:1px dashed #cbd5e1; border-radius:10px; }
        .notes p { margin:5px 0 0; font-size:12px; }
        .total { display:flex; justify-content:space-between; gap:12px; margin-top:18px; padding:16px; border-radius:10px; background:#ecfdf5; color:#065f46; font-weight:900; }
        footer { margin-top:24px; padding-top:16px; border-top:1px solid #e2e8f0; text-align:center; color:#475569; font-size:12px; line-height:1.8; }
        .actions { margin-top:20px; text-align:center; }
        .actions button { min-height:46px; padding:10px 22px; border:0; border-radius:10px; background:#4f46e5; color:#fff; font-size:14px; font-weight:700; cursor:pointer; }
        @media(max-width:480px) { body { padding:10px; } .receipt { padding:16px; } h1 { font-size:18px; } .grid { gap:8px; } .field { padding:9px; } }
        @media print { body { padding:0; background:#fff; } .receipt { max-width:none; border:0; border-radius:0; padding:0; } .actions { display:none; } }
    </style>
</head>
<body>
    <main class="receipt">
        <header>
            <div><div class="brand">${esc(state.buildingName || 'Manzil')}</div><p class="number">رقم الإيصال: ${esc(receipt.reference)}</p></div>
            <h1>إيصال استلام</h1>
        </header>
        <section class="grid">
            <div class="field"><div class="label">اسم المالك</div><div class="value">${esc(resident.name || '—')}</div></div>
            <div class="field"><div class="label">الشقة</div><div class="value">${esc(receiptApartmentLabel(resident))}</div></div>
            <div class="field"><div class="label">تاريخ الاستلام</div><div class="value">${esc(formatDate(receipt.date) || '—')}</div></div>
            <div class="field"><div class="label">طريقة الدفع</div><div class="value">${esc(getIncomePaymentMethodLabel(receipt.paymentMethod))}</div></div>
            <div class="field"><div class="label">الغرض</div><div class="value">${esc(receipt.purposeSummary)}</div></div>
            <div class="field"><div class="label">الصندوق</div><div class="value">${esc(receipt.cashboxSummary || '—')}</div></div>
        </section>
        <h2 style="font-size:14px;margin:0">تفاصيل السداد</h2>
        <table><thead><tr><th>الغرض</th><th>شهر / بند</th><th>الصندوق</th><th>المبلغ</th></tr></thead><tbody>${rows}</tbody></table>
        ${notesHtml}
        <div class="total"><span>إجمالي المبلغ المستلم</span><span>${fmtNum(receipt.totalAmount)} ج.م</span></div>
        <footer>${esc(thankYou)}<br>${sourceText}</footer>
        <div class="actions"><button type="button" onclick="window.print()">طباعة / حفظ PDF</button></div>
    </main>
</body>
</html>`;
}

function openReceiptPrintWindow(receipt, resident, source = 'owner') {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        toast('اسمح بفتح نافذة الإيصال من المتصفح، ثم حاول مرة أخرى.', 'error');
        return;
    }
    try {
        printWindow.document.open();
        printWindow.document.write(buildReceiptDocument(receipt, resident, source));
        printWindow.document.close();
        printWindow.opener = null;
        printWindow.focus();
        setTimeout(() => {
            try { printWindow.print(); } catch {}
        }, 250);
    } catch {
        try { printWindow.close(); } catch {}
        toast('تعذر تجهيز الإيصال للطباعة. حاول مرة أخرى.', 'error');
    }
}

function getOwnerManagerWhatsAppPhone() {
    let phone = String(state.managerPhone || '').replace(/\D/g, '');
    if (phone.startsWith('00')) phone = phone.slice(2);
    else if (phone.startsWith('0')) phone = '20' + phone.slice(1);
    else if (phone.length === 10) phone = '20' + phone;
    return phone;
}

function contactOwnerManager() {
    if (currentUserRole !== 'owner' || !activeSession || !activeBuildingId || !currentResidentId) return;
    const phone = getOwnerManagerWhatsAppPhone();
    if (!phone || phone.length < 10) {
        toast('رقم مدير العمارة غير مسجل في إعدادات المبنى. اطلب تحديثه من الإدارة.', 'error');
        return;
    }
    const resident = state.residents.find(item => item.id === currentResidentId);
    if (!resident) return;
    const message = [
        'مرحبًا، أحتاج الاستفسار عن حساب شقتي في تطبيق Manzil.',
        `العمارة: ${state.buildingName || '—'}`,
        `الشقة: ${receiptApartmentLabel(resident)}`,
        `الاسم: ${resident.name || '—'}`
    ].join('\n');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}


function printOwnerReceipt(receiptId) {
    if (currentUserRole !== 'owner' || !activeSession || !activeBuildingId || !currentResidentId) return;
    const resident = state.residents.find(item => item.id === currentResidentId);
    if (!resident) return;
    const receipt = groupOwnerPaymentsIntoReceipts(resident.id).find(item => item.id === receiptId);
    if (!receipt) {
        toast('تعذر العثور على الإيصال. حدّث الصفحة وحاول مرة أخرى.', 'error');
        return;
    }
    openReceiptPrintWindow(receipt, resident, 'owner');
}

let activeManagerReceipt = null;

function findManagerReceipt(incomeId) {
    const payment = (Array.isArray(state.income) ? state.income : []).find(item => item.id === incomeId);
    if (!payment) return null;
    const resident = state.residents.find(item => item.id === payment.residentId);
    if (!resident) return null;
    const receipt = groupOwnerPaymentsIntoReceipts(resident.id)
        .find(item => item.payments.some(entry => entry.id === incomeId));
    return receipt ? { payment, resident, receipt } : null;
}

function buildManagerReceiptPreview(receipt, resident) {
    const detailRows = receipt.payments.map(payment => `
        <div class="rounded-xl border border-slate-700/50 p-2 space-y-0.5">
            <div class="flex justify-between gap-2 text-[11px] font-bold"><span>${esc(ownerPaymentPurposeLabel(payment))}</span><span class="text-emerald-400">${fmtNum(payment.amount)} ج.م</span></div>
            <p class="text-xs text-slate-500">${esc(payment.month || '—')} · ${esc(ownerPaymentCashLabel(payment) || '—')}</p>
        </div>`).join('');
    const notes = receiptNotesForPayments(receipt.payments);
    const thankYou = typeof getReceiptThankYouMessage === 'function'
        ? getReceiptThankYouMessage()
        : 'شكراً لالتزامكم، ونسعد دائماً بخدمتكم.';
    const field = (label, value) => `<div class="app-input border rounded-xl p-2"><p class="text-xs text-slate-500">${esc(label)}</p><p class="mt-1 text-[11px] font-bold">${esc(value)}</p></div>`;
    return `
        <div class="flex items-start justify-between gap-3 border-b border-slate-700/60 pb-3">
            <div><p class="text-sm font-bold">${esc(state.buildingName || 'Manzil')}</p><p class="text-xs text-slate-400 mt-1">رقم الإيصال: ${esc(receipt.reference)}</p></div>
            <span class="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 text-xs font-bold text-emerald-300">إيصال استلام</span>
        </div>
        <div class="grid grid-cols-2 gap-2">
            ${field('الشقة', receiptApartmentLabel(resident))}
            ${field('اسم المالك', resident.name || '—')}
            ${field('تاريخ الاستلام', formatDate(receipt.date) || '—')}
            ${field('طريقة الدفع', getIncomePaymentMethodLabel(receipt.paymentMethod))}
            ${field('الغرض', receipt.purposeSummary)}
            ${field('الصندوق', receipt.cashboxSummary || '—')}
        </div>
        <div class="space-y-1.5">${detailRows}</div>
        ${notes.length ? `<div class="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-2 space-y-1"><p class="text-xs font-bold text-indigo-300">ملاحظات الدفع</p>${notes.map(note => `<p class="text-[11px] text-slate-300">${esc(note)}</p>`).join('')}</div>` : ''}
        <div class="flex justify-between gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs font-black text-emerald-300"><span>إجمالي المبلغ المستلم</span><span>${fmtNum(receipt.totalAmount)} ج.م</span></div>
        <p class="text-xs text-slate-500 leading-5">${esc(thankYou)}<br>تم إصدار هذا الإيصال من لوحة إدارة Manzil.</p>`;
}

function openIncomeReceiptModal(incomeId) {
    if (!requireManager()) return;
    const found = findManagerReceipt(incomeId);
    if (!found) {
        toast('تعذر العثور على الإيصال. حدّث السجل ثم حاول مرة أخرى.', 'error');
        return;
    }
    activeManagerReceipt = { residentId: found.resident.id, receiptId: found.receipt.id, incomeId };
    const subtitle = document.getElementById('incomeReceiptSubtitle');
    if (subtitle) subtitle.textContent = `${found.receipt.reference} · ${found.resident.name}`;
    const content = document.getElementById('incomeReceiptContent');
    if (content) content.innerHTML = buildManagerReceiptPreview(found.receipt, found.resident);
    openModal('incomeReceiptModal');
}

function printActiveIncomeReceipt() {
    if (!requireManager() || !activeManagerReceipt) return;
    const resident = state.residents.find(item => item.id === activeManagerReceipt.residentId);
    if (!resident) {
        toast('تعذر العثور على بيانات الشقة.', 'error');
        return;
    }
    const receipt = groupOwnerPaymentsIntoReceipts(resident.id)
        .find(item => item.id === activeManagerReceipt.receiptId);
    if (!receipt) {
        toast('تعذر العثور على الإيصال. حدّث الصفحة وحاول مرة أخرى.', 'error');
        return;
    }
    openReceiptPrintWindow(receipt, resident, 'manager');
}

function sendActiveIncomeReceiptOnWhatsApp() {
    if (!requireManager() || !activeManagerReceipt) return;
    if (typeof sendIncomeReceiptOnWhatsApp === 'function') {
        sendIncomeReceiptOnWhatsApp(activeManagerReceipt.incomeId);
    }
}

const RECEIPT_IMAGE_WIDTH = 720;   // logical CSS pixels before the device scale
const RECEIPT_IMAGE_SCALE = 2.5;   // 2×–3× keeps the exported PNG crisp
const RECEIPT_IMAGE_PADDING = 24;
const RECEIPT_IMAGE_FIELD_HEIGHT = 48;
const RECEIPT_IMAGE_FIELD_GAP = 8;
const RECEIPT_IMAGE_TABLE_HEAD = 34;
const RECEIPT_IMAGE_TABLE_ROW = 38;

function receiptImageFilename(receipt) {
    const reference = String(receipt?.reference || '').replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 24) || 'receipt';
    return `manzil_receipt_${reference}.png`;
}

function receiptImageFields(receipt, resident) {
    return [
        ['اسم المالك', resident?.name || '—'],
        ['الشقة', receiptApartmentLabel(resident)],
        ['تاريخ الاستلام', formatDate(receipt?.date) || '—'],
        ['طريقة الدفع', getIncomePaymentMethodLabel(receipt?.paymentMethod)],
        ['الغرض', receipt?.purposeSummary || '—'],
        ['الصندوق', receipt?.cashboxSummary || '—']
    ];
}

function receiptImageHeight(plan) {
    let height = RECEIPT_IMAGE_PADDING + 84 + 20;
    height += Math.ceil(plan.fields.length / 2) * (RECEIPT_IMAGE_FIELD_HEIGHT + RECEIPT_IMAGE_FIELD_GAP);
    height += 30 + RECEIPT_IMAGE_TABLE_HEAD + plan.items.length * RECEIPT_IMAGE_TABLE_ROW;
    if (plan.notes.length) height += 16 + 26 + plan.notes.length * 22;
    height += 18 + 54;
    height += 22 + 58 + RECEIPT_IMAGE_PADDING;
    return Math.round(height);
}

function buildReceiptImagePlan(receipt, resident) {
    const plan = {
        width: RECEIPT_IMAGE_WIDTH,
        scale: RECEIPT_IMAGE_SCALE,
        sections: ['header', 'body', 'footer'],
        buildingName: String(state.buildingName || 'Manzil'),
        title: 'إيصال استلام',
        reference: String(receipt?.reference || '—'),
        fields: receiptImageFields(receipt, resident),
        items: (receipt?.payments || []).map(payment => ({
            purpose: ownerPaymentPurposeLabel(payment),
            month: payment.month || '—',
            cashbox: ownerPaymentCashLabel(payment) || '—',
            amount: `${fmtNum(payment.amount)} ج.م`
        })),
        notes: receiptNotesForPayments(receipt?.payments || []),
        total: `${fmtNum(receipt?.totalAmount)} ج.م`,
        footer: typeof getReceiptThankYouMessage === 'function'
            ? getReceiptThankYouMessage()
            : 'شكراً لالتزامكم، ونسعد دائماً بخدمتكم.',
        sourceText: 'تم إصدار هذا الإيصال من لوحة إدارة Manzil.'
    };
    plan.height = receiptImageHeight(plan);
    return plan;
}

function receiptRoundRect(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawReceiptImage(plan) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(plan.width * plan.scale);
    canvas.height = Math.round(plan.height * plan.scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.scale(plan.scale, plan.scale);
    try { ctx.direction = 'rtl'; } catch { /* engines without rtl canvas text fall back to bidi order */ }
    ctx.textBaseline = 'alphabetic';
    const inner = RECEIPT_IMAGE_PADDING;
    const right = plan.width - inner;
    const font = (size, weight = 400) => `${weight} ${size}px Tahoma, Arial, sans-serif`;
    const text = (value, x, y, { size = 12, weight = 400, color = '#0f172a', align = 'right' } = {}) => {
        ctx.font = font(size, weight);
        ctx.fillStyle = color;
        ctx.textAlign = /** @type {CanvasTextAlign} */ (align);
        ctx.fillText(String(value ?? ''), x, y);
    };

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, plan.width, plan.height);

    // header
    ctx.fillStyle = '#047857';
    receiptRoundRect(ctx, inner, inner, plan.width - inner * 2, 84, 14);
    ctx.fill();
    text(plan.buildingName, right - 20, inner + 36, { size: 20, weight: 700, color: '#ffffff' });
    text(`رقم الإيصال: ${plan.reference}`, right - 20, inner + 60, { size: 12, color: '#d1fae5' });
    text(plan.title, inner + 20, inner + 48, { size: 18, weight: 700, color: '#ffffff', align: 'left' });

    // body: identity grid
    let y = inner + 84 + 20;
    const gridLeft = inner + 16;
    const gridRight = right - 16;
    const columnWidth = (gridRight - gridLeft - 12) / 2;
    plan.fields.forEach((field, index) => {
        const row = Math.floor(index / 2);
        const boxX = index % 2 === 0 ? gridRight - columnWidth : gridLeft;
        const boxY = y + row * (RECEIPT_IMAGE_FIELD_HEIGHT + RECEIPT_IMAGE_FIELD_GAP);
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        receiptRoundRect(ctx, boxX, boxY, columnWidth, RECEIPT_IMAGE_FIELD_HEIGHT, 10);
        ctx.stroke();
        text(field[0], boxX + columnWidth - 12, boxY + 18, { size: 10, color: '#64748b' });
        text(field[1], boxX + columnWidth - 12, boxY + 36, { size: 12, weight: 700 });
    });
    y += Math.ceil(plan.fields.length / 2) * (RECEIPT_IMAGE_FIELD_HEIGHT + RECEIPT_IMAGE_FIELD_GAP) + 30;

    // body: payment details table
    text('تفاصيل السداد', right - 2, y, { size: 13, weight: 700 });
    y += 10;
    const columns = [
        { label: 'الغرض', width: 250, source: 'purpose', color: '#0f172a', weight: 400 },
        { label: 'شهر / بند', width: 120, source: 'month', color: '#334155', weight: 400 },
        { label: 'الصندوق', width: 160, source: 'cashbox', color: '#334155', weight: 400 },
        { label: 'المبلغ', width: 142, source: 'amount', color: '#065f46', weight: 700 }
    ];
    let columnRight = right;
    const columnEdges = columns.map(column => {
        const edge = { ...column, right: columnRight };
        columnRight -= column.width;
        return edge;
    });
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(inner, y, plan.width - inner * 2, RECEIPT_IMAGE_TABLE_HEAD);
    columnEdges.forEach(edge => text(edge.label, edge.right - 10, y + 22, { size: 11, color: '#475569' }));
    y += RECEIPT_IMAGE_TABLE_HEAD;
    plan.items.forEach(item => {
        columnEdges.forEach(edge => text(item[edge.source], edge.right - 10, y + 25, { size: 12, weight: edge.weight, color: edge.color }));
        ctx.strokeStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(inner, y + RECEIPT_IMAGE_TABLE_ROW);
        ctx.lineTo(plan.width - inner, y + RECEIPT_IMAGE_TABLE_ROW);
        ctx.stroke();
        y += RECEIPT_IMAGE_TABLE_ROW;
    });

    // body: notes
    if (plan.notes.length) {
        y += 16;
        const notesHeight = 26 + plan.notes.length * 22;
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = '#cbd5e1';
        receiptRoundRect(ctx, inner, y, plan.width - inner * 2, notesHeight, 10);
        ctx.stroke();
        ctx.setLineDash([]);
        text('ملاحظات الدفع', right - 12, y + 18, { size: 10, weight: 700, color: '#4f46e5' });
        plan.notes.forEach((note, index) => text(note, right - 12, y + 38 + index * 22, { size: 11, color: '#334155' }));
        y += notesHeight;
    }

    // body: total band
    y += 18;
    ctx.fillStyle = '#ecfdf5';
    receiptRoundRect(ctx, inner, y, plan.width - inner * 2, 54, 12);
    ctx.fill();
    text('إجمالي المبلغ المستلم', right - 18, y + 33, { size: 14, weight: 700, color: '#065f46' });
    text(plan.total, inner + 18, y + 33, { size: 16, weight: 700, color: '#065f46', align: 'left' });
    y += 54;

    // footer
    y += 22;
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(inner, y - 10);
    ctx.lineTo(plan.width - inner, y - 10);
    ctx.stroke();
    const center = plan.width / 2;
    text(plan.footer, center, y + 10, { size: 11, color: '#475569', align: 'center' });
    text(plan.sourceText, center, y + 30, { size: 10, color: '#94a3b8', align: 'center' });

    return canvas;
}

function receiptCanvasPngBlob(canvas) {
    return new Promise(resolve => {
        if (typeof canvas.toBlob !== 'function') { resolve(null); return; }
        canvas.toBlob(blob => resolve(blob), 'image/png');
    });
}

async function exportActiveIncomeReceiptImage() {
    if (!requireManager() || !activeManagerReceipt) return;
    const resident = state.residents.find(item => item.id === activeManagerReceipt.residentId);
    if (!resident) {
        toast('تعذر العثور على بيانات الشقة.', 'error');
        return;
    }
    const receipt = groupOwnerPaymentsIntoReceipts(resident.id)
        .find(item => item.id === activeManagerReceipt.receiptId);
    if (!receipt) {
        toast('تعذر العثور على الإيصال. حدّث الصفحة وحاول مرة أخرى.', 'error');
        return;
    }
    const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('incomeReceiptImageBtn'));
    if (button) button.disabled = true;
    try {
        const blob = await receiptCanvasPngBlob(drawReceiptImage(buildReceiptImagePlan(receipt, resident)));
        if (!(blob instanceof Blob) || blob.type !== 'image/png' || blob.size < 100) {
            throw new Error('receipt_image_generation_failed');
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = receiptImageFilename(receipt);
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('تم حفظ صورة الإيصال بجودة عالية.', 'success');
    } catch (error) {
        console.error('Receipt image export failed:', error);
        toast('تعذر إنشاء صورة الإيصال. حاول مرة أخرى.', 'error');
    } finally {
        if (button) button.disabled = false;
    }
}

function renderOwnerPortal() {
    const portal = document.getElementById('ownerPortal');
    if (!portal) return;
    const resident = state.residents.find(item => item.id === currentResidentId);
    if (!resident) {
        portal.innerHTML = '<div class="app-card border rounded-3xl p-6 text-center"><h2 class="font-black">تعذر العثور على حساب الشقة</h2><p class="text-xs text-slate-400 mt-2">اطلب من المدير مراجعة الحساب.</p></div>';
        portal.classList.remove('hidden');
        portal.setAttribute('aria-hidden', 'false');
        updateAccessSwitchButton();
        return;
    }
    const month = getCurrentMonth();
    const paidThisMonth = typeof getMonthlyDuePaidAmount === 'function'
        ? getMonthlyDuePaidAmount(resident.id, month) : getPaidAmountForMonth(resident.id, month);
    const dueThisMonth = typeof getMonthlyDueAmountForMonth === 'function'
        ? getMonthlyDueAmountForMonth(resident, month) : getSubscriptionAmountForMonth(resident, month);
    const remainingThisMonth = getMonthOutstanding(resident, month);
    const debt = calculateCumulativeDebt(resident.id);
    const paymentMethodLabels = typeof INCOME_PAYMENT_METHOD_LABELS !== 'undefined'
        ? INCOME_PAYMENT_METHOD_LABELS
        : { cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي' };
    const paymentSettings = typeof normalizePaymentSettings === 'function'
        ? normalizePaymentSettings(state.paymentSettings)
        : (state.paymentSettings || {
            cash: { enabled: true }, wallet: { enabled: false },
            instapay: { enabled: false }, bank_transfer: { enabled: false }
        });
    const paymentInstructions = Object.entries(paymentMethodLabels)
        .filter(([method]) => paymentSettings[method]?.enabled)
        .map(([method, label]) => {
            const settings = paymentSettings[method] || {};
            const details = [];
            if (method === 'wallet') {
                if (settings.provider) details.push('الشركة: ' + settings.provider);
                if (settings.accountName) details.push('صاحب المحفظة: ' + settings.accountName);
                if (settings.number) details.push('رقم المحفظة: ' + settings.number);
            } else if (method === 'instapay') {
                if (settings.accountName) details.push('صاحب الحساب: ' + settings.accountName);
                if (settings.address) details.push('عنوان الدفع: ' + settings.address);
            } else if (method === 'bank_transfer') {
                if (settings.bankName) details.push('البنك: ' + settings.bankName);
                if (settings.accountName) details.push('صاحب الحساب: ' + settings.accountName);
                if (settings.accountNumber) details.push('رقم الحساب: ' + settings.accountNumber);
                if (settings.iban) details.push('IBAN: ' + settings.iban);
            } else {
                details.push('يتم التسليم مباشرةً إلى مدير العمارة.');
            }
            return `<div class="app-input border rounded-xl p-3 space-y-1">
                <p class="text-xs font-bold">${esc(label)}</p>
                ${details.length ? details.map(item => `<p class="text-[11px] text-slate-400 break-words">${esc(item)}</p>`).join('') : '<p class="text-[11px] text-slate-500">يرجى التواصل مع المدير للحصول على بيانات الاستلام.</p>'}
            </div>`;
        }).join('');
    const subscriptionDueDay = Math.min(28, Math.max(1, Number(state.subscriptionDueDay) || 1));
    const subscriptionGraceDays = Math.min(31, Math.max(0, Number(state.subscriptionGraceDays) || 0));
    const ownPayments = state.income
        .filter(payment => payment.residentId === resident.id)
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    const ownerReceipts = groupOwnerPaymentsIntoReceipts(resident.id);
    const ownerReceiptRows = ownerReceipts.length ? ownerReceipts.map(receipt => {
        const allocationRows = receipt.payments.map(payment => `
            <div class="flex items-center justify-between gap-3 py-2 border-b border-slate-700/40 last:border-0">
                <span class="text-xs min-w-0">
                    <span class="block">${esc(ownerPaymentPurposeLabel(payment))} · ${esc(payment.month || '—')}</span>
                    <span class="block text-xs text-slate-500 mt-0.5">${esc(ownerPaymentCashLabel(payment) || '—')}</span>
                </span>
                <strong class="text-xs text-emerald-400 shrink-0">${fmtNum(payment.amount)} ج.م</strong>
            </div>`).join('');
        return `
            <details class="app-input border rounded-2xl p-3">
                <summary class="cursor-pointer list-none flex items-center justify-between gap-3">
                    <span class="min-w-0">
                        <strong class="block text-xs">إيصال رقم ${esc(receipt.reference)}</strong>
                        <span class="block text-xs text-slate-500 mt-1">${esc(formatDate(receipt.date) || '—')} · ${esc(getIncomePaymentMethodLabel(receipt.paymentMethod))}</span>
                    </span>
                    <strong class="text-sm font-black text-emerald-400 shrink-0">${fmtNum(receipt.totalAmount)} ج.م</strong>
                </summary>
                <div class="mt-3 pt-3 border-t border-slate-700/50 space-y-3">
                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div><span class="text-slate-500">العمارة</span><p class="font-bold mt-1">${esc(state.buildingName || '—')}</p></div>
                        <div><span class="text-slate-500">الشقة</span><p class="font-bold mt-1">${esc(resident.apartmentNumber || '—')}</p></div>
                        <div><span class="text-slate-500">صاحب الإيصال</span><p class="font-bold mt-1">${esc(resident.name || '—')}</p></div>
                        <div><span class="text-slate-500">طريقة الدفع</span><p class="font-bold mt-1">${esc(getIncomePaymentMethodLabel(receipt.paymentMethod))}</p></div>
                        <div><span class="text-slate-500">الغرض</span><p class="font-bold mt-1">${esc(receipt.purposeSummary)}</p></div>
                        <div><span class="text-slate-500">الصندوق</span><p class="font-bold mt-1">${esc(receipt.cashboxSummary || '—')}</p></div>
                        <div><span class="text-slate-500">تاريخ الاستلام</span><p class="font-bold mt-1">${esc(formatDate(receipt.date) || '—')}</p></div>
                        <div><span class="text-slate-500">المبلغ المستلم</span><p class="font-black text-emerald-400 mt-1">${fmtNum(receipt.totalAmount)} ج.م</p></div>
                    </div>
                    <div class="rounded-xl border border-slate-700/40 px-3">
                        <p class="text-xs font-bold text-slate-400 pt-2">تفاصيل توزيع المبلغ</p>
                        ${allocationRows}
                    </div>
                    <p class="text-xs text-slate-500">${esc(typeof getReceiptThankYouMessage === 'function' ? getReceiptThankYouMessage() : 'تم تسجيل عملية السداد بنجاح.')}</p>
                    <button type="button" onclick="printOwnerReceipt(${esc(JSON.stringify(String(receipt.id)))})" class="w-full min-h-11 border border-indigo-500/30 text-indigo-300 rounded-xl px-3 py-2.5 text-xs font-bold"><i class="fa-solid fa-print ml-1"></i> طباعة الإيصال / حفظ PDF</button>
                </div>
            </details>`;
    }).join('') : '<p class="text-xs text-slate-500 text-center py-3">لا توجد إيصالات مسجلة لهذا الحساب حتى الآن.</p>';
    const ownerArrears = Array.isArray(debt.unpaidMonthDetails) && debt.unpaidMonthDetails.length
        ? debt.unpaidMonthDetails.map(item => ({ month: item.month, amount: item.amount, daysOverdue: item.daysOverdue || 0 }))
        : (debt.unpaidMonths || []).map(unpaidMonth => ({
            month: unpaidMonth,
            amount: getMonthOutstanding(resident, unpaidMonth),
            daysOverdue: getSubscriptionOverdueDays(unpaidMonth)
        }));
    const ownerArrearsHtml = ownerArrears.length
        ? `<details class="app-input border rounded-2xl p-3">
            <summary class="cursor-pointer list-none flex items-center justify-between gap-3">
                <span class="text-xs font-bold">تفصيل الشهور المتأخرة</span>
                <span class="text-xs text-indigo-300">عرض التفاصيل</span>
            </summary>
            <div class="mt-2 pt-2 border-t border-slate-700/40">
                ${ownerArrears.slice(0, 12).map(item => `
                    <div class="flex justify-between gap-3 py-2 border-b border-slate-700/40 last:border-0">
                        <span class="text-xs">${esc(item.month)}${item.daysOverdue ? ` <span class="text-xs text-slate-500">· متأخر ${esc(formatOverdueDuration(item.daysOverdue))}</span>` : ''}</span>
                        <strong class="text-xs text-rose-400">${fmtNum(item.amount)} ج.م</strong>
                    </div>`).join('')}
                ${ownerArrears.length > 12 ? `<p class="text-xs text-slate-500 pt-2">تم عرض أقدم 12 شهرًا من أصل ${fmtNum(ownerArrears.length)} شهر.</p>` : ''}
            </div>
        </details>`
        : '<p class="text-xs text-emerald-400 text-center">لا توجد شهور متأخرة.</p>';
    const managerPhone = String(state.managerPhone || '').trim();
    const managerPhoneTel = managerPhone.replace(/[^0-9+]/g, '');
    const managerContact = managerPhoneTel
        ? `<div class="app-input border rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0"><p class="text-xs text-slate-500">التواصل مع المدير</p><p class="text-xs font-bold mt-1">${esc(state.managerName || 'مدير العمارة')}</p><p class="text-xs text-slate-500 mt-1" dir="ltr">${esc(managerPhone)}</p></div>
            <div class="flex gap-2">
                <a href="tel:${esc(managerPhoneTel)}" class="inline-flex items-center justify-center min-h-11 px-3 rounded-xl border border-slate-600 text-xs font-bold"><i class="fa-solid fa-phone ml-1"></i> اتصال</a>
                <button type="button" onclick="contactOwnerManager()" class="min-h-11 px-3 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold"><i class="fa-brands fa-whatsapp ml-1"></i> واتساب</button>
            </div>
        </div>`
        : '<div class="app-input border rounded-2xl p-3 text-xs text-slate-500">رقم تواصل المدير غير مسجل. اطلب من الإدارة تحديث رقم الهاتف في بيانات العمارة.</div>';
    const paymentRows = ownPayments.length ? ownPayments.map(payment => `
        <div class="flex items-center justify-between gap-3 border-b border-slate-700/50 py-2 last:border-0">
            <div><p class="text-xs font-bold">${esc(payment.month || '—')}</p><p class="text-xs text-slate-500">${formatDate(payment.date)} · ${esc(getIncomePaymentMethodLabel(payment.paymentMethod))}</p></div>
            <span class="text-sm font-black text-emerald-400">${fmtNum(payment.amount)} ج.م</span>
        </div>`).join('') : '<p class="text-xs text-slate-500 text-center py-3">لا توجد دفعات مسجلة بعد.</p>';
    const notices = state.notices.length ? state.notices.slice().reverse().map(notice => `
        <article class="app-input border rounded-2xl p-3">
            <p class="text-xs leading-relaxed whitespace-pre-line">${esc(notice.text)}</p>
            <p class="text-xs text-slate-500 mt-2">${formatDate(notice.date)}</p>
        </article>`).join('') : '<p class="text-xs text-slate-500 text-center py-3">لا توجد إعلانات حالياً.</p>';
    const ownerNotifications = Array.isArray(state.ownerNotifications) ? state.ownerNotifications : [];
    const unreadNotifications = ownerNotifications.filter(notification => !notification.readAt);
    const notificationRows = ownerNotifications.length ? ownerNotifications.map(notification => `
        <article class="app-input border rounded-2xl p-3 space-y-2">
            <div class="flex items-start justify-between gap-3">
                <p class="text-xs font-bold">${esc(notification.title)}</p>
                ${notification.readAt ? '<span class="text-xs text-slate-500">مقروء</span>' : '<span class="text-xs text-indigo-300 font-bold">جديد</span>'}
            </div>
            <p class="text-xs leading-relaxed whitespace-pre-line">${esc(notification.body)}</p>
            <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-slate-500">${formatDate(notification.createdAt)}</span>
                ${notification.readAt ? '' : `<button type="button" onclick="markOwnerNotificationRead('${esc(notification.id)}')" class="inline-flex items-center min-h-11 px-3 text-[11px] text-indigo-300 font-bold">تحديد كمقروء</button>`}
            </div>
        </article>`).join('') : '<p class="text-xs text-slate-500 text-center py-3">لا توجد إشعارات حتى الآن.</p>';

    renderOwnerThemeMenu();
    portal.innerHTML = `
        <div class="app-card border rounded-3xl p-5 sm:p-6 space-y-2">
            <p class="text-xs font-bold text-indigo-400">بوابة المالك • قراءة فقط</p>
            <h2 id="ownerPortalTitle" class="text-xl font-black">أهلاً ${esc(resident.name)}</h2>
            <p class="text-xs text-slate-400">الشقة ${esc(resident.apartmentNumber)}${state.buildingName ? ` • ${esc(state.buildingName)}` : ''}</p>
        </div>
        ${managerContact}
        <section class="app-card border rounded-3xl p-5 space-y-4" aria-label="ملخص حساب الشقة">
            <div class="flex items-center justify-between"><h3 class="font-bold text-sm">ملخص ${esc(month)}</h3><span class="text-xs text-slate-500">اشتراكك الشهري ${fmtNum(dueThisMonth)} ج.م</span></div>
            <div class="grid grid-cols-2 gap-3 text-center">
                <div class="app-input border rounded-2xl p-3"><p class="text-xs text-slate-500">المدفوع هذا الشهر</p><p class="font-black text-emerald-400 mt-1">${fmtNum(paidThisMonth)} ج.م</p></div>
                <div class="app-input border rounded-2xl p-3"><p class="text-xs text-slate-500">المتبقي لهذا الشهر</p><p class="font-black ${remainingThisMonth ? 'text-rose-400' : 'text-emerald-400'} mt-1">${fmtNum(remainingThisMonth)} ج.م</p></div>
            </div>
            <div class="app-input border rounded-2xl p-3 flex items-center justify-between gap-3"><span class="text-xs font-bold">إجمالي متأخرات حسابك (${debt.count} شهر${debt.daysOverdue ? ` · متأخر ${esc(formatOverdueDuration(debt.daysOverdue))}` : ''})</span><strong class="text-sm ${debt.totalDebt ? 'text-rose-400' : 'text-emerald-400'}">${fmtNum(debt.totalDebt)} ج.م</strong></div>
            ${ownerArrearsHtml}
        </section>
        <section class="app-card border rounded-3xl p-5 space-y-3" aria-labelledby="ownerPaymentMethodsTitle">
            <div>
                <h3 id="ownerPaymentMethodsTitle" class="font-bold text-sm">طرق سداد الاشتراك</h3>
                <p class="text-xs text-slate-500 mt-1">موعد الاستحقاق يوم ${subscriptionDueDay} من كل شهر · فترة السماح ${subscriptionGraceDays} يوم</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${paymentInstructions}</div>
        </section>
        <section class="app-card border rounded-3xl p-5 space-y-3" aria-labelledby="ownerReceiptsTitle">
            <div>
                <h3 id="ownerReceiptsTitle" class="font-bold text-sm">إيصالات السداد</h3>
                <p class="text-xs text-slate-500 mt-1">${ownerReceipts.length} إيصال مسجل لحساب شقتك</p>
            </div>
            <div class="space-y-2">${ownerReceiptRows}</div>
        </section>
        <section class="app-card border rounded-3xl p-5 space-y-3" aria-labelledby="ownerNotificationsTitle">
            <div class="flex items-center justify-between gap-3">
                <div>
                    <h3 id="ownerNotificationsTitle" class="font-bold text-sm">إشعارات حسابك</h3>
                    <p class="text-xs text-slate-500 mt-1">${unreadNotifications.length} إشعار غير مقروء</p>
                </div>
                ${unreadNotifications.length ? '<button type="button" onclick="markAllOwnerNotificationsRead()" class="inline-flex items-center min-h-11 px-3 text-[11px] text-indigo-300 font-bold">قراءة الكل</button>' : ''}
            </div>
            <div class="space-y-2">${notificationRows}</div>
        </section>
        <section class="app-card border rounded-3xl p-5 space-y-2" aria-labelledby="ownerPaymentHistoryTitle">
            <h3 id="ownerPaymentHistoryTitle" class="font-bold text-sm">سجل الدفعات حسب الشهر</h3>
            ${paymentRows}
        </section>
        <section class="app-card border rounded-3xl p-5 space-y-3" aria-labelledby="ownerNoticesTitle">
            <h3 id="ownerNoticesTitle" class="font-bold text-sm">إعلانات العمارة</h3>
            ${notices}
        </section>
        <p class="text-center text-xs text-slate-500">هذه الصفحة تعرض بيانات حساب شقتك فقط. للاعتراض أو الاستفسار، تواصل مع المدير.</p>`;
    portal.classList.remove('hidden');
    portal.setAttribute('aria-hidden', 'false');
    document.getElementById('headerBuildingTitle').textContent = state.buildingName || 'Manzil';
    document.getElementById('syncStatus').textContent = 'وضع المالك — قراءة فقط';
    updateAccessSwitchButton();
}


function renderOwnerThemeMenu() {
    const menu = document.getElementById('ownerThemeMenu');
    if (!menu || menu.children.length) return;
    menu.innerHTML = MANZIL_THEME_LIST.map(theme => `
        <button type="button" class="owner-theme-option" data-owner-theme-option="${theme}" aria-pressed="false" onclick="setOwnerTheme('${theme}')">
            <span class="owner-theme-swatch theme-preview-${theme}" aria-hidden="true"></span>
            <span>${esc(MANZIL_THEME_NAMES[theme])}</span>
        </button>`).join('');
    updateOwnerThemeSelection();
}

function toggleOwnerThemeMenu(force) {
    const menu = document.getElementById('ownerThemeMenu');
    const button = document.getElementById('ownerThemeBtn');
    if (!menu || !button) return;
    const open = typeof force === 'boolean' ? force : menu.classList.contains('hidden');
    if (open) renderOwnerThemeMenu();
    menu.classList.toggle('hidden', !open);
    button.setAttribute('aria-expanded', String(open));
}

function closeOwnerThemeMenu() { toggleOwnerThemeMenu(false); }

function handleOwnerThemeOutsideClick(event) {
    const control = document.getElementById('ownerThemeControl');
    const menu = document.getElementById('ownerThemeMenu');
    if (!control || !menu || menu.classList.contains('hidden')) return;
    if (control.contains(event?.target)) return;
    closeOwnerThemeMenu();
}

function handleOwnerThemeKeydown(event) {
    if (event?.key === 'Escape') closeOwnerThemeMenu();
}

function bindOwnerThemeMenu() {
    document.addEventListener('click', handleOwnerThemeOutsideClick);
    document.addEventListener('keydown', handleOwnerThemeKeydown);
}

function updateOwnerThemeSelection() {
    const active = normalizeThemeName(state.currentTheme) || 'dark';
    document.querySelectorAll('[data-owner-theme-option]').forEach(button => {
        const el = /** @type {HTMLElement} */ (button);
        const isActive = el.dataset.ownerThemeOption === active;
        el.classList.toggle('active', isActive);
        el.setAttribute('aria-pressed', String(isActive));
    });
    const swatch = document.getElementById('ownerThemeSwatch');
    if (swatch) swatch.className = `owner-theme-swatch theme-preview-${active}`;
    const button = document.getElementById('ownerThemeBtn');
    if (button) button.setAttribute('title', `مظهرك الحالي: ${MANZIL_THEME_NAMES[active]}`);
}

async function persistOwnerTheme(theme) {
    const { error } = await supabaseClient.rpc('set_my_theme', { p_theme: theme });
    if (error) throw error;
}

async function setOwnerTheme(theme) {
    if (currentUserRole !== 'owner') {
        toast('اختيار المظهر متاح من بوابة المالك.', 'error');
        return;
    }
    const next = normalizeThemeName(theme);
    if (!next) return;
    const previous = normalizeThemeName(state.currentTheme) || 'dark';
    if (next === previous) {
        closeOwnerThemeMenu();
        return;
    }
    state.currentTheme = next;
    applyThemeToDocument(next);
    updateOwnerThemeSelection();
    closeOwnerThemeMenu();
    try {
        await persistOwnerTheme(next);
        toast('تم حفظ المظهر لحسابك.', 'success');
    } catch (error) {
        state.currentTheme = previous;
        applyThemeToDocument(previous);
        updateOwnerThemeSelection();
        toast('تعذر حفظ المظهر. حاول مرة أخرى.', 'error');
        console.error('Owner theme error:', error);
    }
}

async function markOwnerNotificationRead(notificationId) {
    if (currentUserRole !== 'owner' || !activeSession || !activeBuildingId) return;
    const notification = (state.ownerNotifications || []).find(item => item.id === notificationId);
    if (!notification || notification.readAt) return;
    const readAt = new Date().toISOString();
    const { error } = await supabaseClient.from('notifications')
        .update({ read_at: readAt })
        .eq('id', notificationId)
        .eq('building_id', activeBuildingId)
        .eq('target_user_id', activeSession.user.id);
    if (error) {
        toast('تعذر تحديث حالة الإشعار. حاول مجددًا.', 'error');
        return;
    }
    notification.readAt = readAt;
    renderOwnerPortal();
}

async function markAllOwnerNotificationsRead() {
    if (currentUserRole !== 'owner' || !activeSession || !activeBuildingId) return;
    const unread = (state.ownerNotifications || []).filter(item => !item.readAt);
    if (!unread.length) return;
    const readAt = new Date().toISOString();
    const { error } = await supabaseClient.from('notifications')
        .update({ read_at: readAt })
        .eq('building_id', activeBuildingId)
        .eq('target_user_id', activeSession.user.id)
        .is('read_at', null);
    if (error) {
        toast('تعذر تحديث الإشعارات. حاول مجددًا.', 'error');
        return;
    }
    unread.forEach(notification => { notification.readAt = readAt; });
    renderOwnerPortal();
}

function syncManagerNotificationsControl() {
    const control = document.getElementById('managerNotificationsControl');
    if (!control) return;
    const visible = currentUserRole === 'manager' && Boolean(activeSession);
    control.classList.toggle('hidden', !visible);
    if (!visible) closeManagerNotifications();
}

function renderManagerNotifications() {
    const control = document.getElementById('managerNotificationsControl');
    if (!control) return;
    const visible = currentUserRole === 'manager' && Boolean(activeSession);
    control.classList.toggle('hidden', !visible);
    if (!visible) return;
    const badge = document.getElementById('managerNotificationsBadge');
    const menu = document.getElementById('managerNotificationsMenu');
    const list = Array.isArray(state.managerNotifications) ? state.managerNotifications : [];
    const unread = list.filter(notification => !notification.readAt).length;
    if (badge) {
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.classList.toggle('hidden', unread === 0);
    }
    if (!menu) return;
    if (!list.length) {
        menu.innerHTML = '<p class="text-xs text-slate-500 text-center py-3">لا توجد إشعارات حتى الآن.</p>';
        return;
    }
    menu.innerHTML = `
        <div class="flex items-center justify-between gap-3 px-1 pb-2">
            <span class="text-[11px] font-bold">الإشعارات${unread ? ` · ${fmtNum(unread)} جديد` : ''}</span>
            ${unread ? '<button type="button" onclick="markAllManagerNotificationsRead()" class="text-[11px] text-indigo-300 font-bold">قراءة الكل</button>' : ''}
        </div>
        ${list.map(notification => `
            <button type="button" class="manager-notification-row block w-full text-right" onclick="openManagerNotification('${esc(notification.id)}')">
                <span class="flex items-start justify-between gap-2">
                    <span class="text-xs font-bold">${esc(notification.title)}</span>
                    ${notification.readAt ? '' : '<span class="text-xs text-indigo-300 font-bold shrink-0">جديد</span>'}
                </span>
                <span class="block text-[11px] text-slate-400 mt-1 whitespace-pre-line">${esc(notification.body)}</span>
                <span class="block text-xs text-slate-500 mt-1">${formatDate(notification.createdAt)}</span>
            </button>`).join('')}`;
}

function toggleManagerNotifications(force) {
    const menu = document.getElementById('managerNotificationsMenu');
    const button = document.getElementById('managerNotificationsBtn');
    if (!menu || !button) return;
    const open = typeof force === 'boolean' ? force : menu.classList.contains('hidden');
    if (open) renderManagerNotifications();
    menu.classList.toggle('hidden', !open);
    button.setAttribute('aria-expanded', String(open));
}

function closeManagerNotifications() { toggleManagerNotifications(false); }

function handleManagerNotificationsOutsideClick(event) {
    const control = document.getElementById('managerNotificationsControl');
    const menu = document.getElementById('managerNotificationsMenu');
    if (!control || !menu || menu.classList.contains('hidden')) return;
    if (control.contains(event?.target)) return;
    closeManagerNotifications();
}

function handleManagerNotificationsKeydown(event) {
    if (event?.key === 'Escape') closeManagerNotifications();
}

function bindManagerNotifications() {
    document.addEventListener('click', handleManagerNotificationsOutsideClick);
    document.addEventListener('keydown', handleManagerNotificationsKeydown);
}

async function markManagerNotificationRead(notificationId) {
    if (currentUserRole !== 'manager' || !activeSession || !activeBuildingId) return;
    const notification = (state.managerNotifications || []).find(item => item.id === notificationId);
    if (!notification || notification.readAt) return;
    const readAt = new Date().toISOString();
    const { error } = await supabaseClient.from('notifications')
        .update({ read_at: readAt })
        .eq('id', notificationId)
        .eq('building_id', activeBuildingId)
        .is('target_user_id', null);
    if (error) {
        toast('تعذر تحديث حالة الإشعار. حاول مجددًا.', 'error');
        return;
    }
    notification.readAt = readAt;
    renderManagerNotifications();
}

async function markAllManagerNotificationsRead() {
    if (currentUserRole !== 'manager' || !activeSession || !activeBuildingId) return;
    const unread = (state.managerNotifications || []).filter(item => !item.readAt);
    if (!unread.length) return;
    const readAt = new Date().toISOString();
    const { error } = await supabaseClient.from('notifications')
        .update({ read_at: readAt })
        .eq('building_id', activeBuildingId)
        .is('target_user_id', null)
        .is('read_at', null);
    if (error) {
        toast('تعذر تحديث الإشعارات. حاول مجددًا.', 'error');
        return;
    }
    unread.forEach(notification => { notification.readAt = readAt; });
    renderManagerNotifications();
}

async function openManagerNotification(notificationId) {
    const notification = (state.managerNotifications || []).find(item => item.id === notificationId);
    await markManagerNotificationRead(notificationId);
    closeManagerNotifications();
    const target = String(notification?.actionPath || '').trim();
    if (target.startsWith('#') && typeof switchTab === 'function') {
        switchTab(target.slice(1).replace(/^tab-/, ''));
    }
}

function requestOwnerPinOnWhatsApp() {
    const supportNumber = '201027767039';
    const phone = /** @type {HTMLInputElement} */ (document.getElementById('authIdentifier'))?.value.trim() || '';
    const apartmentNumber = /** @type {HTMLInputElement} */ (document.getElementById('ownerApartmentRequestNumber'))?.value.trim() || '';
    const message = [
        'مرحبًا، أنا مالك شقة وأحتاج الرقم السري للدخول إلى تطبيق المبنى. من فضلك راجع طلبي وأرسل لي طريقة الدخول.',
        phone ? `رقم الجوال الذي أحاول الدخول به: ${phone}` : '',
        `رقم الشقة: ${apartmentNumber || '(اكتب رقم الشقة هنا)'}`
    ].filter(Boolean).join('\n');
    const url = `https://wa.me/${supportNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    const notice = document.getElementById('pinRequestNotice');
    if (notice) notice.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    bindOwnerThemeMenu();
    bindManagerNotifications();
    updateAccessSwitchButton();
});
