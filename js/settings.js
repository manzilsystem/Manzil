// @ts-check
const SETTINGS_TABS = ['building','payments','subscriptions','appearance','backup','receipts','reminders','account'];
function updateSettingsMessageCounter(inputId, counterId, maxLength) {
    const input = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById(inputId));
    const counter = /** @type {HTMLElement | null} */ (document.getElementById(counterId));
    if (!input || !counter) return;
    const length = String(input.value || '').length;
    counter.textContent = `${length} / ${maxLength} حرف`;
    counter.classList.toggle('is-near-limit', length >= Math.ceil(maxLength * 0.9));
    counter.classList.toggle('is-at-limit', length >= maxLength);
}

function renderReceiptPreview() {
    const input = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById('settingsReceiptThankYou'));
    const preview = /** @type {HTMLElement | null} */ (document.getElementById('settingsReceiptPreview'));
    updateSettingsMessageCounter('settingsReceiptThankYou', 'settingsReceiptCharacterCount', 180);
    if (!preview) return;
    const thankYou = String(input?.value || '').trim() || DEFAULT_RECEIPT_THANK_YOU;
    preview.textContent = [
        `إيصال استلام — ${state.buildingName || 'العمارة'}`,
        '', 'مرحباً أحمد،', 'نؤكد استلام دفعة الاشتراك بنجاح.',
        'الشقة: 12', 'المبلغ المستلم: 500 ج.م', 'طريقة الدفع: نقدًا',
        'تفاصيل السداد:', '• نوفمبر 2026: 500 ج.م',
        'تاريخ الاستلام: 04/11/2026', 'رقم الإيصال: SAMPLE-001', '', thankYou
    ].join('\n');
}
function renderReminderPreview() {
    const input = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById('settingsReminderTemplate'));
    const preview = /** @type {HTMLElement | null} */ (document.getElementById('settingsReminderPreview'));
    updateSettingsMessageCounter('settingsReminderTemplate', 'settingsReminderCharacterCount', 500);
    if (!preview) return;
    const template = String(input?.value || '').trim() || DEFAULT_REMINDER_TEMPLATE;
    preview.textContent = renderReminderTemplate(template, {
        name: 'أحمد', building: state.buildingName || 'عمارة النور',
        apartment: '12', month: 'نوفمبر 2026', amount: '1,250',
        count: 3, months: 'سبتمبر 2026، أكتوبر 2026، نوفمبر 2026'
    });
}
function resetReceiptTemplate() {
    const input = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById('settingsReceiptThankYou'));
    if (!input) return;
    input.value = DEFAULT_RECEIPT_THANK_YOU;
    renderReceiptPreview();
}

function resetReminderTemplate() {
    const input = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById('settingsReminderTemplate'));
    if (!input) return;
    input.value = DEFAULT_REMINDER_TEMPLATE.slice(0, 500);
    renderReminderPreview();
}

function insertReminderVariable(variable) {
    const input = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById('settingsReminderTemplate'));
    if (!input || !variable) return;
    const value = String(input.value || '');
    const start = Number.isInteger(input.selectionStart) ? /** @type {number} */ (input.selectionStart) : value.length;
    const end = Number.isInteger(input.selectionEnd) ? /** @type {number} */ (input.selectionEnd) : start;
    input.value = (value.slice(0, start) + variable + value.slice(end)).slice(0, 500);
    const caret = Math.min(start + String(variable).length, 500);
    input.focus?.();
    try { input.setSelectionRange?.(caret, caret); } catch (error) { /* selection unsupported */ }
    renderReminderPreview();
}

const SETTINGS_THEME_NAMES = { dark:'ليلي', light:'نهاري', emerald:'زمردي', ocean:'محيطي', sand:'رملي', turquoise:'فيروزي' };
const SETTINGS_SECTION_ICONS = {
    building:'fa-building', payments:'fa-wallet', subscriptions:'fa-calendar-check',
    appearance:'fa-palette', backup:'fa-cloud-arrow-up', receipts:'fa-receipt',
    reminders:'fa-bell', account:'fa-user-shield'
};

function syncSettingsWorkspace(tab) {
    const activeTab = SETTINGS_TABS.includes(tab) ? tab : null;
    document.querySelectorAll('[data-settings-nav]').forEach(item => {
        const el = /** @type {HTMLElement} */ (item);
        const active = el.dataset.settingsNav === (activeTab || 'overview');
        el.classList.toggle('is-active', active);
        if (active) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
    });
    document.querySelectorAll('.settings-card[aria-controls]').forEach(card => {
        card.classList.toggle('is-active', card.getAttribute('aria-controls') === 'settings-panel-' + activeTab);
    });
    const layout = /** @type {HTMLElement | null} */ (document.getElementById('settingsLayout'));
    if (layout) layout.dataset.settingsView = activeTab ? 'section' : 'overview';
    const toolbarIcon = /** @type {HTMLElement | null} */ (document.getElementById('settingsCurrentSectionIcon'));
    if (toolbarIcon) toolbarIcon.innerHTML = `<i class="fa-solid ${SETTINGS_SECTION_ICONS[activeTab] || 'fa-sliders'}" aria-hidden="true"></i>`;
}

