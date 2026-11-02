let backupConsoleRefreshTimer = null;
let activeRestoreRequestId = null;
const BACKUP_CACHE_KEY = 'manzil.backup-console.v1';

function formatBackupBytes(bytes) {
    const value = Number(bytes) || 0;
    return value >= 1024 * 1024 ? (value / 1024 / 1024).toFixed(2) + ' MB' : Math.ceil(value / 1024) + ' KB';
}

function backupStatusLabel(status) {
    return ({
        queued: 'في انتظار التنفيذ',
        dispatched: 'تم إرسال المهمة',
        running: 'جاري التنفيذ',
        succeeded: 'اكتملت العملية',
        failed: 'فشلت العملية'
    })[status] || status || 'غير معروف';
}

async function callBackupConsole(body) {
    const { data, error } = await supabaseClient.functions.invoke('backup-console', { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
}

function renderBackupConsole(data, cached = false) {
    const select = document.getElementById('backupRestoreSelect');
    const last = document.getElementById('backupLastStatus');
    const history = document.getElementById('backupRestoreHistory');
    const backupHistory = document.getElementById('backupRequestHistory');
    const restoreButton = document.getElementById('backupRestoreButton');
    const createButton = document.getElementById('backupCreateButton');
    if (!select || !last || !history || !restoreButton || !createButton) return;

    const backups = Array.isArray(data.backups) ? data.backups : [];
    const restoreRequests = Array.isArray(data.restoreRequests) ? data.restoreRequests : (Array.isArray(data.requests) ? data.requests : []);
    const backupRequests = Array.isArray(data.backupRequests) ? data.backupRequests : [];
    const selected = select.value;
    select.innerHTML = '<option value="">اختر نسخة احتياطية</option>' + backups.map(item => {
        const date = new Date(item.created_at).toLocaleString('ar-EG');
        return '<option value="' + esc(item.tag) + '">' + esc(date) + ' — ' + esc(formatBackupBytes(item.size_bytes)) + '</option>';
    }).join('');
    if (backups.some(item => item.tag === selected)) select.value = selected;

    const restorePending = restoreRequests.some(item => ['queued', 'running'].includes(item.status));
    const backupPending = backupRequests.some(item => ['queued', 'dispatched'].includes(item.status));
    restoreButton.disabled = !backups.length || restorePending;
    createButton.disabled = backupPending || restorePending;

    last.textContent = backups.length
        ? (cached ? 'نسخة محفوظة محليًا — ' : '') + 'آخر نسخة: ' + new Date(backups[0].created_at).toLocaleString('ar-EG') + ' — ' + formatBackupBytes(backups[0].size_bytes)
        : 'لا توجد نسخ مسجلة بعد.';

    history.innerHTML = restoreRequests.length
        ? '<div class="font-bold text-slate-300 pt-2">سجل الاستعادة</div>' + restoreRequests.map(item =>
            '<div class="app-input border rounded-xl p-3"><div class="flex justify-between gap-2"><span>' + esc(item.backup_tag) + '</span><b>' + esc(backupStatusLabel(item.status)) + '</b></div><p class="text-slate-400 mt-1">' + esc(item.result_message || '') + '</p><p class="text-slate-500 mt-1">' + new Date(item.created_at).toLocaleString('ar-EG') + '</p></div>'
          ).join('')
        : '<p class="text-slate-500 pt-2">لا توجد عمليات استعادة سابقة.</p>';

    if (backupHistory) {
        backupHistory.innerHTML = backupRequests.length
            ? '<div class="font-bold text-slate-300 pt-2">سجل النسخ اليدوي</div>' + backupRequests.map(item =>
                '<div class="app-input border rounded-xl p-3"><div class="flex justify-between gap-2"><b>' + esc(backupStatusLabel(item.status)) + '</b><span class="text-slate-500">' + new Date(item.created_at).toLocaleString('ar-EG') + '</span></div><p class="text-slate-400 mt-1">' + esc(item.result_message || '') + '</p></div>'
              ).join('')
            : '<p class="text-slate-500 pt-2">لا توجد طلبات نسخ يدوي.</p>';
    }

    const pendingRestore = restoreRequests.find(item => ['queued', 'running'].includes(item.status));
    activeRestoreRequestId = pendingRestore?.id || null;
    const pendingBackup = backupRequests.some(item => ['queued', 'dispatched'].includes(item.status));
    const status = document.getElementById('backupRestoreStatus');
    if (status && pendingRestore) status.textContent = backupStatusLabel(pendingRestore.status);
    if (status && pendingBackup) status.textContent = 'طلب النسخ الاحتياطي قيد التنفيذ.';
    if (status && !pendingRestore && !pendingBackup && !cached) status.textContent = '';
    scheduleBackupConsoleRefresh(Boolean(pendingRestore || pendingBackup));
}

function scheduleBackupConsoleRefresh(shouldRefresh) {
    if (backupConsoleRefreshTimer) clearTimeout(backupConsoleRefreshTimer);
    if (shouldRefresh) backupConsoleRefreshTimer = setTimeout(() => loadBackupConsole({ silent: true }), 9000);
}

async function loadBackupConsole(options = {}) {
    if (document.getElementById('backupModal')?.classList.contains('hidden')) return;
    if (!requireManager()) return;
    const last = document.getElementById('backupLastStatus');
    if (!last) return;

    let hasCache = false;
    try {
        const cached = JSON.parse(localStorage.getItem(BACKUP_CACHE_KEY) || 'null');
        if (cached && Array.isArray(cached.backups)) {
            hasCache = true;
            renderBackupConsole(cached, true);
        }
    } catch { /* Ignore invalid local cache. */ }

    if (!hasCache && !options.silent) last.textContent = 'جارٍ تحميل النسخ من الخادم لأول مرة...';
    try {
        const data = await callBackupConsole({ action: 'list' });
        localStorage.setItem(BACKUP_CACHE_KEY, JSON.stringify(data));
        renderBackupConsole(data, false);
    } catch (error) {
        if (!hasCache) last.textContent = 'تعذر تحميل النسخ. تحقق من الاتصال ثم أعد فتح النافذة.';
        console.error('Backup console error:', error);
    }
}

async function requestDatabaseBackup() {
    if (!requireManager()) return;
    const button = document.getElementById('backupCreateButton');
    const status = document.getElementById('backupRestoreStatus');
    if (!button || button.disabled) return;
    button.disabled = true;
    status.textContent = 'جارٍ تسجيل طلب النسخ الاحتياطي...';
    try {
        await callBackupConsole({ action: 'request_backup' });
        status.textContent = 'تم تسجيل الطلب. سيبدأ إنشاء النسخة تلقائيًا خلال دقائق.';
        await loadBackupConsole();
    } catch (error) {
        button.disabled = false;
        status.textContent = error.message === 'backup_already_pending'
            ? 'يوجد طلب نسخ احتياطي قيد التنفيذ بالفعل.'
            : 'تعذر تسجيل طلب النسخ الاحتياطي. حاول مرة أخرى.';
        console.error('Backup request error:', error);
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
        await loadBackupConsole();
    } catch (error) {
        button.disabled = false;
        status.textContent = error.message === 'restore_already_pending'
            ? 'توجد عملية استعادة أخرى قيد التنفيذ.'
            : 'تعذر تسجيل طلب الاستعادة. حاول مرة أخرى.';
        console.error('Restore request error:', error);
    }
}
