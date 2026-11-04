let backupConsoleRefreshTimer = null;
let backupConsoleLoadPromise = null;
let activeRestoreRequestId = null;
let backupDownloadAllowed = false;
let backupDownloadInProgress = false;
function backupCacheKey() { return 'manzil.backup-console.v1.' + (activeBuildingId || 'none'); }

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
    const downloadButton = document.getElementById('backupDownloadButton');
    if (!select || !last || !history || !restoreButton || !createButton || !downloadButton) return;

    const backups = Array.isArray(data.backups) ? data.backups : [];
    backupDownloadAllowed = !cached && data.canDownload === true;
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
    // Cached state is display-only; destructive/financial actions require a fresh server read.
    restoreButton.disabled = cached || !backups.length || restorePending || backupPending;
    createButton.disabled = cached || backupPending || restorePending;
    updateBackupDownloadButton();

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
    if (pendingRestore?.id) activeRestoreRequestId = pendingRestore.id;
    else if (!cached) activeRestoreRequestId = null;
    const pendingBackup = backupRequests.some(item => ['queued', 'dispatched'].includes(item.status));
    const status = document.getElementById('backupRestoreStatus');
    if (status && pendingRestore) {
        status.textContent = pendingRestore.status === 'running'
            ? 'جاري استبدال قاعدة البيانات. يمكنك متابعة الحالة هنا.'
            : 'تم تسجيل طلب الاستعادة، وفي انتظار بدء التنفيذ.';
    } else if (status && pendingBackup) {
        status.textContent = 'طلب النسخ الاحتياطي قيد التنفيذ.';
    } else if (status && !cached) {
        const latestRestore = restoreRequests[0];
        if (latestRestore?.status === 'succeeded') {
            status.textContent = 'اكتملت الاستعادة بنجاح. ' + (latestRestore.result_message || 'تم تحديث قاعدة البيانات.');
        } else if (latestRestore?.status === 'failed') {
            status.textContent = 'فشلت الاستعادة. ' + (latestRestore.result_message || 'راجع تفاصيل العملية قبل إعادة المحاولة.');
        } else {
            status.textContent = '';
        }
    }
    scheduleBackupConsoleRefresh(Boolean(pendingRestore || pendingBackup));
}

function scheduleBackupConsoleRefresh(shouldRefresh) {
    if (backupConsoleRefreshTimer) clearTimeout(backupConsoleRefreshTimer);
    if (shouldRefresh) backupConsoleRefreshTimer = setTimeout(() => loadBackupConsole({ silent: true }), 30000);
}