function renderSettingsWorkspaceSummary() {
    const residents = Array.isArray(state.residents) ? state.residents : [];
    const floors = Math.max(0, Number(state.floorCount) || 0);
    const perFloor = Math.max(0, Number(state.apartmentsPerFloor) || 0);
    const apartments = residents.length || floors * perFloor;
    const methods = Object.values(normalizePaymentSettings(state.paymentSettings))
        .filter(method => method.enabled).length;
    const setText = (id, value) => {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
    };
    setText('settingsSidebarBuilding', String(state.buildingName || '').trim() || 'عمارة بدون اسم');
    setText('settingsSidebarManager', String(state.managerName || '').trim() || 'لم يُحدَّد المدير');
    setText('settingsSidebarFloors', floors || '—');
    setText('settingsSidebarApartments', apartments || '—');
    setText('settingsOverviewFloors', floors || '—');
    setText('settingsOverviewApartments', apartments || '—');
    setText('settingsOverviewMethods', methods || '—');
}

function showSettingsOverview() {
    document.getElementById('settingsOverview')?.classList.remove('hidden');
    document.getElementById('settingsSectionToolbar')?.classList.add('hidden');
    document.querySelectorAll('.settings-panel').forEach(panel => panel.classList.add('hidden'));
    document.getElementById('settingsSaveButton')?.classList.add('hidden');
    document.querySelector('.settings-footer')?.classList.add('settings-footer-overview');
    document.getElementById('settingsModalTitle').innerHTML = '<i class="fa-solid fa-gear ml-2"></i> الإعدادات';
    syncSettingsWorkspace(null);
}
function switchSettingsTab(tab) {
    if (!SETTINGS_TABS.includes(tab)) return;
    document.getElementById('settingsOverview')?.classList.add('hidden');
    document.getElementById('settingsSectionToolbar')?.classList.remove('hidden');
    document.getElementById('settingsSaveButton')?.classList.remove('hidden');
    document.querySelector('.settings-footer')?.classList.remove('settings-footer-overview');
    const titles = {
        building: 'بيانات العمارة', payments: 'طرق التحصيل', subscriptions: 'الاشتراكات',
        appearance: 'المظهر والثيمات', backup: 'النسخ الاحتياطي', receipts: 'الإيصالات',
        reminders: 'التذكيرات', account: 'الحساب والصلاحيات'
    };
    if (tab === 'backup') loadSettingsBackupSummary();
    const title = titles[tab];
    const titleNode = document.getElementById('settingsCurrentSectionTitle');
    if (titleNode) titleNode.textContent = title;
    SETTINGS_TABS.forEach(name => {
        document.getElementById('settings-panel-' + name)?.classList.toggle('hidden', name !== tab);
    });
    syncSettingsWorkspace(tab);
    document.getElementById('settings-content')?.scrollTo?.({ top: 0, behavior: 'auto' });
}

function handleSettingsTabKeydown(event) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const items = [...document.querySelectorAll('[data-settings-nav]')];
    const current = /** @type {HTMLElement | null} */ (document.activeElement?.closest?.('[data-settings-nav]'));
    const currentIndex = items.indexOf(current);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
            ? items.length - 1
            : (currentIndex + (event.key === 'ArrowLeft' ? 1 : -1) + items.length) % items.length;
    const next = /** @type {HTMLElement} */ (items[nextIndex]);
    const nextTab = next.dataset.settingsNav;
    if (nextTab === 'overview') showSettingsOverview();
    else switchSettingsTab(nextTab);
    next.focus();
}
function updateThemeSelection() {
    const theme = SETTINGS_THEME_NAMES[state.currentTheme] ? state.currentTheme : 'dark';
    document.querySelectorAll('[data-theme-option]').forEach(button => {
        const el = /** @type {HTMLElement} */ (button);
        const active = el.dataset.themeOption === theme;
        el.classList.toggle('active', active);
        el.setAttribute('aria-pressed', String(active));
    });
    const label = document.getElementById('settingsCurrentTheme');
    if (label) label.textContent = SETTINGS_THEME_NAMES[theme];
    const pill = document.getElementById('settingsCurrentThemePill');
    if (pill) pill.textContent = SETTINGS_THEME_NAMES[theme];
}

