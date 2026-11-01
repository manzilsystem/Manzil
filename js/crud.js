function openResidentModal(mode, id) {
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
        }
    } else {
        document.getElementById('residentForm').reset();
        document.getElementById('residentAmount').value = state.defaultSubscription || '';
    }
    openModal('residentModal');
}

function editResident(id) { openResidentModal('edit', id); }

function handleResidentSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('residentName').value.trim();
    const apartmentNumber = document.getElementById('residentApartment').value.trim();
    const phone = document.getElementById('residentPhone').value.trim();
    const monthlyAmount = parseFloat(document.getElementById('residentAmount').value) || 0;
    const notes = document.getElementById('residentNotes').value.trim();
    if (!name || !apartmentNumber) { toast('الاسم ورقم الشقة مطلوبان','error'); return; }
    if (editingResidentId) {
        const r = state.residents.find(x => x.id === editingResidentId);
        if (r) { Object.assign(r, { name, apartmentNumber, phone, monthlyAmount, notes }); logAction('تعديل شقة', `${name} - شقة ${apartmentNumber}`); toast('تم التعديل','success'); }
    } else {
        state.residents.push({ id: generateId(), name, apartmentNumber, phone, monthlyAmount, notes, createdAt: Date.now() });
        logAction('إضافة شقة', `${name} - شقة ${apartmentNumber}`);
        toast('تمت الإضافة','success');
    }
    saveState(); closeModal('residentModal'); renderAll(); syncWithGitHubGist(true);
}

function deleteResident(id) {
    const r = state.residents.find(x => x.id === id); if (!r) return;
    if (!confirm(`حذف شقة ${r.name}؟ سيتم حذف تحصيلاتها أيضاً.`)) return;
    state.residents = state.residents.filter(x => x.id !== id);
    state.income = state.income.filter(i => i.residentId !== id);
    logAction('حذف شقة', `${r.name} - شقة ${r.apartmentNumber}`);
    saveState(); renderAll(); toast('تم الحذف','info'); syncWithGitHubGist(true);
}

function quickPayResident(residentId) {
    const r = state.residents.find(x => x.id === residentId); if (!r) return;
    const month = getCurrentMonth();
    if (state.income.some(i => i.residentId === residentId && i.month === month)) { toast('مدفوع بالفعل','info'); return; }
    state.income.push({ id: generateId(), residentId, amount: r.monthlyAmount ?? state.defaultSubscription, month, date: new Date().toISOString(), notes: 'دفع سريع' });
    logAction('تحصيل', `${r.name} - ${month}`);
    saveState(); renderAll(); toast(`تم تسجيل ${month}`,'success'); syncWithGitHubGist(true);
}

function handleIncomeSubmit(e) {
    e.preventDefault();
    const residentId = document.getElementById('incomeResident').value;
    const amount = parseFloat(document.getElementById('incomeAmount').value) || 0;
    const month = document.getElementById('incomeMonth').value;
    const notes = document.getElementById('incomeNotes').value.trim();
    if (!residentId || !amount || !month) { toast('أكمل البيانات','error'); return; }
    const r = state.residents.find(x => x.id === residentId);
    state.income.push({ id: generateId(), residentId, amount, month, date: new Date().toISOString(), notes });
    logAction('تحصيل', `${r?.name} - ${month} - ${fmtNum(amount)}`);
    saveState(); closeModal('incomeModal'); document.getElementById('incomeForm').reset(); renderAll();
    toast('تم تسجيل التحصيل','success'); syncWithGitHubGist(true);
}

function deleteIncome(id) {
    if (!confirm('حذف هذا التحصيل؟')) return;
    state.income = state.income.filter(i => i.id !== id);
    logAction('حذف تحصيل', id); saveState(); renderAll(); toast('تم الحذف','info'); syncWithGitHubGist(true);
}

function handleExpenseSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('expenseTitle').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
    const category = document.getElementById('expenseCategory').value;
    const month = document.getElementById('expenseMonth').value;
    const notes = document.getElementById('expenseNotes').value.trim();
    if (!title || !amount) { toast('أكمل البيانات','error'); return; }
    state.expenses.push({ id: generateId(), title, amount, category, month, notes, date: new Date().toISOString() });
    logAction('مصروف', `${title} - ${fmtNum(amount)}`);
    saveState(); closeModal('expenseModal'); document.getElementById('expenseForm').reset(); renderAll();
    toast('تم تسجيل المصروف','success'); syncWithGitHubGist(true);
}

function deleteExpense(id) {
    if (!confirm('حذف هذا المصروف؟')) return;
    state.expenses = state.expenses.filter(e => e.id !== id);
    logAction('حذف مصروف', id); saveState(); renderAll(); toast('تم الحذف','info'); syncWithGitHubGist(true);
}

function openNoticeModal() { document.getElementById('noticeInput').value = ''; openModal('noticeModal'); }