async function loadBackupConsole(options = {}) {
    if (backupConsoleLoadPromise) return backupConsoleLoadPromise;
    backupConsoleLoadPromise = (async () => {
        if (document.getElementById('backupModal')?.classList.contains('hidden')) return;
        if (!requireManager()) return;
        const last = document.getElementById('backupLastStatus');
        if (!last) return;
        backupDownloadAllowed = false;
        const restoreButton = document.getElementById('backupRestoreButton');
        const createButton = document.getElementById('backupCreateButton');
        const downloadButton = document.getElementById('backupDownloadButton');
        if (restoreButton) restoreButton.disabled = true;
        if (createButton) createButton.disabled = true;
        if (downloadButton) downloadButton.disabled = true;

        let hasCache = false;
        try {
            const cached = JSON.parse(localStorage.getItem(backupCacheKey()) || 'null');
            if (cached && Array.isArray(cached.backups)) {
                hasCache = true;
                renderBackupConsole(cached, true);
            }
        } catch { /* Ignore invalid local cache. */ }

        if (!hasCache && !options.silent) last.textContent = 'جارٍ تحميل النسخ من الخادم لأول مرة...';
        try {
            const data = await callBackupConsole({ action: 'list' });
            localStorage.setItem(backupCacheKey(), JSON.stringify(data));
            const trackedRestoreRequestId = activeRestoreRequestId;
            renderBackupConsole(data, false);
            const trackedRestore = trackedRestoreRequestId && (data.restoreRequests || data.requests || [])
                .find(item => item.id === trackedRestoreRequestId);
            const completedRestore = trackedRestore?.status === 'succeeded';
            const uncertainRestore = trackedRestore?.status === 'failed'
                && String(trackedRestore.result_message || '').includes('[RESTORE_OUTCOME_UNCERTAIN]');
            if ((completedRestore || uncertainRestore) && typeof lockCurrentSession === 'function') {
                await lockCurrentSession();
                setAuthModal(true, uncertainRestore
                    ? 'تعذر تأكيد نتيجة الاستعادة بعد انقطاع المهمة. سجّل الدخول مرة أخرى للتحقق من قاعدة البيانات الحالية.'
                    : 'اكتملت استعادة قاعدة البيانات. سجّل الدخول مرة أخرى لتحميل البيانات المستعادة.');
                return;
            }
            const refreshNotice = document.getElementById('backupRefreshNotice');
            if (refreshNotice) refreshNotice.textContent = 'تم تحديث الحالة من الخادم الآن.';
        } catch (error) {
            last.textContent = hasCache
                ? 'تعذر تحديث البيانات؛ المعروض سجل محفوظ محليًا وقد لا يعكس الحالة الحالية.'
                : 'تعذر تحميل النسخ. تحقق من الاتصال ثم اضغط تحديث.';
            const refreshNotice = document.getElementById('backupRefreshNotice');
            if (refreshNotice) refreshNotice.textContent = 'فشل الاتصال بالخادم. أعد المحاولة قبل إنشاء نسخة أو طلب استعادة.';
            // Retry while the modal remains open; cached state never enables actions.
            if (!document.getElementById('backupModal')?.classList.contains('hidden')) {
                scheduleBackupConsoleRefresh(true);
            }
            console.error('Backup console error:', error);
        }
    })();
    try {
        return await backupConsoleLoadPromise;
    } finally {
        backupConsoleLoadPromise = null;
    }
}
function updateBackupDownloadButton() {
    const button = document.getElementById('backupDownloadButton');
    const select = document.getElementById('backupRestoreSelect');
    if (button) button.disabled = !backupDownloadAllowed || backupDownloadInProgress || !select?.value;
}