function renderSettingsOwnerAccess() {
    const container = document.getElementById('settingsOwnerAccessList');
    if (!container) return;
    const summary = document.getElementById('settingsOwnerAccessSummary');
    const search = document.getElementById('settingsOwnerAccessSearch');
    const residents = [...(state.residents || [])].sort((a, b) =>
        String(a.apartmentNumber || '').localeCompare(String(b.apartmentNumber || ''), 'ar', { numeric: true })
    );
    const linkedCount = residents.filter(resident => Boolean(resident.userId)).length;
    const needsAccountCount = residents.filter(resident => !resident.userId && Boolean(String(resident.phone || '').trim())).length;
    const missingPhoneCount = residents.filter(resident => !String(resident.phone || '').trim()).length;
    if (summary) {
        summary.textContent = `${residents.length} شقة · ${linkedCount} حساب مرتبط · ${needsAccountCount} يحتاج إنشاء حساب · ${missingPhoneCount} بدون هاتف`;
    }
    const setStat = (id, value) => {
        const node = document.getElementById(id);
        if (node) node.textContent = String(value);
    };
    setStat('settingsOwnerStatTotal', residents.length);
    setStat('settingsOwnerStatLinked', linkedCount);
    setStat('settingsOwnerStatPending', needsAccountCount);
    setStat('settingsOwnerStatMissing', missingPhoneCount);
    if (!residents.length) {
        container.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">أضف الشقق أولًا لعرض حسابات الملاك.</p>';
        return;
    }
    const normalize = value => String(value || '').toLocaleLowerCase('ar')
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '').trim();
    const searchInput = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsOwnerAccessSearch'));
    const query = normalize(searchInput?.value);
    const filtered = residents.filter(resident => [
        resident.name, resident.apartmentNumber, resident.phone,
        resident.userId ? 'حساب مرتبط' : resident.phone ? 'لم ينشأ حساب' : 'بدون هاتف'
    ].some(value => normalize(value).includes(query)));
    if (!filtered.length) {
        container.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">لا توجد نتائج مطابقة للبحث.</p>';
        return;
    }
    container.innerHTML = filtered.map(resident => {
        const linked = Boolean(resident.userId);
        const hasPhone = Boolean(String(resident.phone || '').trim());
        const status = linked ? 'حساب مرتبط' : hasPhone ? 'لم يُنشأ حساب' : 'لا يوجد رقم جوال';
        const statusClass = linked ? 'text-emerald-500' : hasPhone ? 'text-amber-500' : 'text-slate-500';
        const provisionButton = hasPhone
            ? `<button type="button" class="settings-owner-action" onclick="provisionOwnerAccess('${esc(resident.id)}')">${linked ? 'إعادة إصدار PIN' : 'إنشاء حساب المالك'}</button>`
            : '';
        return `<article class="settings-owner-row">
            <div class="min-w-0"><b>شقة ${esc(resident.apartmentNumber || '—')} · ${esc(resident.name || '—')}</b>
                <p class="text-[11px] text-slate-500" dir="auto">${esc(resident.phone || '—')}</p>
                <p class="text-[11px] font-bold ${statusClass}">${status}</p>
            </div>
            <div class="settings-owner-actions">${provisionButton}
                <button type="button" class="settings-owner-action secondary" onclick="editResident('${esc(resident.id)}')">تعديل الشقة</button>
            </div>
        </article>`;
    }).join('');
}

function syncPaymentMethodDetails() {
    const methods = [
        { toggle: 'settingsPaymentWalletEnabled', details: 'settingsWalletDetails' },
        { toggle: 'settingsPaymentInstapayEnabled', details: 'settingsInstapayDetails' },
        { toggle: 'settingsPaymentBankEnabled', details: 'settingsBankDetails' },
        { toggle: 'settingsPaymentCashEnabled', details: null }
    ];
    let enabledCount = 0;
    methods.forEach(({ toggle: toggleId, details: detailsId }) => {
        const toggle = /** @type {HTMLInputElement | null} */ (document.getElementById(toggleId));
        if (!toggle) return;
        const enabled = toggle.checked;
        if (enabled) enabledCount += 1;
        const details = detailsId ? /** @type {HTMLElement | null} */ (document.getElementById(detailsId)) : null;
        if (details) {
            details.hidden = !enabled;
            details.classList.toggle('hidden', !enabled);
            details.setAttribute('aria-hidden', String(!enabled));
            toggle.setAttribute('aria-expanded', String(enabled));
            details.querySelectorAll('input, select, textarea').forEach(field => {
                const el = /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} */ (field);
                el.disabled = !enabled;
            });
        }
        toggle.onchange = syncPaymentMethodDetails;
        const card = toggle.closest('.settings-payment-card');
        card?.classList.toggle('is-disabled', !enabled);
        const status = card?.querySelector('[data-method-status]');
        if (status) {
            const statusEl = /** @type {HTMLElement} */ (status);
            statusEl.textContent = enabled ? 'مفعّلة' : 'متوقفة';
            statusEl.classList.toggle('is-off', !enabled);
        }
    });
    const count = /** @type {HTMLElement | null} */ (document.getElementById('settingsPaymentSummaryCount'));
    if (count) count.textContent = String(enabledCount);
}

