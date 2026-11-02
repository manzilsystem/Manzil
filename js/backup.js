let backupConsoleRefreshTimer = null;
let activeRestoreRequestId = null;

function formatBackupBytes(bytes) {
    const value = Number(bytes) || 0;
    return value >= 1024 * 1024 ? (value / 1024 / 1024).toFixed(2) + ' MB' : Math.ceil(value / 1024) + ' KB';
}

function backupStatusLabel(status) {
    return ({ queued: 'في انتظار التنفيذ', running: 'جاري الاستعادة', succeeded: 'اكتملت الاستعادة', failed: 'فشلت الاستعادة' })[status] || status;
}

async function callBackupConsole(body) {
    const { data, error } = await supabaseClient.functions.invoke('backup-console', { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
}

async function loadBackupConsole() {
    if (!requireManager()) return;
    const select = document.getElementById('backupRestoreSelect');
    const last = document.getElementById('backupLastStatus');
    const history = document.getElementById('backupRestoreHistory');
    const button = document.getElementById('backupRestoreButton');
    if (!select || !last || !history || !button) return;
    last.textContent = 'جارٍ تحميل النسخ...';
    try {
        const data = await callBackupConsole({ action: 'list' });
        const backups = Array.isArray(data.backups) ? data.backups : [];
        const requests = Array.isArray(data.requests) ? data.requests : [];
        const selected = select.value;
        select.innerHTML = '<option value="">اختر نسخة احتياطية</option>' + backups.map(item => {
            const date = new Date(item.created_at).toLocaleString('ar-EG');
            return '<option value="' + esc(item.tag) + '">' + esc(date) + ' — ' + esc(formatBackupBytes(item.size_bytes)) + '</option>';
        }).join('');
        if (backups.some(item => item.tag === selected)) select.value = selected;
        button.disabled = !backups.length || requests.some(item => ['queued', 'running'].includes(item.status));
        last.textContent = backups.length
            ? 'آخر نسخة: ' + new Date(backups[0].created_at).toLocaleString('ar-EG') + ' — ' + formatBackupBytes(backups[0].size_bytes) + ' — تم تسجيلها بعد فحص سلامة الأرشيف.'
            : 'لا توجد نسخ مسجلة بعد. ستظهر النسخة بعد اكتمال دورة النسخ التالية.';
        history.innerHTML = requests.length
            ? '<div class="font-bold text-slate-300 pt-2">سجل الاستعادة</div>' + requests.map(item =>
                '<div class="app-input border rounded-xl p-3"><div class="flex justify-between gap-2"><span>' + esc(item.backup_tag) + '</span><b>' + esc(backupStatusLabel(item.status)) + '</b></div><p class="text-slate-400 mt-1">' + esc(item.result_message || '') + '</p><p class="text-slate-500 mt-1">' + new Date(item.created_at).toLocaleString('ar-EG') + '</p></div>'
              ).join('')
            : '<p class="text-slate-500 pt-2">لا توجد عمليات استعادة سابقة.</p>';
        const pending = requests.find(item => ['queued', 'running'].includes(item.status));
        if (pending) {
            activeRestoreRequestId = pending.id;
            button.disabled = true;
            document.getElementById('backupRestoreStatus').textContent = backupStatusLabel(pending.status);
            scheduleRestoreStatusCheck();
        }
    } catch (error) {
        last.textContent = 'تعذر تحميل سجل النسخ.';
        console.error('Backup console error:', error);
    }
}

function scheduleRestoreStatusCheck() {
    if (backupConsoleRefreshTimer) clearTimeout(backupConsoleRefreshTimer);
    if (!activeRestoreRequestId) return;
    backupConsoleRefreshTimer = setTimeout(checkRestoreStatus, 7000);
}

async function checkRestoreStatus() {
    if (!activeRestoreRequestId) return;
    try {
        const data = await callBackupConsole({ action: 'status', request_id: activeRestoreRequestId });
        const request = data.request;
        document.getElementById('backupRestoreStatus').textContent =
            backupStatusLabel(request.status) + (request.result_message ? ' — ' + request.result_message : '');
        if (['succeeded', 'failed'].includes(request.status)) {
            activeRestoreRequestId = null;
            await loadBackupConsole();
            return;
        }
        scheduleRestoreStatusCheck();
    } catch (error) {
        document.getElementById('backupRestoreStatus').textContent = 'تعذر تحديث الحالة؛ أعد فتح النافذة للمحاولة.';
        console.error('Restore status error:', error);
    }
}

async function requestDatabaseRestore() {
    if (!requireManager()) return;
    const tag = document.getElementById('backupRestoreSelect')?.value;
    if (!tag) { toast('اختر نسخة احتياطية أولاً', 'error'); return; }
    if (!confirm('تحذير: سيتم استبدال قاعدة بيانات الإنتاج بالكامل بالنسخة المختارة. هل تريد المتابعة؟')) return;
    const confirmation = prompt('للتأكيد اكتب RESTORE');
    if (confirmation !== 'RESTORE') { toast('تم إلغاء الاستعادة', 'info'); return; }
    const button = document.getElementById('backupRestoreButton');
    const status = document.getElementById('backupRestoreStatus');
    button.disabled = true;
    status.textContent = 'جارٍ إرسال طلب الاستعادة...';
    try {
        const data = await callBackupConsole({ action: 'request_restore', backup_tag: tag, confirmation });
        activeRestoreRequestId = data.request.id;
        status.textContent = 'تم تسجيل الطلب. سيبدأ التنفيذ تلقائيًا خلال دقائق.';
        scheduleRestoreStatusCheck();
        await loadBackupConsole();
    } catch (error) {
        button.disabled = false;
        status.textContent = error.message === 'restore_already_pending'
            ? 'توجد عملية استعادة أخرى قيد التنفيذ.'
            : 'تعذر تسجيل طلب الاستعادة. حاول مرة أخرى.';
        console.error('Restore request error:', error);
    }
}