async function downloadDatabaseBackup() {
    if (!requireManager()) return;
    const select = document.getElementById('backupRestoreSelect');
    const tag = select?.value || '';
    const button = document.getElementById('backupDownloadButton');
    const status = document.getElementById('backupDownloadStatus');
    if (!button || button.disabled || !/^backup-\\d{8}T\\d{6}Z$/.test(tag)) return;

    backupDownloadInProgress = true;
    updateBackupDownloadButton();
    if (status) status.textContent = 'جارٍ تجهيز تنزيل النسخة والتحقق من مصدرها...';
    try {
        const prepared = await supabaseClient.functions.invoke('backup-console', {
            body: { action: 'prepare_download', backup_tag: tag }
        });
        if (prepared.error) {
            let code = prepared.error.message || 'backup_download_failed';
            try { code = (await prepared.error.context?.json())?.error || code; } catch { /* Keep the generic error. */ }
            if (!['provider_digest_unavailable', 'direct_download_unavailable', 'unknown_action'].includes(code)) {
                throw new Error(code);
            }
        } else {
            const direct = prepared.data;
            const directUrl = new URL(direct?.downloadUrl || '');
            const expectedFilename = `manzil-db-${tag.slice('backup-'.length)}.dump`;
            if (direct.filename !== expectedFilename
                || !/^[a-f0-9]{64}$/i.test(String(direct.sha256 || ''))
                || !Number.isSafeInteger(Number(direct.sizeBytes)) || Number(direct.sizeBytes) <= 0
                || directUrl.protocol !== 'https:'
                || !['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(directUrl.hostname)) {
                throw new Error('invalid_direct_backup_download');
            }
            const link = document.createElement('a');
            link.href = directUrl.toString();
            link.download = direct.filename;
            link.rel = 'noopener noreferrer';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            link.remove();
            if (status) status.textContent = 'تم بدء التنزيل المباشر. تم التحقق من بصمة النسخة من مستودع النسخ؛ تابع التقدم في مدير التنزيلات.';
            return;
        }

        // Compatibility fallback for providers that do not expose an asset digest
        // or do not issue a short-lived redirect.
        if (status) status.textContent = 'التنزيل المباشر غير متاح لهذه النسخة؛ جارٍ التنزيل عبر الخادم والتحقق من SHA-256...';
        const { data, error, response } = await supabaseClient.functions.invoke('backup-console', {
            body: { action: 'download_backup', backup_tag: tag }
        });
        if (error) {
            let code = error.message || 'backup_download_failed';
            try { code = (await error.context?.json())?.error || code; } catch { /* Keep the generic error. */ }
            throw new Error(code);
        }
        if (!(data instanceof Blob)) throw new Error('invalid_backup_download');

        const expectedSha = response?.headers?.get('x-backup-sha256') || '';
        if (!/^[a-f0-9]{64}$/i.test(expectedSha)) throw new Error('backup_checksum_missing');
        const digest = await crypto.subtle.digest('SHA-256', await data.arrayBuffer());
        const actualSha = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (actualSha !== expectedSha.toLowerCase()) throw new Error('backup_checksum_mismatch');

        const filename = `manzil-db-${tag.slice('backup-'.length)}.dump`;
        const objectUrl = URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        if (status) status.textContent = 'تم التحقق من SHA-256 وبدء تنزيل النسخة بنجاح.';
    } catch (error) {
        if (status) {
            status.textContent = error.message === 'backup_download_not_configured'
                ? 'تنزيل النسخ لم يُفعّل على الخادم بعد.'
                : error.message === 'global_manager_only'
                    ? 'تنزيل قاعدة البيانات الكاملة متاح للمدير الذي يدير جميع المباني فقط.'
                    : 'فشل تنزيل النسخة أو لم تتطابق بصمتها. لم يتم حفظ الملف.';
        }
        console.error('Backup download error:', error);
    } finally {
        backupDownloadInProgress = false;
        updateBackupDownloadButton();
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
        status.textContent = ['backup_already_pending', 'restore_already_pending'].includes(error.message)
            ? 'يوجد طلب نسخ أو استعادة قيد التنفيذ بالفعل.'
            : 'تعذر تسجيل طلب النسخ الاحتياطي. حاول مرة أخرى.';
        console.error('Backup request error:', error);
    }
}

async function requestDatabaseRestore() {
    if (!requireManager()) return;
    const select = document.getElementById('backupRestoreSelect');
    const tag = select?.value;
    if (!tag) { toast('اختر نسخة احتياطية أولاً', 'error'); return; }
    const selectedLabel = select.options[select.selectedIndex]?.textContent?.trim() || tag;
    const warning = 'سيتم استبدال قاعدة بيانات الإنتاج بالكامل، بما يشمل جميع المباني والحسابات والسجلات.\\n\\nالنسخة المحددة: ' + selectedLabel + '\\nمعرّف النسخة: ' + tag + '\\n\\nلا يمكن التراجع عن العملية من داخل التطبيق. هل تريد المتابعة؟';
    if (!confirm(warning)) return;
    const confirmation = prompt('لتأكيد الاستعادة اكتب RESTORE');
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
    const validNumber = value => (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
    const validAmount = value => validNumber(value) && Number(value) >= 0;
    if (!data.residents.every(r => r && typeof r === 'object' && validId(r.id) && typeof r.name === 'string' && typeof r.apartmentNumber === 'string' && (r.phone === undefined || typeof r.phone === 'string') && (r.floor === undefined || r.floor === null || typeof r.floor === 'string') && (r.notes === undefined || typeof r.notes === 'string') && validAmount(r.monthlyAmount ?? 0))) return false;
    if (!data.residents.every(r => r.userId === undefined || r.userId === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(r.userId)))) return false;
    const hasUnique = values => new Set(values).size === values.length;
    if (!hasUnique(data.residents.map(r => r.id))) return false;
    const apartmentKeys = data.residents.map(r => String(r.apartmentNumber).replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776)).trim().toLocaleLowerCase('ar-EG'));
    if (!hasUnique(apartmentKeys)) return false;
    if (!data.residents.every(r => {
        if (r.subscriptionRates === undefined) return true;
        if (!Array.isArray(r.subscriptionRates)) return false;
        const months = r.subscriptionRates.map(rate => rate?.effectiveMonth);
        return hasUnique(months) && r.subscriptionRates.every(rate =>
            rate && typeof rate === 'object' &&
            /^\d{4}-(0[1-9]|1[0-2])-01$/.test(String(rate.effectiveMonth || '')) &&
            validAmount(rate.monthlyAmount)
        );
    })) return false;
    const residentIds = new Set(data.residents.map(r => r.id));
    if (!data.income.every(i => i && typeof i === 'object' && validId(i.id) && validId(i.residentId) && residentIds.has(i.residentId) && typeof i.month === 'string' && validAmount(i.amount) && (i.notes === undefined || typeof i.notes === 'string') && (i.paymentMethod === undefined || i.paymentMethod === null || ['cash', 'wallet', 'instapay', 'bank_transfer'].includes(i.paymentMethod)))) return false;
    if (!hasUnique(data.income.map(i => i.id))) return false;
    if (!data.expenses.every(e => e && typeof e === 'object' && validId(e.id) && typeof e.title === 'string' && typeof e.month === 'string' && validAmount(e.amount) && (e.category === undefined || typeof e.category === 'string') && (e.notes === undefined || typeof e.notes === 'string'))) return false;
    if (!hasUnique(data.expenses.map(e => e.id))) return false;
    if (!data.notices.every(n => n && typeof n === 'object' && validId(n.id) && typeof n.text === 'string')) return false;
    if (!hasUnique(data.notices.map(n => n.id))) return false;
    if (data.auditLogs !== undefined && !Array.isArray(data.auditLogs)) return false;
    if (data.currentTheme !== undefined && !['dark','light','emerald','ocean','sand','turquoise'].includes(data.currentTheme)) return false;
    if (data.defaultSubscription !== undefined && !validAmount(data.defaultSubscription)) return false;
    if (data.startingBalance !== undefined && !validNumber(data.startingBalance)) return false;
    const floorCount = data.floorCount ?? 0;
    const apartmentsPerFloor = data.apartmentsPerFloor ?? 0;
    if (!Number.isInteger(floorCount) || !Number.isInteger(apartmentsPerFloor)
        || !((floorCount === 0 && apartmentsPerFloor === 0)
            || (floorCount >= 1 && floorCount <= 100 && apartmentsPerFloor >= 1 && apartmentsPerFloor <= 100))) return false;
    return true;
}