function renderSubscriptionRulePreview() {
    const preview = /** @type {HTMLElement | null} */ (document.getElementById('settingsSubscriptionRulePreview'));
    if (!preview) return;
    const dueDay = Number(/** @type {HTMLInputElement | null} */ (document.getElementById('settingsSubscriptionDueDay'))?.value);
    const graceDays = Number(/** @type {HTMLInputElement | null} */ (document.getElementById('settingsSubscriptionGraceDays'))?.value);
    const policy = /** @type {HTMLSelectElement | null} */ (document.getElementById('settingsPaymentAllocationPolicy'))?.value;
    const validDue = Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 28;
    const validGrace = Number.isInteger(graceDays) && graceDays >= 0 && graceDays <= 31;
    const dueLabel = validDue
        ? `يوم ${dueDay} من كل شهر`
        : 'لم يتم تحديد يوم الاستحقاق';
    const graceLabel = validGrace
        ? (graceDays === 0 ? 'بدون فترة سماح' : `${graceDays} يوم`)
        : 'فترة السماح غير صحيحة';
    const policyLabel = policy === 'selected_month_first'
        ? 'الشهر المحدد أولًا، ثم الشهور الأقدم'
        : 'الشهور الأقدم أولًا';
    preview.textContent = [
        `موعد الاستحقاق: ${dueLabel}`,
        `فترة السماح: ${graceLabel}`,
        `توزيع الدفعات: ${policyLabel}`,
        'يبدأ التأخير بعد انتهاء يوم الاستحقاق وفترة السماح.'
    ].join('\n');

    const setText = (id, text) => {
        const node = document.getElementById(id);
        if (node) node.textContent = text;
    };
    const overdueDay = validDue && validGrace ? dueDay + graceDays + 1 : 0;
    setText('settingsRuleDueValue', validDue ? `يوم ${dueDay} من الشهر` : '—');
    setText('settingsRuleGraceValue', validGrace
        ? (graceDays === 0 ? 'لا توجد مهلة إضافية' : `${graceDays} يوم بعد الاستحقاق`)
        : '—');
    setText('settingsRuleOverdueValue', overdueDay
        ? (overdueDay > 30 ? 'مطلع الشهر التالي' : `من يوم ${overdueDay} من الشهر`)
        : '—');
    const example = document.getElementById('settingsRuleExample');
    if (example) {
        example.textContent = validDue && validGrace
            ? `مثال: اشتراك مستحق يوم ${dueDay} وفترة سماح ${graceDays} يوم يعني أن التأخير يُحتسب ${overdueDay > 30 ? 'من مطلع الشهر التالي' : `من يوم ${overdueDay} من الشهر`}.`
            : 'سيظهر مثال محسوب عند إدخال المواعيد.';
    }
}

async function loadSettingsBackupSummary() {
    const summary = document.getElementById('settingsBackupSummaryText');
    const meta = document.getElementById('settingsBackupSummaryMeta');
    if (!summary || typeof callBackupConsole !== 'function') return;
    if (typeof requireManager === 'function' && !requireManager()) return;
    summary.textContent = 'جارٍ التحقق من حالة النسخ على الخادم...';
    if (meta) meta.textContent = '';
    try {
        const data = await callBackupConsole({ action: 'list' });
        const backups = Array.isArray(data.backups) ? data.backups : [];
        const restoreRequests = Array.isArray(data.restoreRequests) ? data.restoreRequests : [];
        const backupRequests = Array.isArray(data.backupRequests) ? data.backupRequests : [];
        const pendingRestore = restoreRequests.some(item => ['queued', 'running'].includes(item.status));
        const pendingBackup = backupRequests.some(item => ['queued', 'dispatched'].includes(item.status));
        if (pendingRestore) {
            summary.textContent = 'توجد عملية استعادة قيد التنفيذ. لا تبدأ عملية أخرى حتى تنتهي.';
        } else if (pendingBackup) {
            summary.textContent = 'طلب إنشاء نسخة احتياطية قيد التنفيذ.';
        } else if (backups.length) {
            const latest = new Date(backups[0].created_at);
            summary.textContent = Number.isNaN(latest.getTime())
                ? 'تم العثور على نسخ احتياطية محفوظة على الخادم.'
                : 'آخر نسخة ناجحة: ' + latest.toLocaleString('ar-EG');
        } else {
            summary.textContent = 'لا توجد نسخ مسجلة على الخادم حتى الآن.';
        }
        if (meta) meta.textContent = backups.length + ' نسخة متاحة للاستعادة أو التنزيل.'
            + (data.canDownload === true ? ' التنزيل الكامل متاح لهذا الحساب.' : ' التنزيل الكامل غير متاح لهذا الحساب.');
    } catch (error) {
        summary.textContent = 'تعذر جلب حالة النسخ من الخادم. استخدم زر التحديث أو افتح إدارة النسخ للمحاولة مرة أخرى.';
        if (meta) meta.textContent = 'لم يتم الاعتماد على بيانات محلية قديمة في هذا الملخص.';
        console.error('Settings backup summary error:', error);
    }
}