function applyNoticeTemplate(type) {
    const t = {
        monthly_sub: `السادة سكان العمارة،\nنذكركم بضرورة سداد اشتراك شهر ${getCurrentMonth()} وقدره ${fmtNum(state.defaultSubscription)} جنيه.\nشاكرين تعاونكم.`,
        cleaning: `إعلان هام:\nسيتم عمل حملة نظافة للعمارة يوم ____ القادم.\nنرجو التعاون وإزالة أي عوائق من أمام الأبواب.`,
        elevator: `إعلان:\nنظراً لأعمال الصيانة الدورية، سيكون الأسانسير متوقفاً يوم ____ من الساعة __ إلى __.\nنعتذر عن الإزعاج.`,
        eid: `كل عام وأنتم بخير بمناسبة ____.\nأعاده الله عليكم باليمن والبركات.\nإدارة العمارة.`
    };
    document.getElementById('noticeInput').value = t[type] || '';
}

function handleNoticeSubmit() {
    const text = document.getElementById('noticeInput').value.trim();
    if (!text) { toast('اكتب نص الإعلان','error'); return; }
    state.notices.push({ id: generateId(), text, date: new Date().toISOString() });
    logAction('إعلان جديد', text.substring(0, 40));
    saveState(); closeModal('noticeModal'); renderNotices(); toast('تم النشر','success'); syncWithGitHubGist(true);
}

function deleteNotice(id) {
    if (!confirm('حذف هذا الإعلان؟')) return;
    state.notices = state.notices.filter(n => n.id !== id); saveState(); renderNotices();
}

function shareNoticeToWhatsApp() {
    if (!state.notices.length) { toast('لا يوجد إعلان','error'); return; }
    const n = state.notices[state.notices.length - 1];
    const text = `📢 ${state.buildingName || 'العمارة'}\n\n${n.text}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function copyNoticeToClipboard() {
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
    const r = state.residents.find(x => x.id === residentId); if (!r) return;
    const d = calculateCumulativeDebt(residentId);
    const phone = cleanPhone(r.phone);
    const msg = `مرحباً ${r.name}،\nنذكركم بسداد اشتراك شهر ${getCurrentMonth()} للعمارة.\n${d.count>0?`إجمالي المتأخرات: ${fmtNum(d.totalDebt)} ج.م (${d.count} شهر)\n`:''}شكراً لتعاونكم.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function generateLandlordReport() {
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
    const rows = [['النوع','الوصف','الشقة','الشهر','المبلغ','ملاحظات']];
    state.income.forEach(i => {
        const r = state.residents.find(x => x.id === i.residentId);
        rows.push(['تحصيل', r?.name||'', r?.apartmentNumber||'', i.month, i.amount, i.notes||'']);
    });
    state.expenses.forEach(e => rows.push(['مصروف', e.title, '', e.month, e.amount, e.category+' '+e.notes]));
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `manzil_${Date.now()}.csv`;
    a.click();
}

function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `manzil_backup_${Date.now()}.json`;
    a.click();
    toast('تم التصدير','success');
}

function importJSON(ev) {
    const f = ev.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
        try {
            const data = JSON.parse(r.result);
            if (!data.residents) throw new Error('ملف غير صالح');
            if (!confirm('استيراد البيانات؟ سيتم استبدال الحالية.')) return;
            state = { ...state, ...data };
            saveState(); renderAll(); setTheme(state.currentTheme || 'dark');
            toast('تم الاستيراد','success'); closeModal('backupModal');
        } catch (e) { toast('ملف غير صالح','error'); }
    };
    r.readAsText(f);
}

function openSettingsModal() {
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
    state.buildingName = document.getElementById('settingsBuildingName').value.trim();
    state.managerName = document.getElementById('settingsManagerName').value.trim();
    state.managerPhone = document.getElementById('settingsManagerPhone').value.trim();
    state.defaultSubscription = parseFloat(document.getElementById('settingsDefaultSub').value) || 0;
    state.startingBalance = parseFloat(document.getElementById('settingsStartingBalance').value) || 0;
    state.pinEnabled = document.getElementById('settingsPinEnabled').checked;
    const pin = document.getElementById('settingsPinCode').value.trim();
    if (pin && /^\d{4}$/.test(pin)) state.pinCode = pin;
    const tok = document.getElementById('settingsGhToken').value.trim();
    const gid = document.getElementById('settingsGhGistId').value.trim();
    if (tok) { githubConfig.token = tok; localStorage.setItem('manzil_gh_token', tok); }
    if (gid) { githubConfig.gistId = gid; localStorage.setItem('manzil_gh_gist', gid); }
    saveState(); renderAll(); closeModal('settingsModal'); toast('تم الحفظ','success');
}

async function syncWithGitHubGist(silent) {
    if (syncing || !githubConfig.token || !githubConfig.gistId) {
        if (!silent) { const s = document.getElementById('syncStatus'); if (s) s.textContent = 'غير مفعل'; }
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