function importJSON(ev) {
    if (!requireManager()) return;
    const f = ev.target.files[0]; if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast('حجم النسخة أكبر من الحد المسموح (10 ميجابايت)','error'); ev.target.value = ''; return; }
    const r = new FileReader();
    r.onload = async () => {
        let previousState = null;
        try {
            const data = JSON.parse(r.result);
            if (!isValidBackup(data)) throw new Error('ملف غير صالح');
            if (!confirm('استيراد البيانات؟ سيتم استبدال الحالية.')) return;
            previousState = cloneStateSnapshot();
            state = { ...state, ...data, auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs : [] };
            const { data: layoutResult, error: layoutError } = await supabaseClient.rpc('set_building_apartment_layout', {
                p_building_id: activeBuildingId,
                p_floor_count: state.floorCount || 0,
                p_apartments_per_floor: state.apartmentsPerFloor || 0
            });
            if (layoutError || !layoutResult?.ok) throw new Error('تعذر حفظ إعدادات الأدوار في النسخة');
            if (!await saveWithRollback(previousState)) {
                await supabaseClient.rpc('set_building_apartment_layout', {
                    p_building_id: activeBuildingId,
                    p_floor_count: previousState.floorCount || 0,
                    p_apartments_per_floor: previousState.apartmentsPerFloor || 0
                });
                throw new Error('تعذر حفظ النسخة');
            }
            const importedTheme = state.currentTheme || 'dark';
            document.body.setAttribute('data-theme', importedTheme);
            const themeColors = { dark:'#0b1020', light:'#f3f6fc', emerald:'#071c18', ocean:'#071827', sand:'#211b16', turquoise:'#071f27' };
            document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[importedTheme] || themeColors.dark);
            renderAll();
            toast('تم الاستيراد','success'); closeModal('backupModal');
        } catch (e) {
            if (previousState) state = previousState;
            console.error('تعذر استيراد النسخة:', e);
            toast('النسخة غير صالحة أو تعذر حفظها؛ لم يتم استبدال البيانات','error');
        }
        finally { ev.target.value = ''; }
    };
    r.onerror = () => { toast('تعذر قراءة الملف','error'); ev.target.value = ''; };
    r.readAsText(f);
}