function renderSettingsFloorStack(floors, apartmentsPerFloor, total) {
    const stack = document.getElementById('settingsFloorStack');
    if (!stack) return;
    if (!total) {
        stack.innerHTML = '';
        return;
    }
    const row = (label, count) => {
        const dots = Array.from({ length: Math.min(count, 12) }, () => '<i></i>').join('');
        return `<div class="settings-floor-row"><span class="settings-floor-label">${label}</span><span class="settings-floor-dots">${dots}</span></div>`;
    };
    const rows = [];
    if (floors <= 4) {
        for (let index = 1; index <= floors; index += 1) {
            rows.push(row(`الدور ${index}`, apartmentsPerFloor));
        }
    } else {
        rows.push(row('الدور 1', apartmentsPerFloor));
        rows.push(row('الدور 2', apartmentsPerFloor));
        rows.push(`<div class="settings-floor-row"><span class="settings-floor-label">…</span><span class="settings-floor-dots"><i></i><i></i><i></i></span></div>`);
        rows.push(row(`الدور ${floors - 1}`, apartmentsPerFloor));
        rows.push(row(`الدور ${floors}`, apartmentsPerFloor));
    }
    stack.innerHTML = rows.join('');
}

function renderSettingsBuildingLive() {
    const value = id => String(/** @type {HTMLInputElement | null} */ (document.getElementById(id))?.value ?? '').trim();
    const floors = Number(value('settingsFloorCount') || state.floorCount || 0);
    const perFloor = Number(value('settingsApartmentsPerFloor') || state.apartmentsPerFloor || 0);
    const residents = Array.isArray(state.residents) ? state.residents.length : 0;
    const total = Number.isInteger(floors) && Number.isInteger(perFloor) && floors > 0 && perFloor > 0
        ? floors * perFloor
        : (residents || Number(state.floorCount || 0) * Number(state.apartmentsPerFloor || 0));
    const setText = (id, text) => {
        const node = document.getElementById(id);
        if (node) node.textContent = text;
    };
    const money = amount => {
        const number = Number(amount);
        if (!Number.isFinite(number) || number <= 0) return '—';
        const formatted = typeof fmtNum === 'function' ? fmtNum(number) : String(number);
        return `${formatted} ج.م`;
    };
    setText('settingsLiveBuildingName', value('settingsBuildingName') || String(state.buildingName || '').trim() || 'عمارة بدون اسم');
    setText('settingsLiveManagerName', value('settingsManagerName') || String(state.managerName || '').trim() || 'لم يُحدَّد المدير');
    setText('settingsLiveFloors', floors > 0 ? floors : '—');
    setText('settingsLiveApartments', total > 0 ? total : '—');
    setText('settingsLiveSubscription', money(value('settingsDefaultSub') || state.defaultSubscription));
    setText('settingsLiveBalance', money(value('settingsStartingBalance') || state.startingBalance));
}

function renderBuildingLayoutPreview() {
    renderSettingsBuildingLive();
    const preview = /** @type {HTMLElement | null} */ (document.getElementById('settingsBuildingLayoutPreview'));
    if (!preview) return;
    const floors = Number(/** @type {HTMLInputElement | null} */ (document.getElementById('settingsFloorCount'))?.value || 0);
    const apartmentsPerFloor = Number(/** @type {HTMLInputElement | null} */ (document.getElementById('settingsApartmentsPerFloor'))?.value || 0);
    if (floors === 0 && apartmentsPerFloor === 0) {
        preview.textContent = 'حدد عدد الأدوار والشقق لعرض التوزيع.';
        renderSettingsFloorStack(0, 0, 0);
        return;
    }
    if (!Number.isInteger(floors) || !Number.isInteger(apartmentsPerFloor)
        || floors < 1 || floors > 100 || apartmentsPerFloor < 1 || apartmentsPerFloor > 100) {
        preview.textContent = 'أدخل عدد الأدوار وعدد الشقق معًا، من 1 إلى 100 لكل قيمة.';
        renderSettingsFloorStack(0, 0, 0);
        return;
    }
    const total = floors * apartmentsPerFloor;
    const lastStart = total - apartmentsPerFloor + 1;
    preview.textContent = [
        `عدد الأدوار: ${floors}`,
        `الشقق في كل دور: ${apartmentsPerFloor}`,
        `إجمالي الشقق: ${total}`,
        `الدور الأول: الشقق 1–${apartmentsPerFloor}`,
        `الدور الأخير: الشقق ${lastStart}–${total}`
    ].join('\n');
    renderSettingsFloorStack(floors, apartmentsPerFloor, total);
}

