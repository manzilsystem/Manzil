function openResidentModal(mode, id) {
    if (!requireManager()) return;
    editingResidentId = mode === 'edit' ? id : null;
    document.getElementById('residentModalTitle').textContent = mode === 'edit' ? 'تعديل بيانات الشقة' : 'شقة جديدة';
    if (mode === 'edit') {
        const r = state.residents.find(x => x.id === id);
        if (r) {
            document.getElementById('residentName').value = r.name||'';
            document.getElementById('residentApartment').value = r.apartmentNumber||'';
            document.getElementById('residentPhone').value = r.phone||'';
            document.getElementById('residentAmount').value = r.monthlyAmount ?? '';
            document.getElementById('residentNotes').value = r.notes||'';
            document.getElementById('residentOwnerPin').value = '';
            document.getElementById('residentOwnerPin').placeholder = r.ownerPin ? 'يوجد رمز حالي؛ اتركه كما هو أو أدخل رمزاً جديداً' : 'عيّن رمزاً من 4 أرقام';
            document.getElementById('removeResidentOwnerPin').checked = false;
        }
    } else {
        document.getElementById('residentForm').reset();
        document.getElementById('residentAmount').value = state.defaultSubscription || '';
        document.getElementById('residentOwnerPin').placeholder = 'عيّن رمزاً من 4 أرقام';
    }
    openModal('residentModal');
}

function editResident(id) { openResidentModal('edit', id); }

function handleResidentSubmit(e) {
    if (!requireManager()) return;
    e.preventDefault();
    const name = document.getElementById('residentName').value.trim();
    const apartmentNumber = document.getElementById('residentApartment').value.trim();
    const phone = document.getElementById('residentPhone').value.trim();
    const amountInput = document.getElementById('residentAmount').value.trim();
    const monthlyAmount = amountInput === '' ? Number(state.defaultSubscription) || 0 : Number(amountInput);
    const notes = document.getElementById('residentNotes').value.trim();
    const ownerPin = document.getElementById('residentOwnerPin').value.trim();
    const removeOwnerPin = document.getElementById('removeResidentOwnerPin').checked;
    if (!name || !apartmentNumber) { toast('الاسم ورقم الشقة مطلوبان','error'); return; }
    if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0) { toast('قيمة الاشتراك يجب أن تكون صفراً أو أكثر','error'); return; }
    if (ownerPin && !/^\d{4}$/.test(ownerPin)) { toast('رمز دخول المالك يجب أن يتكون من 4 أرقام','error'); return; }
    const editedResident = state.residents.find(r => r.id === editingResidentId);
    const effectiveOwnerPin = removeOwnerPin ? '' : (ownerPin || editedResident?.ownerPin || '');
    if (effectiveOwnerPin) {
        if (!state.pinEnabled || state.pinCode === '0000') { toast('فعّل أولاً رمزاً خاصاً للمدير من الإعدادات','error'); return; }
        if (effectiveOwnerPin === state.pinCode) { toast('يجب أن يختلف رمز المالك عن رمز المدير','error'); return; }
        if (state.residents.some(r => r.id !== editingResidentId && String(r.ownerPin || '') === effectiveOwnerPin)) { toast('هذا الرمز مستخدم بالفعل لمالك آخر','error'); return; }
    }
    const normalizedApartment = apartmentNumber.toLocaleLowerCase('ar-EG');
    if (state.residents.some(r => r.id !== editingResidentId && String(r.apartmentNumber||'').trim().toLocaleLowerCase('ar-EG') === normalizedApartment)) {
        toast('رقم الشقة مسجل بالفعل','error'); return;
    }
    if (editingResidentId) {
        const r = state.residents.find(x => x.id === editingResidentId);
        if (r) {
            Object.assign(r, { name, apartmentNumber, phone, monthlyAmount, notes });
            if (effectiveOwnerPin) r.ownerPin = effectiveOwnerPin; else delete r.ownerPin;
            logAction('تعديل شقة', `${name} - شقة ${apartmentNumber}`); toast('تم التعديل','success');
        }
    } else {
        const resident = { id: generateId(), name, apartmentNumber, phone, monthlyAmount, notes, createdAt: Date.now() };
        if (effectiveOwnerPin) resident.ownerPin = effectiveOwnerPin;
        state.residents.push(resident);
        logAction('إضافة شقة', `${name} - شقة ${apartmentNumber}`);
        toast('تمت الإضافة','success');
    }
    saveState(); closeModal('residentModal'); renderAll(); syncWithGitHubGist(true);
}