function openSettingsModal() {
    if (!requireManager()) return;
    const idVal = (id) => /** @type {HTMLInputElement | null} */ (document.getElementById(id));
    idVal('settingsBuildingName').value = state.buildingName||'';
    idVal('settingsManagerName').value = state.managerName||'';
    idVal('settingsManagerPhone').value = state.managerPhone||'';
    idVal('settingsDefaultSub').value = String(state.defaultSubscription||'');
    idVal('settingsStartingBalance').value = String(state.startingBalance ?? '');
    idVal('settingsFloorCount').value = String(state.floorCount || '');
    idVal('settingsApartmentsPerFloor').value = String(state.apartmentsPerFloor || '');
    ['settingsFloorCount', 'settingsApartmentsPerFloor'].forEach(id => {
        const field = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
        if (!field) return;
        field.oninput = renderBuildingLayoutPreview;
        field.onchange = renderBuildingLayoutPreview;
    });
    renderBuildingLayoutPreview();
    ['settingsBuildingName', 'settingsManagerName', 'settingsDefaultSub', 'settingsStartingBalance'].forEach(id => {
        const field = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
        if (field) field.oninput = renderSettingsBuildingLive;
    });

    const paymentSettings = normalizePaymentSettings(state.paymentSettings);
    const cashToggle = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsPaymentCashEnabled'));
    if (cashToggle) cashToggle.checked = paymentSettings.cash.enabled;
    const walletToggle = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsPaymentWalletEnabled'));
    if (walletToggle) walletToggle.checked = paymentSettings.wallet.enabled;
    const walletProvider = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsWalletProvider'));
    if (walletProvider) walletProvider.value = paymentSettings.wallet.provider;
    const walletAccountName = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsWalletAccountName'));
    if (walletAccountName) walletAccountName.value = paymentSettings.wallet.accountName;
    const walletNumber = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsWalletNumber'));
    if (walletNumber) walletNumber.value = paymentSettings.wallet.number;
    const instapayToggle = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsPaymentInstapayEnabled'));
    if (instapayToggle) instapayToggle.checked = paymentSettings.instapay.enabled;
    const instapayAccountName = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsInstapayAccountName'));
    if (instapayAccountName) instapayAccountName.value = paymentSettings.instapay.accountName;
    const instapayAddress = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsInstapayAddress'));
    if (instapayAddress) instapayAddress.value = paymentSettings.instapay.address;
    const bankToggle = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsPaymentBankEnabled'));
    if (bankToggle) bankToggle.checked = paymentSettings.bank_transfer.enabled;
    const bankName = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsBankName'));
    if (bankName) bankName.value = paymentSettings.bank_transfer.bankName;
    const bankAccountName = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsBankAccountName'));
    if (bankAccountName) bankAccountName.value = paymentSettings.bank_transfer.accountName;
    const bankAccountNumber = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsBankAccountNumber'));
    if (bankAccountNumber) bankAccountNumber.value = paymentSettings.bank_transfer.accountNumber;
    const bankIban = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsBankIban'));
    if (bankIban) bankIban.value = paymentSettings.bank_transfer.iban;
    syncPaymentMethodDetails();
    const dueDayInput = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsSubscriptionDueDay'));
    if (dueDayInput) dueDayInput.value = String(Number(state.subscriptionDueDay) || 1);
    const graceDaysInput = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsSubscriptionGraceDays'));
    if (graceDaysInput) graceDaysInput.value = String(Number(state.subscriptionGraceDays) || 0);
    const policySelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('settingsPaymentAllocationPolicy'));
    if (policySelect) policySelect.value =
        ['oldest_first', 'selected_month_first'].includes(state.paymentAllocationPolicy)
            ? state.paymentAllocationPolicy
            : 'oldest_first';
    ['settingsSubscriptionDueDay', 'settingsSubscriptionGraceDays', 'settingsPaymentAllocationPolicy'].forEach(id => {
        const field = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.getElementById(id));
        if (!field) return;
        field.oninput = renderSubscriptionRulePreview;
        field.onchange = renderSubscriptionRulePreview;
    });
    renderSubscriptionRulePreview();

    renderSettingsOwnerAccess();
    const account = document.getElementById('settingsAccountEmail');
    if (account) account.textContent = currentUserRole === 'manager'
        ? (activeSession?.user?.email || '—')
        : 'تسجيل دخول برقم الهاتف';
    const role = document.getElementById('settingsAccountRole');
    if (role) role.textContent = currentUserRole === 'manager' ? 'مدير المبنى' : 'مالك الشقة';
    document.getElementById('settingsPasswordResetBtn')?.classList.toggle('hidden', currentUserRole !== 'manager');
    const receiptInput = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById('settingsReceiptThankYou'));
    if (receiptInput) {
        try { receiptInput.value = state.receiptThankYouTemplate ?? (localStorage.getItem(getReceiptSettingsKey()) || ''); }
        catch { receiptInput.value = state.receiptThankYouTemplate || ''; }
        receiptInput.oninput = renderReceiptPreview;
    }
    renderReceiptPreview();
    const reminderInput = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById('settingsReminderTemplate'));
    if (reminderInput) {
        try { reminderInput.value = state.reminderMessageTemplate ?? (localStorage.getItem(getReminderTemplateKey()) || ''); }
        catch { reminderInput.value = state.reminderMessageTemplate || ''; }
        reminderInput.oninput = renderReminderPreview;
    }
    renderReminderPreview();
    renderSettingsWorkspaceSummary();
    showSettingsOverview();
    updateThemeSelection();
    openModal('settingsModal');
}

async function saveSettings() {
    if (!requireManager()) return;
    const defaultSubscription = Number(/** @type {HTMLInputElement | null} */ (document.getElementById('settingsDefaultSub')).value || 0);
    const startingBalance = Number(/** @type {HTMLInputElement | null} */ (document.getElementById('settingsStartingBalance')).value || 0);
    const floorCount = Number(/** @type {HTMLInputElement | null} */ (document.getElementById('settingsFloorCount')).value || 0);
    const apartmentsPerFloor = Number(/** @type {HTMLInputElement | null} */ (document.getElementById('settingsApartmentsPerFloor')).value || 0);
    const validLayout = (floorCount === 0 && apartmentsPerFloor === 0)
        || (Number.isInteger(floorCount) && floorCount >= 1 && floorCount <= 100
            && Number.isInteger(apartmentsPerFloor) && apartmentsPerFloor >= 1 && apartmentsPerFloor <= 100);
    const subscriptionDueDay = Number(/** @type {HTMLInputElement | null} */ (document.getElementById('settingsSubscriptionDueDay')).value);
    const subscriptionGraceDays = Number(/** @type {HTMLInputElement | null} */ (document.getElementById('settingsSubscriptionGraceDays')).value);
    const paymentAllocationPolicy = /** @type {HTMLSelectElement | null} */ (document.getElementById('settingsPaymentAllocationPolicy')).value;
    const validSubscriptionRules = Number.isInteger(subscriptionDueDay) && subscriptionDueDay >= 1 && subscriptionDueDay <= 28
        && Number.isInteger(subscriptionGraceDays) && subscriptionGraceDays >= 0 && subscriptionGraceDays <= 31
        && ['oldest_first', 'selected_month_first'].includes(paymentAllocationPolicy);
    const paymentSettings = normalizePaymentSettings({
        cash: { enabled: /** @type {HTMLInputElement | null} */ (document.getElementById('settingsPaymentCashEnabled')).checked },
        wallet: {
            enabled: /** @type {HTMLInputElement | null} */ (document.getElementById('settingsPaymentWalletEnabled')).checked,
            provider: /** @type {HTMLInputElement | null} */ (document.getElementById('settingsWalletProvider')).value,
            accountName: /** @type {HTMLInputElement | null} */ (document.getElementById('settingsWalletAccountName')).value,
            number: /** @type {HTMLInputElement | null} */ (document.getElementById('settingsWalletNumber')).value
        },
        instapay: {
            enabled: /** @type {HTMLInputElement | null} */ (document.getElementById('settingsPaymentInstapayEnabled')).checked,
            accountName: /** @type {HTMLInputElement | null} */ (document.getElementById('settingsInstapayAccountName')).value,
            address: /** @type {HTMLInputElement | null} */ (document.getElementById('settingsInstapayAddress')).value
        },
        bank_transfer: {
            enabled: /** @type {HTMLInputElement | null} */ (document.getElementById('settingsPaymentBankEnabled')).checked,
            bankName: /** @type {HTMLInputElement | null} */ (document.getElementById('settingsBankName')).value,
            accountName: /** @type {HTMLInputElement | null} */ (document.getElementById('settingsBankAccountName')).value,
            accountNumber: /** @type {HTMLInputElement | null} */ (document.getElementById('settingsBankAccountNumber')).value,
            iban: /** @type {HTMLInputElement | null} */ (document.getElementById('settingsBankIban')).value
        }
    });
    const hasEnabledPaymentMethod = Object.values(paymentSettings).some(method => method.enabled);
    if (!Number.isFinite(defaultSubscription) || defaultSubscription < 0
        || !Number.isFinite(startingBalance) || !validLayout) {
        toast('تحقق من قيم الاشتراك والرصيد وعدد الأدوار والشقق (من 1 إلى 100).', 'error');
        return;
    }
    if (!validSubscriptionRules) {
        toast('يجب أن يكون يوم الاستحقاق من 1 إلى 28، وفترة السماح من 0 إلى 31 يومًا.', 'error');
        return;
    }
    if (!hasEnabledPaymentMethod) {
        toast('فعّل وسيلة دفع واحدة على الأقل قبل حفظ الإعدادات.', 'error');
        return;
    }
    const receiptInput = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById('settingsReceiptThankYou'));
    const receiptThankYou = String(receiptInput?.value || '').trim();
    const reminderInput = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById('settingsReminderTemplate'));
    const reminderTemplate = String(reminderInput?.value || '').trim();
    if (receiptThankYou.length > 180 || reminderTemplate.length > 500) {
        toast('تحقق من طول رسالة الإيصال أو التذكير.', 'error');
        return;
    }
    const previousState = cloneStateSnapshot();
    const buildingNameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsBuildingName'));
    if (buildingNameInput) state.buildingName = buildingNameInput.value.trim();
    const managerNameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsManagerName'));
    if (managerNameInput) state.managerName = managerNameInput.value.trim();
    const managerPhoneInput = /** @type {HTMLInputElement | null} */ (document.getElementById('settingsManagerPhone'));
    if (managerPhoneInput) state.managerPhone = managerPhoneInput.value.trim();
    state.defaultSubscription = defaultSubscription;
    state.startingBalance = startingBalance;
    state.floorCount = floorCount;
    state.apartmentsPerFloor = apartmentsPerFloor;
    state.paymentSettings = paymentSettings;
    state.subscriptionDueDay = subscriptionDueDay;
    state.subscriptionGraceDays = subscriptionGraceDays;
    state.paymentAllocationPolicy = paymentAllocationPolicy;

    logAction('تعديل إعدادات التحصيل والاشتراك',
        `طرق الدفع المفعّلة: ${Object.entries(paymentSettings).filter(([, method]) => method.enabled).map(([key]) => getIncomePaymentMethodLabel(key)).join('، ')} · الاستحقاق يوم ${subscriptionDueDay} · السماح ${subscriptionGraceDays} يوم`);

    const { data: layoutResult, error: layoutError } = await supabaseClient.rpc('set_building_apartment_layout', {
        p_building_id: activeBuildingId,
        p_floor_count: floorCount,
        p_apartments_per_floor: apartmentsPerFloor
    });
    if (layoutError || !layoutResult?.ok) {
        state = previousState;
        toast('تعذر حفظ إعدادات الأدوار والشقق. لم يتم اعتماد التغيير.', 'error');
        return;
    }
    if (!await saveWithRollback(previousState)) {
        const rollback = await supabaseClient.rpc('set_building_apartment_layout', {
            p_building_id: activeBuildingId,
            p_floor_count: previousState.floorCount || 0,
            p_apartments_per_floor: previousState.apartmentsPerFloor || 0
        });
        if (rollback.error || !rollback.data?.ok) toast('فشل حفظ الإعدادات، وتعذر التراجع عن إعدادات الأدوار. أعد تحميل المبنى للتحقق.', 'error');
        return;
    }
    const { data: messageSettingsRow, error: messageSettingsError } = await supabaseClient.from('buildings')
        .update({
            receipt_thank_you_template: receiptThankYou || null,
            arrears_reminder_template: reminderTemplate || null
        })
        .eq('id', activeBuildingId)
        .select('id')
        .maybeSingle();
    if (messageSettingsError || !messageSettingsRow?.id) {
        console.error('Could not save building message templates:', messageSettingsError || 'manager update returned no row');
        toast('تم حفظ بقية الإعدادات، لكن تعذر حفظ قوالب الرسائل على الخادم. أعد المحاولة.', 'error');
        return;
    }
    state.receiptThankYouTemplate = receiptThankYou || null;
    state.reminderMessageTemplate = reminderTemplate || null;
    try {
        localStorage.removeItem(getReceiptSettingsKey());
        localStorage.removeItem(getReminderTemplateKey());
    } catch (error) {
        console.warn('Legacy message template cleanup failed:', error);
    }
    renderAll();
    updateAccessSwitchButton();
    closeModal('settingsModal');
    toast('تم حفظ إعدادات العقار والتحصيل والاشتراكات والرسائل ومزامنتها بين الأجهزة', 'success');
}

async function sendSettingsPasswordReset() {
    if (!requireManager()) return;
    const email = activeSession?.user?.email;
    if (!email) { toast('لا يوجد بريد إلكتروني مرتبط بحساب المدير', 'error'); return; }
    const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('settingsPasswordResetBtn'));
    if (button) { button.disabled = true; button.textContent = 'جارٍ إرسال الرابط...'; }
    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
        if (error) throw error;
        toast('تم إرسال رابط تغيير كلمة المرور إلى بريد المدير', 'success');
    } catch (error) {
        console.error('Settings password reset error:', error);
        toast('تعذر إرسال رابط تغيير كلمة المرور', 'error');
    } finally {
        if (button) { button.disabled = false; button.textContent = 'إرسال رابط تغيير كلمة مرور المدير'; }
    }
}