function deleteResident(id) {
    if (!requireManager()) return;
    const r = state.residents.find(x => x.id === id); if (!r) return;
    if (!confirm(`حذف شقة ${r.name}؟ سيتم حذف تحصيلاتها أيضاً.`)) return;
    state.residents = state.residents.filter(x => x.id !== id);
    state.income = state.income.filter(i => i.residentId !== id);
    logAction('حذف شقة', `${r.name} - شقة ${r.apartmentNumber}`);
    saveState(); renderAll(); toast('تم الحذف','info'); syncWithGitHubGist(true);
}

function quickPayResident(residentId) {
    if (!requireManager()) return;
    const r = state.residents.find(x => x.id === residentId); if (!r) return;
    const month = getCurrentMonth();
    const amount = getMonthOutstanding(r, month);
    if (amount <= 0) { toast('تم سداد اشتراك الشهر بالكامل','info'); return; }
    state.income.push({ id: generateId(), residentId, amount, month, date: new Date().toISOString(), notes: 'دفع سريع' });
    logAction('تحصيل', `${r.name} - ${month} - ${fmtNum(amount)}`);
    saveState(); renderAll(); toast(`تم تسجيل باقي اشتراك ${month}`,'success'); syncWithGitHubGist(true);
}

function handleIncomeSubmit(e) {
    if (!requireManager()) return;
    e.preventDefault();
    const residentId = document.getElementById('incomeResident').value;
    const amount = Number(document.getElementById('incomeAmount').value);
    const month = document.getElementById('incomeMonth').value;
    const notes = document.getElementById('incomeNotes').value.trim();
    if (!residentId || !Number.isFinite(amount) || amount <= 0 || !month) { toast('اختر الشقة والشهر وأدخل مبلغاً أكبر من صفر','error'); return; }
    const r = state.residents.find(x => x.id === residentId);
    state.income.push({ id: generateId(), residentId, amount, month, date: new Date().toISOString(), notes });
    logAction('تحصيل', `${r?.name} - ${month} - ${fmtNum(amount)}`);
    saveState(); closeModal('incomeModal'); document.getElementById('incomeForm').reset(); renderAll();
    toast('تم تسجيل التحصيل','success'); syncWithGitHubGist(true);
}

function deleteIncome(id) {
    if (!requireManager()) return;
    if (!confirm('حذف هذا التحصيل؟')) return;
    state.income = state.income.filter(i => i.id !== id);
    logAction('حذف تحصيل', id); saveState(); renderAll(); toast('تم الحذف','info'); syncWithGitHubGist(true);
}

function handleExpenseSubmit(e) {
    if (!requireManager()) return;
    e.preventDefault();
    const title = document.getElementById('expenseTitle').value.trim();
    const amount = Number(document.getElementById('expenseAmount').value);
    const category = document.getElementById('expenseCategory').value;
    const month = document.getElementById('expenseMonth').value;
    const notes = document.getElementById('expenseNotes').value.trim();
    if (!title || !Number.isFinite(amount) || amount <= 0 || !month) { toast('أدخل وصفاً ومبلغاً أكبر من صفر واختر الشهر','error'); return; }
    state.expenses.push({ id: generateId(), title, amount, category, month, notes, date: new Date().toISOString() });
    logAction('مصروف', `${title} - ${fmtNum(amount)}`);
    saveState(); closeModal('expenseModal'); document.getElementById('expenseForm').reset(); renderAll();
    toast('تم تسجيل المصروف','success'); syncWithGitHubGist(true);
}

function deleteExpense(id) {
    if (!requireManager()) return;
    if (!confirm('حذف هذا المصروف؟')) return;
    state.expenses = state.expenses.filter(e => e.id !== id);
    logAction('حذف مصروف', id); saveState(); renderAll(); toast('تم الحذف','info'); syncWithGitHubGist(true);
}

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

function handleNoticeSubmit() {
    if (!requireManager()) return;
    const text = document.getElementById('noticeInput').value.trim();
    if (!text) { toast('اكتب نص الإعلان','error'); return; }
    state.notices.push({ id: generateId(), text, date: new Date().toISOString() });
    logAction('إعلان جديد', text.substring(0, 40));
    saveState(); closeModal('noticeModal'); renderNotices(); toast('تم النشر','success'); syncWithGitHubGist(true);
}

function deleteNotice(id) {
    if (!requireManager()) return;
    if (!confirm('حذف هذا الإعلان؟')) return;
    state.notices = state.notices.filter(n => n.id !== id); saveState(); renderNotices();
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

function generateLandlordReport() {
    if (!requireManager()) return;
    const m = document.getElementById('reportMonthSelect').value;
    if (!m) { toast('اختر شهر','error'); return; }
    const inc = state.income.filter(i => i.month === m);
    const exp = state.expenses.filter(e => e.month === m);
    const totalInc = inc.reduce((s,i) => s + (parseFloat(i.amount)||0), 0);
    const totalExp = exp.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
    const net = totalInc - totalExp;
    document.getElementById('landlordReportPreview').innerHTML = `
        <div class="space-y-3">
            <div class="text-center border-b border-slate-700 pb-2"><h3 class="font-black text-sm">${esc(state.buildingName||'العمارة')}</h3><p class="text-[10px] text-slate-400">تقرير ${esc(m)}</p></div>
            <div class="grid grid-cols-3 gap-2 text-center">
                <div class="app-card p-2 rounded-xl border"><p class="text-[10px] text-slate-500">تحصيل</p><p class="text-xs font-black text-emerald-400">${fmtNum(totalInc)}</p></div>
                <div class="app-card p-2 rounded-xl border"><p class="text-[10px] text-slate-500">مصروف</p><p class="text-xs font-black text-rose-400">${fmtNum(totalExp)}</p></div>
                <div class="app-card p-2 rounded-xl border"><p class="text-[10px] text-slate-500">صافي</p><p class="text-xs font-black ${net>=0?'text-emerald-400':'text-rose-400'}">${fmtNum(net)}</p></div>
            </div>
            <div><p class="text-[10px] font-bold text-slate-400 mb-1">تفاصيل التحصيلات (${inc.length}):</p>
                ${inc.length?inc.map(i => { const r = state.residents.find(x => x.id===i.residentId); return `<div class="flex justify-between text-[11px] border-b border-slate-800 py-1"><span>${esc(r?.name||'—')}</span><span class="text-emerald-400">${fmtNum(i.amount)}</span></div>`; }).join(''):'<p class="text-slate-500 text-[10px]">لا يوجد</p>'}
            </div>
            <div><p class="text-[10px] font-bold text-slate-400 mb-1">تفاصيل المصروفات (${exp.length}):</p>
                ${exp.length?exp.map(e => `<div class="flex justify-between text-[11px] border-b border-slate-800 py-1"><span>${esc(e.title)}</span><span class="text-rose-400">${fmtNum(e.amount)}</span></div>`).join(''):'<p class="text-slate-500 text-[10px]">لا يوجد</p>'}
            </div>
            <div class="text-[10px] text-slate-500 text-center pt-2 border-t border-slate-700">تم الإنشاء: ${formatDate(new Date().toISOString())}</div>
        </div>`;
}

function exportToCSV() {
    if (!requireManager()) return;
    const rows = [['النوع','الوصف','الشقة','الشهر','المبلغ','ملاحظات']];
    state.income.forEach(i => {
        const r = state.residents.find(x => x.id === i.residentId);
        rows.push(['تحصيل', r?.name||'', r?.apartmentNumber||'', i.month, i.amount, i.notes||'']);
    });
    state.expenses.forEach(e => rows.push(['مصروف', e.title, '', e.month, e.amount, e.category+' '+e.notes]));
    const csvCell = value => {
        let text = String(value ?? '');
        if (typeof value === 'string' && /^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g,'""')}"`;
    };
    const csv = '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `manzil_${Date.now()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportArrearsCSV() {
    if (!requireManager()) return;
    const report = buildArrearsReport();
    const rows = [['الشقة','اسم الساكن','التصنيف','الشهر غير المسدد','المبلغ المستحق']];
    report.residents.forEach(item => item.unpaidMonths.forEach(month => {
        rows.push([item.resident.apartmentNumber, item.resident.name, item.bucket, month.month, month.amount]);
    }));
    const csvCell = value => {
        let text = String(value ?? '');
        if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    };
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `manzil_arrears_${Date.now()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('تم تصدير تقرير المتأخرات','success');
}

function exportJSON() {
    if (!requireManager()) return;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `manzil_backup_${Date.now()}.json`;
    a.click();
    toast('تم التصدير','success');
}

function isValidBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const requiredArrays = ['residents','income','expenses','notices'];
    if (!requiredArrays.every(key => Array.isArray(data[key]))) return false;
    const validId = value => typeof value === 'string' && /^[\w-]{1,100}$/.test(value);
    const validAmount = value => Number.isFinite(Number(value)) && Number(value) >= 0;
    if (!data.residents.every(r => r && typeof r === 'object' && validId(r.id) && typeof r.name === 'string' && typeof r.apartmentNumber === 'string' && (r.phone === undefined || typeof r.phone === 'string') && (r.notes === undefined || typeof r.notes === 'string') && validAmount(r.monthlyAmount ?? 0))) return false;
    const ownerPins = data.residents.map(r => r.ownerPin).filter(pin => pin !== undefined && pin !== '').map(String);
    if (!ownerPins.every(pin => /^\d{4}$/.test(pin)) || new Set(ownerPins).size !== ownerPins.length) return false;
    const residentIds = new Set(data.residents.map(r => r.id));
    if (!data.income.every(i => i && typeof i === 'object' && validId(i.id) && validId(i.residentId) && residentIds.has(i.residentId) && typeof i.month === 'string' && validAmount(i.amount) && (i.notes === undefined || typeof i.notes === 'string'))) return false;
    if (!data.expenses.every(e => e && typeof e === 'object' && validId(e.id) && typeof e.title === 'string' && typeof e.month === 'string' && validAmount(e.amount) && (e.category === undefined || typeof e.category === 'string') && (e.notes === undefined || typeof e.notes === 'string'))) return false;
    if (!data.notices.every(n => n && typeof n === 'object' && validId(n.id) && typeof n.text === 'string')) return false;
    if (data.auditLogs !== undefined && !Array.isArray(data.auditLogs)) return false;
    if (data.pinCode !== undefined && !/^\d{4}$/.test(String(data.pinCode))) return false;
    if (data.pinEnabled !== undefined && typeof data.pinEnabled !== 'boolean') return false;
    if (ownerPins.length && (!data.pinEnabled || !/^\d{4}$/.test(String(data.pinCode || '')) || data.pinCode === '0000' || ownerPins.includes(String(data.pinCode)))) return false;
    if (data.currentTheme !== undefined && !['dark','light','emerald'].includes(data.currentTheme)) return false;
    if (data.defaultSubscription !== undefined && !validAmount(data.defaultSubscription)) return false;
    return true;
}

function importJSON(ev) {
    if (!requireManager()) return;
    const f = ev.target.files[0]; if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast('حجم النسخة أكبر من الحد المسموح (10 ميجابايت)','error'); ev.target.value = ''; return; }
    const r = new FileReader();
    r.onload = () => {
        try {
            const data = JSON.parse(r.result);
            if (!isValidBackup(data)) throw new Error('ملف غير صالح');
            if (!confirm('استيراد البيانات؟ سيتم استبدال الحالية.')) return;
            const previousState = state;
            state = { ...state, ...data, auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs : [] };
            if (!saveState()) { state = previousState; throw new Error('تعذر حفظ النسخة'); }
            renderAll(); setTheme(state.currentTheme || 'dark');
            toast('تم الاستيراد','success'); closeModal('backupModal');
        } catch (e) { console.error('تعذر استيراد النسخة:', e); toast('النسخة غير صالحة أو تعذر حفظها؛ لم يتم استبدال البيانات','error'); }
        finally { ev.target.value = ''; }
    };
    r.onerror = () => { toast('تعذر قراءة الملف','error'); ev.target.value = ''; };
    r.readAsText(f);
}

function openSettingsModal() {
    if (!requireManager()) return;
    document.getElementById('settingsBuildingName').value = state.buildingName||'';
    document.getElementById('settingsManagerName').value = state.managerName||'';
    document.getElementById('settingsManagerPhone').value = state.managerPhone||'';
    document.getElementById('settingsDefaultSub').value = state.defaultSubscription||'';
    document.getElementById('settingsStartingBalance').value = state.startingBalance||'';
    document.getElementById('settingsPinEnabled').checked = state.pinEnabled;
    document.getElementById('settingsPinCode').value = '';
    document.getElementById('settingsGhToken').value = githubConfig.token||'';
    document.getElementById('settingsGhGistId').value = githubConfig.gistId||'';
    openModal('settingsModal');
}

function saveSettings() {
    if (!requireManager()) return;
    const defaultSubscription = Number(document.getElementById('settingsDefaultSub').value || 0);
    const startingBalance = Number(document.getElementById('settingsStartingBalance').value || 0);
    const pinEnabled = document.getElementById('settingsPinEnabled').checked;
    const pin = document.getElementById('settingsPinCode').value.trim();
    if (!Number.isFinite(defaultSubscription) || defaultSubscription < 0 || !Number.isFinite(startingBalance)) {
        toast('تحقق من قيم الاشتراك والرصيد الافتتاحي','error'); return;
    }
    if (pin && !/^\d{4}$/.test(pin)) { toast('رمز PIN يجب أن يتكون من أربعة أرقام','error'); return; }
    if (pinEnabled && !state.pinEnabled && !pin && state.pinCode === '0000') {
        toast('اختر رمز PIN جديداً قبل تفعيل القفل','error'); return;
    }
    const ownerPins = state.residents.map(resident => String(resident.ownerPin || '')).filter(Boolean);
    const effectivePin = pin || String(state.pinCode);
    if (ownerPins.length && (!pinEnabled || effectivePin === '0000')) {
        toast('لا يمكن إلغاء رمز المدير ما دامت هناك حسابات ملاك مفعّلة','error'); return;
    }
    if (ownerPins.includes(effectivePin)) { toast('رمز المدير يجب أن يختلف عن رموز الملاك','error'); return; }
    state.buildingName = document.getElementById('settingsBuildingName').value.trim();
    state.managerName = document.getElementById('settingsManagerName').value.trim();
    state.managerPhone = document.getElementById('settingsManagerPhone').value.trim();
    state.defaultSubscription = defaultSubscription;
    state.startingBalance = startingBalance;
    state.pinEnabled = pinEnabled;
    if (pin) state.pinCode = pin;
    const tok = document.getElementById('settingsGhToken').value.trim();
    const gid = document.getElementById('settingsGhGistId').value.trim();
    if (tok) { githubConfig.token = tok; localStorage.setItem('manzil_gh_token', tok); }
    if (gid) { githubConfig.gistId = gid; localStorage.setItem('manzil_gh_gist', gid); }
    saveState(); renderAll(); updateAccessSwitchButton(); closeModal('settingsModal'); toast('تم الحفظ','success');
}

async function syncWithGitHubGist(silent) {
    if (!requireManager()) return;
    if (syncing) return;
    if (!githubConfig.token || !githubConfig.gistId) {
        if (!silent) {
            const s = document.getElementById('syncStatus');
            if (s) s.textContent = 'المزامنة غير مفعّلة';
            toast('للمزامنة، أضف رمز GitHub ومعرّف Gist في الإعدادات','info');
        }
        return;
    }
    syncing = true;
    const status = document.getElementById('syncStatus');
    if (status) status.textContent = 'جاري المزامنة...';
    try {
        const headers = { 'Authorization': `Bearer ${githubConfig.token}`, 'Accept': 'application/vnd.github+json' };
        const getRes = await fetch(`https://api.github.com/gists/${githubConfig.gistId}`, { headers });
        let remote = null;
        if (getRes.ok) {
            const g = await getRes.json();
            const f = g.files['manzil.json'];
            if (f) { try { remote = JSON.parse(f.content); } catch(e){} }
        }
        let merged = state;
        if (remote && remote.lastUpdated && remote.lastUpdated > state.lastUpdated) merged = remote;
        state = { ...state, ...merged };
        saveState();
        const body = JSON.stringify(state, null, 2);
        const pushRes = await fetch(`https://api.github.com/gists/${githubConfig.gistId}`, {
            method: 'PATCH', headers,
            body: JSON.stringify({ files: { 'manzil.json': { content: body } } })
        });
        if (!pushRes.ok) throw new Error('Push failed');
        if (status) status.textContent = `تم ${new Date().toLocaleTimeString('ar-EG')}`;
        if (!silent) { toast('تمت المزامنة','success'); renderAll(); }
    } catch (e) {
        if (status) status.textContent = 'فشل المزامنة';
        if (!silent) toast('فشل المزامنة','error');
    } finally { syncing = false; }
}
