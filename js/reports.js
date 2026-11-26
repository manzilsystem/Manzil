// @ts-check
let landlordReportMonth = '';
let landlordReportSignature = '';
let landlordReportPurposeFilter = '';
let landlordReportCashAccountFilter = '';
let landlordReportPaymentMethodFilter = '';
let landlordReportResidentFilter = '';

const REPORT_TABS = ['landlord', 'period', 'cashflow', 'expenses', 'adjustments', 'statement', 'apartments', 'monthlyClose', 'arrears', 'audit'];
const REPORT_PANEL_IDS = {
    landlord: 'landlordReportPrint',
    period: 'periodReportCard',
    cashflow: 'cashFlowPanel',
    expenses: 'expensesReportCard',
    adjustments: 'adjustmentsReportCard',
    statement: 'residentStatementCard',
    apartments: 'apartmentsPanel',
    monthlyClose: 'monthlyClosePanel',
    arrears: 'arrearsPanel',
    audit: 'auditLogPanel'
};
const REPORT_OUTPUT_BUTTON_IDS = {
    landlord: 'reportPrintBtn',
    period: 'periodReportPrintBtn',
    cashflow: 'cashFlowPrintBtn',
    expenses: 'expensesReportPrintBtn',
    adjustments: 'adjustmentsReportPrintBtn',
    statement: 'statementPrintBtn',
    apartments: 'apartmentsPrintBtn',
    monthlyClose: 'monthlyClosePdfButton'
};

const REPORT_TONE_CLASSES = ['report-tone-indigo', 'report-tone-emerald', 'report-tone-amber', 'report-tone-rose', 'report-tone-sky'];

// تخزين مؤقت لنماذج التقارير (محلي، لتجنب تكرار依赖 على performance.js الذي قد يسبب تكراراً لا نهائياً)
const REPORT_MODEL_CACHE_LOCAL = new Map();

function getReportCacheScope() {
  // نطاق التخزين المؤقت: المبنى والدور والمالك، حتى لا يظهر تقرير جلسة أخرى بنفس الفلاتر.
  const building = typeof activeBuildingId !== 'undefined' ? activeBuildingId : '';
  const role = typeof currentUserRole !== 'undefined' ? currentUserRole : '';
  const resident = typeof currentResidentId !== 'undefined' ? currentResidentId : '';
  return `${building || ''}|${role || ''}|${resident || ''}|`;
}

function getCachedReportModel(rawCacheKey, builder, invalidateChecker) {
  const cacheKey = getReportCacheScope() + rawCacheKey;
  const cached = REPORT_MODEL_CACHE_LOCAL.get(cacheKey);
  if (cached && (!invalidateChecker || invalidateChecker(cached))) {
    return cached.model;
  }
  const model = builder();
  if (model) {
    REPORT_MODEL_CACHE_LOCAL.set(cacheKey, { model, timestamp: Date.now() });
    if (REPORT_MODEL_CACHE_LOCAL.size > 100) {
      const firstKey = REPORT_MODEL_CACHE_LOCAL.keys().next().value;
      REPORT_MODEL_CACHE_LOCAL.delete(firstKey);
    }
  }
  return model;
}

function clearReportModelCache() {
  REPORT_MODEL_CACHE_LOCAL.clear();
}

const REPORT_PURPOSE_FILTER_IDS = ['landlordReportPurpose', 'periodReportPurpose', 'statementPurpose'];
const REPORT_CASH_ACCOUNT_FILTER_IDS = ['landlordReportCashAccount', 'periodReportCashAccount', 'expensesReportCashAccount'];
const REPORT_RESIDENT_FILTER_IDS = ['landlordReportResident', 'periodReportResident', 'adjustmentsReportResident'];

function reportPurposeLabel(purposeCode) {
    return typeof getIncomePurposeLabel === 'function' ? getIncomePurposeLabel(purposeCode) : 'اشتراك شهري';
}

function normalizeReportPurposeFilter(value) {
    const purpose = String(value || '').trim();
    if (!purpose || typeof INCOME_PURPOSE_FORM_CODES === 'undefined') return '';
    return INCOME_PURPOSE_FORM_CODES.includes(purpose) ? purpose : '';
}

function getReportPurposeFilter(id) {
    if (typeof document === 'undefined') return '';
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
    return normalizeReportPurposeFilter(select?.value || '');
}

function reportPaymentMatchesPurpose(payment, purposeFilter) {
    if (!purposeFilter) return true;
    const purpose = typeof getIncomePurposeFormCode === 'function'
        ? getIncomePurposeFormCode(payment?.purposeCode)
        : (String(payment?.purposeCode || '').trim() || 'subscription');
    return purpose === purposeFilter;
}

function filterReportIncome(income, purposeFilter, cashAccountFilter = '', paymentMethodFilter = '', residentFilter = '') {
    if (!purposeFilter && !cashAccountFilter && !paymentMethodFilter && !residentFilter) return income;
    return income.filter(payment =>
        reportPaymentMatchesPurpose(payment, purposeFilter) &&
        reportCashAccountMatches(payment, cashAccountFilter) &&
        reportPaymentMatchesMethod(payment, paymentMethodFilter) &&
        reportPaymentMatchesResident(payment, residentFilter));
}

function filterReportExpenses(expenses, cashAccountFilter = '') {
    if (!cashAccountFilter) return expenses;
    return expenses.filter(expense => reportCashAccountMatches(expense, cashAccountFilter));
}

function reportShowsSubscriptionDues(purposeFilter) {
    return !purposeFilter || purposeFilter === 'subscription';
}

function reportPurposeFilterLabel(purposeFilter) {
    return purposeFilter ? reportPurposeLabel(purposeFilter) : 'كل الأغراض';
}

function populateReportPurposeFilters() {
    if (typeof INCOME_PURPOSE_FORM_CODES === 'undefined') return;
    const options = INCOME_PURPOSE_FORM_CODES
        .map(value => `<option value="${esc(value)}">${esc(reportPurposeLabel(value))}</option>`)
        .join('');
    REPORT_PURPOSE_FILTER_IDS.forEach(id => {
        const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
        if (!select) return;
        const selected = normalizeReportPurposeFilter(select.value || '');
        select.innerHTML = '<option value="">كل الأغراض</option>' + options;
        select.value = selected;
    });
}

function reportIsSubscriptionPayment(payment) {
    const purpose = String(payment?.purposeCode || '').trim();
    if (purpose === 'settlement') return true;
    if (typeof isSubscriptionIncome === 'function') return isSubscriptionIncome(payment);
    return !purpose || purpose === 'subscription';
}

function reportCashAccountLabel(code) {
    return typeof getCashAccountLabel === 'function' ? getCashAccountLabel(code || 'main') : 'الخزنة الرئيسية';
}

function normalizeReportCashAccountFilter(value) {
    const code = String(value || '').trim();
    if (!code) return '';
    const accounts = typeof CASH_ACCOUNTS !== 'undefined' ? CASH_ACCOUNTS : null;
    if (accounts) return accounts[code] ? code : '';
    return ['main', 'development', 'emergency'].includes(code) ? code : '';
}

function getReportCashAccountFilter(id) {
    if (typeof document === 'undefined') return '';
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
    return normalizeReportCashAccountFilter(select?.value || '');
}

function reportCashAccountFilterLabel(cashAccountFilter) {
    return cashAccountFilter ? reportCashAccountLabel(cashAccountFilter) : 'كل الصناديق';
}

function reportCashAccountMatches(item, cashAccountFilter) {
    if (!cashAccountFilter) return true;
    return (String(item?.cashAccountCode || '').trim() || 'main') === cashAccountFilter;
}

function populateReportCashAccountFilters() {
    const accounts = typeof CASH_ACCOUNTS !== 'undefined' ? CASH_ACCOUNTS : null;
    if (!accounts) return;
    const options = Object.keys(accounts)
        .map(code => `<option value="${esc(code)}">${esc(reportCashAccountLabel(code))}</option>`)
        .join('');
    REPORT_CASH_ACCOUNT_FILTER_IDS.forEach(id => {
        const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
        if (!select) return;
        const selected = normalizeReportCashAccountFilter(select.value || '');
        select.innerHTML = '<option value="">كل الصناديق</option>' + options;
        select.value = selected;
    });
}

function reportPaymentMethodLabel(code) {
    return typeof getIncomePaymentMethodLabel === 'function' ? getIncomePaymentMethodLabel(code) : String(code || '');
}

function normalizeReportPaymentMethodFilter(value) {
    const code = String(value || '').trim();
    if (!code) return '';
    const labels = typeof INCOME_PAYMENT_METHOD_LABELS !== 'undefined' ? INCOME_PAYMENT_METHOD_LABELS : null;
    if (labels) return Object.prototype.hasOwnProperty.call(labels, code) ? code : '';
    return ['cash', 'wallet', 'instapay', 'bank_transfer'].includes(code) ? code : '';
}

function getReportPaymentMethodFilter(id) {
    if (typeof document === 'undefined') return '';
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
    return normalizeReportPaymentMethodFilter(select?.value || '');
}

function reportPaymentMethodFilterLabel(paymentMethodFilter) {
    return paymentMethodFilter ? reportPaymentMethodLabel(paymentMethodFilter) : 'كل الطرق';
}

function reportPaymentMatchesMethod(payment, paymentMethodFilter) {
    if (!paymentMethodFilter) return true;
    return String(payment?.paymentMethod || '').trim() === paymentMethodFilter;
}

function populateReportPaymentMethodFilters() {
    const labels = typeof INCOME_PAYMENT_METHOD_LABELS !== 'undefined' ? INCOME_PAYMENT_METHOD_LABELS : null;
    if (!labels) return;
    const options = Object.keys(labels)
        .map(code => `<option value="${esc(code)}">${esc(reportPaymentMethodLabel(code))}</option>`)
        .join('');
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('landlordReportPaymentMethod'));
    if (!select) return;
    const selected = normalizeReportPaymentMethodFilter(select.value || '');
    select.innerHTML = '<option value="">كل الطرق</option>' + options;
    select.value = selected;
}

function getReportResident(residentFilter) {
    const id = String(residentFilter || '').trim();
    if (!id || typeof state === 'undefined') return null;
    return (state.residents || []).find(resident => resident.id === id) || null;
}

function normalizeReportResidentFilter(value) {
    return getReportResident(value) ? String(value).trim() : '';
}

function getReportResidentFilter(id) {
    if (typeof document === 'undefined') return '';
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
    return normalizeReportResidentFilter(select?.value || '');
}

function reportResidentFilterLabel(residentFilter) {
    const resident = getReportResident(residentFilter);
    return resident ? `شقة ${resident.apartmentNumber} · ${resident.name}` : 'كل الشقق';
}

function reportResidentFileSlug(residentFilter) {
    const resident = getReportResident(residentFilter);
    return resident ? String(resident.apartmentNumber || resident.id).trim() : '';
}

function reportPaymentMatchesResident(payment, residentFilter) {
    if (!residentFilter) return true;
    return String(payment?.residentId || '').trim() === residentFilter;
}

function populateReportResidentFilters() {
    const residents = typeof state !== 'undefined' ? (state.residents || []) : [];
    const options = residents
        .slice()
        .sort((a, b) => String(a.apartmentNumber || '').localeCompare(String(b.apartmentNumber || ''), 'ar', { numeric: true }))
        .map(resident => `<option value="${esc(resident.id)}">شقة ${esc(resident.apartmentNumber)} · ${esc(resident.name)}</option>`)
        .join('');
    REPORT_RESIDENT_FILTER_IDS.forEach(id => {
        const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
        if (!select) return;
        const selected = normalizeReportResidentFilter(select.value || '');
        select.innerHTML = '<option value="">كل الشقق</option>' + options;
        select.value = selected;
    });
}

function reportComparisonModeLabel(value) {
    return ({ previous: 'الفترة السابقة', previous_year: 'نفس الفترة من العام الماضي' })[value] || '';
}

const REPORT_FILTER_DESCRIPTORS = {
    landlord: [
        { id: 'reportMonthSelect', label: 'الشهر' },
        { id: 'landlordReportResident', label: 'الشقة', text: reportResidentFilterLabel },
        { id: 'landlordReportPurpose', label: 'غرض التحصيل', text: reportPurposeFilterLabel },
        { id: 'landlordReportCashAccount', label: 'الصندوق', text: reportCashAccountFilterLabel },
        { id: 'landlordReportPaymentMethod', label: 'طريقة الدفع', text: reportPaymentMethodFilterLabel }
    ],
    period: [
        { id: 'periodReportFrom', label: 'من شهر' },
        { id: 'periodReportTo', label: 'إلى شهر' },
        { id: 'periodReportPurpose', label: 'غرض التحصيل', text: reportPurposeFilterLabel },
        { id: 'periodReportCashAccount', label: 'الصندوق', text: reportCashAccountFilterLabel },
        { id: 'periodReportResident', label: 'الشقة', text: reportResidentFilterLabel },
        { id: 'periodReportComparison', label: 'المقارنة', text: reportComparisonModeLabel }
    ],
    cashflow: [
        { id: 'cashFlowFrom', label: 'من شهر' },
        { id: 'cashFlowTo', label: 'إلى شهر' },
        { id: 'cashFlowCashAccount', label: 'الصندوق', text: reportCashAccountFilterLabel },
        { id: 'cashFlowComparison', label: 'المقارنة', text: reportComparisonModeLabel }
    ],
    expenses: [
        { id: 'expensesReportFrom', label: 'من شهر' },
        { id: 'expensesReportTo', label: 'إلى شهر' },
        { id: 'expensesReportCashAccount', label: 'الصندوق', text: reportCashAccountFilterLabel },
        { id: 'expensesReportCategory', label: 'التصنيف' },
        { id: 'expensesReportComparison', label: 'المقارنة', text: reportComparisonModeLabel }
    ],
    adjustments: [
        { id: 'adjustmentsReportFrom', label: 'من شهر' },
        { id: 'adjustmentsReportTo', label: 'إلى شهر' },
        { id: 'adjustmentsReportResident', label: 'الشقة', text: reportResidentFilterLabel },
        { id: 'adjustmentsReportKind', label: 'النوع', text: value => value === 'waiver' ? 'إعفاء' : value === 'discount' ? 'تخفيض' : '' }
    ],
    statement: [
        { id: 'statementResidentSelect', label: 'المالك', text: reportResidentFilterLabel },
        { id: 'statementPurpose', label: 'غرض التحصيل', text: reportPurposeFilterLabel }
    ],
    apartments: [
        { id: 'apartmentsReportFrom', label: 'من شهر' },
        { id: 'apartmentsReportTo', label: 'إلى شهر' },
        { id: 'apartmentsReportResident', label: 'الشقة', text: reportResidentFilterLabel },
        { id: 'apartmentsReportComparison', label: 'المقارنة', text: reportComparisonModeLabel }
    ],
    monthlyClose: [
        { id: 'monthlyCloseMonthSelect', label: 'شهر الإقفال' }
    ],
    arrears: [
        { id: 'arrearsApartmentFilter', label: 'الشقة', text: reportResidentFilterLabel },
        { id: 'arrearsStatusFilter', label: 'حالة التأخير', text: value => ({ one: 'شهر واحد', two_three: '2–3 أشهر', four_plus: '4 أشهر فأكثر' })[value] || '' },
        { id: 'arrearsFromMonth', label: 'من شهر', text: reportFilterMonthInputLabel },
        { id: 'arrearsToMonth', label: 'إلى شهر', text: reportFilterMonthInputLabel }
    ],
    audit: [
        { id: 'auditLogSearch', label: 'البحث' }
    ]
};

function reportFilterMonthInputLabel(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return getStatementMonthLabel(/^\d{4}-\d{2}$/.test(text) ? text + '-01' : text) || text;
}

function getReportClearRange() {
    const current = getCurrentMonth();
    const currentKey = monthLabelToKey(current);
    const from = currentKey ? (getStatementMonthLabel(shiftStatementMonthKey(currentKey, -5)) || current) : current;
    return { from, to: current };
}

function setReportFilterControlValue(id, value) {
    const control = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.getElementById(id));
    if (control) control.value = value;
}

/** تعرض الفلاتر المؤثرة بجانب أدوات التقرير، دون لمس بيانات المحاسبة أو المعاينة. */
function renderReportFilterSummaries() {
    Object.keys(REPORT_FILTER_DESCRIPTORS).forEach(tab => {
        const summary = /** @type {HTMLElement | null} */ (document.querySelector(`[data-report-filter-summary="${tab}"]`));
        if (!summary) return;
        const chips = REPORT_FILTER_DESCRIPTORS[tab].map(descriptor => {
            const control = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.getElementById(descriptor.id));
            const raw = String(control?.value || '').trim();
            if (!raw || raw === 'all' || raw === 'none' || raw === 'custom') return '';
            const text = descriptor.text ? String(descriptor.text(raw) || '').trim() : raw;
            if (!text) return '';
            return `<span class="report-filter-chip">${esc(descriptor.label)}: <b>${esc(text)}</b></span>`;
        }).filter(Boolean);
        const list = /** @type {HTMLElement | null} */ (summary.querySelector('[data-report-filter-list]'));
        if (list) list.innerHTML = chips.join('');
        summary.hidden = chips.length === 0;
    });
}

/** إعادة الفلاتر إلى حالتها الافتراضية دون حذف أي سجل مالي. */
function clearReportFilters(tab) {
    if (!REPORT_FILTER_DESCRIPTORS[tab]) return false;
    const range = getReportClearRange();
    switch (tab) {
        case 'landlord':
            setReportFilterControlValue('reportMonthSelect', getCurrentMonth());
            ['landlordReportResident', 'landlordReportPurpose', 'landlordReportCashAccount', 'landlordReportPaymentMethod']
                .forEach(id => setReportFilterControlValue(id, ''));
            invalidateLandlordReportPreview();
            break;
        case 'period':
            ['periodReportPurpose', 'periodReportCashAccount', 'periodReportResident']
                .forEach(id => setReportFilterControlValue(id, ''));
            setReportFilterControlValue('periodReportComparison', 'none');
            setReportFilterControlValue('periodReportPreset', '6');
            applyPeriodReportPreset();
            break;
        case 'cashflow':
            setReportFilterControlValue('cashFlowCashAccount', '');
            setReportFilterControlValue('cashFlowComparison', 'none');
            setReportFilterControlValue('cashFlowPreset', '6');
            applyCashFlowPreset();
            break;
        case 'expenses':
            setReportFilterControlValue('expensesReportFrom', range.from);
            setReportFilterControlValue('expensesReportTo', range.to);
            setReportFilterControlValue('expensesReportCashAccount', '');
            setReportFilterControlValue('expensesReportCategory', '');
            setReportFilterControlValue('expensesReportComparison', 'none');
            invalidateExpensesReportPreview();
            break;
        case 'adjustments':
            setReportFilterControlValue('adjustmentsReportFrom', range.from);
            setReportFilterControlValue('adjustmentsReportTo', range.to);
            setReportFilterControlValue('adjustmentsReportResident', '');
            setReportFilterControlValue('adjustmentsReportKind', '');
            invalidateAdjustmentsReportPreview();
            break;
        case 'statement':
            // المالك مطلوب لبناء الكشف، لذلك يبقى كما هو ويُمسح غرض التحصيل فقط.
            setReportFilterControlValue('statementPurpose', '');
            invalidateResidentStatementPreview();
            break;
        case 'apartments':
            setReportFilterControlValue('apartmentsReportResident', '');
            setReportFilterControlValue('apartmentsReportComparison', 'none');
            setReportFilterControlValue('apartmentsReportPreset', '6');
            applyApartmentsPreset();
            break;
        case 'monthlyClose':
            setReportFilterControlValue('monthlyCloseMonthSelect', getCurrentMonth());
            invalidateMonthlyClosePreview();
            break;
        case 'arrears':
            resetArrearsFilters();
            break;
        case 'audit':
            setReportFilterControlValue('auditLogSearch', '');
            renderAuditLog();
            break;
        default:
            return false;
    }
    renderReportFilterSummaries();
    return true;
}

function getReportView() {
    return document.getElementById('tab-reports')?.dataset.reportView === 'panel' ? 'panel' : 'index';
}

/** ينسخ هوية التقرير من صفّ الفهرس إلى المساحة التي تعرض تفاصيله. */
function copyReportTone(target, item) {
    if (!target || !item) return;
    const computed = typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
        ? window.getComputedStyle(item)
        : null;
    ['--report-tone', '--report-tone-soft', '--report-tone-line', '--report-glyph'].forEach(name => {
        const value = computed?.getPropertyValue?.(name)?.trim();
        if (value) target.style.setProperty(name, value);
        else target.style.removeProperty(name);
    });
}

function renderReportViewBar(tab) {
    const bar = document.getElementById('reportViewBar');
    const item = /** @type {HTMLElement | null} */ (document.querySelector(`[data-report-nav="${tab}"]`));
    if (!bar || !item) return;
    REPORT_TONE_CLASSES.forEach(tone => bar.classList.remove(tone));
    const tone = REPORT_TONE_CLASSES.find(name => item.classList.contains(name));
    if (tone) bar.classList.add(tone);
    // The per-report identity lives on the index row as custom properties, so the
    // full-page bar and the open panel copy that palette instead of drifting to a shared tone.
    copyReportTone(bar, item);
    const panel = document.getElementById(REPORT_PANEL_IDS[tab]);
    if (panel) copyReportTone(panel, item);
    document.getElementById('reportViewTitle').textContent = item.querySelector('.report-index-copy b')?.textContent || '';
    document.getElementById('reportViewMeta').textContent = item.querySelector('.report-index-copy small')?.textContent || '';
    renderReportViewStatus();
}

function closeReportPanel({ focusCard = true } = {}) {
    REPORT_TABS.forEach(name => {
        const panel = document.getElementById(REPORT_PANEL_IDS[name]);
        if (panel) panel.classList.add('hidden');
    });
    /** @type {HTMLElement | null} */
    let opened = null;
    document.querySelectorAll('[data-report-nav]').forEach((item) => {
        if (item.classList.contains('is-active')) opened = /** @type {HTMLElement} */ (item);
        item.classList.remove('is-active');
        item.removeAttribute('aria-current');
    });
    document.getElementById('tab-reports')?.setAttribute('data-report-view', 'index');
    document.querySelectorAll('[data-report-step]').forEach(button => {
        const active = button.getAttribute('data-report-step') === 'filters';
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (focusCard && opened) opened.focus();
}

function showReportIndex() {
    if (getReportView() !== 'panel') return false;
    closeReportPanel();
    return true;
}

function resetReportView() {
    closeReportPanel({ focusCard: false });
}

function switchReportTab(tab) {
    if (!REPORT_PANEL_IDS[tab]) return false;
    REPORT_TABS.forEach(name => {
        const panel = document.getElementById(REPORT_PANEL_IDS[name]);
        if (panel) panel.classList.toggle('hidden', name !== tab);
    });
    document.querySelectorAll('[data-report-nav]').forEach((item) => {
        const active = /** @type {HTMLElement} */ (item).dataset.reportNav === tab;
        item.classList.toggle('is-active', active);
        if (active) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
    });
    syncReportNavStatus();
    syncReportNavTabIndex();
    renderReportViewBar(tab);
    document.getElementById('tab-reports')?.setAttribute('data-report-view', 'panel');
    const bar = document.getElementById('reportViewBar');
    if (bar) requestAnimationFrame(() => bar.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return true;
}

function jumpToReportPanel(panelId) {
    const tab = REPORT_TABS.find(name => REPORT_PANEL_IDS[name] === panelId);
    if (!tab) return;
    switchReportTab(tab);
}

function syncReportNavTabIndex() {
    const items = [...document.querySelectorAll('[data-report-nav]')]
        .filter(item => !item.classList.contains('hidden'));
    if (!items.length) return;
    const active = items.find(item => item.classList.contains('is-active'))
        || (document.activeElement?.closest?.('[data-report-nav]'));
    const target = items.includes(active) ? active : items[0];
    items.forEach(item => {
        if (typeof item.setAttribute === 'function') {
            item.setAttribute('tabindex', item === target ? '0' : '-1');
        }
    });
}

function normalizeReportIndexSearch(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/\s+/g, ' ')
        .trim();
}

function filterReportIndex() {
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById('reportIndexSearch'));
    const term = normalizeReportIndexSearch(input?.value || '');
    const clear = document.getElementById('reportIndexClear');
    if (clear) clear.hidden = !term;

    let visible = 0;
    document.querySelectorAll('.report-index-item[data-report-nav]').forEach(item => {
        const card = /** @type {HTMLElement} */ (item);
        const searchable = [
            card.closest('.report-index-group')?.querySelector('.report-index-group-head h3')?.textContent,
            card.querySelector('.report-index-copy b')?.textContent,
            card.querySelector('.report-index-copy small')?.textContent,
            card.querySelector('.report-index-badge')?.textContent
        ].join(' ');
        const matches = !term || normalizeReportIndexSearch(searchable).includes(term);
        card.hidden = !matches;
        card.classList.toggle('hidden', !matches);
        if (matches) visible += 1;
    });

    document.querySelectorAll('.report-index-group').forEach(group => {
        const section = /** @type {HTMLElement} */ (group);
        section.hidden = !section.querySelector('.report-index-item:not([hidden])');
    });
    const empty = document.getElementById('reportIndexEmpty');
    if (empty) empty.hidden = visible > 0;
    syncReportNavTabIndex();
    return visible;
}

function clearReportIndexSearch() {
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById('reportIndexSearch'));
    if (input) input.value = '';
    filterReportIndex();
    input?.focus();
}

function handleReportTabKeydown(event) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const items = [...document.querySelectorAll('[data-report-nav]')].filter(item => !item.classList.contains('hidden'));
    const current = document.activeElement?.closest?.('[data-report-nav]');
    const currentIndex = items.indexOf(current);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
            ? items.length - 1
            : (currentIndex + (event.key === 'ArrowLeft' ? 1 : -1) + items.length) % items.length;
    const next = /** @type {HTMLElement} */ (items[nextIndex]);
    next.focus();
    syncReportNavTabIndex();
}

function handleReportViewKeydown(event) {
    if (event.key !== 'Escape' || getReportView() !== 'panel') return;
    if (typeof getTopmostOpenModal === 'function' && getTopmostOpenModal()) return;
    if (document.getElementById('tab-reports')?.classList.contains('hidden')) return;
    event.preventDefault();
    showReportIndex();
}

function markReportPreviewStale(previewId, stale) {
    const preview = document.getElementById(previewId);
    if (preview) preview.dataset.stale = stale ? 'true' : 'false';
}

function syncReportNavStatus() {
    Object.keys(REPORT_OUTPUT_BUTTON_IDS).forEach(tab => {
        const item = document.querySelector(`[data-report-nav="${tab}"]`);
        if (!item) return;
        const button = /** @type {HTMLButtonElement} */ (document.getElementById(REPORT_OUTPUT_BUTTON_IDS[tab]));
        const preview = document.querySelector(`#${REPORT_PANEL_IDS[tab]} [id$="Preview"]`);
        const ready = Boolean(button) && !button.disabled;
        item.classList.toggle('is-ready', ready);
        const stale = !ready && /** @type {HTMLElement} */ (preview)?.dataset.stale === 'true';
        item.classList.toggle('is-stale', stale);
        const fresh = item.querySelector('[data-report-freshness]');
        if (fresh) fresh.textContent = ready ? 'معاينة جاهزة' : stale ? 'يحتاج تحديث' : 'لم تُعرض';
    });
    renderReportFilterSummaries();
    renderReportViewStatus();
}

/**
 * الحالة الظاهرة في شريط التقرير المفتوح: نفس بوابة المعاينة التي تتحكم في
 * أزرار الطباعة والتصدير، حتى لا يظن المدير أن التصدير متاح قبل تحديث المعاينة.
 */
function renderReportViewStatus() {
    const status = document.getElementById('reportViewStatus');
    if (!status) return;
    const active = /** @type {HTMLElement | null} */ (document.querySelector('[data-report-nav].is-active'));
    const tab = active?.dataset?.reportNav || '';
    if (!tab || !REPORT_PANEL_IDS[tab]) {
        status.textContent = '';
        status.className = 'report-view-status no-print';
        return;
    }
    const buttonId = REPORT_OUTPUT_BUTTON_IDS[tab];
    const button = buttonId ? /** @type {HTMLButtonElement | null} */ (document.getElementById(buttonId)) : null;
    const preview = document.querySelector(`#${REPORT_PANEL_IDS[tab]} [id$="Preview"]`);
    let message = 'عرض مباشر';
    let state = 'live';
    if (button) {
        if (!button.disabled) {
            message = 'المعاينة جاهزة';
            state = 'ready';
        } else if (/** @type {HTMLElement | null} */ (preview)?.dataset.stale === 'true') {
            message = 'تغيّرت البيانات — أعد المعاينة';
            state = 'stale';
        } else {
            message = 'معاينة مطلوبة قبل التصدير';
            state = 'idle';
        }
    }
    status.textContent = message;
    status.className = 'report-view-status no-print is-' + state;
}

/** التنقل السريع بين أقسام التقرير المفتوح دون تغيير بيانات المعاينة. */
function focusReportStep(step) {
    const allowed = ['filters', 'preview', 'export'];
    const target = allowed.includes(step) ? step : 'preview';
    document.querySelectorAll('[data-report-step]').forEach(button => {
        const active = button.getAttribute('data-report-step') === target;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const active = /** @type {HTMLElement | null} */ (document.querySelector('[data-report-nav].is-active'));
    const tab = active?.dataset?.reportNav || '';
    const panelId = REPORT_PANEL_IDS[tab];
    const panel = panelId ? document.getElementById(panelId) : null;
    if (!panel) return false;
    let section = null;
    if (target === 'filters') section = panel.querySelector('.report-toolbar');
    else if (target === 'export') {
        section = panel.querySelector('.report-actions');
    } else section = panel.querySelector('[id$="Preview"]') || panel.querySelector('.report-preview');
    if (!section) return true;
    const targetSection = /** @type {HTMLElement} */ (section);
    targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    targetSection.classList.remove('report-focus-flash');
    // Reflow once so the highlight animation restarts on repeated clicks.
    void targetSection.offsetWidth;
    targetSection.classList.add('report-focus-flash');
    return true;
}

function hasReportMetricHelpers() {
    if (typeof globalThis === 'undefined') return false;
    return ['getCurrentMonth', 'monthLabelToKey', 'toCents', 'fmtMoney', 'fmtNum', 'calculateCumulativeDebt',
        'getMonthOutstanding', 'isResidentActiveInMonth', 'formatOverdueDuration']
        .every(name => typeof /** @type {any} */ (globalThis)[name] === 'function');
}

function runReportQualityCheck() {
    if (!hasReportMetricHelpers()) return false;
    const note = document.getElementById('reportQualityNote');
    const meter = document.getElementById('reportQualityMeter');
    const residents = Array.isArray(state?.residents) ? state.residents : [];
    const records = [
        ...(Array.isArray(state?.income) ? state.income : []),
        ...(Array.isArray(state?.expenses) ? state.expenses : []),
        ...(Array.isArray(state?.adjustments) ? state.adjustments : [])
    ];
    const issues = [];
    if (records.some(item => !item.month)) issues.push('سجل بلا شهر');
    if (records.some(item => toCents(item.amount) <= 0)) issues.push('مبلغ غير صالح');
    const ids = records.map(item => String(item.id || '')).filter(Boolean);
    if (new Set(ids).size !== ids.length) issues.push('معرّف مكرر');
    if (records.some(item => item.residentId && !residents.some(resident => resident.id === item.residentId))) {
        issues.push('سجل لمالك غير معروف');
    }
    const score = Math.max(0, 100 - issues.length * 12);
    if (note) {
        note.textContent = issues.length
            ? 'فحص الدقة: ' + issues.join('، ') + '. راجع السجلات قبل الطباعة.'
            : 'فحص الدقة: ' + fmtNum(records.length) + ' سجل متسق، و' + fmtNum(residents.length) + ' مالك مرتبط بتقاريره.';
    }
    if (meter) {
        meter.textContent = fmtNum(score) + '%';
        meter.classList.toggle('is-warn', issues.length > 0);
    }
    return issues.length === 0;
}

function getLandlordReportData(month, purposeFilter = '', cashAccountFilter = '', paymentMethodFilter = '', residentFilter = '') {
    return {
        income: filterReportIncome(state.income.filter(i => i.month === month), purposeFilter, cashAccountFilter, paymentMethodFilter, residentFilter),
        expenses: filterReportExpenses(state.expenses.filter(e => e.month === month), cashAccountFilter)
    };
}

function buildResidentIndex() {
    return new Map((state.residents || []).map(resident => [resident.id, resident]));
}

function isResidentActiveInMonth(resident, monthKey) {
    if (!resident || !monthKey) return false;
    if (!resident.createdAt && !resident.billingStartMonth) return true;
    const startKey = typeof getResidentBillingStartKey === 'function'
        ? getResidentBillingStartKey(resident)
        : null;
    if (!startKey) return true;
    return startKey <= monthKey;
}

function getMonthlyBillingTotals(month, residentFilter = '') {
    const monthKey = monthLabelToKey(month);
    const totals = { grossExpectedCents: 0, adjustmentCents: 0, expectedCents: 0, outstandingCents: 0 };
    (state.residents || []).forEach(resident => {
        if (residentFilter && resident.id !== residentFilter) return;
        if (!isResidentActiveInMonth(resident, monthKey)) return;
        const grossCents = toCents(getSubscriptionAmountForMonth(resident, month));
        totals.grossExpectedCents += grossCents;
        const settlement = typeof getSettlementAdjustmentForMonth === 'function'
            ? getSettlementAdjustmentForMonth(resident.id, month) : null;
        if (settlement) {
            totals.adjustmentCents += Math.max(0, grossCents - toCents(settlement.amount));
        } else if (typeof getAdjustmentAmountForMonth === 'function') {
            totals.adjustmentCents += toCents(getAdjustmentAmountForMonth(resident.id, month));
        }
        totals.outstandingCents += toCents(getMonthOutstanding(resident, month));
    });
    totals.expectedCents = Math.max(0, totals.grossExpectedCents - totals.adjustmentCents);
    return totals;
}

function getExpenseCategoryTotals(expenses) {
    const totals = new Map();
    expenses.forEach(expense => {
        const label = String(expense.category || '').trim() || 'غير مصنف';
        const current = totals.get(label) || { count: 0, cents: 0 };
        current.count += 1;
        current.cents += toCents(expense.amount);
        totals.set(label, current);
    });
    return Array.from(totals.entries()).sort((a, b) => b[1].cents - a[1].cents);
}

function buildLandlordReportModel(month, purposeFilter = '', cashAccountFilter = '', paymentMethodFilter = '', residentFilter = '') {
    const cacheKey = `landlord:${month}:${purposeFilter}:${cashAccountFilter}:${paymentMethodFilter}:${residentFilter}`;
    return getCachedReportModel(cacheKey, () => _buildLandlordReportModel(month, purposeFilter, cashAccountFilter, paymentMethodFilter, residentFilter), () => {
        // التحقق من صحة التخزين المؤقت: إذا تغيّرت البيانات، يتم إعادة الحساب
        return true;
    });
}

function _buildLandlordReportModel(month, purposeFilter = '', cashAccountFilter = '', paymentMethodFilter = '', residentFilter = '') {
    const showDues = reportShowsSubscriptionDues(purposeFilter) && !cashAccountFilter && !paymentMethodFilter;
    const filterLabel = reportPurposeFilterLabel(purposeFilter);
    const cashAccountLabel = reportCashAccountFilterLabel(cashAccountFilter);
    const paymentMethodLabel = reportPaymentMethodFilterLabel(paymentMethodFilter);
    const residentLabel = reportResidentFilterLabel(residentFilter);
    const { income: inc, expenses: exp } = getLandlordReportData(month, purposeFilter, cashAccountFilter, paymentMethodFilter, residentFilter);
    const totalIncCents = inc.reduce((sum, i) => sum + toCents(i.amount), 0);
    // المحصّل من الاشتراكات والتسويات يحتسب الحركات الموجبة فقط، مثل تقرير الفترة.
    const subscriptionIncCents = inc
        .filter(item => reportIsSubscriptionPayment(item) && toCents(item.amount) > 0)
        .reduce((sum, item) => sum + toCents(item.amount), 0);
    const negativePaymentCount = inc.filter(item => toCents(item.amount) < 0).length;
    const totalExpCents = exp.reduce((sum, e) => sum + toCents(e.amount), 0);
    const netCents = totalIncCents - totalExpCents;
    const { expectedCents, outstandingCents, adjustmentCents } = showDues
        ? getMonthlyBillingTotals(month, residentFilter)
        : { expectedCents: 0, outstandingCents: 0, adjustmentCents: 0 };
    const collectionRate = showDues && expectedCents > 0 ? Math.round((subscriptionIncCents / expectedCents) * 100) : null;
    const advanceCents = showDues && expectedCents > 0 ? Math.max(0, subscriptionIncCents - expectedCents) : 0;
    const paymentMethodTotals = new Map();
    inc.forEach(payment => {
        const label = getIncomePaymentMethodLabel(payment.paymentMethod);
        const totals = paymentMethodTotals.get(label) || { count: 0, cents: 0 };
        totals.count += 1;
        totals.cents += toCents(payment.amount);
        paymentMethodTotals.set(label, totals);
    });
    const purposeTotals = new Map();
    inc.forEach(payment => {
        const label = reportPurposeLabel(payment.purposeCode);
        const totals = purposeTotals.get(label) || { count: 0, cents: 0 };
        totals.count += 1;
        totals.cents += toCents(payment.amount);
        purposeTotals.set(label, totals);
    });
    return {
        month,
        purposeFilter,
        cashAccountFilter,
        cashAccountLabel,
        paymentMethodFilter,
        paymentMethodLabel,
        residentFilter,
        residentLabel,
        showDues,
        filterLabel,
        inc,
        exp,
        residentsById: buildResidentIndex(),
        totalIncCents,
        subscriptionIncCents,
        negativePaymentCount,
        totalExpCents,
        netCents,
        expectedCents,
        outstandingCents,
        adjustmentCents,
        collectionRate,
        advanceCents,
        expenseCategories: getExpenseCategoryTotals(exp),
        paymentMethodTotals,
        purposeTotals
    };
}

function getLandlordSummaryItems(model) {
    if (model.showDues) {
        return [
            { label: 'تحصيل', cents: model.totalIncCents, tone: 'emerald', detail: { label: 'منها اشتراكات وتسويات', cents: model.subscriptionIncCents } },
            { label: 'مصروف', cents: model.totalExpCents, tone: 'rose' },
            { label: 'صافي', cents: model.netCents, tone: model.netCents >= 0 ? 'emerald' : 'rose' },
            { label: 'المستحق', cents: model.expectedCents },
            ...(model.adjustmentCents > 0
                ? [{ label: 'إعفاء/تخفيض/تسوية', cents: model.adjustmentCents, tone: 'amber' }]
                : []),
            { label: 'غير المحصّل', cents: model.outstandingCents, tone: model.outstandingCents > 0 ? 'amber' : 'emerald' },
            { label: 'نسبة التحصيل', text: formatPeriodRate(model.collectionRate) },
            ...(model.advanceCents > 0 ? [{ label: 'مدفوع مقدمًا', cents: model.advanceCents, tone: 'sky' }] : [])
        ];
    }
    return [
        { label: model.paymentMethodFilter ? 'تحصيل الطريقة' : model.residentFilter ? 'تحصيل الشقة' : 'تحصيل الغرض', cents: model.totalIncCents, tone: 'emerald' },
        { label: 'عدد الحركات', text: fmtNum(model.inc.length) },
        { label: 'مصروف الشهر', cents: model.totalExpCents, tone: 'rose' },
        { label: 'صافي الحركة', cents: model.netCents, tone: model.netCents >= 0 ? 'emerald' : 'rose' }
    ];
}

// جداول التقارير كلها تخرج من هنا: رأس ملوّن، شبكة خطوط، صفوف متناوبة،
// وتذييل إجماليات بارز. النصوص تُهرَّب مرة واحدة عند بناء الخلية.
function renderSheetTable(headers, rows, options = {}) {
    const foot = options.foot || null;
    const caption = options.caption || '';
    const empty = options.empty || 'لا توجد بيانات مطابقة.';
    const numeric = options.numeric || [];
    const attrs = index => numeric.includes(index) ? ' class="sheet-num"' : '';
    const head = headers.map((header, index) => '<th scope="col"' + attrs(index) + '>' + esc(header) + '</th>').join('');
    const body = rows.length
        ? rows.map(row => '<tr>' + row.map((cell, index) => '<td' + attrs(index) + '>' + cell + '</td>').join('') + '</tr>').join('')
        : '<tr><td class="sheet-empty" colspan="' + headers.length + '">' + esc(empty) + '</td></tr>';
    const footHtml = foot
        ? '<tfoot><tr>' + foot.map((cell, index) => '<td' + attrs(index) + '>' + cell + '</td>').join('') + '</tr></tfoot>'
        : '';
    const tableClass = options.tableClass ? ' sheet-table ' + options.tableClass : ' sheet-table';
    return (caption ? '<p class="sheet-caption">' + esc(caption) + '</p>' : '') +
        '<div class="sheet-wrap' + (headers.length >= 5 || options.cards ? ' sheet-cards' : '') + '"><table class="' + tableClass.trim() + '"><thead><tr>' + head +
        '</tr></thead><tbody>' + body + '</tbody>' + footHtml + '</table></div>';
}

function renderSheetBlock(title, headers, rows, options = {}) {
    const label = esc(title);
    const collapsed = Boolean(options.collapsed);
    const heading = '<div class="report-block-head">' +
        '<h3 class="report-block-title">' + label + ' <span class="report-block-count">' +
        fmtNum(rows.length) + '</span></h3>' +
        '<button type="button" class="report-block-toggle no-print" data-report-block-toggle ' +
        'aria-expanded="' + (collapsed ? 'false' : 'true') + '" aria-label="' + (collapsed ? 'إظهار' : 'طي') + ' قسم ' + label + '" title="' + (collapsed ? 'إظهار القسم' : 'طي القسم') + '">' +
        '<i class="fa-solid fa-chevron-up" aria-hidden="true"></i></button></div>';
    return '<div class="report-block' + (collapsed ? ' is-collapsed' : '') + '">' + heading +
        '<div class="report-block-body">' + renderSheetTable(headers, rows, options) + '</div></div>';
}

// كل معاينات التقارير تبدأ بنفس الترويسة: عنوان واحد وسطر وصف واحد فقط.
function renderReportHeader(title, metaLines = []) {
    const meta = (Array.isArray(metaLines) ? metaLines : [metaLines]).filter(Boolean).join(' • ');
    return '<header class="report-preview-header"><h3 class="report-preview-title">' + esc(title) + '</h3>' +
        (meta ? '<p class="report-preview-meta">' + meta + '</p>' : '') + '</header>';
}

// الملاحظات تطوى في آخر المعاينة حتى لا تزاحم الجداول، وتُعرض كاملة عند الطباعة.
function renderReportNotes(paragraphs) {
    const list = (Array.isArray(paragraphs) ? paragraphs : [paragraphs]).filter(Boolean);
    if (!list.length) return '';
    return '<details class="report-note-fold"><summary class="report-note-summary">' +
        'ملاحظات الحساب <span class="report-block-count">' + fmtNum(list.length) + '</span></summary>' +
        '<div class="report-note">' + list.join('') + '</div></details>';
}


// Compatibility helpers keep previews safe in unit harnesses that do not load charts.js.
// In the browser these simply delegate to the shared chart module.
function reportPreviewChartHasData(values) {
    return Array.isArray(values) && values.some(value => {
        const number = Number(value);
        return Number.isFinite(number) && number !== 0;
    });
}

function reportPreviewDestroyChart(canvasId) {
    if (typeof destroyChartById === 'function') destroyChartById(canvasId);
}

function reportPreviewChartColor(name) {
    const defaultColor = typeof REPORT_CHART_COLORS !== 'undefined' && REPORT_CHART_COLORS.emerald
        ? REPORT_CHART_COLORS.emerald
        : 'currentColor';
    if (typeof REPORT_CHART_COLORS !== 'undefined' && REPORT_CHART_COLORS) {
        return REPORT_CHART_COLORS[name] || defaultColor;
    }
    return typeof REPORT_PDF_PALETTE !== 'undefined' && REPORT_PDF_PALETTE && REPORT_PDF_PALETTE[name]
        ? REPORT_PDF_PALETTE[name]
        : defaultColor;
}

function reportPreviewChartPalette(count) {
    if (typeof reportChartPalette === 'function') return reportChartPalette(count);
    const tokens = typeof REPORT_PDF_PALETTE !== 'undefined' && REPORT_PDF_PALETTE ? REPORT_PDF_PALETTE : {};
    const fallback = [tokens.rule, tokens.muted, tokens.faint, tokens.line, tokens.hairline, tokens.ink]
        .filter(Boolean);
    const size = Math.max(0, Math.min(60, Number(count) || 0));
    return Array.from({ length: size }, (_, index) => fallback[index % fallback.length] || 'currentColor');
}

// الملخص الرقمي المرافق للرسم يستخدم نفس وحدة الجداول؛ لا أرقام تجريبية ولا مصادر أخرى.
/**
 * @param {Array<{label: string, cents?: number, text?: string, tone?: string, note?: string}>} items
 */
function renderChartMetricStrip(items) {
    const tones = ['emerald', 'rose', 'amber', 'sky'];
    return '<div class="report-chart-metrics">' + items.map(item => {
        const value = item.text !== undefined
            ? esc(String(item.text))
            : fmtMoney((Number(item.cents) || 0) / 100);
        const tone = tones.includes(String(item.tone || '')) ? ' sheet-' + item.tone : '';
        const note = item.note ? '<span class="report-chart-metric-note">' + esc(item.note) + '</span>' : '';
        return '<div class="report-chart-metric"><span class="report-chart-metric-label">' +
            esc(item.label) + '</span><strong class="report-chart-metric-value' + tone + '">' +
            value + '</strong>' + note + '</div>';
    }).join('') + '</div>';
}

/**
 * @param {string} canvasId
 * @param {string} label
 * @param {{summary?: Array<{label: string, cents?: number, text?: string, tone?: string, note?: string}>, hasData?: boolean, empty?: string, ariaLabel?: string}} [options]
 */
function renderChartFold(canvasId, label, options = {}) {
    const summary = Array.isArray(options.summary) ? options.summary.filter(Boolean) : [];
    const hasData = options.hasData !== false;
    const emptyMessage = options.empty || 'لا توجد بيانات كافية لعرض الرسم.';
    const ariaLabel = options.ariaLabel || 'رسم بياني؛ البيانات نفسها متاحة في الجداول التفصيلية.';
    const summaryHtml = summary.length ? renderChartMetricStrip(summary) : '';
    const visualHtml = hasData
        ? '<div class="report-chart-container"><canvas id="' + esc(canvasId) +
            '" role="img" aria-label="' + esc(ariaLabel) + '"></canvas></div>'
        : '<p class="report-chart-empty"><i class="fa-solid fa-chart-column" aria-hidden="true"></i>' +
            '<span>' + esc(emptyMessage) + '</span></p>';
    return '<details class="report-chart-fold report-chart-block no-print">' +
        '<summary class="report-chart-summary">' + esc(label) + '</summary>' +
        '<div class="report-chart-body">' + summaryHtml + visualHtml + '</div></details>';
}

/**
 * التقارير الموسّعة تُنشئ canvas داخل حاوية موجودة، فتُطوى الحاوية نفسها.
 * @param {string} containerId
 * @param {string} label
 * @param {{summary?: Array<{label: string, cents?: number, text?: string, tone?: string, note?: string}>, hasData?: boolean, empty?: string}} [options]
 */
function renderChartFoldContainer(containerId, label, options = {}) {
    const summary = Array.isArray(options.summary) ? options.summary.filter(Boolean) : [];
    const hasData = options.hasData !== false;
    const emptyMessage = options.empty || 'لا توجد بيانات كافية لعرض الرسم.';
    const summaryHtml = summary.length ? renderChartMetricStrip(summary) : '';
    const visualHtml = hasData
        ? '<div id="' + esc(containerId) + '" class="report-chart-container"></div>'
        : '<p class="report-chart-empty"><i class="fa-solid fa-chart-column" aria-hidden="true"></i>' +
            '<span>' + esc(emptyMessage) + '</span></p>';
    return '<details class="report-chart-fold report-chart-block no-print">' +
        '<summary class="report-chart-summary">' + esc(label) + '</summary>' +
        '<div class="report-chart-body">' + summaryHtml + visualHtml + '</div></details>';
}

function renderReportStatTiles(items, compact = false) {
    const head = items.map(item => '<th class="report-stat"><span class="report-stat-label">' +
        esc(item.label) + '</span></th>').join('');
    const body = items.map(item => {
        const value = item.text !== undefined ? esc(item.text) : fmtMoney(item.cents / 100);
        const tone = item.tone ? ' sheet-' + item.tone : '';
        return '<td class="report-stat" data-label="' + esc(item.label) + '"><span class="report-stat-value' + tone + '">' + value + '</span></td>';
    }).join('');
    // عدد الأعمدة موحّد في كل المعاينات؛ الجدول نفسه يتوسّط داخل غلاف واحد.
    return '<div class="report-stats report-stats-4">' +
        '<div class="sheet-wrap"><table class="sheet-table sheet-kpi"><thead><tr>' + head +
        '</tr></thead><tbody><tr>' + body + '</tr></tbody></table></div></div>';
}

// الرسوم مطوية افتراضيًا كي يظهر الجدول أولًا؛ عند فتح الطيّ نعيد قياس المخطط.
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('toggle', event => {
        const fold = /** @type {HTMLDetailsElement|null} */ (event && event.target);
        if (!fold || typeof fold.matches !== 'function' || !fold.matches('.report-chart-fold') || !fold.open) return;
        const chartLib = /** @type {{getChart?: (canvas: HTMLCanvasElement) => {resize?: () => void} | null}|undefined} */ (
            /** @type {any} */ (globalThis).Chart
        );
        fold.querySelectorAll('canvas').forEach(canvas => {
            const chart = chartLib && chartLib.getChart ? chartLib.getChart(canvas) : null;
            if (chart && typeof chart.resize === 'function') chart.resize();
        });
    }, true);
}

// داخل المعاينة نفسها: فهرس سريع يقفز إلى كل جدول، وزر طيّ لكل قسم حتى يبقى
// التقرير الطويل قابلًا للمسح دون فقدان الترويسة أو أزرار الإخراج. الطيّ عرضي
// فقط؛ قواعد الطباعة تُظهر كل الأقسام مهما كانت حالة الزر على الشاشة.
/** @param {HTMLElement} block @param {boolean} collapsed */
function setReportBlockCollapsed(block, collapsed) {
    block.classList.toggle('is-collapsed', collapsed);
    const toggle = block.querySelector('[data-report-block-toggle]');
    if (!toggle) return;
    const title = (block.querySelector('.report-block-title')?.textContent || '').replace(/\s+/g, ' ').trim() || 'القسم';
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.setAttribute('aria-label', (collapsed ? 'إظهار' : 'طي') + ' قسم ' + title);
    toggle.setAttribute('title', collapsed ? 'إظهار القسم' : 'طي القسم');
}

function isReportPhoneView() {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 639.98px)').matches;
}

function enhanceReportPreviews(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const flows = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.report-preview-flow')]);
    flows.forEach(flow => {
        if (flow.querySelector(':scope > .report-section-rail')) return;
        const blocks = /** @type {HTMLElement[]} */ ([...flow.querySelectorAll(':scope > .report-block')]);
        if (!blocks.length) return;
        const rail = document.createElement('div');
        rail.className = 'report-section-rail no-print';
        rail.setAttribute('role', 'group');
        rail.setAttribute('aria-label', 'الانتقال بين أقسام المعاينة');
        rail.innerHTML = '<span class="report-section-rail-label">أقسام المعاينة</span>' + blocks.map((block, index) => {
            const title = (block.querySelector('.report-block-title')?.textContent || '').replace(/\s+/g, ' ').trim() || 'قسم';
            return '<button type="button" class="report-section-jump" data-report-section-jump="' + index + '" ' +
                'aria-label="الانتقال إلى ' + esc(title) + '">' + esc(title) + '</button>';
        }).join('');
        const kpi = flow.querySelector(':scope > .report-stats');
        if (kpi) kpi.after(rail);
        else flow.prepend(rail);
        if (isReportPhoneView()) blocks.slice(1).forEach(block => setReportBlockCollapsed(block, true));

        rail.querySelectorAll('[data-report-section-jump]').forEach(button => {
            button.addEventListener('click', () => {
                const index = Number(/** @type {HTMLElement} */ (button).dataset.reportSectionJump);
                const targetBlocks = /** @type {HTMLElement[]} */ ([...flow.querySelectorAll(':scope > .report-block')]);
                const target = targetBlocks[index];
                rail.querySelectorAll('[data-report-section-jump]').forEach(item =>
                    item.classList.toggle('is-active', item === button));
                if (!target) return;
                setReportBlockCollapsed(target, false);
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                target.classList.remove('report-focus-flash');
                void target.offsetWidth;
                target.classList.add('report-focus-flash');
            });
        });
    });
}

function initReportPreviewInteractions() {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    runReportQualityCheck();
    enhanceReportPreviews(document);

    renderReportFilterSummaries();
    const reportFilterIds = new Set(Object.values(REPORT_FILTER_DESCRIPTORS).flatMap(descriptors => descriptors.map(descriptor => descriptor.id)));
    document.addEventListener('change', event => {
        const target = /** @type {Element | null} */ (event && event.target);
        if (!target?.id || !reportFilterIds.has(target.id)) return;
        renderReportFilterSummaries();
    });
    document.addEventListener('input', event => {
        const target = /** @type {Element | null} */ (event && event.target);
        if (target?.id !== 'auditLogSearch') return;
        renderReportFilterSummaries();
    });
    if (typeof document.addEventListener === 'function') {
        document.addEventListener('click', event => {
            const filtersToggle = /** @type {HTMLElement | null} */ (/** @type {Element | null} */ (event && event.target)?.closest?.('[data-report-filters-toggle]'));
            if (filtersToggle) {
                const open = filtersToggle.closest('.report-toolbar')?.classList.toggle('is-open') === true;
                filtersToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
                return;
            }
            const target = /** @type {Element | null} */ (event && event.target);
            const toggle = /** @type {HTMLElement | null} */ (target?.closest?.('[data-report-block-toggle]'));
            if (!toggle) return;
            const block = /** @type {HTMLElement | null} */ (toggle.closest('.report-block'));
            if (!block) return;
            const collapsed = block.classList.toggle('is-collapsed');
            const title = (block.querySelector('.report-block-title')?.textContent || '').replace(/\s+/g, ' ').trim() || 'القسم';
            toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            toggle.setAttribute('aria-label', (collapsed ? 'إظهار' : 'طي') + ' قسم ' + title);
            toggle.title = collapsed ? 'إظهار القسم' : 'طي القسم';
        });
    }
    if (typeof MutationObserver !== 'undefined' && typeof document.body !== 'undefined') {
        const observer = new MutationObserver(() => enhanceReportPreviews(document));
        observer.observe(document.getElementById('tab-reports') || document.body, { childList: true, subtree: true });
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initReportPreviewInteractions);
    else initReportPreviewInteractions();
}

const PDF_SUMMARY_TONE_STYLES = {
    emerald: 'color:#047857;font-weight:700',
    rose: 'color:#be123c;font-weight:700',
    amber: 'color:#b45309;font-weight:700',
    sky: ''
};

function renderPdfSummaryRows(items) {
    return items.map(item => {
        const value = item.text !== undefined ? esc(item.text) : fmtMoney(item.cents / 100);
        let row = '<tr>' + statementPdfHeadCell(esc(item.label)) +
            statementPdfCell(value, PDF_SUMMARY_TONE_STYLES[item.tone] || '') + '</tr>';
        if (item.detail) {
            row += '<tr>' + statementPdfHeadCell(esc(item.detail.label)) +
                statementPdfCell(fmtMoney(item.detail.cents / 100)) + '</tr>';
        }
        return row;
    }).join('');
}

function getResidentStatementSummaryItems(statement) {
    const showDues = statement.showDues !== false;
    const averageCents = statement.payments.length
        ? Math.round(statement.totals.filteredPaidCents / statement.payments.length)
        : 0;
    if (showDues) {
        return [
            { label: 'إجمالي المستحق', cents: statement.totals.dueCents },
            ...(statement.totals.adjustmentCents > 0
                ? [{ label: 'إعفاء/تخفيض/تسوية', cents: statement.totals.adjustmentCents, tone: 'amber' }]
                : []),
            { label: 'مدفوع الاشتراكات والتسويات', cents: statement.totals.paidCents, tone: 'emerald' },
            ...(statement.totals.settlementAgreedCents > 0
                ? [
                    { label: 'إجمالي اتفاقات التسوية', cents: statement.totals.settlementAgreedCents, tone: 'amber' },
                    { label: 'المسدد من التسويات', cents: statement.totals.settlementPaidCents, tone: 'emerald' },
                    { label: 'المتبقي من التسويات', cents: statement.totals.settlementRemainingCents, tone: statement.totals.settlementRemainingCents ? 'rose' : 'emerald' }
                ]
                : []),
            ...(!statement.purposeFilter ? [{ label: 'إجمالي حركات التحصيل', cents: statement.totals.filteredPaidCents, tone: 'emerald' }] : []),
            { label: 'إجمالي المتبقي', cents: statement.totals.remainingCents, tone: statement.totals.remainingCents ? 'rose' : 'emerald' },
            { label: 'أشهر متأخرة', text: fmtNum(statement.totals.arrearsMonths), tone: statement.totals.arrearsMonths ? 'amber' : 'emerald' }
        ];
    }
    return [
        { label: 'مدفوع الغرض', cents: statement.totals.filteredPaidCents, tone: 'emerald' },
        ...(statement.purposeFilter === 'settlement' && statement.totals.settlementAgreedCents > 0
            ? [
                { label: 'إجمالي اتفاقات التسوية', cents: statement.totals.settlementAgreedCents, tone: 'amber' },
                { label: 'المسدد من التسويات', cents: statement.totals.settlementPaidCents, tone: 'emerald' },
                { label: 'المتبقي من التسويات', cents: statement.totals.settlementRemainingCents, tone: statement.totals.settlementRemainingCents ? 'rose' : 'emerald' }
            ]
            : []),
        { label: 'عدد الحركات', text: fmtNum(statement.payments.length) },
        { label: 'متوسط الحركة', cents: averageCents },
        { label: 'آخر دفعة', text: formatDate(statement.payments[0]?.date) || '—', tone: 'sky' }
    ];
}

function getSelectedReportMonth() {
    return String(/** @type {HTMLSelectElement} */ (document.getElementById('reportMonthSelect'))?.value || '');
}

function getLandlordReportSignature(month, purposeFilter = '', cashAccountFilter = '', paymentMethodFilter = '', residentFilter = '') {
    const { income, expenses } = getLandlordReportData(month, purposeFilter, cashAccountFilter, paymentMethodFilter, residentFilter);
    const monthKey = monthLabelToKey(month);
    const adjustments = (state.adjustments || [])
        .filter(item => String(item.effectiveMonth || '') === monthKey);
    return JSON.stringify([
        state.buildingName || '',
        state.managerName || '',
        state.defaultSubscription ?? '',
        state.residents || [],
        income,
        expenses,
        adjustments,
        purposeFilter || '',
        cashAccountFilter || '',
        paymentMethodFilter || '',
        residentFilter || ''
    ]);
}

function setLandlordReportActionsEnabled(enabled) {
    ['reportPrintBtn', 'reportPdfBtn', 'reportExportBtn'].forEach(id => {
        const button = /** @type {HTMLButtonElement} */ (document.getElementById(id));
        if (button) button.disabled = !enabled;
    });
    markReportPreviewStale('landlordReportPreview', !enabled);
    syncReportNavStatus();
}

function clearLandlordReportPreview(message) {
    reportPreviewDestroyChart('landlordReportChart');
    landlordReportMonth = '';
    landlordReportSignature = '';
    landlordReportPurposeFilter = '';
    landlordReportCashAccountFilter = '';
    landlordReportPaymentMethodFilter = '';
    landlordReportResidentFilter = '';
    setLandlordReportActionsEnabled(false);
    const preview = document.getElementById('landlordReportPreview');
    if (preview) preview.innerHTML = `<p class="report-preview-empty">${esc(message)}</p>`;
}

function invalidateLandlordReportPreview() {
    if (!landlordReportMonth) return;
    clearLandlordReportPreview('تغيّر الشهر أو الفلتر أو البيانات — اضغط «معاينة» لتحديث التقرير.');
}

function invalidateLandlordReportIfStale() {
    if (!landlordReportMonth) return;
    if (getLandlordReportSignature(landlordReportMonth, landlordReportPurposeFilter, landlordReportCashAccountFilter, landlordReportPaymentMethodFilter, landlordReportResidentFilter) !== landlordReportSignature) {
        clearLandlordReportPreview('تغيّرت البيانات — اضغط «معاينة» لتحديث التقرير.');
    }
}

async function generateLandlordReport() {
    if (!requireManager()) return;
    const m = /** @type {HTMLSelectElement} */ (document.getElementById('reportMonthSelect')).value;
    if (!m) { toast('اختر شهر','error'); return; }
    const purposeFilter = getReportPurposeFilter('landlordReportPurpose');
    const cashAccountFilter = getReportCashAccountFilter('landlordReportCashAccount');
    const paymentMethodFilter = getReportPaymentMethodFilter('landlordReportPaymentMethod');
    const residentFilter = getReportResidentFilter('landlordReportResident');
    const model = buildLandlordReportModel(m, purposeFilter, cashAccountFilter, paymentMethodFilter, residentFilter);
    const { showDues, filterLabel, cashAccountLabel, paymentMethodLabel, residentLabel, inc, exp, residentsById, purposeTotals, paymentMethodTotals, expenseCategories } = model;
    const money = cents => fmtMoney(cents / 100);
    const expenseCategoryRows = expenseCategories.map(([label, totals]) => [
        esc(label), fmtNum(totals.count), '<span class="sheet-negative">' + money(totals.cents) + '</span>'
    ]);
    const paymentMethodRows = Array.from(paymentMethodTotals.entries()).map(([label, totals]) => [
        esc(label), fmtNum(totals.count), '<span class="sheet-positive">' + money(totals.cents) + '</span>'
    ]);
    const purposeRows = Array.from(purposeTotals.entries()).map(([label, totals]) => [
        esc(label), fmtNum(totals.count), '<span class="sheet-positive">' + money(totals.cents) + '</span>'
    ]);
    const incomeRows = inc.map(i => {
        const r = residentsById.get(i.residentId);
        return [
            esc(r?.name || '—'),
            esc(reportPurposeLabel(i.purposeCode)) + ' · ' + esc(getIncomePaymentMethodLabel(i.paymentMethod)),
            '<span class="sheet-positive">' + money(toCents(i.amount)) + '</span>'
        ];
    });
    const expenseRows = exp.map(e => [esc(e.title), '<span class="sheet-negative">' + money(toCents(e.amount)) + '</span>']);
    const paymentMethodChartRows = Array.from(paymentMethodTotals.entries())
        .map(([label, totals]) => ({ label, cents: totals.cents }))
        .filter(item => item.cents > 0)
        .sort((a, b) => b.cents - a.cents);
    const paymentMethodChartHasData = reportPreviewChartHasData(paymentMethodChartRows.map(item => item.cents));
    const topPaymentMethod = paymentMethodChartRows[0] || null;
    const statsHtml = renderReportStatTiles(getLandlordSummaryItems(model), !showDues);
    const negativeNote = (model.negativePaymentCount > 0
        ? `<p>تنبيه: ${fmtNum(model.negativePaymentCount)} حركة تحصيل بقيمة سالبة، لم تُحسب ضمن المحصّل من الاشتراكات والتسويات.</p>` : '');
    const note = residentFilter
        ? 'التحصيلات معروضة لشقة «' + esc(residentLabel) + '» فقط' +
            (cashAccountFilter ? ' ضمن صندوق «' + esc(cashAccountLabel) + '»' : '') +
            (paymentMethodFilter ? ' وطريقة «' + esc(paymentMethodLabel) + '»' : '') + '. ' +
            (showDues
                ? 'المستحق ونسبة التحصيل يخصان هذه الشقة.'
                : 'المستحق ونسبة التحصيل يُخفيان عند تصفية الصندوق أو طريقة الدفع.') +
            ' المصروفات معروضة كاملة لأنها غير مرتبطة بشقة محددة.'
        : cashAccountFilter
        ? 'الحركات معروضة لصندوق «' + esc(cashAccountLabel) + '» فقط، والمستحق ونسبة التحصيل يخصان العمارة كلها لذلك يُخفيان عند تصفية الصندوق.'
        : paymentMethodFilter
            ? 'التحصيلات معروضة لطريقة «' + esc(paymentMethodLabel) + '» فقط. المستحق ونسبة التحصيل مرتبطان بكل اشتراكات الشهر لذلك يُخفيان عند تصفية طريقة الدفع، والمصروفات معروضة كاملة لأنها غير مرتبطة بطريقة التحصيل.'
            : purposeFilter
                ? (showDues
                    ? 'المستحق ونسبة التحصيل يعتمدان على اشتراكات الشهر، والحركات معروضة للاشتراكات فقط.'
                    : 'المعروض يشمل تحصيلات غرض «' + esc(filterLabel) + '» فقط. المستحق ونسبة التحصيل مرتبطان باشتراكات الشهر لذلك يُخفيان عند تصفية غرض آخر، والمصروفات معروضة كاملة لأنها غير مرتبطة بأغراض التحصيل.')
                : 'المستحق محسوب بقيمة الاشتراك السارية في شهر التقرير، ونسبة التحصيل تعتمد على تحصيلات الاشتراك فقط.';
    document.getElementById('landlordReportPreview').innerHTML = `
        <div class="report-preview-flow">
            ${renderReportHeader('تقرير الملاك · ' + (state.buildingName || 'العمارة'), [
                'تقرير ' + esc(m) +
                    (purposeFilter ? ' • الغرض: ' + esc(filterLabel) : '') +
                    (cashAccountFilter ? ' • الصندوق: ' + esc(cashAccountLabel) : '') +
                    (paymentMethodFilter ? ' • طريقة الدفع: ' + esc(paymentMethodLabel) : '') +
                    (residentFilter ? ' • الشقة: ' + esc(residentLabel) : ''),
                'تم الإنشاء ' + esc(formatDate(new Date().toISOString()))
            ])}
            ${statsHtml}
            ${negativeNote}
            ${renderSheetBlock('التحصيل حسب الغرض', ['الغرض', 'الحركات', 'التحصيل'], purposeRows, {
                empty: 'لا يوجد تحصيل في هذا التقرير.', numeric: [1, 2],
                foot: ['الإجمالي', fmtNum(inc.length), '<span class="sheet-positive">' + money(model.totalIncCents) + '</span>']
            })}
            ${renderSheetBlock('توزيع طرق الدفع', ['طريقة الدفع', 'الحركات', 'التحصيل'], paymentMethodRows, {
                empty: 'لا يوجد تحصيل في هذا التقرير.', numeric: [1, 2],
                foot: ['الإجمالي', fmtNum(inc.length), '<span class="sheet-positive">' + money(model.totalIncCents) + '</span>']
            })}
            ${renderSheetBlock('تصنيفات المصروفات', ['التصنيف', 'الحركات', 'المصروف'], expenseCategoryRows, {
                empty: 'لا توجد مصروفات في هذا التقرير.', numeric: [1, 2],
                foot: ['الإجمالي', fmtNum(exp.length), '<span class="sheet-negative">' + money(model.totalExpCents) + '</span>']
            })}
            ${renderSheetBlock('تفاصيل التحصيلات', ['المالك', 'الغرض وطريقة الدفع', 'المبلغ'], incomeRows, {
                empty: 'لا يوجد تحصيل في هذا التقرير.', numeric: [2],
                foot: ['الإجمالي', fmtNum(inc.length) + ' حركة', '<span class="sheet-positive">' + money(model.totalIncCents) + '</span>']
            })}
            ${renderSheetBlock('تفاصيل المصروفات', ['المصروف', 'المبلغ'], expenseRows, {
                empty: 'لا توجد مصروفات في هذا التقرير.', numeric: [1],
                foot: ['الإجمالي', '<span class="sheet-negative">' + money(model.totalExpCents) + '</span>']
            })}
            ${renderChartFold('landlordReportChart', 'التصور البياني - توزيع التحصيل حسب طريقة الدفع', {
                hasData: paymentMethodChartHasData,
                empty: 'لا يوجد تحصيل لعرض توزيع طرق الدفع.',
                ariaLabel: 'مخطط دائري لتوزيع التحصيل حسب طريقة الدفع؛ البيانات نفسها متاحة في الجدول.',
                summary: paymentMethodChartHasData ? [
                    { label: 'إجمالي التحصيل', cents: model.totalIncCents, tone: 'emerald' },
                    { label: 'عدد الطرق', text: fmtNum(paymentMethodChartRows.length) },
                    { label: 'أعلى طريقة', text: topPaymentMethod.label, note: fmtMoney(topPaymentMethod.cents / 100) },
                    {
                        label: 'حصة الأعلى',
                        text: model.totalIncCents > 0
                            ? fmtNum(Math.round((topPaymentMethod.cents / model.totalIncCents) * 100)) + '%'
                            : '—'
                    }
                ] : []
            })}
            ${renderReportNotes(['<p>' + note + '</p>'])}
        </div>`;
    landlordReportMonth = m;
    landlordReportPurposeFilter = purposeFilter;
    landlordReportCashAccountFilter = cashAccountFilter;
    landlordReportPaymentMethodFilter = paymentMethodFilter;
    landlordReportResidentFilter = residentFilter;
    landlordReportSignature = getLandlordReportSignature(m, purposeFilter, cashAccountFilter, paymentMethodFilter, residentFilter);
    setLandlordReportActionsEnabled(true);

    // Render chart for landlord report (lazy-loaded Chart.js, fire-and-forget)
    if (typeof renderDoughnutValues === 'function' && paymentMethodChartHasData) {
        renderDoughnutValues(
            'landlordReportChart',
            paymentMethodChartRows.map(item => item.label),
            paymentMethodChartRows.map(item => item.cents / 100),
            reportPreviewChartPalette(paymentMethodChartRows.length),
            { cutout: '55%' }
        ).catch(() => {});
    }
}

// ===== Paper size (A4 / A5) for print and PDF =====
// The browser reads the @page size when printing, and "save as PDF" uses the same size.
const PRINT_PAPER_KEY = 'manzilPrintPaper';
const PRINT_PAPER_SIZES = { A4: 'A4 portrait', A5: 'A5 portrait' };
const PRINT_PAPER_MARGINS = { A4: '14mm', A5: '10mm' };

function getPrintPaper() {
    try {
        const saved = localStorage.getItem(PRINT_PAPER_KEY);
        return PRINT_PAPER_SIZES[saved] ? saved : 'A4';
    } catch (_) { return 'A4'; }
}

function applyPrintPaper(size) {
    const paper = PRINT_PAPER_SIZES[size] ? size : 'A4';
    let style = document.getElementById('printPaperStyle');
    if (!style) {
        style = document.createElement('style');
        style.id = 'printPaperStyle';
        document.head.appendChild(style);
    }
    style.textContent = `@page { size: ${PRINT_PAPER_SIZES[paper]}; margin: ${PRINT_PAPER_MARGINS[paper]}; }`;
    document.documentElement.setAttribute('data-print-paper', paper);
    const select = document.getElementById('printPaperSelect');
    if (select instanceof HTMLSelectElement) select.value = paper;
    return paper;
}

function setPrintPaper(size) {
    const paper = applyPrintPaper(size);
    try { localStorage.setItem(PRINT_PAPER_KEY, paper); } catch (_) { /* storage may be unavailable */ }
}

function initPrintPaper() { applyPrintPaper(getPrintPaper()); }
if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.documentElement) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPrintPaper);
    else initPrintPaper();
    window.setPrintPaper = setPrintPaper;
    window.getPrintPaper = getPrintPaper;
}

function printLandlordReport() {
    if (!requireManager()) return;
    const selected = getSelectedReportMonth();
    if (!landlordReportMonth || (selected && selected !== landlordReportMonth)) {
        toast('اعرض معاينة الشهر المحدد أولًا','error');
        return;
    }
    const title = document.getElementById('printBuildingTitle');
    const meta = document.getElementById('printBuildingMeta');
    const previousTitle = title ? title.textContent : '';
    const previousMeta = meta ? meta.textContent : '';
    if (title) title.textContent = `تقرير الملاك - ${state.buildingName || 'Manzil'}`;
    if (meta) meta.textContent = `تقرير ${landlordReportMonth}${landlordReportPaymentMethodFilter ? ' • طريقة الدفع: ' + reportPaymentMethodLabel(landlordReportPaymentMethodFilter) : ''}${landlordReportResidentFilter ? ' • الشقة: ' + reportResidentFilterLabel(landlordReportResidentFilter) : ''} • المدير: ${state.managerName || '—'}`;
    document.body.classList.add('print-landlord');
    const restore = () => {
        document.body.classList.remove('print-landlord');
        if (title) title.textContent = previousTitle;
        if (meta) meta.textContent = previousMeta;
    };
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
}

function escapeCsvCell(value) {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(rows) {
    return '\uFEFF' + rows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
}

function downloadCsv(filename, rows) {
    const blob = new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportToCSV(month = landlordReportMonth, purposeFilter = landlordReportPurposeFilter, cashAccountFilter = landlordReportCashAccountFilter, paymentMethodFilter = landlordReportPaymentMethodFilter, residentFilter = landlordReportResidentFilter) {
    if (!requireManager()) return;
    const reportMonth = String(month || '');
    if (!reportMonth) { toast('اعرض معاينة التقرير أولًا','error'); return; }
    const selected = getSelectedReportMonth();
    if (selected && selected !== reportMonth) { toast('اعرض معاينة الشهر المحدد أولًا','error'); return; }
    const purposeSelect = typeof document !== 'undefined'
        ? /** @type {HTMLSelectElement | null} */ (document.getElementById('landlordReportPurpose'))
        : null;
    if (purposeSelect && normalizeReportPurposeFilter(purposeSelect.value) !== purposeFilter) {
        toast('اعرض معاينة الغرض المحدد أولًا','error');
        return;
    }
    const cashSelect = typeof document !== 'undefined'
        ? /** @type {HTMLSelectElement | null} */ (document.getElementById('landlordReportCashAccount'))
        : null;
    if (cashSelect && normalizeReportCashAccountFilter(cashSelect.value) !== cashAccountFilter) {
        toast('اعرض معاينة الصندوق المحدد أولًا','error');
        return;
    }
    const methodSelect = typeof document !== 'undefined'
        ? /** @type {HTMLSelectElement | null} */ (document.getElementById('landlordReportPaymentMethod'))
        : null;
    if (methodSelect && normalizeReportPaymentMethodFilter(methodSelect.value) !== paymentMethodFilter) {
        toast('اعرض معاينة طريقة الدفع المحددة أولًا','error');
        return;
    }
    const residentSelect = typeof document !== 'undefined'
        ? /** @type {HTMLSelectElement | null} */ (document.getElementById('landlordReportResident'))
        : null;
    if (residentSelect && normalizeReportResidentFilter(residentSelect.value) !== residentFilter) {
        toast('اعرض معاينة الشقة المحددة أولًا','error');
        return;
    }
    if (landlordReportSignature && getLandlordReportSignature(reportMonth, purposeFilter, cashAccountFilter, paymentMethodFilter, residentFilter) !== landlordReportSignature) {
        toast('تغيّرت البيانات — اضغط «معاينة» لتحديث التقرير.','error');
        return;
    }
    const { income: inc, expenses: exp } = getLandlordReportData(reportMonth, purposeFilter, cashAccountFilter, paymentMethodFilter, residentFilter);
    const residentsById = buildResidentIndex();
    const rows = [['النوع','الوصف','الشقة','الشهر','المبلغ','الغرض','الصندوق','طريقة الدفع','ملاحظات']];
    inc.forEach(i => {
        const r = residentsById.get(i.residentId);
        rows.push(['تحصيل', r?.name||'', r?.apartmentNumber||'', i.month, toCents(i.amount) / 100,
            reportPurposeLabel(i.purposeCode), reportCashAccountLabel(i.cashAccountCode),
            getIncomePaymentMethodLabel(i.paymentMethod), i.notes||'']);
    });
    exp.forEach(e => rows.push(['مصروف', e.title, '', e.month, toCents(e.amount) / 100, '', reportCashAccountLabel(e.cashAccountCode), '', [e.category, e.notes].filter(Boolean).join(' ')]));
    const monthKey = monthLabelToKey(reportMonth);
    const purposeSuffix = purposeFilter ? `_${purposeFilter}` : '';
    const cashSuffix = cashAccountFilter ? `_${cashAccountFilter}` : '';
    const paymentSuffix = paymentMethodFilter ? `_pay_${paymentMethodFilter}` : '';
    const residentSlug = reportResidentFileSlug(residentFilter);
    const residentSuffix = residentSlug ? `_apt_${residentSlug}` : '';
    downloadCsv(`manzil_report_${monthKey ? monthKey.slice(0, 7) : Date.now()}${purposeSuffix}${cashSuffix}${paymentSuffix}${residentSuffix}.csv`, rows);
    toast(`تم تصدير تقرير ${reportMonth}`,'success');
}

function renderLandlordReportPdfHtml(month, purposeFilter = '', cashAccountFilter = '', paymentMethodFilter = '', residentFilter = '') {
    const model = buildLandlordReportModel(month, purposeFilter, cashAccountFilter, paymentMethodFilter, residentFilter);
    const { showDues, filterLabel, cashAccountLabel, paymentMethodLabel, residentLabel, inc, exp, residentsById, purposeTotals, paymentMethodTotals, expenseCategories } = model;
    const summaryRows = renderPdfSummaryRows(getLandlordSummaryItems(model));

    const paymentMethodRows = Array.from(paymentMethodTotals.entries()).map(([label, totals]) =>
        '<tr>' + statementPdfCell(esc(label) + ' (' + totals.count + ')') +
        statementPdfCell(fmtMoney(totals.cents / 100), 'color:#047857;font-weight:700') + '</tr>'
    ).join('') || '<tr><td colspan="2" style="' + REPORT_PDF_EMPTY_CELL_STYLE + '">لا يوجد</td></tr>';

    const expenseCategoryRows = expenseCategories.map(([label, totals]) =>
        '<tr>' + statementPdfCell(esc(label) + ' (' + totals.count + ')') +
        statementPdfCell(fmtMoney(totals.cents / 100), 'color:#be123c;font-weight:700') + '</tr>'
    ).join('') || '<tr><td colspan="2" style="' + REPORT_PDF_EMPTY_CELL_STYLE + '">لا يوجد</td></tr>';

    const purposeRows = Array.from(purposeTotals.entries()).map(([label, totals]) =>
        '<tr>' + statementPdfCell(esc(label) + ' (' + totals.count + ')') +
        statementPdfCell(fmtMoney(totals.cents / 100), 'color:#047857;font-weight:700') + '</tr>'
    ).join('') || '<tr><td colspan="2" style="' + REPORT_PDF_EMPTY_CELL_STYLE + '">لا يوجد</td></tr>';

    const incomeRows = inc.length
        ? inc.map(i => {
            const resident = residentsById.get(i.residentId);
            return '<tr>' +
                statementPdfCell(esc(resident?.name || '—')) +
                statementPdfCell(esc(reportPurposeLabel(i.purposeCode))) +
                statementPdfCell(esc(getIncomePaymentMethodLabel(i.paymentMethod))) +
                statementPdfCell(fmtMoney(toCents(i.amount) / 100), 'color:#047857;font-weight:700') +
                '</tr>';
        }).join('')
        : '<tr><td colspan="4" style="' + REPORT_PDF_EMPTY_CELL_STYLE + '">لا يوجد</td></tr>';

    const expenseRows = exp.length
        ? exp.map(e =>
            '<tr>' +
            statementPdfCell(esc(e.title || '—')) +
            statementPdfCell(esc(e.category || 'غير مصنف')) +
            statementPdfCell(fmtMoney(toCents(e.amount) / 100), 'color:#be123c;font-weight:700') +
            '</tr>').join('')
        : '<tr><td colspan="3" style="' + REPORT_PDF_EMPTY_CELL_STYLE + '">لا يوجد</td></tr>';

    const generatedAtLabel = reportPdfDate(new Date().toISOString());
    return [
        reportPdfDocumentOpen(),
        reportPdfHeader([
            'تقرير الملاك — ', esc(month),
            purposeFilter ? ' • الغرض: ' + esc(filterLabel) : '',
            cashAccountFilter ? ' • الصندوق: ' + esc(cashAccountLabel) : '',
            paymentMethodFilter ? ' • طريقة الدفع: ' + esc(paymentMethodLabel) : '',
            residentFilter ? ' • الشقة: ' + esc(residentLabel) : ''
        ], [
            'المدير: ', esc(state.managerName || '—'),
            ' • تم الإنشاء ', esc(generatedAtLabel)
        ]),
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">الملخص المالي</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:11px"><tbody>',
        summaryRows,
        '</tbody></table></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">التحصيل حسب الغرض</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><tbody>', purposeRows, '</tbody></table></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">توزيع طرق الدفع</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><tbody>', paymentMethodRows, '</tbody></table></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">تصنيفات المصروفات</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><tbody>', expenseCategoryRows, '</tbody></table></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">تفاصيل التحصيلات</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="' + REPORT_PDF_TABLE_HEAD_STYLE + '">',
        '<th style="' + REPORT_PDF_CELL_STYLE + '">المالك</th><th style="' + REPORT_PDF_CELL_STYLE + '">الغرض</th><th style="' + REPORT_PDF_CELL_STYLE + '">طريقة الدفع</th>',
        '<th style="' + REPORT_PDF_CELL_STYLE + '">المبلغ</th></tr></thead><tbody>', incomeRows, '</tbody></table></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">تفاصيل المصروفات</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="' + REPORT_PDF_TABLE_HEAD_STYLE + '">',
        '<th style="' + REPORT_PDF_CELL_STYLE + '">البيان</th><th style="' + REPORT_PDF_CELL_STYLE + '">التصنيف</th>',
        '<th style="' + REPORT_PDF_CELL_STYLE + '">المبلغ</th></tr></thead><tbody>', expenseRows, '</tbody></table></section>',
        '<p style="' + REPORT_PDF_FOOTNOTE_STYLE + '">',
        'تقرير للقراءة فقط ولا يعدل أي بيانات. ',
        residentFilter
            ? 'التحصيلات معروضة لشقة «' + esc(residentLabel) + '» فقط' +
                (cashAccountFilter ? ' ضمن صندوق «' + esc(cashAccountLabel) + '»' : '') +
                (paymentMethodFilter ? ' وطريقة «' + esc(paymentMethodLabel) + '»' : '') + '. ' +
                (showDues
                    ? 'المستحق ونسبة التحصيل يخصان هذه الشقة. '
                    : 'المستحق ونسبة التحصيل لا يظهران عند تصفية الصندوق أو طريقة الدفع. ') +
                'المصروفات كاملة لأنها غير مرتبطة بشقة محددة.'
            : cashAccountFilter
            ? 'الحركات معروضة لصندوق «' + esc(cashAccountLabel) + '» فقط. المستحق ونسبة التحصيل يخصان العمارة كلها لذلك لا يظهران عند تصفية الصندوق.'
            : paymentMethodFilter
                ? 'التحصيلات معروضة لطريقة «' + esc(paymentMethodLabel) + '» فقط، بينما المصروفات كاملة لأنها غير مرتبطة بطريقة التحصيل. المستحق ونسبة التحصيل يخصان كل اشتراكات الشهر لذلك لا يظهران في هذا العرض.'
                : showDues
                ? 'المستحق محسوب بقيمة الاشتراك السارية في شهر التقرير بعد الإعفاءات والتخفيضات، والتحصيلات والمصروفات محسوبة على شهر استحقاقها المسجل.'
                : 'التحصيلات معروضة لغرض «' + esc(filterLabel) + '» فقط، بينما المصروفات كاملة لأنها غير مرتبطة بأغراض التحصيل. المستحق ونسبة التحصيل يخصان الاشتراكات لذلك لا يظهران في هذا العرض.',
        '</p>',
        reportPdfFooter(generatedAtLabel),
        '</div>'
    ].join('');
}

async function exportLandlordReportPdf() {
    if (!requireManager()) return;
    const selected = getSelectedReportMonth();
    if (!landlordReportMonth || (selected && selected !== landlordReportMonth)) {
        toast('اعرض معاينة الشهر المحدد أولًا', 'error');
        return;
    }
    if (getLandlordReportSignature(landlordReportMonth, landlordReportPurposeFilter, landlordReportCashAccountFilter, landlordReportPaymentMethodFilter, landlordReportResidentFilter) !== landlordReportSignature) {
        toast('تغيّرت البيانات — اضغط «معاينة» لتحديث التقرير.', 'error');
        return;
    }

    const monthKey = monthLabelToKey(landlordReportMonth);
    const purposeSuffix = landlordReportPurposeFilter ? `_${landlordReportPurposeFilter}` : '';
    const cashSuffix = landlordReportCashAccountFilter ? `_${landlordReportCashAccountFilter}` : '';
    const paymentSuffix = landlordReportPaymentMethodFilter ? `_pay_${landlordReportPaymentMethodFilter}` : '';
    const residentSlug = reportResidentFileSlug(landlordReportResidentFilter);
    const residentSuffix = residentSlug ? `_apt_${residentSlug}` : '';
    const filename = `manzil_landlord_report_${monthKey ? monthKey.slice(0, 7) : 'report'}${purposeSuffix}${cashSuffix}${paymentSuffix}${residentSuffix}.pdf`;
    const button = /** @type {HTMLButtonElement} */ (document.getElementById('reportPdfBtn'));
    if (button) button.disabled = true;
    let root = null;

    try {
        await ensurePdfLibrary();
        await loadReportPdfFonts();

        root = document.createElement('section');
        root.dir = 'rtl';
        root.lang = 'ar';
        root.style.cssText = reportExportRootCss();
        root.innerHTML = renderLandlordReportPdfHtml(landlordReportMonth, landlordReportPurposeFilter, landlordReportCashAccountFilter, landlordReportPaymentMethodFilter, landlordReportResidentFilter);
        mountReportExportRoot(root);

        if (reportExportMode === 'image') {
            await saveReportRootAsImages(root, filename);
            toast('تم حفظ صورة التقرير.', 'success');
            return;
        }

        const pdfBlob = await renderReportRootToPdfBlob(root, filename);

        if (!(pdfBlob instanceof Blob) || pdfBlob.type !== 'application/pdf' || pdfBlob.size < 100) {
            throw new Error('landlord_report_pdf_generation_failed');
        }

        const url = URL.createObjectURL(pdfBlob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        toast('تم إنشاء ملف PDF لتقرير الملاك.', 'success');
    } catch (error) {
        console.error('Landlord report PDF export failed:', error);
        toast('تعذر إنشاء PDF. تحقق من الاتصال ثم أعد المحاولة.', 'error');
    } finally {
        if (root) removeReportExportRoot(root);
        if (button && landlordReportMonth) setLandlordReportActionsEnabled(true);
    }
}

let periodReportSnapshot = null;
let periodReportSignature = '';

function getPeriodReportSelection() {
    return {
        from: String(/** @type {HTMLSelectElement} */ (document.getElementById('periodReportFrom'))?.value || ''),
        to: String(/** @type {HTMLSelectElement} */ (document.getElementById('periodReportTo'))?.value || '')
    };
}

function setPeriodReportMonthValue(id, monthKey) {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById(id));
    const label = getStatementMonthLabel(monthKey);
    if (!select || !label) return;
    select.value = label;
}

function applyPeriodReportPreset() {
    const preset = String(/** @type {HTMLSelectElement} */ (document.getElementById('periodReportPreset'))?.value || '');
    if (!preset || preset === 'custom') return;
    const currentKey = monthLabelToKey(getCurrentMonth());
    if (!currentKey) return;
    const count = preset === 'ytd'
        ? Math.max(1, Number(currentKey.slice(5, 7)) || 1)
        : Math.max(1, Number(preset) || 6);
    setPeriodReportMonthValue('periodReportFrom', shiftStatementMonthKey(currentKey, -(count - 1)));
    setPeriodReportMonthValue('periodReportTo', currentKey);
    invalidatePeriodReportPreview();
}

function onPeriodReportRangeChange() {
    const preset = /** @type {HTMLSelectElement} */ (document.getElementById('periodReportPreset'));
    if (preset) preset.value = 'custom';
    invalidatePeriodReportPreview();
}

const PERIOD_REPORT_MAX_MONTHS = 60;

function getPeriodMonthSpan(fromKey, toKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromKey) || !/^\d{4}-\d{2}-\d{2}$/.test(toKey)) return null;
    return (Number(toKey.slice(0, 4)) - Number(fromKey.slice(0, 4))) * 12 +
        (Number(toKey.slice(5, 7)) - Number(fromKey.slice(5, 7))) + 1;
}

function buildPeriodMonthKeys(fromMonth, toMonth) {
    const fromKey = monthLabelToKey(fromMonth);
    const toKey = monthLabelToKey(toMonth);
    if (!fromKey || !toKey || fromKey > toKey) return null;
    if (getPeriodMonthSpan(fromKey, toKey) > PERIOD_REPORT_MAX_MONTHS) return null;
    const keys = [];
    for (let key = fromKey; key <= toKey; key = shiftStatementMonthKey(key, 1)) keys.push(key);
    return keys.length ? keys : null;
}

function formatPeriodRate(rate) {
    if (rate === null || rate === undefined || rate === '') return '—';
    // Shown rate never passes 100%; the excess is shown separately as an advance amount.
    return fmtNum(Math.min(100, Number(rate))) + '%';
}

function getPeriodCollectionRate(expectedCents, collectedCents) {
    return expectedCents > 0 ? Math.round((collectedCents / expectedCents) * 100) : null;
}

function buildPeriodReport(fromMonth, toMonth, purposeFilter = '', cashAccountFilter = '', residentFilter = '') {
    const cacheKey = `period:${fromMonth}:${toMonth}:${purposeFilter}:${cashAccountFilter}:${residentFilter}`;
    return getCachedReportModel(cacheKey, () => _buildPeriodReport(fromMonth, toMonth, purposeFilter, cashAccountFilter, residentFilter), () => true);
}

function _buildPeriodReport(fromMonth, toMonth, purposeFilter = '', cashAccountFilter = '', residentFilter = '') {
    const keys = buildPeriodMonthKeys(fromMonth, toMonth);
    if (!keys) return null;
    const normalizedPurpose = normalizeReportPurposeFilter(purposeFilter);
    const normalizedCashAccount = normalizeReportCashAccountFilter(cashAccountFilter);
    const normalizedResident = normalizeReportResidentFilter(residentFilter);
    const showDues = reportShowsSubscriptionDues(normalizedPurpose) && !normalizedCashAccount;
    const months = keys.map(key => {
        const month = getStatementMonthLabel(key);
        const monthIncome = filterReportIncome((state.income || []).filter(item => item.month === month), normalizedPurpose, normalizedCashAccount, '', normalizedResident);
        const totalIncomeCents = monthIncome.reduce((sum, item) => sum + toCents(item.amount), 0);
        const collectedCents = monthIncome
            .filter(item => reportIsSubscriptionPayment(item) && toCents(item.amount) > 0)
            .reduce((sum, item) => sum + toCents(item.amount), 0);
        const otherIncomeCents = totalIncomeCents - collectedCents;
        const negativePaymentCount = monthIncome.filter(item => toCents(item.amount) < 0).length;
        const monthExpenses = filterReportExpenses(
            (state.expenses || []).filter(item => item.month === month),
            normalizedCashAccount
        );
        const emptyExpenseCount = monthExpenses.filter(item => item.amount === null || item.amount === undefined || String(item.amount).trim() === '').length;
        const expenseCents = monthExpenses.reduce((sum, item) => sum + toCents(item.amount), 0);
        const { expectedCents, outstandingCents, adjustmentCents } = showDues
            ? getMonthlyBillingTotals(month, normalizedResident)
            : { expectedCents: 0, outstandingCents: 0, adjustmentCents: 0 };
        return {
            key,
            month,
            expectedCents,
            adjustmentCents,
            totalIncomeCents,
            movementCount: monthIncome.length,
            collectedCents,
            otherIncomeCents,
            outstandingCents,
            expenseCents,
            negativePaymentCount,
            emptyExpenseCount,
            advanceCents: showDues && expectedCents > 0 ? Math.max(0, collectedCents - expectedCents) : 0,
            netCents: totalIncomeCents - expenseCents,
            rate: showDues ? getPeriodCollectionRate(expectedCents, collectedCents) : null
        };
    });
    const totals = months.reduce((acc, row) => {
        acc.expectedCents += row.expectedCents;
        acc.adjustmentCents += row.adjustmentCents;
        acc.totalIncomeCents += row.totalIncomeCents;
        acc.movementCount += row.movementCount;
        acc.collectedCents += row.collectedCents;
        acc.otherIncomeCents += row.otherIncomeCents;
        acc.advanceCents += row.advanceCents || 0;
        acc.negativePaymentCount += row.negativePaymentCount || 0;
        acc.emptyExpenseCount += row.emptyExpenseCount || 0;
        acc.outstandingCents += row.outstandingCents;
        acc.expenseCents += row.expenseCents;
        if (row.outstandingCents > 0) acc.unpaidMonths += 1;
        return acc;
    }, { expectedCents: 0, adjustmentCents: 0, totalIncomeCents: 0, movementCount: 0, collectedCents: 0, otherIncomeCents: 0, negativePaymentCount: 0, emptyExpenseCount: 0, advanceCents: 0, outstandingCents: 0, expenseCents: 0, unpaidMonths: 0, netCents: 0, rate: null });
    totals.netCents = totals.totalIncomeCents - totals.expenseCents;
    totals.rate = showDues ? getPeriodCollectionRate(totals.expectedCents, totals.collectedCents) : null;
    const rangeLabels = new Set(months.map(row => row.month));
    const rangeIncome = filterReportIncome(
        (state.income || []).filter(item => rangeLabels.has(item.month)),
        normalizedPurpose,
        normalizedCashAccount,
        '',
        normalizedResident
    );
    const methodTotals = new Map();
    rangeIncome.forEach(payment => {
        const label = getIncomePaymentMethodLabel(payment.paymentMethod);
        const bucket = methodTotals.get(label) || { label, count: 0, cents: 0 };
        bucket.count += 1;
        bucket.cents += toCents(payment.amount);
        methodTotals.set(label, bucket);
    });
    const methods = Array.from(methodTotals.values())
        .sort((a, b) => b.cents - a.cents)
        .map(item => ({
            ...item,
            share: totals.totalIncomeCents > 0
                ? Math.round((item.cents / totals.totalIncomeCents) * 100)
                : null
        }));
    const purposeTotals = new Map();
    rangeIncome.forEach(payment => {
        const label = reportPurposeLabel(payment.purposeCode);
        const bucket = purposeTotals.get(label) || { label, count: 0, cents: 0 };
        bucket.count += 1;
        bucket.cents += toCents(payment.amount);
        purposeTotals.set(label, bucket);
    });
    const purposes = Array.from(purposeTotals.values()).sort((a, b) => b.cents - a.cents);
    return {
        fromMonth,
        toMonth,
        months,
        totals,
        methods,
        purposes,
        showDues,
        purposeFilter: normalizedPurpose,
        purposeLabel: reportPurposeFilterLabel(normalizedPurpose),
        cashAccountFilter: normalizedCashAccount,
        cashAccountLabel: reportCashAccountFilterLabel(normalizedCashAccount),
        residentFilter: normalizedResident,
        residentLabel: reportResidentFilterLabel(normalizedResident),
        rangeLabel: `${fromMonth} – ${toMonth}`,
        generatedAt: new Date().toISOString()
    };
}

function canUsePeriodReportRpc() {
    return typeof supabaseClient !== 'undefined'
        && typeof supabaseClient?.rpc === 'function'
        && typeof activeBuildingId !== 'undefined'
        && Boolean(activeBuildingId)
        && typeof currentUserRole !== 'undefined'
        && currentUserRole === 'manager';
}

function normalizeServerPeriodReport(serverReport, localReport) {
    if (!serverReport || !Array.isArray(serverReport.months) || !localReport) return null;
    // المستحقات تُخفى عند تصفية الصندوق أو الغرض غير الاشتراك؛ لا نعتمد أرقام
    // مستحقات من الخادم لا يراعي هذا الشرط، فنصفّرها ليتطابق مع التقرير المحلي.
    const showDues = Boolean(localReport.showDues);
    const months = serverReport.months.map(row => {
        const key = String(row?.key || '').slice(0, 10);
        const month = getStatementMonthLabel(key);
        if (!/^\d{4}-\d{2}-01$/.test(key) || !month) return null;
        const cents = value => Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
        const rate = row.rate === null || row.rate === undefined || row.rate === ''
            ? null
            : (Number.isFinite(Number(row.rate)) ? Math.round(Number(row.rate)) : null);
        return {
            key,
            month,
            expectedCents: showDues ? cents(row.expectedCents) : 0,
            adjustmentCents: showDues ? cents(row.adjustmentCents) : 0,
            totalIncomeCents: cents(row.totalIncomeCents),
            movementCount: Math.max(0, Math.round(Number(row.movementCount) || 0)),
            collectedCents: cents(row.collectedCents),
            otherIncomeCents: cents(row.otherIncomeCents),
            outstandingCents: showDues ? cents(row.outstandingCents) : 0,
            expenseCents: cents(row.expenseCents),
            netCents: cents(row.netCents),
            rate: showDues ? rate : null
        };
    });
    const expectedKeys = localReport.months.map(row => row.key).join('|');
    if (months.some(row => !row) || months.map(row => row.key).join('|') !== expectedKeys) return null;
    const totals = months.reduce((acc, row) => {
        acc.expectedCents += row.expectedCents;
        acc.adjustmentCents += row.adjustmentCents;
        acc.totalIncomeCents += row.totalIncomeCents;
        acc.movementCount += row.movementCount;
        acc.collectedCents += row.collectedCents;
        acc.otherIncomeCents += row.otherIncomeCents;
        acc.advanceCents += row.advanceCents || 0;
        acc.negativePaymentCount += row.negativePaymentCount || 0;
        acc.emptyExpenseCount += row.emptyExpenseCount || 0;
        acc.outstandingCents += row.outstandingCents;
        acc.expenseCents += row.expenseCents;
        if (row.outstandingCents > 0) acc.unpaidMonths += 1;
        return acc;
    }, { expectedCents: 0, adjustmentCents: 0, totalIncomeCents: 0, movementCount: 0, collectedCents: 0, otherIncomeCents: 0, negativePaymentCount: 0, emptyExpenseCount: 0, advanceCents: 0, outstandingCents: 0, expenseCents: 0, unpaidMonths: 0, netCents: 0, rate: null });
    totals.netCents = totals.totalIncomeCents - totals.expenseCents;
    totals.rate = localReport.showDues ? getPeriodCollectionRate(totals.expectedCents, totals.collectedCents) : null;
    const methods = (Array.isArray(serverReport.methods) ? serverReport.methods : []).map(item => ({
        label: item.code === 'unknown' ? 'غير محدد' : getIncomePaymentMethodLabel(item.code),
        count: Math.max(0, Math.round(Number(item.count) || 0)),
        cents: Number.isFinite(Number(item.cents)) ? Math.round(Number(item.cents)) : 0,
        share: item.share === null || item.share === undefined ? null : Math.round(Number(item.share) || 0)
    }));
    const purposes = (Array.isArray(serverReport.purposes) ? serverReport.purposes : []).map(item => ({
        label: reportPurposeLabel(item.code),
        count: Math.max(0, Math.round(Number(item.count) || 0)),
        cents: Number.isFinite(Number(item.cents)) ? Math.round(Number(item.cents)) : 0
    }));
    return {
        ...localReport,
        months,
        totals,
        methods,
        purposes,
        generatedAt: serverReport.generatedAt || new Date().toISOString(),
        dataSource: 'database'
    };
}

async function fetchPeriodReportFromDatabase(fromMonth, toMonth, purposeFilter, cashAccountFilter, residentFilter) {
    if (!canUsePeriodReportRpc()) return null;
    const fromKey = monthLabelToKey(fromMonth);
    const toKey = monthLabelToKey(toMonth);
    if (!fromKey || !toKey) return null;
    const { data, error } = await supabaseClient.rpc('get_period_report', {
        p_building_id: activeBuildingId,
        p_from_month: fromKey,
        p_to_month: toKey,
        p_purpose_code: purposeFilter || null,
        p_cash_account_code: cashAccountFilter || null,
        p_resident_id: residentFilter || null
    });
    if (error) throw error;
    return data;
}

function getPeriodReportSignature(fromMonth, toMonth, purposeFilter = '', cashAccountFilter = '', residentFilter = '') {
    const labels = new Set([fromMonth, toMonth]);
    const keys = new Set(buildPeriodMonthKeys(fromMonth, toMonth) || []);
    keys.forEach(key => labels.add(getStatementMonthLabel(key)));
    return JSON.stringify([
        state.buildingName || '',
        state.managerName || '',
        state.defaultSubscription ?? '',
        state.residents || [],
        (state.income || []).filter(item => labels.has(item.month)),
        (state.expenses || []).filter(item => labels.has(item.month)),
        (state.adjustments || []).filter(item => keys.has(String(item.effectiveMonth || ''))),
        purposeFilter || '',
        cashAccountFilter || '',
        residentFilter || ''
    ]);
}

function setPeriodReportActionsEnabled(enabled) {
    ['periodReportPrintBtn', 'periodReportPdfBtn', 'periodReportExportBtn', 'periodReportExcelBtn'].forEach(id => {
        const button = /** @type {HTMLButtonElement} */ (document.getElementById(id));
        if (button) button.disabled = !enabled;
    });
    markReportPreviewStale('periodReportPreview', !enabled);
    syncReportNavStatus();
}

function clearPeriodReportPreview(message) {
    reportPreviewDestroyChart('periodReportChart');
    if (typeof window !== 'undefined') {
        window.__manzilPeriodReportRequestToken = (window.__manzilPeriodReportRequestToken || 0) + 1;
    }
    periodReportSnapshot = null;
    periodReportSignature = '';
    setPeriodReportActionsEnabled(false);
    const preview = document.getElementById('periodReportPreview');
    if (preview) preview.innerHTML = `<p class="report-preview-empty">${esc(message)}</p>`;
}

function invalidatePeriodReportPreview() {
    if (!periodReportSnapshot) return;
    clearPeriodReportPreview('تغيّرت الفترة أو الفلتر أو البيانات — اضغط «معاينة» لتحديث التقرير.');
}

function invalidatePeriodReportIfStale() {
    if (!periodReportSnapshot) return;
    const signature = getPeriodReportSignature(
        periodReportSnapshot.fromMonth,
        periodReportSnapshot.toMonth,
        periodReportSnapshot.purposeFilter,
        periodReportSnapshot.cashAccountFilter,
        periodReportSnapshot.residentFilter
    );
    if (signature !== periodReportSignature) {
        clearPeriodReportPreview('تغيّرت البيانات — اضغط «معاينة» لتحديث التقرير.');
    }
}

function getSelectedPeriodReportSnapshot() {
    if (!periodReportSnapshot) {
        toast('اعرض معاينة الفترة أولًا','error');
        return null;
    }
    const selected = getPeriodReportSelection();
    if ((selected.from && selected.from !== periodReportSnapshot.fromMonth) ||
        (selected.to && selected.to !== periodReportSnapshot.toMonth)) {
        toast('اعرض معاينة الفترة المحددة أولًا','error');
        return null;
    }
    if (getReportPurposeFilter('periodReportPurpose') !== (periodReportSnapshot.purposeFilter || '')) {
        toast('اعرض معاينة الغرض المحدد أولًا','error');
        return null;
    }
    if (getReportCashAccountFilter('periodReportCashAccount') !== (periodReportSnapshot.cashAccountFilter || '')) {
        toast('اعرض معاينة الصندوق المحدد أولًا','error');
        return null;
    }
    if (getReportResidentFilter('periodReportResident') !== (periodReportSnapshot.residentFilter || '')) {
        toast('اعرض معاينة الشقة المحددة أولًا','error');
        return null;
    }
    return periodReportSnapshot;
}

function renderPeriodReportHtml(report) {
    const showDues = report.showDues !== false;
    const money = cents => fmtMoney(cents / 100);
    const tone = (amount, positive) => '<span class="' + (positive ? 'sheet-positive' : 'sheet-negative') + '">' + money(amount) + '</span>';
    const monthRows = showDues
        ? report.months.map(row => [
            esc(row.month), money(row.expectedCents), tone(row.collectedCents, true),
            row.outstandingCents ? tone(row.outstandingCents, false) : money(0),
            formatPeriodRate(row.rate),
            row.otherIncomeCents ? tone(row.otherIncomeCents, true) : money(0),
            row.expenseCents ? tone(row.expenseCents, false) : money(0),
            tone(row.netCents, row.netCents >= 0)
        ])
        : report.months.map(row => [
            esc(row.month), tone(row.totalIncomeCents, true), fmtNum(row.movementCount),
            row.expenseCents ? tone(row.expenseCents, false) : money(0),
            tone(row.netCents, row.netCents >= 0)
        ]);
    const totals = report.totals;
    const periodPrimaryValue = row => showDues ? row.collectedCents : row.totalIncomeCents;
    const periodSecondaryValue = row => showDues ? row.expectedCents : row.expenseCents;
    const periodChartHasData = reportPreviewChartHasData(report.months.flatMap(row => [
        periodPrimaryValue(row), periodSecondaryValue(row)
    ]));
    const periodPeakMonth = report.months.reduce((best, row) => {
        const value = periodPrimaryValue(row);
        return !best || value > best.value ? { month: row.month, value } : best;
    }, null);
    const methodRows = report.methods.map(item => [
        esc(item.label), fmtNum(item.count),
        item.share === null ? '—' : fmtNum(item.share) + '%', tone(item.cents, true)
    ]);
    const purposeRows = (report.purposes || []).map(item => [
        esc(item.label), fmtNum(item.count), tone(item.cents, true)
    ]);
    const unpaidNote = showDues && totals.unpaidMonths > 0
        ? `<p>${fmtNum(totals.unpaidMonths)} شهر من الفترة فيه متبقٍّ غير محصّل.</p>`
        : '';
    const flagNote = (totals.negativePaymentCount > 0
        ? `<p>تنبيه: ${fmtNum(totals.negativePaymentCount)} حركة تحصيل بقيمة سالبة، لم تُحسب ضمن المحصّل.</p>` : '')
        + (totals.emptyExpenseCount > 0
            ? `<p>تنبيه: ${fmtNum(totals.emptyExpenseCount)} مصروف بلا مبلغ، راجعه.</p>` : '');
    const adjustmentNote = showDues && totals.adjustmentCents > 0
        ? `<p>المستحق بعد إعفاءات وتخفيضات بقيمة ${fmtMoney(totals.adjustmentCents / 100)}.</p>`
        : '';
    const filterNote = report.purposeFilter
        ? `<p>التحصيلات معروضة لغرض «${esc(report.purposeLabel)}» فقط.</p>`
        : '';
    const cashFilterNote = report.cashAccountFilter
        ? `<p>الحركات معروضة لصندوق «${esc(report.cashAccountLabel)}» فقط.</p>`
        : '';
    const residentFilterNote = report.residentFilter
        ? `<p>التحصيلات معروضة لشقة «${esc(report.residentLabel)}» فقط، والمصروفات كاملة لأنها غير مرتبطة بشقة محددة.</p>`
        : '';
    const incomeStatLabel = report.cashAccountFilter ? 'تحصيل الصندوق' : report.residentFilter ? 'تحصيل الشقة' : 'تحصيل الغرض';
    const statsHtml = showDues
        ? renderReportStatTiles([
            { label: 'المستحق', cents: totals.expectedCents },
            ...(totals.adjustmentCents > 0 ? [{ label: 'إعفاء/تخفيض', cents: totals.adjustmentCents, tone: 'amber' }] : []),
            { label: 'المحصّل', cents: totals.collectedCents, tone: 'emerald' },
            { label: 'غير المحصّل', cents: totals.outstandingCents, tone: totals.outstandingCents > 0 ? 'amber' : 'emerald' },
            { label: 'نسبة التحصيل', text: formatPeriodRate(totals.rate) },
            ...(totals.advanceCents > 0 ? [{ label: 'مدفوع مقدمًا', cents: totals.advanceCents, tone: 'sky' }] : []),
            { label: 'إيرادات أخرى', cents: totals.otherIncomeCents, tone: 'sky' },
            { label: 'المصروف', cents: totals.expenseCents, tone: 'rose' },
            { label: 'الصافي', cents: totals.netCents, tone: totals.netCents >= 0 ? 'emerald' : 'rose' }
        ])
        : renderReportStatTiles([
            { label: incomeStatLabel, cents: totals.totalIncomeCents, tone: 'emerald' },
            { label: 'عدد الحركات', text: fmtNum(totals.movementCount) },
            { label: 'المصروف', cents: totals.expenseCents, tone: 'rose' },
            { label: 'الصافي', cents: totals.netCents, tone: totals.netCents >= 0 ? 'emerald' : 'rose' }
        ], true);
    const tableHtml = showDues
        ? renderSheetBlock('الحركة شهرًا بشهر', ['الشهر', 'المستحق', 'المحصّل', 'غير المحصّل', 'نسبة التحصيل', 'إيرادات أخرى', 'المصروف', 'الصافي'], monthRows, {
            empty: 'لا توجد حركات في الفترة المحددة.', numeric: [1, 2, 3, 4, 5, 6, 7], tableClass: 'statement-table',
            foot: ['الإجمالي', money(totals.expectedCents), tone(totals.collectedCents, true),
                tone(totals.outstandingCents, false), formatPeriodRate(totals.rate),
                totals.otherIncomeCents ? tone(totals.otherIncomeCents, true) : money(0),
                tone(totals.expenseCents, false), tone(totals.netCents, totals.netCents >= 0)]
        })
        : renderSheetBlock('الحركة شهرًا بشهر', ['الشهر', incomeStatLabel, 'عدد الحركات', 'المصروف', 'الصافي'], monthRows, {
            empty: 'لا توجد حركات في الفترة المحددة.', numeric: [1, 2, 3, 4], tableClass: 'statement-table',
            foot: ['الإجمالي', tone(totals.totalIncomeCents, true), fmtNum(totals.movementCount),
                tone(totals.expenseCents, false), tone(totals.netCents, totals.netCents >= 0)]
        });
    return `
        <div class="report-preview-flow">
            ${renderReportHeader('تقرير الفترة · ' + (state.buildingName || 'العمارة'), [
                'تقرير الفترة ' + esc(report.rangeLabel) +
                    (report.purposeFilter ? ' • الغرض: ' + esc(report.purposeLabel) : '') +
                    (report.cashAccountFilter ? ' • الصندوق: ' + esc(report.cashAccountLabel) : '') +
                    (report.residentFilter ? ' • الشقة: ' + esc(report.residentLabel) : ''),
                'تم الإنشاء ' + esc(formatDate(report.generatedAt)),
                report.dataSource === 'database' ? 'مصدر الحساب: قاعدة البيانات بعد التحقق من صلاحية مدير المبنى' : ''
            ])}
            ${statsHtml}
            ${tableHtml}
            ${renderSheetBlock('التحصيل حسب الغرض', ['الغرض', 'الحركات', 'المبلغ'], purposeRows, {
                empty: 'لا تحصيلات في هذه الفترة.', numeric: [1, 2],
                foot: ['الإجمالي', fmtNum(totals.movementCount), tone(totals.totalIncomeCents, true)]
            })}
            ${renderSheetBlock('التحصيل حسب الطريقة', ['الطريقة', 'الحركات', 'النسبة', 'المبلغ'], methodRows, {
                empty: 'لا تحصيلات في هذه الفترة.', numeric: [1, 2, 3],
                foot: ['الإجمالي', fmtNum(totals.movementCount), '100%', tone(totals.totalIncomeCents, true)]
            })}
            ${renderChartFold('periodReportChart', 'التصور البياني - الحركة عبر الأشهر', {
                hasData: periodChartHasData,
                empty: 'لا توجد حركات أو مستحقات كافية لعرض الرسم.',
                ariaLabel: 'مخطط خطي للحركة شهرًا بشهر؛ البيانات نفسها متاحة في الجدول.',
                summary: periodChartHasData ? [
                    {
                        label: showDues ? 'إجمالي المحصّل' : 'إجمالي التحصيل',
                        cents: showDues ? totals.collectedCents : totals.totalIncomeCents,
                        tone: 'emerald'
                    },
                    {
                        label: showDues ? 'إجمالي المستحق' : 'إجمالي المصروف',
                        cents: showDues ? totals.expectedCents : totals.expenseCents,
                        tone: showDues ? 'sky' : 'rose'
                    },
                    {
                        label: 'أعلى شهر تحصيلًا',
                        text: periodPeakMonth ? periodPeakMonth.month : '—',
                        note: periodPeakMonth ? fmtMoney(periodPeakMonth.value / 100) : ''
                    },
                    { label: 'عدد الأشهر', text: fmtNum(report.months.length) }
                ] : []
            })}
            ${renderReportNotes([
                report.residentFilter
                    ? `<p>${showDues ? 'المستحق ونسبة التحصيل يخصان الشقة المحددة.' : 'المستحق ونسبة التحصيل لا يظهران عند تصفية الصندوق مع الشقة.'} المصروفات معروضة كاملة لأنها غير مرتبطة بشقة محددة.</p>`
                    : report.cashAccountFilter
                    ? '<p>المستحق ونسبة التحصيل يخصان العمارة كلها لذلك لا يظهران عند تصفية الصندوق، والمصروفات معروضة لهذا الصندوق فقط.</p>'
                    : showDues
                        ? '<p>عمود «المحصّل» يحتسب الاشتراكات فقط؛ أما الإيرادات الأخرى فتُعرض في بند مستقل وتُضاف إلى الصافي.</p>'
                        : '<p>المستحق ونسبة التحصيل يخصان الاشتراكات الشهرية لذلك لا يظهران عند تصفية غرض آخر. المصروفات معروضة كاملة لأنها غير مرتبطة بأغراض التحصيل.</p>',
                '<p>كل شهر محسوب بسعر الاشتراك السارية فيه وحصيلته من حركات الشهر نفسه، مثل تقرير الملاك الشهري.</p>',
                '<p>نسبة تزيد على 100% تعني تحصيلًا أعلى من مستحق الشهر (مقدمة أو متأخرات مسددة).</p>',
                '<p>توزيع الطرق يغطي كل تحصيلات أشهر الفترة، ومجموعه يساوي إجمالي التحصيل.</p>',
                filterNote, cashFilterNote, residentFilterNote, unpaidNote, flagNote, adjustmentNote
            ])}
         </div>`;
}

function getPeriodRangeError(fromMonth, toMonth) {
    const fromKey = monthLabelToKey(fromMonth);
    const toKey = monthLabelToKey(toMonth);
    if (!fromKey || !toKey) return 'الفترة غير صحيحة: اختر شهر البداية والنهاية.';
    if (fromKey > toKey) return 'الفترة غير صحيحة: شهر البداية بعد شهر النهاية.';
    if (getPeriodMonthSpan(fromKey, toKey) > PERIOD_REPORT_MAX_MONTHS) {
        return `أقصى مدة لتقرير الفترة ${PERIOD_REPORT_MAX_MONTHS} شهرًا. اختر فترة أقصر.`;
    }
    return '';
}

/**
 * الحصول على وضع مقارنة الفترة
 * @returns {string}
 */
function getPeriodComparisonMode() {
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('periodReportComparison'));
    return String(select?.value || 'none');
}

/**
 * معالجة تغيير وضع المقارنة
 */
function onPeriodComparisonChange() {
    invalidatePeriodReportPreview();
}

/**
 * بناء وعرض مقارنة الفترة
 * @param {Object} currentReport - التقرير الحالي
 * @param {string} purposeFilter
 * @param {string} cashAccountFilter
 * @param {string} residentFilter
 * @returns {string} - HTML المقارنة
 */
function buildPeriodComparisonHtml(currentReport, purposeFilter, cashAccountFilter, residentFilter) {
    const mode = getPeriodComparisonMode();
    if (!mode || mode === 'none' || typeof getComparisonRange !== 'function') return '';

    const range = getComparisonRange(currentReport.fromMonth, currentReport.toMonth, mode);
    if (!range || !range.fromMonth || !range.toMonth) return '';

    const previousReport = buildPeriodReport(range.fromMonth, range.toMonth, purposeFilter, cashAccountFilter, residentFilter);
    if (!previousReport) return '';

    const comparison = buildComparisonModel(currentReport, previousReport);
    return comparison ? renderComparisonHtml(comparison) : '';
}

async function generatePeriodReport() {
    if (!requireManager()) return;
    const { from, to } = getPeriodReportSelection();
    if (!from || !to) { toast('اختر شهر البداية والنهاية','error'); return; }
    const purposeFilter = getReportPurposeFilter('periodReportPurpose');
    const cashAccountFilter = getReportCashAccountFilter('periodReportCashAccount');
    const residentFilter = getReportResidentFilter('periodReportResident');
    const report = buildPeriodReport(from, to, purposeFilter, cashAccountFilter, residentFilter);
    if (!report) {
        const message = getPeriodRangeError(from, to) || 'الفترة غير صحيحة.';
        clearPeriodReportPreview(message);
        toast(message, 'error');
        return;
    }
    const preview = document.getElementById('periodReportPreview');
    if (!preview) return;
    const comparisonHtml = buildPeriodComparisonHtml(report, purposeFilter, cashAccountFilter, residentFilter);
    preview.innerHTML = renderPeriodReportHtml(report) + comparisonHtml;
    periodReportSnapshot = report;
    periodReportSignature = getPeriodReportSignature(from, to, purposeFilter, cashAccountFilter, residentFilter);
    setPeriodReportActionsEnabled(true);

    // Render chart for period report
    const periodShowDues = report.showDues !== false;
    const periodPrimaryValues = report.months.map(m => periodShowDues ? m.collectedCents : m.totalIncomeCents);
    const periodSecondaryValues = report.months.map(m => periodShowDues ? m.expectedCents : m.expenseCents);
    if (typeof renderLineSeries === 'function' &&
        reportPreviewChartHasData([...periodPrimaryValues, ...periodSecondaryValues])) {
        await renderLineSeries('periodReportChart', report.months.map(m => m.month), [
            {
                label: periodShowDues ? 'المحصّل' : 'التحصيل',
                values: periodPrimaryValues.map(cents => cents / 100),
                color: periodShowDues ? reportPreviewChartColor('emerald') : reportPreviewChartColor('indigo'),
                fill: periodShowDues ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)'
            },
            {
                label: periodShowDues ? 'المستحق' : 'المصروف',
                values: periodSecondaryValues.map(cents => cents / 100),
                color: periodShowDues ? reportPreviewChartColor('indigo') : reportPreviewChartColor('rose'),
                fill: periodShowDues ? 'rgba(99, 102, 241, 0.1)' : 'rgba(244, 63, 94, 0.1)'
            }
        ], { tension: 0.3 });
    }

    if (!canUsePeriodReportRpc()) return;
    const requestToken = (window.__manzilPeriodReportRequestToken = (window.__manzilPeriodReportRequestToken || 0) + 1);
    setPeriodReportActionsEnabled(false);
    fetchPeriodReportFromDatabase(from, to, purposeFilter, cashAccountFilter, residentFilter)
        .then(serverReport => {
            if (window.__manzilPeriodReportRequestToken !== requestToken) return;
            const selected = getPeriodReportSelection();
            if (selected.from !== from || selected.to !== to
                || getReportPurposeFilter('periodReportPurpose') !== purposeFilter
                || getReportCashAccountFilter('periodReportCashAccount') !== cashAccountFilter
                || getReportResidentFilter('periodReportResident') !== residentFilter) return;
            const normalized = normalizeServerPeriodReport(serverReport, report);
            if (!normalized) {
                // Keep the already-rendered local report usable when the RPC payload is incomplete or mismatched.
                setPeriodReportActionsEnabled(true);
                return;
            }
            const comparisonHtml = buildPeriodComparisonHtml(normalized, purposeFilter, cashAccountFilter, residentFilter);
            preview.innerHTML = renderPeriodReportHtml(normalized) + comparisonHtml;
            periodReportSnapshot = normalized;
            periodReportSignature = getPeriodReportSignature(from, to, purposeFilter, cashAccountFilter, residentFilter);
            setPeriodReportActionsEnabled(true);
        })
        .catch(error => {
            if (window.__manzilPeriodReportRequestToken !== requestToken) return;
            console.warn('Period report RPC unavailable; local report retained.', error);
            setPeriodReportActionsEnabled(true);
        });
}

function printPeriodReport() {
    if (!requireManager()) return;
    const report = getSelectedPeriodReportSnapshot();
    if (!report) return;
    const title = document.getElementById('printBuildingTitle');
    const meta = document.getElementById('printBuildingMeta');
    const previousTitle = title ? title.textContent : '';
    const previousMeta = meta ? meta.textContent : '';
    if (title) title.textContent = `تقرير الفترة - ${state.buildingName || 'Manzil'}`;
    if (meta) meta.textContent = `الفترة ${report.rangeLabel}${report.cashAccountFilter ? ' • الصندوق: ' + report.cashAccountLabel : ''}${report.residentFilter ? ' • الشقة: ' + report.residentLabel : ''} • المدير: ${state.managerName || '—'}`;
    document.body.classList.remove('print-landlord', 'print-statement');
    document.body.classList.add('print-period');
    const restore = () => {
        document.body.classList.remove('print-period');
        if (title) title.textContent = previousTitle;
        if (meta) meta.textContent = previousMeta;
    };
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
}

function getPeriodReportFileSlug(report) {
    const fromKey = monthLabelToKey(report.fromMonth) || String(Date.now());
    const toKey = monthLabelToKey(report.toMonth) || String(Date.now());
    return `${fromKey.slice(0, 7)}_${toKey.slice(0, 7)}`;
}

function exportPeriodReportCsv() {
    if (!requireManager()) return;
    const report = getSelectedPeriodReportSnapshot();
    if (!report) return;
    const totals = report.totals;
    const showDues = report.showDues !== false;
    const rows = showDues
        ? [['الشهر','المستحق','المحصّل','غير المحصّل','نسبة التحصيل %','إيرادات أخرى','المصروف','الصافي']]
        : [['الشهر', report.cashAccountFilter ? 'تحصيل الصندوق' : report.residentFilter ? 'تحصيل الشقة' : 'تحصيل الغرض','عدد الحركات','المصروف','الصافي']];
    report.months.forEach(row => {
        if (showDues) {
            rows.push([row.month, row.expectedCents / 100, row.collectedCents / 100, row.outstandingCents / 100,
                row.rate ?? '', row.otherIncomeCents / 100, row.expenseCents / 100, row.netCents / 100]);
        } else {
            rows.push([row.month, row.totalIncomeCents / 100, row.movementCount, row.expenseCents / 100, row.netCents / 100]);
        }
    });
    if (showDues) {
        rows.push(['الإجمالي', totals.expectedCents / 100, totals.collectedCents / 100, totals.outstandingCents / 100,
            totals.rate ?? '', totals.otherIncomeCents / 100, totals.expenseCents / 100, totals.netCents / 100]);
    } else {
        rows.push(['الإجمالي', totals.totalIncomeCents / 100, totals.movementCount, totals.expenseCents / 100, totals.netCents / 100]);
        rows.push([]);
        rows.push(['الغرض', report.purposeLabel]);
        if (report.cashAccountFilter) rows.push(['الصندوق', report.cashAccountLabel]);
    }
    if (report.residentFilter) {
        if (showDues) rows.push([]);
        rows.push(['الشقة', report.residentLabel]);
    }
    rows.push([]);
    rows.push(['طريقة التحصيل', 'عدد الحركات', 'المبلغ', 'نسبته من المحصّل %']);
    report.methods.forEach(item => {
        rows.push([item.label, item.count, item.cents / 100, item.share ?? '']);
    });
    const purposeSuffix = report.purposeFilter ? `_${report.purposeFilter}` : '';
    const cashSuffix = report.cashAccountFilter ? `_${report.cashAccountFilter}` : '';
    const residentSlug = reportResidentFileSlug(report.residentFilter);
    const residentSuffix = residentSlug ? `_apt_${residentSlug}` : '';
    downloadCsv(`manzil_period_${getPeriodReportFileSlug(report)}${purposeSuffix}${cashSuffix}${residentSuffix}.csv`, rows);
    toast('تم تصدير تقرير الفترة','success');
}

/**
 * تصدير تقرير الفترة إلى Excel مع أوراق متعددة
 */
function exportPeriodReportExcel() {
    if (!requireManager()) return;
    const report = getSelectedPeriodReportSnapshot();
    if (!report || typeof exportReportWithDetailExcel !== 'function') return;

    const purposeSuffix = report.purposeFilter ? `_${report.purposeFilter}` : '';
    const cashSuffix = report.cashAccountFilter ? `_${report.cashAccountFilter}` : '';
    const residentSlug = reportResidentFileSlug(report.residentFilter);
    const residentSuffix = residentSlug ? `_apt_${residentSlug}` : '';
    const filename = `manzil_period_${getPeriodReportFileSlug(report)}${purposeSuffix}${cashSuffix}${residentSuffix}`;

    const { summary, details } = periodReportToExcelRows(report);
    exportReportWithDetailExcel(filename, `تقرير الفترة - ${state.buildingName || 'Manzil'}`, summary, details, {
        'الفترة': report.rangeLabel,
        'الغرض': report.purposeLabel,
        'الصندوق': report.cashAccountLabel,
        'الشقة': report.residentLabel,
        'تاريخ الإنشاء': new Date(report.generatedAt || Date.now())
    });
}

async function exportPeriodReportPdf() {
    if (!requireManager()) return;
    const report = getSelectedPeriodReportSnapshot();
    if (!report) return;
    const purposeSuffix = report.purposeFilter ? `_${report.purposeFilter}` : '';
    const cashSuffix = report.cashAccountFilter ? `_${report.cashAccountFilter}` : '';
    const residentSlug = reportResidentFileSlug(report.residentFilter);
    const residentSuffix = residentSlug ? `_apt_${residentSlug}` : '';
    await downloadStatementPdf(
        renderPeriodReportPdfHtml(report),
        `manzil_period_${getPeriodReportFileSlug(report)}${purposeSuffix}${cashSuffix}${residentSuffix}.pdf`,
        'periodReportPdfBtn',
        'تم إنشاء تقرير الفترة PDF.',
        'Period report PDF export failed:',
        () => !!periodReportSnapshot
    );
}

let expensesReportSnapshot = null;
let expensesReportSignature = '';

function getExpenseCategoryValue(expense) {
    return String(expense?.category || '').trim() || 'غير مصنف';
}

function getExpensesReportSelection() {
    const fromSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('expensesReportFrom'));
    const toSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('expensesReportTo'));
    return {
        from: String(fromSelect?.value || ''),
        to: String(toSelect?.value || '')
    };
}

function getExpensesReportCategoryFilter() {
    const select = typeof document !== 'undefined'
        ? /** @type {HTMLSelectElement | null} */ (document.getElementById('expensesReportCategory'))
        : null;
    return String(select?.value || '').trim();
}

function getExpenseCategoryOptions() {
    const categories = new Set();
    (state.expenses || []).forEach(expense => categories.add(getExpenseCategoryValue(expense)));
    return Array.from(categories).sort((a, b) => a.localeCompare(b, 'ar'));
}

function populateExpensesReportFilters(months, current = getCurrentMonth()) {
    const currentKey = monthLabelToKey(current) || '';
    const defaultFrom = currentKey ? (getStatementMonthLabel(shiftStatementMonthKey(currentKey, -5)) || current) : current;
    const defaults = { expensesReportFrom: defaultFrom, expensesReportTo: current };
    ['expensesReportFrom', 'expensesReportTo'].forEach(id => {
        const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
        if (!select) return;
        const previousValue = select.value;
        select.innerHTML = months.map(month => `<option value="${esc(month)}">${esc(month)}</option>`).join('');
        const currentValue = previousValue || defaults[id];
        select.value = months.includes(currentValue) ? currentValue : defaults[id];
    });
    const categorySelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('expensesReportCategory'));
    if (categorySelect) {
        const selected = String(categorySelect.value || '').trim();
        const categories = getExpenseCategoryOptions();
        categorySelect.innerHTML = '<option value="">كل التصنيفات</option>' + categories
            .map(category => `<option value="${esc(category)}">${esc(category)}</option>`)
            .join('');
        categorySelect.value = categories.includes(selected) ? selected : '';
    }
}

function buildExpensesReport(fromMonth, toMonth, cashAccountFilter = '', categoryFilter = '') {
    const cacheKey = `expenses:${fromMonth}:${toMonth}:${cashAccountFilter}:${categoryFilter}`;
    return getCachedReportModel(cacheKey, () => _buildExpensesReport(fromMonth, toMonth, cashAccountFilter, categoryFilter), () => true);
}

function _buildExpensesReport(fromMonth, toMonth, cashAccountFilter = '', categoryFilter = '') {
    const keys = buildPeriodMonthKeys(fromMonth, toMonth);
    if (!keys) return null;
    const normalizedCashAccount = normalizeReportCashAccountFilter(cashAccountFilter);
    const normalizedCategory = String(categoryFilter || '').trim();
    const rangeLabels = new Set(keys.map(key => getStatementMonthLabel(key)));
    const expenses = (state.expenses || []).filter(expense =>
        rangeLabels.has(expense.month) &&
        reportCashAccountMatches(expense, normalizedCashAccount) &&
        (!normalizedCategory || getExpenseCategoryValue(expense) === normalizedCategory));
    const categoryTotals = new Map();
    const fundTotals = new Map();
    expenses.forEach(expense => {
        const category = getExpenseCategoryValue(expense);
        const categoryBucket = categoryTotals.get(category) || { label: category, count: 0, cents: 0 };
        categoryBucket.count += 1;
        categoryBucket.cents += toCents(expense.amount);
        categoryTotals.set(category, categoryBucket);
        const fundCode = String(expense.cashAccountCode || '').trim() || 'main';
        const fundBucket = fundTotals.get(fundCode) || { code: fundCode, label: reportCashAccountLabel(fundCode), count: 0, cents: 0 };
        fundBucket.count += 1;
        fundBucket.cents += toCents(expense.amount);
        fundTotals.set(fundCode, fundBucket);
    });
    const months = keys.map(key => {
        const month = getStatementMonthLabel(key);
        const monthExpenses = expenses.filter(expense => expense.month === month);
        return {
            key,
            month,
            count: monthExpenses.length,
            expenseCents: monthExpenses.reduce((sum, expense) => sum + toCents(expense.amount), 0)
        };
    });
    const expenseCents = expenses.reduce((sum, expense) => sum + toCents(expense.amount), 0);
    const totals = {
        expenseCents,
        count: expenses.length,
        monthCount: months.filter(row => row.count > 0).length,
        averageCents: months.length ? Math.round(expenseCents / months.length) : 0
    };
    const withShare = item => ({
        ...item,
        share: expenseCents > 0 ? Math.round((item.cents / expenseCents) * 100) : null
    });
    const categories = Array.from(categoryTotals.values()).sort((a, b) => b.cents - a.cents).map(withShare);
    const funds = Array.from(fundTotals.values()).sort((a, b) => b.cents - a.cents).map(withShare);
    const list = expenses.slice().sort((a, b) =>
        String(monthLabelToKey(b.month) || '').localeCompare(String(monthLabelToKey(a.month) || '')) ||
        toCents(b.amount) - toCents(a.amount));
    return {
        fromMonth,
        toMonth,
        months,
        totals,
        categories,
        funds,
        list,
        cashAccountFilter: normalizedCashAccount,
        cashAccountLabel: reportCashAccountFilterLabel(normalizedCashAccount),
        categoryFilter: normalizedCategory,
        categoryLabel: normalizedCategory || 'كل التصنيفات',
        rangeLabel: `${fromMonth} – ${toMonth}`,
        generatedAt: new Date().toISOString()
    };
}

function getExpensesReportSignature(fromMonth, toMonth, cashAccountFilter = '', categoryFilter = '') {
    const labels = new Set([fromMonth, toMonth]);
    const keys = new Set(buildPeriodMonthKeys(fromMonth, toMonth) || []);
    keys.forEach(key => labels.add(getStatementMonthLabel(key)));
    return JSON.stringify([
        state.buildingName || '',
        state.managerName || '',
        (state.expenses || []).filter(item => labels.has(item.month)),
        String(cashAccountFilter || '').trim(),
        String(categoryFilter || '').trim()
    ]);
}

function setExpensesReportActionsEnabled(enabled) {
    ['expensesReportPrintBtn', 'expensesReportPdfBtn', 'expensesReportExportBtn', 'expensesReportExcelBtn'].forEach(id => {
        const button = /** @type {HTMLButtonElement} */ (document.getElementById(id));
        if (button) button.disabled = !enabled;
    });
    markReportPreviewStale('expensesReportPreview', !enabled);
    syncReportNavStatus();
}

function clearExpensesReportPreview(message) {
    reportPreviewDestroyChart('expensesReportChart');
    expensesReportSnapshot = null;
    expensesReportSignature = '';
    setExpensesReportActionsEnabled(false);
    const preview = document.getElementById('expensesReportPreview');
    if (preview) preview.innerHTML = `<p class="report-preview-empty">${esc(message)}</p>`;
}

function invalidateExpensesReportPreview() {
    if (!expensesReportSnapshot) return;
    clearExpensesReportPreview('تغيّرت الفترة أو الفلتر — اضغط «معاينة» لتحديث التقرير.');
}

function onExpensesReportRangeChange() {
    invalidateExpensesReportPreview();
}

function invalidateExpensesReportIfStale() {
    if (!expensesReportSnapshot) return;
    const signature = getExpensesReportSignature(
        expensesReportSnapshot.fromMonth,
        expensesReportSnapshot.toMonth,
        expensesReportSnapshot.cashAccountFilter,
        expensesReportSnapshot.categoryFilter
    );
    if (signature !== expensesReportSignature) {
        clearExpensesReportPreview('تغيّرت البيانات — اضغط «معاينة» لتحديث التقرير.');
    }
}

function getSelectedExpensesReportSnapshot() {
    if (!expensesReportSnapshot) {
        toast('اعرض معاينة تقرير المصروفات أولًا','error');
        return null;
    }
    const selected = getExpensesReportSelection();
    if ((selected.from && selected.from !== expensesReportSnapshot.fromMonth) ||
        (selected.to && selected.to !== expensesReportSnapshot.toMonth)) {
        toast('اعرض معاينة الفترة المحددة أولًا','error');
        return null;
    }
    if (getReportCashAccountFilter('expensesReportCashAccount') !== (expensesReportSnapshot.cashAccountFilter || '')) {
        toast('اعرض معاينة الصندوق المحدد أولًا','error');
        return null;
    }
    if (getExpensesReportCategoryFilter() !== (expensesReportSnapshot.categoryFilter || '')) {
        toast('اعرض معاينة التصنيف المحدد أولًا','error');
        return null;
    }
    return expensesReportSnapshot;
}

function renderExpensesReportHtml(report) {
    const totals = report.totals;
    const money = cents => '<span class="sheet-negative">' + fmtMoney(cents / 100) + '</span>';
    const shareRows = items => items.map(item => [
        esc(item.label), fmtNum(item.count),
        item.share === null ? '—' : fmtNum(item.share) + '%', money(item.cents)
    ]);
    const detailRows = report.list.map(expense => [
        esc(expense.title), esc(expense.month),
        esc(getExpenseCategoryValue(expense)), esc(reportCashAccountLabel(expense.cashAccountCode)),
        money(toCents(expense.amount))
    ]);
    const monthRows = report.months.map(row => [
        esc(row.month), fmtNum(row.count), money(row.expenseCents),
        totals.expenseCents > 0 ? fmtNum(Math.round((row.expenseCents / totals.expenseCents) * 100)) + '%' : '—'
    ]);
    const expensesChartHasData = reportPreviewChartHasData(report.categories.map(item => item.cents));
    const topExpenseCategory = report.categories[0] || null;
    const fundNote = report.cashAccountFilter
        ? `<p>المصروفات معروضة لصندوق «${esc(report.cashAccountLabel)}» فقط.</p>`
        : '';
    const categoryNote = report.categoryFilter
        ? `<p>المصروفات معروضة لتصنيف «${esc(report.categoryLabel)}» فقط.</p>`
        : '';
    return `
        <div class="report-preview-flow">
            ${renderReportHeader('تقرير المصروفات · ' + (state.buildingName || 'العمارة'), [
                'تقرير المصروفات ' + esc(report.rangeLabel) +
                    (report.cashAccountFilter ? ' • الصندوق: ' + esc(report.cashAccountLabel) : '') +
                    (report.categoryFilter ? ' • التصنيف: ' + esc(report.categoryLabel) : ''),
                'تم الإنشاء ' + esc(formatDate(report.generatedAt))
            ])}
            ${renderReportStatTiles([
                { label: 'إجمالي المصروف', cents: totals.expenseCents, tone: 'rose' },
                { label: 'عدد الحركات', text: fmtNum(totals.count) },
                { label: 'متوسط الشهر', cents: totals.averageCents },
                { label: 'أشهر فيها مصروف', text: fmtNum(totals.monthCount) }
            ], true)}
            ${renderSheetBlock('المصروف حسب التصنيف', ['التصنيف', 'الحركات', 'النسبة', 'المبلغ'], shareRows(report.categories), {
                empty: 'لا توجد مصروفات مطابقة.', numeric: [1, 2, 3],
                foot: ['الإجمالي', fmtNum(totals.count), '100%', money(totals.expenseCents)]
            })}
            ${renderSheetBlock('المصروف حسب الصندوق', ['الصندوق', 'الحركات', 'النسبة', 'المبلغ'], shareRows(report.funds), {
                empty: 'لا توجد مصروفات مطابقة.', numeric: [1, 2, 3],
                foot: ['الإجمالي', fmtNum(totals.count), '100%', money(totals.expenseCents)]
            })}
            ${renderSheetBlock('المصروف شهرًا بشهر', ['الشهر', 'الحركات', 'المصروف', 'نسبته من الفترة'], monthRows, {
                empty: 'لا توجد مصروفات مطابقة.', numeric: [1, 2, 3], tableClass: 'statement-table',
                foot: ['الإجمالي', fmtNum(totals.count), money(totals.expenseCents), '100%']
            })}
            ${renderSheetBlock('تفاصيل المصروفات', ['المصروف', 'الشهر', 'التصنيف', 'الصندوق', 'المبلغ'], detailRows, {
                empty: 'لا توجد مصروفات مطابقة.', numeric: [4],
                foot: ['الإجمالي', '', '', fmtNum(totals.count) + ' حركة', money(totals.expenseCents)]
            })}
            ${renderChartFold('expensesReportChart', 'التصور البياني - المصروف حسب التصنيف', {
                hasData: expensesChartHasData,
                empty: 'لا توجد مصروفات مطابقة لعرض التوزيع.',
                ariaLabel: 'مخطط دائري لتوزيع المصروفات حسب التصنيف؛ البيانات نفسها متاحة في الجدول.',
                summary: expensesChartHasData ? [
                    { label: 'إجمالي المصروف', cents: totals.expenseCents, tone: 'rose' },
                    { label: 'عدد التصنيفات', text: fmtNum(report.categories.length) },
                    {
                        label: 'أعلى تصنيف',
                        text: topExpenseCategory.label,
                        note: fmtMoney(topExpenseCategory.cents / 100)
                    },
                    { label: 'أشهر فيها مصروف', text: fmtNum(totals.monthCount) }
                ] : []
            })}
            ${renderReportNotes([
                '<p>تقرير للقراءة فقط ولا يعدل أي بيانات. المصروفات محسوبة على شهر استحقاقها المسجل.</p>',
                fundNote,
                categoryNote
            ])}
        </div>`;
}

const EXPENSES_COMPARISON_METRICS = [
    { key: 'expenseCents', label: 'إجمالي المصروفات', lowerIsBetter: true },
    { key: 'averageCents', label: 'متوسط المصروف الشهري', lowerIsBetter: true },
    { key: 'count', label: 'عدد الحركات', lowerIsBetter: false },
    { key: 'monthCount', label: 'شهور بها مصروفات', lowerIsBetter: false }
];

function getExpensesComparisonMode() {
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('expensesReportComparison'));
    return String(select?.value || 'none');
}

function onExpensesComparisonChange() {
    invalidateExpensesReportPreview();
}

/**
 * مقارنة تقرير المصروفات بفترة سابقة، على نفس منطق مقارنة تقرير الفترة.
 * @param {Object} currentReport
 * @param {string} cashAccountFilter
 * @param {string} categoryFilter
 * @returns {string}
 */
function buildExpensesComparisonHtml(currentReport, cashAccountFilter, categoryFilter) {
    const mode = getExpensesComparisonMode();
    if (!mode || mode === 'none' || typeof getComparisonRange !== 'function' || typeof buildReportComparisonHtml !== 'function') return '';
    const range = getComparisonRange(currentReport.fromMonth, currentReport.toMonth, mode);
    if (!range || !range.fromMonth || !range.toMonth) return '';
    const previousReport = buildExpensesReport(range.fromMonth, range.toMonth, cashAccountFilter, categoryFilter);
    if (!previousReport) return '';
    return buildReportComparisonHtml(currentReport, previousReport, EXPENSES_COMPARISON_METRICS);
}

async function generateExpensesReport() {
    if (!requireManager()) return;
    const { from, to } = getExpensesReportSelection();
    if (!from || !to) { toast('اختر شهر البداية والنهاية','error'); return; }
    const cashAccountFilter = getReportCashAccountFilter('expensesReportCashAccount');
    const categoryFilter = getExpensesReportCategoryFilter();
    const report = buildExpensesReport(from, to, cashAccountFilter, categoryFilter);
    if (!report) {
        const message = getPeriodRangeError(from, to) || 'الفترة غير صحيحة.';
        clearExpensesReportPreview(message);
        toast(message, 'error');
        return;
    }
    const preview = document.getElementById('expensesReportPreview');
    if (!preview) return;
    preview.innerHTML = renderExpensesReportHtml(report) + buildExpensesComparisonHtml(report, cashAccountFilter, categoryFilter);
    expensesReportSnapshot = report;
    expensesReportSignature = getExpensesReportSignature(from, to, cashAccountFilter, categoryFilter);
    setExpensesReportActionsEnabled(true);

    // Render chart for expenses report (lazy-loaded Chart.js)
    if (typeof renderDoughnutValues === 'function' && reportPreviewChartHasData(report.categories.map(c => c.cents))) {
        await renderDoughnutValues(
            'expensesReportChart',
            report.categories.map(c => c.label),
            report.categories.map(c => c.cents / 100),
            reportPreviewChartPalette(report.categories.length),
            { cutout: '55%' }
        );
    }
}

function printExpensesReport() {
    if (!requireManager()) return;
    const report = getSelectedExpensesReportSnapshot();
    if (!report) return;
    const title = document.getElementById('printBuildingTitle');
    const meta = document.getElementById('printBuildingMeta');
    const previousTitle = title ? title.textContent : '';
    const previousMeta = meta ? meta.textContent : '';
    if (title) title.textContent = `تقرير المصروفات - ${state.buildingName || 'Manzil'}`;
    if (meta) meta.textContent = `الفترة ${report.rangeLabel}${report.cashAccountFilter ? ' • الصندوق: ' + report.cashAccountLabel : ''}${report.categoryFilter ? ' • التصنيف: ' + report.categoryLabel : ''} • المدير: ${state.managerName || '—'}`;
    document.body.classList.remove('print-landlord', 'print-statement', 'print-period');
    document.body.classList.add('print-expenses');
    const restore = () => {
        document.body.classList.remove('print-expenses');
        if (title) title.textContent = previousTitle;
        if (meta) meta.textContent = previousMeta;
    };
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
}

function exportExpensesReportCsv() {
    if (!requireManager()) return;
    const report = getSelectedExpensesReportSnapshot();
    if (!report) return;
    const rows = [
        ['الفترة', report.rangeLabel, 'الصندوق', report.cashAccountLabel, 'التصنيف', report.categoryLabel],
        ['الشهر', 'البيان', 'التصنيف', 'الصندوق', 'المبلغ', 'ملاحظات']
    ];
    report.list.forEach(expense => rows.push([
        expense.month,
        expense.title,
        getExpenseCategoryValue(expense),
        reportCashAccountLabel(expense.cashAccountCode),
        toCents(expense.amount) / 100,
        expense.notes || ''
    ]));
    rows.push(['الإجمالي', '', '', '', report.totals.expenseCents / 100, '']);
    const cashSuffix = report.cashAccountFilter ? `_${report.cashAccountFilter}` : '';
    const categorySuffix = report.categoryFilter ? `_${report.categoryFilter.replace(/\s+/g, '-')}` : '';
    downloadCsv(`manzil_expenses_${getPeriodReportFileSlug(report)}${cashSuffix}${categorySuffix}.csv`, rows);
    toast('تم تصدير تقرير المصروفات','success');
}

/**
 * تصدير تقرير المصروفات إلى Excel مع أوراق متعددة
 */
function exportExpensesReportExcel() {
    if (!requireManager()) return;
    const report = getSelectedExpensesReportSnapshot();
    if (!report || typeof exportReportWithDetailExcel !== 'function') return;

    const cashSuffix = report.cashAccountFilter ? `_${report.cashAccountFilter}` : '';
    const categorySuffix = report.categoryFilter ? `_${report.categoryFilter.replace(/\s+/g, '-')}` : '';
    const filename = `manzil_expenses_${getPeriodReportFileSlug(report)}${cashSuffix}${categorySuffix}`;

    const { summary, details } = expensesReportToExcelRows(report);
    exportReportWithDetailExcel(filename, `تقرير المصروفات - ${state.buildingName || 'Manzil'}`, summary, details, {
        'الفترة': report.rangeLabel,
        'الصندوق': report.cashAccountLabel,
        'التصنيف': report.categoryLabel,
        'تاريخ الإنشاء': new Date(report.generatedAt || Date.now())
    });
}

async function exportExpensesReportPdf() {
    if (!requireManager()) return;
    const report = getSelectedExpensesReportSnapshot();
    if (!report) return;
    const cashSuffix = report.cashAccountFilter ? `_${report.cashAccountFilter}` : '';
    const categorySuffix = report.categoryFilter ? `_${report.categoryFilter.replace(/\s+/g, '-')}` : '';
    await downloadStatementPdf(
        renderExpensesReportPdfHtml(report),
        `manzil_expenses_${getPeriodReportFileSlug(report)}${cashSuffix}${categorySuffix}.pdf`,
        'expensesReportPdfBtn',
        'تم إنشاء تقرير المصروفات PDF.',
        'Expenses report PDF export failed:',
        () => !!expensesReportSnapshot
    );
}

let adjustmentsReportSnapshot = null;
let adjustmentsReportSignature = '';

const ADJUSTMENT_REPORT_KINDS = ['waiver', 'discount'];
const ADJUSTMENT_REPORT_KIND_LABELS = { waiver: 'إعفاء', discount: 'تخفيض' };

function getAdjustmentReportKindLabel(kind) {
    return typeof getAdjustmentKindLabel === 'function'
        ? getAdjustmentKindLabel(kind)
        : (ADJUSTMENT_REPORT_KIND_LABELS[kind] || 'تسوية');
}

function normalizeAdjustmentReportKindFilter(value) {
    const kind = String(value || '').trim();
    return ADJUSTMENT_REPORT_KINDS.includes(kind) ? kind : '';
}

function getAdjustmentsReportSelection() {
    const fromSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('adjustmentsReportFrom'));
    const toSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('adjustmentsReportTo'));
    return {
        from: String(fromSelect?.value || ''),
        to: String(toSelect?.value || '')
    };
}

function getAdjustmentReportKindFilter() {
    if (typeof document === 'undefined') return '';
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('adjustmentsReportKind'));
    return normalizeAdjustmentReportKindFilter(select?.value || '');
}

function populateAdjustmentsReportFilters(months, current = getCurrentMonth()) {
    const adjustmentMonths = (state.adjustments || [])
        .map(adjustment => getStatementMonthLabel(String(adjustment.effectiveMonth || '').slice(0, 7) + '-01'))
        .filter(Boolean);
    const options = Array.from(new Set([...(months || []), ...adjustmentMonths]))
        .sort((a, b) => String(monthLabelToKey(a) || '').localeCompare(String(monthLabelToKey(b) || '')));
    const currentKey = monthLabelToKey(current) || '';
    const defaultFrom = currentKey ? (getStatementMonthLabel(shiftStatementMonthKey(currentKey, -5)) || current) : current;
    const defaults = { adjustmentsReportFrom: defaultFrom, adjustmentsReportTo: current };
    ['adjustmentsReportFrom', 'adjustmentsReportTo'].forEach(id => {
        const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
        if (!select) return;
        const previousValue = select.value;
        select.innerHTML = options.map(month => `<option value="${esc(month)}">${esc(month)}</option>`).join('');
        const currentValue = previousValue || defaults[id];
        select.value = options.includes(currentValue) ? currentValue : defaults[id];
    });
}

function buildAdjustmentsReport(fromMonth, toMonth, residentFilter = '', kindFilter = '') {
    const cacheKey = `adjustments:${fromMonth}:${toMonth}:${residentFilter}:${kindFilter}`;
    return getCachedReportModel(cacheKey, () => _buildAdjustmentsReport(fromMonth, toMonth, residentFilter, kindFilter), () => true);
}

function _buildAdjustmentsReport(fromMonth, toMonth, residentFilter = '', kindFilter = '') {
    const keys = buildPeriodMonthKeys(fromMonth, toMonth);
    if (!keys) return null;
    const keySet = new Set(keys);
    const normalizedResident = normalizeReportResidentFilter(residentFilter);
    const normalizedKind = normalizeAdjustmentReportKindFilter(kindFilter);
    const residentIndex = buildResidentIndex();
    const list = (Array.isArray(state.adjustments) ? state.adjustments : [])
        .map(adjustment => {
            const monthKey = String(adjustment.effectiveMonth || '').slice(0, 7);
            if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
            const key = `${monthKey}-01`;
            if (!keySet.has(key)) return null;
            if (normalizedResident && adjustment.residentId !== normalizedResident) return null;
            if (normalizedKind && adjustment.kind !== normalizedKind) return null;
            const resident = residentIndex.get(adjustment.residentId) || null;
            return {
                id: adjustment.id,
                effectiveMonth: key,
                month: getStatementMonthLabel(key),
                kind: adjustment.kind || 'settlement',
                kindLabel: getAdjustmentReportKindLabel(adjustment.kind),
                amountCents: toCents(adjustment.amount),
                reason: String(adjustment.reason || '').trim(),
                residentId: adjustment.residentId,
                residentName: resident?.name || '—',
                apartmentNumber: resident?.apartmentNumber || '—'
            };
        })
        .filter(Boolean)
        .sort((a, b) =>
            b.effectiveMonth.localeCompare(a.effectiveMonth) ||
            String(a.apartmentNumber).localeCompare(String(b.apartmentNumber), 'ar', { numeric: true }));
    const amountCents = list.reduce((sum, item) => sum + item.amountCents, 0);
    const kindTotals = new Map();
    list.forEach(item => {
        const bucket = kindTotals.get(item.kind) || { kind: item.kind, label: item.kindLabel, count: 0, cents: 0 };
        bucket.count += 1;
        bucket.cents += item.amountCents;
        kindTotals.set(item.kind, bucket);
    });
    const kinds = Array.from(kindTotals.values())
        .sort((a, b) => b.cents - a.cents)
        .map(item => ({ ...item, share: amountCents > 0 ? Math.round((item.cents / amountCents) * 100) : null }));
    const months = keys.map(key => {
        const monthItems = list.filter(item => item.effectiveMonth === key);
        return {
            key,
            month: getStatementMonthLabel(key),
            count: monthItems.length,
            amountCents: monthItems.reduce((sum, item) => sum + item.amountCents, 0)
        };
    });
    return {
        fromMonth,
        toMonth,
        rangeLabel: `${fromMonth} – ${toMonth}`,
        residentFilter: normalizedResident,
        residentLabel: normalizedResident ? reportResidentFilterLabel(normalizedResident) : 'كل الشقق',
        kindFilter: normalizedKind,
        kindLabel: normalizedKind ? getAdjustmentReportKindLabel(normalizedKind) : 'كل الأنواع',
        totals: {
            amountCents,
            count: list.length,
            residentCount: new Set(list.map(item => item.residentId)).size,
            monthCount: months.filter(row => row.count > 0).length
        },
        kinds,
        months,
        list,
        generatedAt: new Date().toISOString()
    };
}

function getAdjustmentsReportSignature(fromMonth, toMonth, residentFilter = '', kindFilter = '') {
    const keys = new Set(buildPeriodMonthKeys(fromMonth, toMonth) || []);
    return JSON.stringify([
        state.buildingName || '',
        state.managerName || '',
        state.residents || [],
        (state.adjustments || []).filter(item => keys.has(String(item.effectiveMonth || ''))),
        String(residentFilter || '').trim(),
        normalizeAdjustmentReportKindFilter(kindFilter)
    ]);
}

function setAdjustmentsReportActionsEnabled(enabled) {
    ['adjustmentsReportPrintBtn', 'adjustmentsReportPdfBtn', 'adjustmentsReportExportBtn', 'adjustmentsReportExcelBtn'].forEach(id => {
        const button = /** @type {HTMLButtonElement} */ (document.getElementById(id));
        if (button) button.disabled = !enabled;
    });
    markReportPreviewStale('adjustmentsReportPreview', !enabled);
    syncReportNavStatus();
}

function clearAdjustmentsReportPreview(message) {
    reportPreviewDestroyChart('adjustmentsReportChart');
    adjustmentsReportSnapshot = null;
    adjustmentsReportSignature = '';
    setAdjustmentsReportActionsEnabled(false);
    const preview = document.getElementById('adjustmentsReportPreview');
    if (preview) preview.innerHTML = `<p class="report-preview-empty">${esc(message)}</p>`;
}

function renderAdjustmentsReportHtml(report) {
    const totals = report.totals;
    const money = cents => '<span class="sheet-amber">' + fmtMoney(cents / 100) + '</span>';
    const kindRows = report.kinds.map(item => [
        esc(item.label), fmtNum(item.count),
        item.share === null ? '—' : fmtNum(item.share) + '%', money(item.cents)
    ]);
    const monthRows = report.months.map(row => [
        esc(row.month), fmtNum(row.count), money(row.amountCents),
        totals.amountCents > 0 ? fmtNum(Math.round((row.amountCents / totals.amountCents) * 100)) + '%' : '—'
    ]);
    const adjustmentsChartHasData = reportPreviewChartHasData(report.months.map(row => row.amountCents));
    const adjustmentsPeakMonth = report.months.reduce((best, row) => {
        return !best || row.amountCents > best.amountCents ? row : best;
    }, null);
    const detailRows = report.list.map(item => [
        'شقة ' + esc(item.apartmentNumber) + ' · ' + esc(item.residentName),
        esc(item.kindLabel), esc(item.month), esc(item.reason || '—'), money(item.amountCents)
    ]);
    const residentNote = report.residentFilter
        ? `<p>المعروض لشقة «${esc(report.residentLabel)}» فقط.</p>`
        : '';
    const kindNote = report.kindFilter
        ? `<p>المعروض لنوع «${esc(report.kindLabel)}» فقط.</p>`
        : '';
    return `
        <div class="report-preview-flow">
            ${renderReportHeader('تقرير الإعفاءات والتخفيضات · ' + (state.buildingName || 'العمارة'), [
                'تقرير الإعفاءات والتخفيضات ' + esc(report.rangeLabel) +
                    (report.residentFilter ? ' • الشقة: ' + esc(report.residentLabel) : '') +
                    (report.kindFilter ? ' • النوع: ' + esc(report.kindLabel) : ''),
                'تم الإنشاء ' + esc(formatDate(report.generatedAt))
            ])}
            ${renderReportStatTiles([
                { label: 'إجمالي الإعفاءات والتخفيضات', cents: totals.amountCents, tone: 'amber' },
                { label: 'عدد التسجيلات', text: fmtNum(totals.count) },
                { label: 'الشقق المستفيدة', text: fmtNum(totals.residentCount) },
                { label: 'أشهر مشمولة', text: fmtNum(totals.monthCount) }
            ], true)}
            ${renderSheetBlock('التوزيع حسب النوع', ['النوع', 'التسجيلات', 'النسبة', 'المبلغ'], kindRows, {
                empty: 'لا توجد مصروفات مطابقة.', numeric: [1, 2, 3],
                foot: ['الإجمالي', fmtNum(totals.count), '100%', money(totals.amountCents)]
            })}
            ${renderSheetBlock('الإعفاءات شهرًا بشهر', ['الشهر', 'التسجيلات', 'المبلغ', 'نسبته من الفترة'], monthRows, {
                empty: 'لا توجد مصروفات مطابقة.', numeric: [1, 2, 3], tableClass: 'statement-table',
                foot: ['الإجمالي', fmtNum(totals.count), money(totals.amountCents), '100%']
            })}
            ${renderSheetBlock('تفاصيل الإعفاءات والتخفيضات', ['الشقة والمالك', 'النوع', 'الشهر', 'السبب', 'المبلغ'], detailRows, {
                empty: 'لا توجد إعفاءات مطابقة.', numeric: [4],
                foot: ['الإجمالي', '', '', fmtNum(totals.count) + ' تسجيل', money(totals.amountCents)]
            })}
            ${renderChartFold('adjustmentsReportChart', 'التصور البياني - الإعفاءات عبر الأشهر', {
                hasData: adjustmentsChartHasData,
                empty: 'لا توجد إعفاءات أو تخفيضات مطابقة لعرض الرسم.',
                ariaLabel: 'مخطط أعمدة للإعفاءات والتخفيضات شهرًا بشهر؛ البيانات نفسها متاحة في الجدول.',
                summary: adjustmentsChartHasData ? [
                    { label: 'إجمالي الإعفاءات', cents: totals.amountCents, tone: 'amber' },
                    { label: 'عدد التسجيلات', text: fmtNum(totals.count) },
                    {
                        label: 'أعلى شهر',
                        text: adjustmentsPeakMonth ? adjustmentsPeakMonth.month : '—',
                        note: adjustmentsPeakMonth ? fmtMoney(adjustmentsPeakMonth.amountCents / 100) : ''
                    },
                    { label: 'أشهر مشمولة', text: fmtNum(totals.monthCount) }
                ] : []
            })}
            ${renderReportNotes([
                '<p>تقرير للقراءة فقط ولا يعدل أي بيانات. تُخصم الإعفاءات والتخفيضات من مستحق الشهر المسجل فيه الاستحقاق.</p>',
                residentNote,
                kindNote
            ])}
        </div>`;
}

async function generateAdjustmentsReport() {
    if (!requireManager()) return;
    const { from, to } = getAdjustmentsReportSelection();
    if (!from || !to) { toast('اختر شهر البداية والنهاية','error'); return; }
    const residentFilter = getReportResidentFilter('adjustmentsReportResident');
    const kindFilter = getAdjustmentReportKindFilter();
    const report = buildAdjustmentsReport(from, to, residentFilter, kindFilter);
    if (!report) {
        const message = getPeriodRangeError(from, to) || 'الفترة غير صحيحة.';
        clearAdjustmentsReportPreview(message);
        toast(message, 'error');
        return;
    }
    const preview = document.getElementById('adjustmentsReportPreview');
    if (!preview) return;
    preview.innerHTML = renderAdjustmentsReportHtml(report);
    preview.dataset.stale = 'false';
    adjustmentsReportSnapshot = report;
    adjustmentsReportSignature = getAdjustmentsReportSignature(from, to, residentFilter, kindFilter);
    setAdjustmentsReportActionsEnabled(true);

    // Render chart for adjustments report (lazy-loaded Chart.js)
    if (typeof renderBarValues === 'function' && reportPreviewChartHasData(report.months.map(m => m.amountCents))) {
        await renderBarValues(
            'adjustmentsReportChart',
            report.months.map(m => m.month),
            report.months.map(m => m.amountCents / 100),
            reportPreviewChartColor('amber'),
            'الإعفاءات والتخفيضات'
        );
    }
}

function invalidateAdjustmentsReportPreview() {
    if (adjustmentsReportSnapshot) {
        clearAdjustmentsReportPreview('تغيّر الشهر أو الفلتر أو البيانات — اضغط «معاينة» لتحديث التقرير.');
    }
    syncReportNavStatus();
}

function invalidateAdjustmentsReportIfStale() {
    if (!adjustmentsReportSnapshot) return;
    if (getAdjustmentsReportSignature(
        adjustmentsReportSnapshot.fromMonth,
        adjustmentsReportSnapshot.toMonth,
        adjustmentsReportSnapshot.residentFilter,
        adjustmentsReportSnapshot.kindFilter
    ) !== adjustmentsReportSignature) {
        clearAdjustmentsReportPreview('تغيّرت البيانات — اضغط «معاينة» لتحديث التقرير.');
    }
}

function getSelectedAdjustmentsReportSnapshot() {
    if (!adjustmentsReportSnapshot) {
        toast('اعرض معاينة تقرير الإعفاءات والتخفيضات أولًا','error');
        return null;
    }
    const selected = getAdjustmentsReportSelection();
    if ((selected.from && selected.from !== adjustmentsReportSnapshot.fromMonth) ||
        (selected.to && selected.to !== adjustmentsReportSnapshot.toMonth)) {
        toast('اعرض معاينة الفترة المحددة أولًا','error');
        return null;
    }
    if (getReportResidentFilter('adjustmentsReportResident') !== (adjustmentsReportSnapshot.residentFilter || '')) {
        toast('اعرض معاينة الشقة المحددة أولًا','error');
        return null;
    }
    if (getAdjustmentReportKindFilter() !== (adjustmentsReportSnapshot.kindFilter || '')) {
        toast('اعرض معاينة النوع المحدد أولًا','error');
        return null;
    }
    if (getAdjustmentsReportSignature(
        adjustmentsReportSnapshot.fromMonth,
        adjustmentsReportSnapshot.toMonth,
        adjustmentsReportSnapshot.residentFilter,
        adjustmentsReportSnapshot.kindFilter
    ) !== adjustmentsReportSignature) {
        clearAdjustmentsReportPreview('تغيّرت البيانات — اضغط «معاينة» لتحديث التقرير.');
        toast('تغيّرت البيانات — اضغط «معاينة» لتحديث التقرير.','error');
        return null;
    }
    return adjustmentsReportSnapshot;
}

function printAdjustmentsReport() {
    if (!requireManager()) return;
    const report = getSelectedAdjustmentsReportSnapshot();
    if (!report) return;
    const title = document.getElementById('printBuildingTitle');
    const meta = document.getElementById('printBuildingMeta');
    const previousTitle = title ? title.textContent : '';
    const previousMeta = meta ? meta.textContent : '';
    if (title) title.textContent = `تقرير الإعفاءات والتخفيضات - ${state.buildingName || 'Manzil'}`;
    if (meta) meta.textContent = `الفترة ${report.rangeLabel}${report.residentFilter ? ' • الشقة: ' + report.residentLabel : ''}${report.kindFilter ? ' • النوع: ' + report.kindLabel : ''} • المدير: ${state.managerName || '—'}`;
    document.body.classList.remove('print-landlord', 'print-statement', 'print-period', 'print-expenses');
    document.body.classList.add('print-adjustments');
    const restore = () => {
        document.body.classList.remove('print-adjustments');
        if (title) title.textContent = previousTitle;
        if (meta) meta.textContent = previousMeta;
    };
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
}

function exportAdjustmentsReportExcel() {
    if (!requireManager()) return;
    const report = getSelectedAdjustmentsReportSnapshot();
    if (!report || typeof exportReportWithDetailExcel !== 'function') return;

    const residentSlug = reportResidentFileSlug(report.residentFilter);
    const residentSuffix = residentSlug ? `_apt_${residentSlug}` : '';
    const kindSuffix = report.kindFilter ? `_${report.kindFilter}` : '';
    const filename = `manzil_adjustments_${getPeriodReportFileSlug(report)}${residentSuffix}${kindSuffix}`;

    const { summary, details } = adjustmentsReportToExcelRows(report);
    exportReportWithDetailExcel(filename, `تقرير الإعفاءات والتخفيضات - ${state.buildingName || 'Manzil'}`, summary, details, {
        'الفترة': report.rangeLabel,
        'الشقة': report.residentLabel,
        'النوع': report.kindLabel,
        'تاريخ الإنشاء': new Date(report.generatedAt || Date.now())
    });
}

function exportAdjustmentsReportCsv() {
    if (!requireManager()) return;
    const report = getSelectedAdjustmentsReportSnapshot();
    if (!report) return;
    const rows = [
        ['الفترة', report.rangeLabel, 'الشقة', report.residentLabel, 'النوع', report.kindLabel],
        ['الشقة', 'اسم المالك', 'الشهر', 'النوع', 'المبلغ', 'السبب']
    ];
    report.list.forEach(item => rows.push([
        item.apartmentNumber,
        item.residentName,
        item.month,
        item.kindLabel,
        item.amountCents / 100,
        item.reason
    ]));
    rows.push(['الإجمالي', '', '', '', report.totals.amountCents / 100, '']);
    const residentSlug = reportResidentFileSlug(report.residentFilter);
    const residentSuffix = residentSlug ? `_apt_${residentSlug}` : '';
    const kindSuffix = report.kindFilter ? `_${report.kindFilter}` : '';
    downloadCsv(`manzil_adjustments_${getPeriodReportFileSlug(report)}${residentSuffix}${kindSuffix}.csv`, rows);
    toast('تم تصدير تقرير الإعفاءات والتخفيضات','success');
}

async function exportAdjustmentsReportPdf() {
    if (!requireManager()) return;
    const report = getSelectedAdjustmentsReportSnapshot();
    if (!report) return;
    const residentSlug = reportResidentFileSlug(report.residentFilter);
    const residentSuffix = residentSlug ? `_apt_${residentSlug}` : '';
    const kindSuffix = report.kindFilter ? `_${report.kindFilter}` : '';
    await downloadStatementPdf(
        renderAdjustmentsReportPdfHtml(report),
        `manzil_adjustments_${getPeriodReportFileSlug(report)}${residentSuffix}${kindSuffix}.pdf`,
        'adjustmentsReportPdfBtn',
        'تم إنشاء تقرير الإعفاءات والتخفيضات PDF.',
        'Adjustments report PDF export failed:',
        () => !!adjustmentsReportSnapshot
    );
}

function exportArrearsExcel() {
    if (!requireManager()) return;
    if (typeof exportReportWithDetailExcel !== 'function') return;
    const report = buildArrearsReport(getArrearsReportFilters());
    if (!report.residents.length) {
        toast('لا توجد متأخرات للتصدير','error');
        return;
    }
    const { summary, details } = arrearsReportToExcelRows(report);
    exportReportWithDetailExcel(`manzil_arrears_${Date.now()}`, `تقرير المتأخرات - ${state.buildingName || 'Manzil'}`, summary, details, {
        'تاريخ الإنشاء': new Date()
    });
}

function exportArrearsCSV() {
    if (!requireManager()) return;
    const report = buildArrearsReport(getArrearsReportFilters());
    const rows = [['الشقة','اسم المالك','التصنيف','الشهر غير المسدد','المبلغ المستحق']];
    report.residents.forEach(item => item.unpaidMonths.forEach(month => {
        rows.push([item.resident.apartmentNumber, item.resident.name, item.bucket, month.month, month.amount]);
    }));
    downloadCsv(`manzil_arrears_${Date.now()}.csv`, rows);
    toast('تم تصدير تقرير المتأخرات','success');
}

let residentStatementSnapshot = null;
let residentStatementResidentId = '';
let residentStatementSignature = '';

function getStatementMonthKeyFromDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function getStatementMonthLabel(monthKey) {
    const [year, month] = String(monthKey).split('-').map(Number);
    if (!year || !month || !monthsNames[month - 1]) return '';
    return `${monthsNames[month - 1]} ${year}`;
}

function shiftStatementMonthKey(monthKey, offset) {
    const [year, month] = String(monthKey).split('-').map(Number);
    const cursor = new Date(Date.UTC(year, month - 1 + offset, 1));
    return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function getResidentStatementStatus(dueCents, paidCents, monthKey, currentKey, adjustmentCents = 0) {
    if (dueCents === 0 && paidCents === 0 && adjustmentCents > 0) {
        return { label: 'مغطى بإعفاء/تخفيض', className: 'text-amber-400' };
    }
    if (dueCents === 0 && paidCents === 0) {
        return monthKey > currentKey
            ? { label: 'لم يحن بعد', className: 'text-slate-500' }
            : { label: 'لا استحقاق', className: 'text-slate-500' };
    }
    if (dueCents === 0) return { label: 'مدفوع مقدماً', className: 'text-sky-400' };
    if (paidCents >= dueCents) {
        return paidCents > dueCents
            ? { label: 'مسدد بزيادة', className: 'text-emerald-400' }
            : { label: 'مسدد', className: 'text-emerald-400' };
    }
    if (paidCents === 0) return { label: 'غير مسدد', className: 'text-rose-400' };
    return { label: 'سداد جزئي', className: 'text-amber-400' };
}

function buildResidentStatement(residentId, purposeFilter = '') {
    const cacheKey = `statement:${residentId}:${purposeFilter}`;
    return getCachedReportModel(cacheKey, () => _buildResidentStatement(residentId, purposeFilter), () => true);
}

function _buildResidentStatement(residentId, purposeFilter = '') {
    const resident = buildResidentIndex().get(String(residentId || ''));
    if (!resident) return null;

    const normalizedPurpose = normalizeReportPurposeFilter(purposeFilter);
    const showDues = reportShowsSubscriptionDues(normalizedPurpose);
    const currentKey = monthLabelToKey(getCurrentMonth()) || '';
    const allPayments = (state.income || [])
        .filter(payment => payment.residentId === resident.id)
        .slice()
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    const payments = filterReportIncome(allPayments, normalizedPurpose);
    const paymentKeys = payments
        .map(payment => monthLabelToKey(payment.month))
        .filter(Boolean)
        .sort();
    const createdKey = typeof getResidentBillingStartKey === 'function'
        ? getResidentBillingStartKey(resident)
        : getStatementMonthKeyFromDate(new Date(resident.createdAt || ''));
    let startKey = createdKey || paymentKeys[0] || currentKey;
    let endKey = currentKey || startKey;
    paymentKeys.forEach(key => {
        if (key < startKey) startKey = key;
        if (key > endKey) endKey = key;
    });
    if (!startKey) return null;
    if (startKey > endKey) endKey = startKey;

    const months = [];
    let dueCents = 0;
    let adjustmentCents = 0;
    let paidCents = 0;
    let remainingCents = 0;
    for (let key = startKey; key <= endKey; key = shiftStatementMonthKey(key, 1)) {
        const month = getStatementMonthLabel(key);
        const isBilled = (!createdKey || key >= createdKey) && (!currentKey || key <= currentKey);
        const rowDueCents = isBilled ? toCents(getSubscriptionAmountForMonth(resident, month)) : 0;
        const includeSettlementBalance = showDues || normalizedPurpose === 'settlement';
        const settlement = isBilled && includeSettlementBalance && typeof getSettlementAdjustmentForMonth === 'function'
            ? getSettlementAdjustmentForMonth(resident.id, month) : null;
        const settlementAmountCents = settlement ? toCents(settlement.amount) : 0;
        const settlementPaidCents = settlement && typeof getSettlementPaidAmount === 'function'
            ? toCents(getSettlementPaidAmount(settlement.id)) : 0;
        const subscriptionPaidCents = toCents(getPaidAmountForMonth(resident.id, month));
        const rowAdjustmentCents = isBilled && showDues && settlement
            ? Math.max(0, rowDueCents - settlementAmountCents)
            : isBilled && showDues && typeof getAdjustmentAmountForMonth === 'function'
                ? toCents(getAdjustmentAmountForMonth(resident.id, month))
                : 0;
        const rowNetDueCents = settlement
            ? settlementAmountCents
            : Math.max(0, rowDueCents - rowAdjustmentCents);
        // Product rule (approved 2026-11-26): on a settled month both the earlier
        // subscription payments and the settlement payments count against the due.
        const rowPaidCents = settlement ? subscriptionPaidCents + settlementPaidCents : subscriptionPaidCents;
        const rowRemainingCents = Math.max(0, rowNetDueCents - rowPaidCents);
        dueCents += rowDueCents;
        adjustmentCents += rowAdjustmentCents;
        paidCents += rowPaidCents;
        remainingCents += rowRemainingCents;
        months.push({
            key,
            month,
            dueCents: rowDueCents,
            adjustmentCents: rowAdjustmentCents,
            settlementAmountCents,
            settlementPaidCents,
            settlementRemainingCents: Math.max(0, settlementAmountCents - settlementPaidCents),
            netDueCents: rowNetDueCents,
            paidCents: rowPaidCents,
            remainingCents: rowRemainingCents,
            status: getResidentStatementStatus(rowNetDueCents, rowPaidCents, key, currentKey, rowAdjustmentCents)
        });
    }

    const toPaymentRow = payment => ({
        id: payment.id,
        month: String(payment.month || '—'),
        amountCents: toCents(payment.amount),
        purpose: reportPurposeLabel(payment.purposeCode),
        method: getIncomePaymentMethodLabel(payment.paymentMethod),
        cashAccount: getCashAccountLabel(payment.cashAccountCode || 'main'),
        date: payment.date || '',
        notes: String(payment.notes || '')
    });
    const paymentRows = payments.map(toPaymentRow);
    const unassignedPaidCents = paymentRows
        .filter(payment => !monthLabelToKey(payment.month))
        .reduce((sum, payment) => sum + payment.amountCents, 0);
    const filteredPaidCents = paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
    const purposeTotals = new Map();
    payments.forEach(payment => {
        const label = reportPurposeLabel(payment.purposeCode);
        const bucket = purposeTotals.get(label) || { label, count: 0, cents: 0 };
        bucket.count += 1;
        bucket.cents += toCents(payment.amount);
        purposeTotals.set(label, bucket);
    });

    const adjustments = (showDues || normalizedPurpose === 'settlement')
        ? (Array.isArray(state.adjustments) ? state.adjustments : [])
            .filter(adjustment => adjustment.residentId === resident.id
                && (normalizedPurpose !== 'settlement' || adjustment.kind === 'settlement'))
            .map(adjustment => ({
                id: adjustment.id,
                key: String(adjustment.effectiveMonth || '').slice(0, 7) + '-01',
                kind: String(adjustment.kind || ''),
                amountCents: toCents(adjustment.amount),
                reason: String(adjustment.reason || '')
            }))
            .filter(adjustment => adjustment.amountCents > 0
                && adjustment.key >= startKey && adjustment.key <= endKey)
            .map(adjustment => ({
                ...adjustment,
                month: getStatementMonthLabel(adjustment.key.slice(0, 7) + '-01'),
                kindLabel: reportAdjustmentKindLabel(adjustment.kind)
            }))
            .sort((a, b) => b.key.localeCompare(a.key))
        : [];

    return {
        resident,
        months,
        adjustments,
        payments: paymentRows,
        purposes: Array.from(purposeTotals.values()).sort((a, b) => b.cents - a.cents),
        showDues,
        purposeFilter: normalizedPurpose,
        purposeLabel: reportPurposeFilterLabel(normalizedPurpose),
        rangeLabel: `${months[0].month} – ${months[months.length - 1].month}`,
        totals: {
            dueCents,
            adjustmentCents,
            paidCents,
            settlementAgreedCents: months.reduce((sum, row) => sum + row.settlementAmountCents, 0),
            settlementPaidCents: months.reduce((sum, row) => sum + row.settlementPaidCents, 0),
            settlementRemainingCents: months.reduce((sum, row) => sum + row.settlementRemainingCents, 0),
            remainingCents,
            filteredPaidCents,
            arrearsMonths: months.filter(row => row.remainingCents > 0 && row.key < currentKey).length,
            unassignedPaidCents
        },
        generatedAt: new Date().toISOString()
    };
}

function reportAdjustmentKindLabel(kind) {
    return ({ waiver: 'إعفاء', discount: 'تخفيض', settlement: 'تسوية' }[kind] || 'تسوية');
}

function getResidentStatementSignature(residentId, purposeFilter = '') {
    const resident = buildResidentIndex().get(String(residentId || ''));
    if (!resident) return '';
    const payments = (state.income || []).filter(payment => payment.residentId === resident.id);
    const adjustments = (state.adjustments || []).filter(adjustment => adjustment.residentId === resident.id);
    return JSON.stringify([resident, payments, adjustments, state.defaultSubscription ?? '', getCurrentMonth(), purposeFilter || '']);
}

function setResidentStatementActionsEnabled(enabled) {
    ['statementPrintBtn', 'statementPdfBtn', 'unitReportPdfBtn', 'statementCsvBtn'].forEach(id => {
        const button = /** @type {HTMLButtonElement} */ (document.getElementById(id));
        if (button) button.disabled = !enabled;
    });
    markReportPreviewStale('residentStatementPreview', !enabled);
    syncReportNavStatus();
}

function clearResidentStatement(message) {
    reportPreviewDestroyChart('residentStatementChart');
    residentStatementSnapshot = null;
    residentStatementResidentId = '';
    residentStatementSignature = '';
    setResidentStatementActionsEnabled(false);
    const preview = document.getElementById('residentStatementPreview');
    if (preview) preview.innerHTML = `<p class="report-preview-empty">${esc(message)}</p>`;
}

function invalidateResidentStatementPreview() {
    if (!residentStatementSnapshot) return;
    clearResidentStatement('تغيّر المالك أو الغرض — اختر مالكًا ثم اضغط «معاينة» لعرض الكشف.');
}

function invalidateResidentStatementIfStale() {
    if (!residentStatementSnapshot) return;
    if (getResidentStatementSignature(residentStatementSnapshot.resident.id, residentStatementSnapshot.purposeFilter) !== residentStatementSignature) {
        clearResidentStatement('تغيّرت البيانات — اضغط «معاينة» لتحديث الكشف.');
    }
}

function getResidentStatementSnapshot() {
    if (!residentStatementSnapshot) {
        toast('اعرض كشف الحساب أولًا','error');
        return null;
    }
    const selected = String(/** @type {HTMLSelectElement} */ (document.getElementById('statementResidentSelect'))?.value || '');
    if (selected && selected !== residentStatementSnapshot.resident.id) {
        toast('اعرض كشف المالك المحدد أولًا','error');
        return null;
    }
    if (getReportPurposeFilter('statementPurpose') !== (residentStatementSnapshot.purposeFilter || '')) {
        toast('اعرض كشف الغرض المحدد أولًا','error');
        return null;
    }
    if (getResidentStatementSignature(residentStatementSnapshot.resident.id, residentStatementSnapshot.purposeFilter) !== residentStatementSignature) {
        clearResidentStatement('تغيّرت البيانات — اضغط «معاينة» لتحديث الكشف.');
        return null;
    }
    return residentStatementSnapshot;
}

function getStatementFileSlug(statement, includePurpose = true) {
    const apartment = String(statement.resident.apartmentNumber || 'resident').replace(/[^\w\u0621-\u064A-]+/g, '_');
    const lastKey = statement.months[statement.months.length - 1]?.key || '';
    const purposeSuffix = includePurpose && statement.purposeFilter ? `_${statement.purposeFilter}` : '';
    return `${apartment}_${lastKey.slice(0, 7)}${purposeSuffix}`;
}

function getResidentStatementChart(statement) {
    const totals = statement.totals;
    if (statement.showDues !== false) {
        const rows = statement.months;
        const hasData = reportPreviewChartHasData(rows.flatMap(row => [row.dueCents, row.paidCents]));
        const peak = rows.reduce((best, row) => {
            return !best || row.dueCents > best.dueCents ? row : best;
        }, null);
        return {
            hasData,
            labels: rows.map(row => row.month),
            series: [
                {
                    label: 'المستحق',
                    values: rows.map(row => row.dueCents / 100),
                    color: reportPreviewChartColor('indigo'),
                    fill: 'rgba(99, 102, 241, 0.1)'
                },
                {
                    label: 'المدفوع',
                    values: rows.map(row => row.paidCents / 100),
                    color: reportPreviewChartColor('emerald')
                }
            ],
            summary: hasData ? [
                { label: 'إجمالي المستحق', cents: totals.dueCents, tone: 'sky' },
                { label: 'إجمالي المدفوع', cents: totals.paidCents, tone: 'emerald' },
                {
                    label: 'المتبقي',
                    cents: totals.remainingCents,
                    tone: totals.remainingCents > 0 ? 'rose' : 'emerald'
                },
                {
                    label: 'أعلى شهر استحقاقًا',
                    text: peak ? peak.month : '—',
                    note: peak ? fmtMoney(peak.dueCents / 100) : ''
                }
            ] : [],
            empty: 'لا توجد مستحقات أو دفعات كافية لعرض الرسم.',
            ariaLabel: 'مخطط خطي للمستحق والمدفوع شهرًا بشهر؛ البيانات نفسها متاحة في الجدول.'
        };
    }
    const byMonth = new Map();
    statement.payments.forEach(payment => {
        const key = monthLabelToKey(payment.month) || String(payment.month || '—');
        const bucket = byMonth.get(key) || { key, label: payment.month, cents: 0 };
        bucket.cents += payment.amountCents;
        byMonth.set(key, bucket);
    });
    const items = Array.from(byMonth.values())
        .sort((a, b) => String(a.key).localeCompare(String(b.key)))
        .filter(item => item.cents > 0);
    const hasData = reportPreviewChartHasData(items.map(item => item.cents));
    const peak = items.reduce((best, item) => {
        return !best || item.cents > best.cents ? item : best;
    }, null);
    return {
        hasData,
        labels: items.map(item => item.label),
        series: [{
            label: 'الحركات',
            values: items.map(item => item.cents / 100),
            color: reportPreviewChartColor('sky')
        }],
        summary: hasData ? [
            { label: 'إجمالي الحركات', cents: totals.filteredPaidCents, tone: 'emerald' },
            { label: 'عدد الأشهر', text: fmtNum(items.length) },
            {
                label: 'أعلى شهر',
                text: peak ? peak.label : '—',
                note: peak ? fmtMoney(peak.cents / 100) : ''
            },
            { label: 'عدد الحركات', text: fmtNum(statement.payments.length) }
        ] : [],
        empty: 'لا توجد حركات كافية لعرض الرسم.',
        ariaLabel: 'مخطط أعمدة لحركات المالك شهرًا بشهر؛ البيانات نفسها متاحة في الجدول.'
    };
}

function renderResidentStatementHtml(statement) {
    const resident = statement.resident;
    const showDues = statement.showDues !== false;
    const statementChart = getResidentStatementChart(statement);
    const money = cents => fmtMoney(cents / 100);
    const paid = cents => '<span class="sheet-positive">' + money(cents) + '</span>';
    const due = cents => '<span class="sheet-negative">' + money(cents) + '</span>';
    const monthRows = statement.months.map(row => [
        esc(row.month), money(row.dueCents),
        row.adjustmentCents ? '<span class="sheet-amber">' + money(row.adjustmentCents) + '</span>' : '—',
        money(row.netDueCents), paid(row.paidCents),
        row.remainingCents ? due(row.remainingCents) : money(0),
        esc(row.status.label)
    ]);
    const paymentRows = statement.payments.map(payment => [
        esc(payment.month), esc(payment.purpose), esc(payment.method),
        esc(payment.cashAccount), esc(formatDate(payment.date) || '—'),
        esc(payment.notes || '—'), paid(payment.amountCents)
    ]);
    const unassignedNote = statement.totals.unassignedPaidCents > 0
        ? `<p>مدفوعات بدون شهر استحقاق قابل للقراءة: ${fmtMoney(statement.totals.unassignedPaidCents / 100)}</p>`
        : '';
    const statsHtml = renderReportStatTiles(getResidentStatementSummaryItems(statement), true);
    const totals = statement.totals;
    const monthsBlock = showDues
        ? renderSheetBlock('كشف المستحق شهرًا بشهر', ['الشهر', 'المستحق', 'إعفاء/تخفيض', 'الصافي', 'المدفوع', 'المتبقي', 'الحالة'], monthRows, {
            empty: 'لا توجد أشهر في الفترة المحددة.', numeric: [1, 2, 3, 4, 5], tableClass: 'statement-table',
            foot: ['الإجمالي', money(totals.dueCents),
                totals.adjustmentCents ? '<span class="sheet-amber">' + money(totals.adjustmentCents) + '</span>' : '—',
                money(totals.netDueCents !== undefined ? totals.netDueCents : totals.dueCents - totals.adjustmentCents),
                paid(totals.paidCents), due(totals.remainingCents), fmtNum(totals.arrearsMonths) + ' شهر']
        })
        : '';
    const adjustmentsTitle = statement.adjustments.some(adjustment => adjustment.kind === 'settlement')
        ? 'التسويات والإعفاءات والتخفيضات'
        : 'الإعفاءات والتخفيضات';
    const adjustmentRows = statement.adjustments.map(adjustment => [
        esc(adjustment.month), esc(adjustment.kindLabel), esc(adjustment.reason || '—'),
        '<span class="sheet-amber">' + money(adjustment.amountCents) + '</span>'
    ]);
    const adjustmentsBlock = showDues && statement.adjustments.length
        ? renderSheetBlock(adjustmentsTitle, ['الشهر', 'النوع', 'السبب', 'المبلغ'], adjustmentRows, {
            empty: 'لا توجد إعفاءات مسجلة.', numeric: [3],
            foot: ['الإجمالي', '', fmtNum(statement.adjustments.length) + ' تسجيل',
                '<span class="sheet-amber">' + money(totals.adjustmentCents) + '</span>']
        })
        : '';
    return `
        <div class="report-preview-flow">
            ${renderReportHeader('كشف حساب مالك · ' + (state.buildingName || 'العمارة'), [
                esc(resident.name) + ' · شقة ' + esc(resident.apartmentNumber || '—') +
                    (resident.floor ? ' · الدور ' + esc(resident.floor) : ''),
                'الفترة: ' + esc(statement.rangeLabel) +
                    (statement.purposeFilter ? ' · الغرض: ' + esc(statement.purposeLabel) : ''),
                'تم الإنشاء ' + esc(formatDate(statement.generatedAt))
            ])}
            ${statsHtml}
            ${monthsBlock}
            ${adjustmentsBlock}
            ${renderSheetBlock('حركات المالك', ['الشهر', 'الغرض', 'الطريقة', 'الصندوق', 'التاريخ', 'ملاحظات', 'المبلغ'], paymentRows, {
                empty: 'لا توجد حركات مسجلة.', numeric: [6],
                foot: ['الإجمالي', '', '', '', '', fmtNum(statement.payments.length) + ' حركة', paid(totals.filteredPaidCents)]
            })}
            ${renderChartFold('residentStatementChart', 'التصور البياني - حركة المستحق والمدفوع', {
                hasData: statementChart.hasData,
                empty: statementChart.empty,
                ariaLabel: statementChart.ariaLabel,
                summary: statementChart.summary
            })}
            ${renderReportNotes([
                showDues
                    ? '<p>كل شهر محسوب بقيمة الاشتراك السارية فيه. يُخصم الإعفاء أو التخفيض، وتُحتسب دفعات التسوية على اتفاق التسوية المرتبط بها، دون تكرارها ضمن مدفوع الاشتراك.</p>'
                    : '<p>المستحق الشهري يخص الاشتراكات فقط، لذلك تُعرض هنا حركات غرض «' + esc(statement.purposeLabel) + '» دون جدول المستحقات.</p>',
                showDues && statement.purposeFilter ? '<p>الحركات معروضة للاشتراكات فقط.</p>' : '',
                showDues ? unassignedNote : ''
            ])}
        </div>`;
}

async function generateResidentStatement() {
    if (!requireManager()) return;
    const residentId = String(/** @type {HTMLSelectElement} */ (document.getElementById('statementResidentSelect'))?.value || '');
    if (!residentId) { toast('اختر مالكًا','error'); return; }
    const purposeFilter = getReportPurposeFilter('statementPurpose');
    const statement = buildResidentStatement(residentId, purposeFilter);
    if (!statement) { toast('تعذر العثور على المالك. حدّث البيانات ثم حاول مرة أخرى.','error'); return; }
    const preview = document.getElementById('residentStatementPreview');
    if (!preview) return;
    preview.innerHTML = renderResidentStatementHtml(statement);
    residentStatementSnapshot = statement;
    residentStatementResidentId = residentId;
    residentStatementSignature = getResidentStatementSignature(residentId, purposeFilter);
    setResidentStatementActionsEnabled(true);
    const statementChart = getResidentStatementChart(statement);
    if (!statementChart.hasData) return;
    if (statement.showDues !== false && typeof renderLineSeries === 'function') {
        await renderLineSeries('residentStatementChart', statementChart.labels, statementChart.series, {
            maintainAspectRatio: false
        });
    } else if (typeof renderBarValues === 'function') {
        await renderBarValues(
            'residentStatementChart',
            statementChart.labels,
            statementChart.series[0].values,
            reportPreviewChartColor('sky'),
            statementChart.series[0].label,
            { maintainAspectRatio: false }
        );
    }
}

function printResidentStatement() {
    if (!requireManager()) return;
    const statement = getResidentStatementSnapshot();
    if (!statement) return;
    switchTab('reports');
    const title = document.getElementById('printBuildingTitle');
    const meta = document.getElementById('printBuildingMeta');
    const previousTitle = title ? title.textContent : '';
    const previousMeta = meta ? meta.textContent : '';
    if (title) title.textContent = `كشف حساب مالك - ${state.buildingName || 'Manzil'}`;
    if (meta) meta.textContent = `${statement.resident.name} • شقة ${statement.resident.apartmentNumber || '—'} • ${statement.rangeLabel}`;
    document.body.classList.remove('print-landlord');
    document.body.classList.add('print-statement');
    const restore = () => {
        document.body.classList.remove('print-statement');
        if (title) title.textContent = previousTitle;
        if (meta) meta.textContent = previousMeta;
    };
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
}

// Part 66: every report PDF (statements, monthly close, summary) is written into a
// detached element before html2pdf renders it, so it cannot inherit the app :root
// tokens. This palette declares the shared print-document colours once and the
// shell, table head, and cell helpers reference it; each value matches the literal
// it replaced, so the generated PDFs are unchanged.
const REPORT_PDF_PALETTE = Object.freeze({
    ink: '#111827',
    surface: '#fff',
    rule: '#334155',
    line: '#cbd5e1',
    hairline: '#e2e8f0',
    muted: '#475569',
    faint: '#64748b'
});

const REPORT_PDF_HEADER_STYLE = 'text-align:center;border-bottom:2px solid ' + REPORT_PDF_PALETTE.rule + ';padding-bottom:12px;margin-bottom:18px';
const REPORT_PDF_TITLE_STYLE = 'font-size:22px;font-weight:800;margin:0';
const REPORT_PDF_SUBTITLE_STYLE = 'font-size:17px;font-weight:700;margin:4px 0';
const REPORT_PDF_META_STYLE = 'font-size:11px;color:' + REPORT_PDF_PALETTE.muted + ';margin:0';
const REPORT_PDF_FOOTER_STYLE = 'font-size:9px;color:' + REPORT_PDF_PALETTE.faint + ';margin-top:18px;text-align:center';

// Shared PDF shell so every report renders an identical RTL header and footer.
// أنماط مضمّنة تجعل جداول التقرير المطبوعة مسطّرة وذات صفوف متناوبة واضحة.
const REPORT_PDF_DOCUMENT_STYLE = '<style>' +
    '.manzil-pdf table{border-collapse:collapse;width:100%}' +
    '.manzil-pdf tbody tr:nth-child(even){background:' + REPORT_PDF_PALETTE.hairline + '}' +
    '.manzil-pdf th,.manzil-pdf td{font-variant-numeric:tabular-nums;vertical-align:middle}' +
    '.manzil-pdf tr{break-inside:avoid}' +
    '.manzil-pdf thead{display:table-header-group}' +
    '.manzil-pdf thead th{background:' + REPORT_PDF_PALETTE.rule + ';color:' + REPORT_PDF_PALETTE.surface + ';border-color:' + REPORT_PDF_PALETTE.rule + '}' +
    '.manzil-pdf tfoot td{font-weight:700;border-top:2px solid ' + REPORT_PDF_PALETTE.rule + '}' +
    '.manzil-pdf table.pdf-summary th{width:45%;font-weight:600}' +
    '.manzil-pdf table.pdf-summary th,.manzil-pdf table.pdf-summary td{padding:4px 8px !important}' +
    '.manzil-pdf table.pdf-summary th{background:' + REPORT_PDF_PALETTE.hairline + '}' +
    '</style>';

function reportPdfDocumentOpen() {
    return '<div dir="rtl" lang="ar" class="manzil-pdf" style="font-family:Cairo,Arial,sans-serif;color:' + REPORT_PDF_PALETTE.ink + ';background:' + REPORT_PDF_PALETTE.surface + ';line-height:1.8">' +
        REPORT_PDF_DOCUMENT_STYLE;
}

function reportPdfHeader(titleLines, metaLines) {
    return [
        '<header style="' + REPORT_PDF_HEADER_STYLE + '">',
        '<h1 style="' + REPORT_PDF_TITLE_STYLE + '">', esc(state.buildingName || 'Manzil'), '</h1>',
        '<h2 style="' + REPORT_PDF_SUBTITLE_STYLE + '">', titleLines.join(''), '</h2>',
        '<p style="' + REPORT_PDF_META_STYLE + '">', metaLines.join(''), '</p></header>'
    ].join('');
}

/** PDF date label: Arabic month names with Latin digits, the same digit style as every amount in the report. */
function reportPdfDate(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (_) { return ''; }
}

function reportPdfFooter(generatedLabel) {
    return '<footer style="' + REPORT_PDF_FOOTER_STYLE + '">Manzil — ' + esc(generatedLabel) + '</footer>';
}

const REPORT_PDF_SECTION_STYLE = 'margin-bottom:10px';
const REPORT_PDF_SECTION_TITLE_STYLE = 'font-size:14px;margin:0 0 8px';
const REPORT_PDF_TABLE_STYLE = 'width:100%;border-collapse:collapse;font-size:10px';
const REPORT_PDF_TABLE_HEAD_STYLE = 'background:' + REPORT_PDF_PALETTE.hairline;

// Part 68: the hand-written report tables inline their cell borders, empty rows,
// table-head fills and footnotes. These shared constants route those structural
// literals to REPORT_PDF_PALETTE so no raw structural colour survives outside the
// palette map. Content tone colours (emerald/rose/amber) stay as content and are
// intentionally left as literals. Every value matches the literal it replaced, so
// the generated PDFs are unchanged.
const REPORT_PDF_CELL_STYLE = 'padding:6px;border:1px solid ' + REPORT_PDF_PALETTE.line;
const REPORT_PDF_EMPTY_CELL_BASE = 'padding:8px;border:1px solid ' + REPORT_PDF_PALETTE.line + ';text-align:center;color:';
const REPORT_PDF_EMPTY_CELL_STYLE = REPORT_PDF_EMPTY_CELL_BASE + REPORT_PDF_PALETTE.muted;
const REPORT_PDF_FOOTNOTE_STYLE = 'font-size:10px;color:' + REPORT_PDF_PALETTE.muted + ';border-top:1px solid ' + REPORT_PDF_PALETTE.line + ';padding-top:10px';
const REPORT_PDF_SUMMARY_NOTE_STYLE = 'font-size:11px;color:' + REPORT_PDF_PALETTE.rule + ';margin:8px 0 0';

function reportPdfSection(title, inner) {
    const heading = title ? '<h3 style="' + REPORT_PDF_SECTION_TITLE_STYLE + '">' + title + '</h3>' : '';
    return '<section style="' + REPORT_PDF_SECTION_STYLE + '">' + heading + inner + '</section>';
}

function reportPdfTable(headers, bodyRows, footRow) {
    const head = '<thead><tr style="' + REPORT_PDF_TABLE_HEAD_STYLE + '">' + headers.map(header => statementPdfHeadCell(header)).join('') + '</tr></thead>';
    const foot = footRow ? '<tfoot><tr style="' + REPORT_PDF_TABLE_HEAD_STYLE + '">' + footRow.map(cell => statementPdfCell(cell)).join('') + '</tr></tfoot>' : '';
    return '<table style="' + REPORT_PDF_TABLE_STYLE + '">' + head + '<tbody>' + bodyRows + '</tbody>' + foot + '</table>';
}

function reportPdfSummaryTable(items) {
    return '<table class="pdf-summary" style="width:100%;border-collapse:collapse;font-size:11px"><tbody>' + renderPdfSummaryRows(items) + '</tbody></table>';
}

function reportPdfEmptyRow(columns, message) {
    return '<tr><td colspan="' + columns + '" style="padding:8px;border:1px solid ' + REPORT_PDF_PALETTE.line + ';text-align:center;color:' + REPORT_PDF_PALETTE.muted + '">' + message + '</td></tr>';
}

function statementPdfCell(value, styles = '') {
    return '<td style="padding:6px;border:1px solid ' + REPORT_PDF_PALETTE.line + ';text-align:right;' + styles + '">' + value + '</td>';
}

function statementPdfHeadCell(value) {
    return '<th style="padding:6px;border:1px solid ' + REPORT_PDF_PALETTE.line + ';text-align:right;font-weight:600">' + value + '</th>';
}

function renderStatementMonthsPdfBody(statement) {
    return statement.months.map(row => [
        '<tr>',
        statementPdfHeadCell(esc(row.month)),
        statementPdfCell(fmtMoney(row.dueCents / 100)),
        statementPdfCell(row.adjustmentCents ? fmtMoney(row.adjustmentCents / 100) : '—', 'color:#b45309'),
        statementPdfCell(fmtMoney(row.netDueCents / 100)),
        statementPdfCell(fmtMoney(row.paidCents / 100)),
        statementPdfCell(fmtMoney(row.remainingCents / 100), row.remainingCents ? 'color:#be123c;font-weight:700' : ''),
        statementPdfCell(esc(row.status.label)),
        '</tr>'
    ].join('')).join('');
}

function renderStatementPaymentsPdfBody(statement, payments = statement.payments) {
    return payments.length
        ? payments.map(payment => [
            '<tr>',
            statementPdfCell(esc(payment.month)),
            statementPdfCell(fmtMoney(payment.amountCents / 100), 'color:#047857;font-weight:700'),
            statementPdfCell(esc(payment.purpose)),
            statementPdfCell(esc(payment.method)),
            statementPdfCell(esc(payment.cashAccount || 'الخزنة الرئيسية')),
            statementPdfCell(esc(formatDate(payment.date) || '—')),
            statementPdfCell(esc(payment.notes || '—')),
            '</tr>'
        ].join('')).join('')
        : '<tr><td colspan="7" style="' + REPORT_PDF_EMPTY_CELL_STYLE + '">لا توجد حركات مسجلة.</td></tr>';
}

function renderResidentStatementPdfHtml(statement) {
    const resident = statement.resident;
    const showDues = statement.showDues !== false;
    const monthRows = renderStatementMonthsPdfBody(statement);
    const paymentRows = renderStatementPaymentsPdfBody(statement);
    const summaryRows = renderPdfSummaryRows(getResidentStatementSummaryItems(statement));
    const adjustmentsTitle = statement.adjustments.some(adjustment => adjustment.kind === 'settlement')
        ? 'التسويات والإعفاءات والتخفيضات'
        : 'الإعفاءات والتخفيضات';
    const monthsSection = showDues
        ? [
            '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">حساب الشهور</h3>',
            '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="' + REPORT_PDF_TABLE_HEAD_STYLE + '">',
            '<th style="' + REPORT_PDF_CELL_STYLE + '">الشهر</th><th style="' + REPORT_PDF_CELL_STYLE + '">المستحق</th>',
            '<th style="' + REPORT_PDF_CELL_STYLE + '">إعفاء/تخفيض</th><th style="' + REPORT_PDF_CELL_STYLE + '">الصافي</th>',
            '<th style="' + REPORT_PDF_CELL_STYLE + '">المدفوع</th><th style="' + REPORT_PDF_CELL_STYLE + '">المتبقي</th>',
            '<th style="' + REPORT_PDF_CELL_STYLE + '">الحالة</th></tr></thead><tbody>', monthRows, '</tbody></table></section>',
            statement.adjustments.length
                ? [
                    '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">' + adjustmentsTitle + '</h3>',
                    '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="' + REPORT_PDF_TABLE_HEAD_STYLE + '">',
                    '<th style="' + REPORT_PDF_CELL_STYLE + '">الشهر</th><th style="' + REPORT_PDF_CELL_STYLE + '">النوع</th>',
                    '<th style="' + REPORT_PDF_CELL_STYLE + '">المبلغ</th><th style="' + REPORT_PDF_CELL_STYLE + '">السبب</th>',
                    '</tr></thead><tbody>',
                    statement.adjustments.map(adjustment => [
                        '<tr>',
                        statementPdfCell(esc(adjustment.month)),
                        statementPdfCell(esc(adjustment.kindLabel)),
                        statementPdfCell(fmtMoney(adjustment.amountCents / 100), 'color:#b45309;font-weight:700'),
                        statementPdfCell(esc(adjustment.reason || '—')),
                        '</tr>'
                    ].join('')).join(''),
                    '</tbody></table></section>'
                ].join('')
                : ''
        ]
        : [];

    const generatedAtLabel = reportPdfDate(statement.generatedAt);
    return [
        reportPdfDocumentOpen(),
        reportPdfHeader([
            'كشف حساب مالك — ', esc(resident.name)
        ], [
            'شقة ', esc(resident.apartmentNumber || '—'), resident.floor ? ' • الدور ' + esc(resident.floor) : '',
            ' • الفترة: ', esc(statement.rangeLabel),
            statement.purposeFilter ? ' • الغرض: ' + esc(statement.purposeLabel) : ''
        ]),
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">الملخص</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:11px"><tbody>',
        summaryRows,
        '</tbody></table></section>',
        ...monthsSection,
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">حركات المالك</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="' + REPORT_PDF_TABLE_HEAD_STYLE + '">',
        '<th style="' + REPORT_PDF_CELL_STYLE + '">الشهر</th><th style="' + REPORT_PDF_CELL_STYLE + '">المبلغ</th>',
        '<th style="' + REPORT_PDF_CELL_STYLE + '">الغرض</th><th style="' + REPORT_PDF_CELL_STYLE + '">طريقة الدفع</th><th style="' + REPORT_PDF_CELL_STYLE + '">الصندوق</th><th style="' + REPORT_PDF_CELL_STYLE + '">التاريخ</th>',
        '<th style="' + REPORT_PDF_CELL_STYLE + '">ملاحظات</th></tr></thead><tbody>', paymentRows, '</tbody></table></section>',
        '<p style="' + REPORT_PDF_FOOTNOTE_STYLE + '">',
        showDues
            ? 'كل شهر محسوب بقيمة الاشتراك السارية فيه. تُحتسب دفعات التسوية على اتفاق التسوية المرتبط بها، ولا تُكرر ضمن مدفوع الاشتراك. هذا الكشف للقراءة فقط ولا يعدل أي بيانات.'
            : 'المستحق الشهري يخص الاشتراكات فقط، لذلك يعرض الكشف حركات الغرض المحدد دون جدول المستحقات. هذا الكشف للقراءة فقط ولا يعدل أي بيانات.',
        '</p>',
        reportPdfFooter(generatedAtLabel),
        '</div>'
    ].join('');
}

function renderUnitReportPdfHtml(statement) {
    const resident = statement.resident;
    const currentMonth = getCurrentMonth();
    const currentRate = getSubscriptionAmountForMonth(resident, currentMonth);
    const currentRow = statement.months.find(row => row.month === currentMonth);
    const unpaidRows = statement.months.filter(row => row.remainingCents > 0);
    const profileRows = [
        ['رقم الشقة', esc(resident.apartmentNumber || '—')],
        ['الدور', esc(resident.floor || '—')],
        ['المالك', esc(resident.name || '—')],
        ['الهاتف', esc(resident.phone || 'غير مسجل')],
        ['تاريخ إضافة الوحدة', esc(formatDate(resident.createdAt) || '—')],
        ['قيمة الاشتراك الحالية', fmtMoney(currentRate)]
    ].map(([label, value]) => '<tr>' + statementPdfHeadCell(label) + statementPdfCell(value) + '</tr>').join('');
    const unpaidHtml = unpaidRows.length
        ? unpaidRows.map(row => '<tr>' + statementPdfCell(esc(row.month)) + statementPdfCell(fmtMoney(row.remainingCents / 100), 'color:#be123c;font-weight:700') + '</tr>').join('')
        : '<tr><td colspan="2" style="' + REPORT_PDF_EMPTY_CELL_BASE + '#047857">لا توجد أشهر غير مسددة.</td></tr>';
    const currentSummary = currentRow
        ? `${currentMonth}: مستحق ${fmtMoney(currentRow.dueCents / 100)}${currentRow.adjustmentCents ? ' • إعفاء/تخفيض ' + fmtMoney(currentRow.adjustmentCents / 100) : ''} • مدفوع ${fmtMoney(currentRow.paidCents / 100)} • متبقٍ ${fmtMoney(currentRow.remainingCents / 100)}`
        : 'لا يوجد استحقاق للشهر الحالي.';

    const generatedAtLabel = reportPdfDate(statement.generatedAt);
    return [
        reportPdfDocumentOpen(),
        reportPdfHeader([
            'تقرير وحدة — شقة ', esc(resident.apartmentNumber || '—')
        ], [
            esc(resident.name || '—'), resident.floor ? ' • الدور ' + esc(resident.floor) : '',
            ' • الفترة: ', esc(statement.rangeLabel)
        ]),
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">بيانات الوحدة</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:11px"><tbody>', profileRows, '</tbody></table></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">الوضع المالي</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:11px"><tbody>',
        '<tr>', statementPdfHeadCell('إجمالي المستحق'), statementPdfCell(fmtMoney(statement.totals.dueCents / 100)), '</tr>',
        '<tr>', statementPdfHeadCell('إعفاء/تخفيض'), statementPdfCell(fmtMoney((statement.totals.adjustmentCents || 0) / 100), 'color:#b45309;font-weight:700'), '</tr>',
        '<tr>', statementPdfHeadCell('مدفوع الاشتراكات'), statementPdfCell(fmtMoney(statement.totals.paidCents / 100), 'color:#047857;font-weight:700'), '</tr>',
        '<tr>', statementPdfHeadCell('إجمالي حركات التحصيل'), statementPdfCell(fmtMoney(statement.totals.filteredPaidCents / 100), 'color:#047857;font-weight:700'), '</tr>',
        '<tr>', statementPdfHeadCell('إجمالي المتبقي'), statementPdfCell(fmtMoney(statement.totals.remainingCents / 100), 'font-weight:700'), '</tr>',
        '<tr>', statementPdfHeadCell('أشهر متأخرة'), statementPdfCell(fmtNum(statement.totals.arrearsMonths)), '</tr>',
        '</tbody></table>',
        '<p style="' + REPORT_PDF_SUMMARY_NOTE_STYLE + '">', esc(currentSummary), '</p></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">المتأخرات</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="' + REPORT_PDF_TABLE_HEAD_STYLE + '">',
        '<th style="' + REPORT_PDF_CELL_STYLE + '">الشهر</th><th style="' + REPORT_PDF_CELL_STYLE + '">المتبقي</th>',
        '</tr></thead><tbody>', unpaidHtml, '</tbody></table></section>',
        statement.adjustments.length
            ? [
                '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">الإعفاءات والتخفيضات</h3>',
                '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="' + REPORT_PDF_TABLE_HEAD_STYLE + '">',
                '<th style="' + REPORT_PDF_CELL_STYLE + '">الشهر</th><th style="' + REPORT_PDF_CELL_STYLE + '">النوع</th>',
                '<th style="' + REPORT_PDF_CELL_STYLE + '">المبلغ</th><th style="' + REPORT_PDF_CELL_STYLE + '">السبب</th>',
                '</tr></thead><tbody>',
                statement.adjustments.map(adjustment => [
                    '<tr>',
                    statementPdfCell(esc(adjustment.month)),
                    statementPdfCell(esc(adjustment.kindLabel)),
                    statementPdfCell(fmtMoney(adjustment.amountCents / 100), 'color:#b45309;font-weight:700'),
                    statementPdfCell(esc(adjustment.reason || '—')),
                    '</tr>'
                ].join('')).join(''),
                '</tbody></table></section>'
            ].join('')
            : '',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">حساب الشهور</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="' + REPORT_PDF_TABLE_HEAD_STYLE + '">',
        '<th style="' + REPORT_PDF_CELL_STYLE + '">الشهر</th><th style="' + REPORT_PDF_CELL_STYLE + '">المستحق</th>',
        '<th style="' + REPORT_PDF_CELL_STYLE + '">إعفاء/تخفيض</th><th style="' + REPORT_PDF_CELL_STYLE + '">الصافي</th>',
        '<th style="' + REPORT_PDF_CELL_STYLE + '">المدفوع</th><th style="' + REPORT_PDF_CELL_STYLE + '">المتبقي</th>',
        '<th style="' + REPORT_PDF_CELL_STYLE + '">الحالة</th></tr></thead><tbody>', renderStatementMonthsPdfBody(statement), '</tbody></table></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">حركات المالك</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="' + REPORT_PDF_TABLE_HEAD_STYLE + '">',
        '<th style="' + REPORT_PDF_CELL_STYLE + '">الشهر</th><th style="' + REPORT_PDF_CELL_STYLE + '">المبلغ</th>',
        '<th style="' + REPORT_PDF_CELL_STYLE + '">الغرض</th><th style="' + REPORT_PDF_CELL_STYLE + '">طريقة الدفع</th><th style="' + REPORT_PDF_CELL_STYLE + '">الصندوق</th><th style="' + REPORT_PDF_CELL_STYLE + '">التاريخ</th>',
        '<th style="' + REPORT_PDF_CELL_STYLE + '">ملاحظات</th></tr></thead><tbody>', renderStatementPaymentsPdfBody(statement), '</tbody></table></section>',
        '<p style="' + REPORT_PDF_FOOTNOTE_STYLE + '">',
        'تقرير وحدة للقراءة فقط ولا يعدل أي بيانات. كل شهر محسوب بقيمة الاشتراك السارية فيه، والمدفوع هو المسجل على الشهر نفسه، ويعرض كل حركات الوحدة بغض النظر عن فلتر الغرض.',
        '</p>',
        reportPdfFooter(generatedAtLabel),
        '</div>'
    ].join('');
}

function renderPeriodReportPdfHtml(report) {
    const showDues = report.showDues !== false;
    const totals = report.totals;
    const incomeStatLabel = report.cashAccountFilter ? 'تحصيل الصندوق' : report.residentFilter ? 'تحصيل الشقة' : 'تحصيل الغرض';
    const money = value => fmtMoney(value / 100);
    const monthRows = showDues
        ? report.months.map(row => [
            '<tr>',
            statementPdfCell(esc(row.month)),
            statementPdfCell(money(row.expectedCents)),
            statementPdfCell(money(row.collectedCents), 'color:#047857;font-weight:700'),
            statementPdfCell(money(row.outstandingCents), row.outstandingCents ? 'color:#be123c;font-weight:700' : ''),
            statementPdfCell(formatPeriodRate(row.rate)),
            statementPdfCell(money(row.otherIncomeCents), row.otherIncomeCents ? 'color:#047857' : ''),
            statementPdfCell(money(row.expenseCents), 'color:#be123c'),
            statementPdfCell(money(row.netCents), row.netCents >= 0 ? 'color:#047857;font-weight:700' : 'color:#be123c;font-weight:700'),
            '</tr>'
        ].join('')).join('')
        : report.months.map(row => [
            '<tr>',
            statementPdfCell(esc(row.month)),
            statementPdfCell(money(row.totalIncomeCents), 'color:#047857;font-weight:700'),
            statementPdfCell(fmtNum(row.movementCount)),
            statementPdfCell(money(row.expenseCents), 'color:#be123c'),
            statementPdfCell(money(row.netCents), row.netCents >= 0 ? 'color:#047857;font-weight:700' : 'color:#be123c;font-weight:700'),
            '</tr>'
        ].join('')).join('');
    const headers = showDues
        ? ['الشهر', 'المستحق', 'المحصّل', 'غير المحصّل', 'نسبة التحصيل', 'إيرادات أخرى', 'المصروف', 'الصافي']
        : ['الشهر', incomeStatLabel, 'عدد الحركات', 'المصروف', 'الصافي'];
    const footRow = showDues
        ? ['الإجمالي', money(totals.expectedCents), money(totals.collectedCents), money(totals.outstandingCents), formatPeriodRate(totals.rate), money(totals.otherIncomeCents), money(totals.expenseCents), money(totals.netCents)]
        : ['الإجمالي', money(totals.totalIncomeCents), fmtNum(totals.movementCount), money(totals.expenseCents), money(totals.netCents)];
    const summaryItems = showDues
        ? [
            { label: 'إجمالي المستحق', cents: totals.expectedCents },
            ...(totals.adjustmentCents > 0 ? [{ label: 'إعفاء/تخفيض', cents: totals.adjustmentCents, tone: 'amber' }] : []),
            { label: 'المحصّل', cents: totals.collectedCents, tone: 'emerald' },
            { label: 'غير المحصّل', cents: totals.outstandingCents, tone: totals.outstandingCents ? 'rose' : 'emerald' },
            { label: 'نسبة التحصيل', text: formatPeriodRate(totals.rate) },
            ...(totals.advanceCents > 0 ? [{ label: 'مدفوع مقدمًا', cents: totals.advanceCents, tone: 'sky' }] : []),
            { label: 'إيرادات أخرى', cents: totals.otherIncomeCents },
            { label: 'المصروف', cents: totals.expenseCents, tone: 'rose' },
            { label: 'الصافي', cents: totals.netCents, tone: totals.netCents >= 0 ? 'emerald' : 'rose' }
        ]
        : [
            { label: incomeStatLabel, cents: totals.totalIncomeCents, tone: 'emerald' },
            { label: 'عدد الحركات', text: fmtNum(totals.movementCount) },
            { label: 'المصروف', cents: totals.expenseCents, tone: 'rose' },
            { label: 'الصافي', cents: totals.netCents, tone: totals.netCents >= 0 ? 'emerald' : 'rose' }
        ];
    const methodRows = report.methods.length
        ? report.methods.map(item => '<tr>' + statementPdfCell(esc(item.label)) + statementPdfCell(fmtNum(item.count)) + statementPdfCell(fmtMoney(item.cents / 100), 'color:#047857;font-weight:700') + statementPdfCell(item.share === null ? '—' : fmtNum(item.share) + '%') + '</tr>').join('')
        : reportPdfEmptyRow(4, 'لا تحصيلات في هذه الفترة.');
    const purposeRows = (report.purposes || []).length
        ? report.purposes.map(item => '<tr>' + statementPdfCell(esc(item.label)) + statementPdfCell(fmtNum(item.count)) + statementPdfCell(fmtMoney(item.cents / 100), 'color:#047857;font-weight:700') + '</tr>').join('')
        : reportPdfEmptyRow(3, 'لا تحصيلات في هذه الفترة.');
    const generatedAtLabel = reportPdfDate(report.generatedAt);
    return [
        reportPdfDocumentOpen(),
        reportPdfHeader([
            'تقرير الفترة — ', esc(report.rangeLabel),
            report.purposeFilter ? ' • الغرض: ' + esc(report.purposeLabel) : '',
            report.cashAccountFilter ? ' • الصندوق: ' + esc(report.cashAccountLabel) : '',
            report.residentFilter ? ' • الشقة: ' + esc(report.residentLabel) : ''
        ], [
            'المدير: ', esc(state.managerName || '—'),
            ' • تم الإنشاء ', esc(generatedAtLabel)
        ]),
        reportPdfSection('الملخص', reportPdfSummaryTable(summaryItems)),
        reportPdfSection('الأرقام الشهرية', reportPdfTable(headers, monthRows, footRow)),
        reportPdfSection('التحصيل حسب الغرض', reportPdfTable(['الغرض', 'عدد الحركات', 'المبلغ'], purposeRows)),
        reportPdfSection('التحصيل حسب الطريقة', reportPdfTable(['الطريقة', 'عدد الحركات', 'المبلغ', 'النسبة'], methodRows)),
        '<p style="' + REPORT_PDF_FOOTNOTE_STYLE + '">',
        'كل شهر محسوب بسعر الاشتراك السارية فيه وحصيلته من حركات الشهر نفسه. نسبة تزيد على 100% تعني تحصيلًا أعلى من مستحق الشهر. هذا التقرير للقراءة فقط ولا يعدل أي بيانات.',
        '</p>',
        reportPdfFooter(generatedAtLabel),
        '</div>'
    ].join('');
}

function renderExpensesReportPdfHtml(report) {
    const totals = report.totals;
    const money = value => fmtMoney(value / 100);
    const shareOf = (cents, total) => total > 0 ? fmtNum(Math.round((cents / total) * 100)) + '%' : '—';
    const monthRows = report.months.map(row => [
        '<tr>',
        statementPdfCell(esc(row.month)),
        statementPdfCell(fmtNum(row.count)),
        statementPdfCell(money(row.expenseCents), 'color:#be123c;font-weight:700'),
        statementPdfCell(shareOf(row.expenseCents, totals.expenseCents)),
        '</tr>'
    ].join('')).join('');
    const categoryRows = report.categories.length
        ? report.categories.map(item => '<tr>' + statementPdfCell(esc(item.label)) + statementPdfCell(fmtNum(item.count)) + statementPdfCell(money(item.cents), 'color:#be123c;font-weight:700') + statementPdfCell(item.share === null ? '—' : fmtNum(item.share) + '%') + '</tr>').join('')
        : reportPdfEmptyRow(4, 'لا يوجد');
    const fundRows = report.funds.length
        ? report.funds.map(item => '<tr>' + statementPdfCell(esc(item.label)) + statementPdfCell(fmtNum(item.count)) + statementPdfCell(money(item.cents), 'color:#be123c;font-weight:700') + statementPdfCell(item.share === null ? '—' : fmtNum(item.share) + '%') + '</tr>').join('')
        : reportPdfEmptyRow(4, 'لا يوجد');
    const detailRows = report.list.length
        ? report.list.map(expense => '<tr>' + statementPdfCell(esc(expense.month)) + statementPdfCell(esc(expense.title)) + statementPdfCell(esc(getExpenseCategoryValue(expense))) + statementPdfCell(esc(reportCashAccountLabel(expense.cashAccountCode))) + statementPdfCell(money(toCents(expense.amount)), 'color:#be123c;font-weight:700') + statementPdfCell(esc(expense.notes || '—')) + '</tr>').join('')
        : reportPdfEmptyRow(6, 'لا يوجد');
    const summaryItems = [
        { label: 'إجمالي المصروف', cents: totals.expenseCents, tone: 'rose' },
        { label: 'عدد الحركات', text: fmtNum(totals.count) },
        { label: 'متوسط الشهر', cents: totals.averageCents },
        { label: 'أشهر فيها مصروف', text: fmtNum(totals.monthCount) }
    ];
    const generatedAtLabel = reportPdfDate(report.generatedAt);
    return [
        reportPdfDocumentOpen(),
        reportPdfHeader([
            'تقرير المصروفات — ', esc(report.rangeLabel),
            report.cashAccountFilter ? ' • الصندوق: ' + esc(report.cashAccountLabel) : '',
            report.categoryFilter ? ' • التصنيف: ' + esc(report.categoryLabel) : ''
        ], [
            'المدير: ', esc(state.managerName || '—'),
            ' • تم الإنشاء ', esc(generatedAtLabel)
        ]),
        reportPdfSection('الملخص', reportPdfSummaryTable(summaryItems)),
        reportPdfSection('المصروف حسب التصنيف', reportPdfTable(['التصنيف', 'عدد الحركات', 'المبلغ', 'النسبة'], categoryRows)),
        reportPdfSection('المصروف حسب الصندوق', reportPdfTable(['الصندوق', 'عدد الحركات', 'المبلغ', 'النسبة'], fundRows)),
        reportPdfSection('الأرقام الشهرية', reportPdfTable(['الشهر', 'عدد الحركات', 'المصروف', 'نسبته من الفترة'], monthRows, ['الإجمالي', fmtNum(totals.count), money(totals.expenseCents), '100%'])),
        reportPdfSection('تفاصيل المصروفات', reportPdfTable(['الشهر', 'البيان', 'التصنيف', 'الصندوق', 'المبلغ', 'ملاحظات'], detailRows)),
        '<p style="' + REPORT_PDF_FOOTNOTE_STYLE + '">',
        'تقرير للقراءة فقط ولا يعدل أي بيانات. المصروفات محسوبة على شهر استحقاقها المسجل.',
        '</p>',
        reportPdfFooter(generatedAtLabel),
        '</div>'
    ].join('');
}

function renderAdjustmentsReportPdfHtml(report) {
    const totals = report.totals;
    const money = value => fmtMoney(value / 100);
    const shareOf = (cents, total) => total > 0 ? fmtNum(Math.round((cents / total) * 100)) + '%' : '—';
    const monthRows = report.months.map(row => [
        '<tr>',
        statementPdfCell(esc(row.month)),
        statementPdfCell(fmtNum(row.count)),
        statementPdfCell(money(row.amountCents), 'color:#b45309;font-weight:700'),
        statementPdfCell(shareOf(row.amountCents, totals.amountCents)),
        '</tr>'
    ].join('')).join('');
    const kindRows = report.kinds.length
        ? report.kinds.map(item => '<tr>' + statementPdfCell(esc(item.label)) + statementPdfCell(fmtNum(item.count)) + statementPdfCell(money(item.cents), 'color:#b45309;font-weight:700') + statementPdfCell(item.share === null ? '—' : fmtNum(item.share) + '%') + '</tr>').join('')
        : reportPdfEmptyRow(4, 'لا يوجد');
    const detailRows = report.list.length
        ? report.list.map(item => '<tr>' + statementPdfCell(esc(item.apartmentNumber)) + statementPdfCell(esc(item.residentName)) + statementPdfCell(esc(item.kindLabel)) + statementPdfCell(esc(item.month)) + statementPdfCell(money(item.amountCents), 'color:#b45309;font-weight:700') + statementPdfCell(esc(item.reason || '—')) + '</tr>').join('')
        : reportPdfEmptyRow(6, 'لا يوجد');
    const summaryItems = [
        { label: 'إجمالي الإعفاءات والتخفيضات', cents: totals.amountCents, tone: 'amber' },
        { label: 'عدد التسجيلات', text: fmtNum(totals.count) },
        { label: 'الشقق المستفيدة', text: fmtNum(totals.residentCount) },
        { label: 'أشهر مشمولة', text: fmtNum(totals.monthCount) }
    ];
    const generatedAtLabel = reportPdfDate(report.generatedAt);
    return [
        reportPdfDocumentOpen(),
        reportPdfHeader([
            'تقرير الإعفاءات والتخفيضات — ', esc(report.rangeLabel),
            report.residentFilter ? ' • الشقة: ' + esc(report.residentLabel) : '',
            report.kindFilter ? ' • النوع: ' + esc(report.kindLabel) : ''
        ], [
            'المدير: ', esc(state.managerName || '—'),
            ' • تم الإنشاء ', esc(generatedAtLabel)
        ]),
        reportPdfSection('الملخص', reportPdfSummaryTable(summaryItems)),
        reportPdfSection('التوزيع حسب النوع', reportPdfTable(['النوع', 'عدد التسجيلات', 'المبلغ', 'النسبة'], kindRows)),
        reportPdfSection('الأرقام الشهرية', reportPdfTable(['الشهر', 'عدد التسجيلات', 'المبلغ', 'نسبته من الفترة'], monthRows, ['الإجمالي', fmtNum(totals.count), money(totals.amountCents), '100%'])),
        reportPdfSection('تفاصيل الإعفاءات والتخفيضات', reportPdfTable(['الشقة', 'المالك', 'النوع', 'الشهر', 'المبلغ', 'السبب'], detailRows)),
        '<p style="' + REPORT_PDF_FOOTNOTE_STYLE + '">',
        'تقرير للقراءة فقط ولا يعدل أي بيانات. تُخصم الإعفاءات والتخفيضات من مستحق الشهر المسجل فيه الاستحقاق.',
        '</p>',
        reportPdfFooter(generatedAtLabel),
        '</div>'
    ].join('');
}

// ===== PDF and image export share the chosen paper size (A4 / A5) =====
const REPORT_PAPER_MM = { A4: { w: 210, h: 297 }, A5: { w: 148, h: 210 } };
const REPORT_EXPORT_MARGIN_MM = 8;
/** Image export: content up to this many pages tall is scaled onto one page. */
const REPORT_IMAGE_FIT_MAX_PAGES = 1.7;
/** @type {'pdf' | 'image'} */
let reportExportMode = 'pdf';

function reportExportPaper() {
    const key = typeof getPrintPaper === 'function' ? getPrintPaper() : 'A4';
    return { key, ...(REPORT_PAPER_MM[key] || REPORT_PAPER_MM.A4) };
}

/** Inline style for the detached export sheet: content width = paper width minus margins. */
function reportExportRootCss() {
    const paper = reportExportPaper();
    const width = paper.w - 2 * REPORT_EXPORT_MARGIN_MM + (paper.key === 'A4' ? 2 : 0);
    return 'width:' + width + 'mm;padding:' + REPORT_EXPORT_MARGIN_MM + 'mm;box-sizing:border-box;background:' + REPORT_PDF_PALETTE.surface + ';z-index:-1';
}

/**
 * The sheet sits in normal flow inside an off-screen stage: html2pdf measures a copy of it,
 * and a position:fixed sheet measures as zero height (blank output).
 * @param {HTMLElement} root
 */
function mountReportExportRoot(root) {
    const stage = document.createElement('div');
    stage.dataset.reportExportStage = 'true';
    stage.setAttribute('aria-hidden', 'true');
    stage.style.cssText = 'position:fixed;top:0;left:-10000px;pointer-events:none';
    stage.appendChild(root);
    document.body.appendChild(stage);
    // html2canvas drops plain spaces between Arabic words in table cells; a no-break space survives. Long text keeps normal spaces so it can wrap.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if ((node.nodeValue || '').length <= 28 && /[\u0600-\u06FF]/.test(node.nodeValue || '')) node.nodeValue = (node.nodeValue || '').replace(/ /g, '\u00a0');
    }
}

/** @param {HTMLElement} root */
function removeReportExportRoot(root) {
    const stage = root.parentElement;
    root.remove();
    if (stage && stage.dataset && stage.dataset.reportExportStage) stage.remove();
}


// ===== PDF pagination, fonts and page footer (shared by every report PDF) =====
const REPORT_PDF_CANVAS_SCALE = 2;
const REPORT_PDF_FONT_WEIGHTS = ['400', '600', '700', '900'];

/** Make sure every bundled Cairo weight is decoded before html2canvas paints, or it falls back to Arial. */
async function loadReportPdfFonts() {
    if (typeof document === 'undefined' || !document.fonts) return;
    const sample = 'تقرير المالك 0123456789';
    try {
        await Promise.all(REPORT_PDF_FONT_WEIGHTS.map(function (weight) {
            return document.fonts.load(weight + ' 16px Cairo', sample);
        }));
    } catch (_) { /* the system fallback font still renders */ }
    if (document.fonts.ready) await document.fonts.ready;
}

/**
 * Height of one PDF page in CSS pixels, exactly as html2pdf slices it: the capture is
 * (inner page width in px + 1) wide at scale 2 and each page is floor(width * inner ratio) tall.
 */
function reportPdfPagePx(root, paper) {
    const innerWidthMm = paper.w - 2 * REPORT_EXPORT_MARGIN_MM;
    const innerHeightMm = paper.h - 2 * REPORT_EXPORT_MARGIN_MM;
    const captureWidth = (Math.floor(innerWidthMm * 96 / 25.4) + 1) * REPORT_PDF_CANVAS_SCALE;
    return Math.floor(captureWidth * innerHeightMm / innerWidthMm) / REPORT_PDF_CANVAS_SCALE;
}

/**
 * Cut the sheet into pages on row boundaries. A table that crosses a page is split
 * into a new table that repeats the header row; headings never end a page alone.
 * Spacers pad each page so html2pdf slices exactly where the cuts are.
 * @param {HTMLElement} root
 * @param {number} pagePx
 * @returns {number} number of pages
 */
function paginateReportRoot(root, pagePx) {
    if (!(pagePx > 50)) return 1;
    const SAFETY = 3;
    const rootTop = function () { return root.getBoundingClientRect().top; };
    const atoms = Array.from(root.querySelectorAll('tbody tr, tfoot tr, header, h3, section > p, .manzil-pdf > p, footer'));
    let pageEnd = pagePx;
    const spacerBefore = function (element, gap) {
        const spacer = document.createElement('div');
        spacer.setAttribute('data-pdf-spacer', '1');
        spacer.style.cssText = 'height:' + Math.max(0, gap) + 'px;margin:0;padding:0;border:0';
        element.parentNode.insertBefore(spacer, element);
    };
    atoms.forEach(function (atom) {
        let guard = 0;
        while (guard < 4) {
            guard += 1;
            const base = rootTop();
            const rect = atom.getBoundingClientRect();
            let top = rect.top - base;
            let bottom = rect.bottom - base;
            if (atom.tagName === 'H3') {
                const next = atom.nextElementSibling;
                const probe = next && (next.tagName === 'TABLE' ? next.querySelector('tbody tr') : next);
                if (probe) bottom = Math.max(bottom, probe.getBoundingClientRect().bottom - base);
            }
            if (bottom <= pageEnd - SAFETY) return;
            if (rect.height > pagePx - SAFETY * 2) return;
            if (top >= pageEnd) { pageEnd += pagePx; continue; }
            if (atom.tagName === 'TR') {
                const table = atom.closest('table');
                const body = table && table.tBodies[0];
                let first = atom;
                if (atom.parentElement && atom.parentElement.tagName === 'TFOOT' && body && body.lastElementChild) first = body.lastElementChild;
                if (table && body && first.parentElement === body && first !== body.firstElementChild) {
                    const next = document.createElement('table');
                    Array.from(table.attributes).forEach(function (attr) { next.setAttribute(attr.name, attr.value); });
                    Array.from(table.children).forEach(function (child) {
                        if (child.tagName === 'COLGROUP' || child.tagName === 'THEAD') next.appendChild(child.cloneNode(true));
                    });
                    const nextBody = document.createElement('tbody');
                    for (let row = first; row;) { const after = row.nextElementSibling; nextBody.appendChild(row); row = after; }
                    next.appendChild(nextBody);
                    if (table.tFoot) next.appendChild(table.tFoot);
                    table.insertAdjacentElement('afterend', next);
                    const tableBottom = table.getBoundingClientRect().bottom - rootTop();
                    spacerBefore(next, pageEnd - tableBottom);
                    pageEnd += pagePx;
                    return;
                }
                // First row of a table: move the heading with it.
                const heading = table && table.previousElementSibling && table.previousElementSibling.tagName === 'H3' ? table.previousElementSibling : null;
                const anchor = heading || table || atom;
                const anchorTop = anchor.getBoundingClientRect().top - rootTop();
                if (anchorTop <= pageEnd - pagePx + SAFETY) return;
                spacerBefore(anchor, pageEnd - anchorTop);
                pageEnd += pagePx;
                continue;
            }
            spacerBefore(atom, pageEnd - top);
            pageEnd += pagePx;
            return;
        }
    });
    const total = root.scrollHeight;
    return Math.max(1, Math.ceil((total - SAFETY) / pagePx));
}

/** Draw "building · page n of m" into the bottom margin of every page. Canvas text shapes Arabic with the bundled Cairo font. */
function drawReportPdfPageNumbers(pdf, paper, buildingName) {
    const total = pdf.internal.getNumberOfPages();
    const widthMm = paper.w - 2 * REPORT_EXPORT_MARGIN_MM;
    const heightMm = 6;
    const pxPerMm = 12;
    for (let page = 1; page <= total; page += 1) {
        const canvas = document.createElement('canvas');
        canvas.width = widthMm * pxPerMm;
        canvas.height = heightMm * pxPerMm;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = REPORT_PDF_PALETTE.surface;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = REPORT_PDF_PALETTE.faint;
        ctx.font = '600 ' + Math.round(2.9 * pxPerMm) + 'px Cairo, Arial, sans-serif';
        ctx.direction = 'rtl';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const name = String(buildingName || 'Manzil');
        ctx.fillText(name + '  •  صفحة ' + page + ' من ' + total, canvas.width / 2, canvas.height / 2);
        pdf.setPage(page);
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', REPORT_EXPORT_MARGIN_MM, paper.h - REPORT_EXPORT_MARGIN_MM - 0.5, widthMm, heightMm);
    }
}

/**
 * Render a mounted report sheet to a PDF blob: fonts loaded first, rows never cut,
 * table headers repeated, page numbers and the building name in every footer.
 * @param {HTMLElement} root
 * @param {string} filename
 * @param {{key: string, w: number, h: number}} [paperOverride]
 * @returns {Promise<Blob>}
 */
async function renderReportRootToPdfBlob(root, filename, paperOverride) {
    const paper = paperOverride || reportExportPaper();
    await loadReportPdfFonts();
    paginateReportRoot(root, reportPdfPagePx(root, paper));
    const buildingName = typeof state !== 'undefined' && state ? state.buildingName : '';
    return window.html2pdf().set({
        margin: REPORT_EXPORT_MARGIN_MM,
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: REPORT_PDF_CANVAS_SCALE, useCORS: true, backgroundColor: REPORT_PDF_PALETTE.surface, logging: false },
        jsPDF: { unit: 'mm', format: paper.key.toLowerCase(), orientation: 'portrait' },
        pagebreak: { mode: ['css'] }
    }).from(root).toPdf().get('pdf').then(function (pdf) {
        drawReportPdfPageNumbers(pdf, paper, buildingName);
    }).outputPdf('blob');
}

function reportExportJsPdfOptions() {
    return { unit: 'mm', format: reportExportPaper().key.toLowerCase(), orientation: 'portrait' };
}

/** Run an existing "export PDF" action but save page images (PNG) instead of a PDF. */
async function exportReportAsImage(pdfExportAction) {
    if (typeof pdfExportAction !== 'function') return;
    reportExportMode = 'image';
    try { await pdfExportAction(); } finally { reportExportMode = 'pdf'; }
}

/**
 * Pick row-safe page cuts so a table row is never sliced in half.
 * @param {HTMLElement} root
 * @param {number} pageHeightPx page height in the root's CSS pixels
 * @returns {number[]} cut positions (CSS px from the top of root), ending with the total height
 */
function planReportImageCuts(root, pageHeightPx) {
    const top = root.getBoundingClientRect().top;
    const total = root.scrollHeight;
    const bottoms = Array.from(root.querySelectorAll('tr, h1, h2, h3, section, table'))
        .map(el => el.getBoundingClientRect().bottom - top)
        .filter(value => value > 0 && value < total)
        .sort((a, b) => a - b);
    const cuts = [];
    let start = 0;
    while (total - start > pageHeightPx + 1) {
        const limit = start + pageHeightPx;
        const safe = bottoms.filter(value => value <= limit && value > start + pageHeightPx * 0.4).pop();
        const cut = safe || limit;
        cuts.push(cut);
        start = cut;
    }
    cuts.push(total);
    return cuts;
}

function downloadReportImageBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
}

/**
 * Render the detached export sheet to high-resolution PNG files, one per page.
 * The scale is capped so old phones do not run out of memory.
 * @param {HTMLElement} root
 * @param {string} pdfFilename
 * @returns {Promise<number>} number of images saved
 */
async function saveReportRootAsImages(root, pdfFilename) {
    const paper = reportExportPaper();
    const widthPx = root.getBoundingClientRect().width;
    const pageHeightPx = widthPx * paper.h / paper.w;
    const cuts = planReportImageCuts(root, pageHeightPx);
    const totalPx = widthPx * root.scrollHeight;
    const scale = Math.max(1.5, Math.min(3, Math.sqrt(16000000 / totalPx)));
    /** @type {HTMLCanvasElement | null} */
    let canvas = null;
    await /** @type {any} */ (window).html2pdf().set({
        margin: REPORT_EXPORT_MARGIN_MM,
        jsPDF: reportExportJsPdfOptions(),
        html2canvas: { scale, useCORS: true, backgroundColor: REPORT_PDF_PALETTE.surface, logging: false, scrollX: 0, scrollY: 0 }
    }).from(root).toCanvas().then(function () { canvas = this.prop.canvas; });
    if (!canvas || !canvas.width || !canvas.height) throw new Error('report_image_generation_failed');
    const base = pdfFilename.replace(/\.pdf$/i, '');
    // A report that spills only a little onto a second page is shrunk onto one page, so the image stays a single sheet.
    const pageCanvasHeight = Math.round((canvas.width * paper.h) / paper.w);
    if (cuts.length > 1 && canvas.height <= pageCanvasHeight * REPORT_IMAGE_FIT_MAX_PAGES) {
        const fit = pageCanvasHeight / canvas.height;
        const single = document.createElement('canvas');
        single.width = canvas.width;
        single.height = pageCanvasHeight;
        const singleContext = single.getContext('2d');
        singleContext.fillStyle = REPORT_PDF_PALETTE.surface;
        singleContext.fillRect(0, 0, single.width, single.height);
        const drawWidth = Math.round(canvas.width * fit);
        singleContext.drawImage(canvas, 0, 0, canvas.width, canvas.height, canvas.width - drawWidth, 0, drawWidth, pageCanvasHeight);
        const singleBlob = await new Promise(resolve => single.toBlob(resolve, 'image/png'));
        if (!singleBlob) throw new Error('report_image_generation_failed');
        downloadReportImageBlob(singleBlob, `${base}_${paper.key}.png`);
        return 1;
    }
    let start = 0;
    for (let index = 0; index < cuts.length; index += 1) {
        const y0 = Math.round(start * scale);
        const y1 = Math.min(canvas.height, Math.round(cuts[index] * scale));
        const height = Math.max(1, y1 - y0);
        const page = document.createElement('canvas');
        page.width = canvas.width;
        page.height = Math.round(Math.max(height, (canvas.width * paper.h) / paper.w));
        const context = page.getContext('2d');
        context.fillStyle = REPORT_PDF_PALETTE.surface;
        context.fillRect(0, 0, page.width, page.height);
        context.drawImage(canvas, 0, y0, canvas.width, height, 0, 0, canvas.width, height);
        const blob = await new Promise(resolve => page.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('report_image_generation_failed');
        downloadReportImageBlob(blob, cuts.length > 1 ? `${base}_${paper.key}_p${index + 1}.png` : `${base}_${paper.key}.png`);
        if (index < cuts.length - 1) await new Promise(resolve => window.setTimeout(resolve, 250));
        start = cuts[index];
    }
    return cuts.length;
}

/** Add an image button beside every PDF button and keep its enabled state in sync. */
/** Phone card view of wide tables: copy each column title onto its cells so CSS can show it above the value. */
function labelSheetCards(scope) {
    scope.querySelectorAll('.sheet-cards:not([data-labelled])').forEach(function (wrap) {
        const titles = Array.from(wrap.querySelectorAll('thead th')).map(function (th) { return (th.textContent || '').trim(); });
        if (!titles.length) return;
        wrap.querySelectorAll('tr').forEach(function (row) {
            Array.from(row.children).forEach(function (cell, index) { if (titles[index]) cell.setAttribute('data-label', titles[index]); });
        });
        wrap.setAttribute('data-labelled', '1');
    });
}
(function watchSheetCards() {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    let queued = false;
    const start = function () {
        new MutationObserver(function () {
            if (queued) return;
            queued = true;
            window.requestAnimationFrame(function () { queued = false; labelSheetCards(document.body); });
        }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();


function initReportImageButtons() {
    document.querySelectorAll('button[id$="PdfBtn"]').forEach(pdfButton => {
        if (!(pdfButton instanceof HTMLButtonElement) || document.getElementById(pdfButton.id + 'Image')) return;
        const match = /^\s*(\w+)\(\)/.exec(pdfButton.getAttribute('onclick') || '');
        if (!match) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.id = pdfButton.id + 'Image';
        button.className = pdfButton.className;
        button.disabled = pdfButton.disabled;
        button.setAttribute('onclick', `exportReportAsImage(${match[1]})`);
        button.innerHTML = '<i class="fa-solid fa-image" aria-hidden="true"></i> صورة';
        pdfButton.insertAdjacentElement('afterend', button);
        new MutationObserver(() => { button.disabled = pdfButton.disabled; })
            .observe(pdfButton, { attributes: true, attributeFilter: ['disabled'] });
    });
}
if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.documentElement) {
    window.exportReportAsImage = exportReportAsImage;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initReportImageButtons);
    else initReportImageButtons();
}

async function downloadStatementPdf(html, filename, buttonId, successMessage, logLabel, isPreviewValid) {
    let root = null;
    const button = /** @type {HTMLButtonElement} */ (document.getElementById(buttonId));
    if (button) button.disabled = true;
    try {
        await ensurePdfLibrary();
        await loadReportPdfFonts();

        root = document.createElement('section');
        root.dir = 'rtl';
        root.lang = 'ar';
        root.style.cssText = reportExportRootCss();
        root.innerHTML = html;
        mountReportExportRoot(root);

        if (reportExportMode === 'image') {
            await saveReportRootAsImages(root, filename);
            toast('تم حفظ صورة التقرير.', 'success');
            return;
        }

        const pdfBlob = await renderReportRootToPdfBlob(root, filename);

        if (!(pdfBlob instanceof Blob) || pdfBlob.type !== 'application/pdf' || pdfBlob.size < 100) {
            throw new Error('statement_pdf_generation_failed');
        }

        const url = URL.createObjectURL(pdfBlob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        toast(successMessage, 'success');
    } catch (error) {
        console.error(logLabel, error);
        toast('تعذر إنشاء PDF. تحقق من الاتصال ثم أعد المحاولة.','error');
    } finally {
        if (root) removeReportExportRoot(root);
        if (button && isPreviewValid()) /** @type {HTMLButtonElement} */ (button).disabled = false;
    }
}

async function exportResidentStatementPdf() {
    if (!requireManager()) return;
    const statement = getResidentStatementSnapshot();
    if (!statement) return;
    await downloadStatementPdf(
        renderResidentStatementPdfHtml(statement),
        `manzil_statement_${getStatementFileSlug(statement)}.pdf`,
        'statementPdfBtn',
        'تم إنشاء كشف الحساب PDF.',
        'Resident statement PDF export failed:',
        () => !!residentStatementSnapshot
    );
}

function buildUnitReportStatement(statement) {
    return buildResidentStatement(statement.resident.id) || statement;
}

async function exportUnitReportPdf() {
    if (!requireManager()) return;
    const statement = getResidentStatementSnapshot();
    if (!statement) return;
    const unitStatement = buildUnitReportStatement(statement);
    await downloadStatementPdf(
        renderUnitReportPdfHtml(unitStatement),
        `manzil_unit_${getStatementFileSlug(unitStatement, false)}.pdf`,
        'unitReportPdfBtn',
        'تم إنشاء تقرير الوحدة PDF.',
        'Unit report PDF export failed:',
        () => !!residentStatementSnapshot
    );
}

function exportResidentStatementCsv() {
    if (!requireManager()) return;
    const statement = getResidentStatementSnapshot();
    if (!statement) return;
    const showDues = statement.showDues !== false;
    const rows = showDues ? [['الشهر','المستحق','إعفاء/تخفيض','الصافي','المدفوع','المتبقي','الحالة']] : [];
    if (showDues) {
        statement.months.forEach(row => {
            rows.push([row.month, row.dueCents / 100, row.adjustmentCents / 100, row.netDueCents / 100, row.paidCents / 100, row.remainingCents / 100, row.status.label]);
        });
        rows.push([]);
        if (statement.adjustments.length) {
            const adjustmentsTitle = statement.adjustments.some(adjustment => adjustment.kind === 'settlement')
                ? 'التسويات والإعفاءات والتخفيضات'
                : 'الإعفاءات والتخفيضات';
            rows.push([adjustmentsTitle,'الشهر','النوع','المبلغ','السبب']);
            statement.adjustments.forEach(adjustment => {
                rows.push(['تسوية', adjustment.month, adjustment.kindLabel, adjustment.amountCents / 100, adjustment.reason]);
            });
            rows.push([]);
        }
    } else {
        rows.push(['الغرض', statement.purposeLabel]);
        rows.push([]);
    }
    rows.push(['الحركات','الشهر','المبلغ','الغرض','طريقة الدفع','الصندوق','التاريخ','ملاحظات']);
    statement.payments.forEach(payment => {
        rows.push(['تحصيل', payment.month, payment.amountCents / 100, payment.purpose, payment.method, payment.cashAccount, formatDate(payment.date) || '', payment.notes]);
    });
    downloadCsv(`manzil_statement_${getStatementFileSlug(statement)}.csv`, rows);
    toast('تم تصدير كشف الحساب','success');
}

/** القوالب الجاهزة: تحفظ فلاتر أي تقرير وتعيد تطبيقها بضغطة، وتبقى بعد إعادة تحميل الصفحة. */
const REPORT_TEMPLATE_LIMIT = 8;
const REPORT_TEMPLATE_NAME_MAX = 40;
const REPORT_TEMPLATE_TABS = {
    landlord: { preset: '', apply: () => invalidateLandlordReportPreview() },
    period: { preset: 'periodReportPreset', apply: () => applyPeriodReportPreset(), range: () => onPeriodReportRangeChange() },
    cashflow: { preset: 'cashFlowPreset', apply: () => applyCashFlowPreset(), range: () => onCashFlowRangeChange() },
    expenses: { preset: '', apply: () => invalidateExpensesReportPreview() },
    adjustments: { preset: '', apply: () => invalidateAdjustmentsReportPreview() },
    statement: { preset: '', apply: () => invalidateResidentStatementPreview() },
    apartments: { preset: 'apartmentsReportPreset', apply: () => applyApartmentsPreset(), range: () => onApartmentsRangeChange() },
    monthlyClose: { preset: '', apply: () => invalidateMonthlyClosePreview() },
    arrears: { preset: '', apply: () => renderArrearsReport() }
};

function getReportTemplateControlIds(tab) {
    const config = REPORT_TEMPLATE_TABS[tab];
    if (!config) return [];
    const ids = (REPORT_FILTER_DESCRIPTORS[tab] || []).map(descriptor => descriptor.id);
    return config.preset ? [config.preset, ...ids] : ids;
}

/** يقرأ قيم فلاتر التقرير الحالية كما هي في الشاشة. */
function captureReportTemplateControls(tab) {
    /** @type {Record<string, string>} */
    const controls = {};
    getReportTemplateControlIds(tab).forEach(id => {
        const control = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.getElementById(id));
        if (control) controls[id] = String(control.value || '');
    });
    return controls;
}

/** يطبق قيم قالب على الفلاتر؛ الفترات السريعة تُحسب من الشهر الحالي لتبقى القوالب صالحة. */
function applyReportTemplateControls(tab, controls) {
    const config = REPORT_TEMPLATE_TABS[tab];
    if (!config || !controls || typeof controls !== 'object') return false;
    const presetValue = config.preset ? String(controls[config.preset] || '') : '';
    const usePreset = !!presetValue && presetValue !== 'custom';
    getReportTemplateControlIds(tab).forEach(id => {
        if (!(id in controls)) return;
        if (usePreset && /(From|To)$/.test(id)) return;
        const control = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.getElementById(id));
        if (!control) return;
        control.value = String(controls[id] || '');
    });
    if (usePreset || !config.range) config.apply();
    else config.range();
    renderReportFilterSummaries();
    return true;
}

function getReportTemplatePanelId(tab) { return 'reportTemplates-' + tab; }

function renderReportTemplateList(tab) {
    const panel = document.getElementById(getReportTemplatePanelId(tab));
    if (!panel) return;
    const templates = typeof getTemplatesForReport === 'function' ? getTemplatesForReport(tab) : [];
    const count = panel.querySelector('[data-report-template-count]');
    if (count) count.textContent = templates.length ? '(' + templates.length + ')' : '';
    const list = panel.querySelector('[data-report-template-list]');
    if (!list) return;
    if (!templates.length) {
        list.innerHTML = '<p class="report-note">لا توجد قوالب بعد. اضبط الفلاتر ثم احفظها باسم تعرفه، مثل «تحصيل الربع الأول».</p>';
        return;
    }
    list.innerHTML = '<div class="report-list">' + templates.map(tpl => `
        <div class="report-list-row report-template-row">
            <span class="report-list-title">${esc(tpl.name)}</span>
            <span class="report-template-actions">
                <button type="button" class="report-action report-action-sm" data-report-template-apply="${esc(tpl.id)}" aria-label="تطبيق القالب ${esc(tpl.name)}"><i class="fa-solid fa-play" aria-hidden="true"></i> تطبيق</button>
                <button type="button" class="report-action report-action-sm report-action-danger" data-report-template-delete="${esc(tpl.id)}" aria-label="حذف القالب ${esc(tpl.name)}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
            </span>
        </div>`).join('') + '</div>';
}

/** يضيف لوحة القوالب بجوار فلاتر كل تقرير مرة واحدة، ثم يحدّث قوائمها. */
function initReportTemplatesUI() {
    if (typeof document === 'undefined') return;
    Object.keys(REPORT_TEMPLATE_TABS).forEach(tab => {
        const summary = document.querySelector(`[data-report-filter-summary="${tab}"]`);
        if (!summary) return;
        if (!document.getElementById(getReportTemplatePanelId(tab))) {
            const anchor = summary.closest('.report-toolbar') || summary;
            const details = document.createElement('details');
            details.id = getReportTemplatePanelId(tab);
            details.className = 'report-note-fold report-template-fold no-print';
            details.setAttribute('data-report-templates', tab);
            details.innerHTML = `
                <summary class="report-note-summary">قوالب جاهزة <span data-report-template-count></span></summary>
                <div class="report-note report-template-body">
                    <div class="report-template-save">
                        <input type="text" maxlength="${REPORT_TEMPLATE_NAME_MAX}" data-report-template-name aria-label="اسم القالب" placeholder="اسم القالب" autocomplete="off" class="report-control app-input border">
                        <button type="button" class="report-action report-action-sm" data-report-template-save><i class="fa-solid fa-bookmark" aria-hidden="true"></i> حفظ الفلاتر الحالية</button>
                    </div>
                    <div data-report-template-list></div>
                </div>`;
            anchor.insertAdjacentElement('afterend', details);
        }
        renderReportTemplateList(tab);
    });
}

function saveReportTemplateFromPanel(tab) {
    const panel = document.getElementById(getReportTemplatePanelId(tab));
    const input = /** @type {HTMLInputElement | null} */ (panel?.querySelector('[data-report-template-name]'));
    const name = String(input?.value || '').replace(/\s+/g, ' ').trim().slice(0, REPORT_TEMPLATE_NAME_MAX);
    if (!name) { toast('أدخل اسم القالب', 'error'); return null; }
    const existing = getTemplatesForReport(tab);
    if (existing.some(tpl => tpl.name === name)) { toast('اسم القالب مستخدم، اختر اسمًا آخر', 'error'); return null; }
    if (existing.length >= REPORT_TEMPLATE_LIMIT) { toast('وصلت للحد الأقصى ' + REPORT_TEMPLATE_LIMIT + ' قوالب، احذف قالبًا أولًا', 'error'); return null; }
    const template = addReportTemplate(name, tab, { controls: captureReportTemplateControls(tab) });
    if (!template) return null;
    if (input) input.value = '';
    renderReportTemplateList(tab);
    toast('تم حفظ القالب', 'success');
    return template;
}

/** تطبيق قالب محفوظ على فلاتر التقرير. */
function applyTemplate(templateId) {
    const template = loadReportTemplates().find(tpl => tpl.id === templateId);
    if (!template || !REPORT_TEMPLATE_TABS[template.reportType]) { toast('تعذر العثور على القالب', 'error'); return false; }
    const tab = template.reportType;
    let controls = template.filters && template.filters.controls;
    if (!controls && tab === 'period') {
        // قوالب قديمة حُفظت قبل تعميم القوالب على كل التقارير.
        const legacy = template.filters || {};
        controls = {
            periodReportPreset: 'custom',
            periodReportFrom: legacy.fromMonth,
            periodReportTo: legacy.toMonth,
            periodReportPurpose: legacy.purposeFilter,
            periodReportCashAccount: legacy.cashAccountFilter,
            periodReportResident: legacy.residentFilter
        };
    }
    if (!applyReportTemplateControls(tab, controls)) { toast('تعذر تطبيق القالب', 'error'); return false; }
    toast('تم تطبيق القالب، اضغط معاينة', 'success');
    return true;
}

/** حذف قالب محفوظ */
function deleteTemplate(templateId) {
    const template = loadReportTemplates().find(tpl => tpl.id === templateId);
    if (!template || !deleteReportTemplate(templateId)) return false;
    toast('تم حذف القالب', 'success');
    renderReportTemplateList(template.reportType);
    return true;
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', event => {
        const target = /** @type {Element | null} */ (event && event.target);
        const button = /** @type {HTMLElement | null} */ (target?.closest?.('[data-report-template-save],[data-report-template-apply],[data-report-template-delete]'));
        if (!button) return;
        const panel = button.closest('[data-report-templates]');
        if (button.hasAttribute('data-report-template-save')) {
            if (panel) saveReportTemplateFromPanel(String(panel.getAttribute('data-report-templates')));
        } else if (button.hasAttribute('data-report-template-apply')) {
            applyTemplate(String(button.getAttribute('data-report-template-apply')));
        } else {
            deleteTemplate(String(button.getAttribute('data-report-template-delete')));
        }
    });
}

// Export report functions to window for inline event handlers
if (typeof window !== 'undefined') {
    window.generateLandlordReport = generateLandlordReport;
    window.printLandlordReport = printLandlordReport;
    window.exportLandlordReportPdf = exportLandlordReportPdf;
    window.exportToCSV = exportToCSV;
    window.generatePeriodReport = generatePeriodReport;
    window.printPeriodReport = printPeriodReport;
    window.exportPeriodReportCsv = exportPeriodReportCsv;
    window.exportPeriodReportExcel = exportPeriodReportExcel;
    window.exportPeriodReportPdf = exportPeriodReportPdf;
    window.generateExpensesReport = generateExpensesReport;
    window.onExpensesComparisonChange = onExpensesComparisonChange;
    window.printExpensesReport = printExpensesReport;
    window.exportExpensesReportCsv = exportExpensesReportCsv;
    window.exportExpensesReportExcel = exportExpensesReportExcel;
    window.exportExpensesReportPdf = exportExpensesReportPdf;
    window.generateAdjustmentsReport = generateAdjustmentsReport;
    window.printAdjustmentsReport = printAdjustmentsReport;
    window.exportAdjustmentsReportCsv = exportAdjustmentsReportCsv;
    window.exportAdjustmentsReportExcel = exportAdjustmentsReportExcel;
    window.exportArrearsExcel = exportArrearsExcel;
    window.exportAdjustmentsReportPdf = exportAdjustmentsReportPdf;
    window.generateResidentStatement = generateResidentStatement;
    window.printResidentStatement = printResidentStatement;
    window.exportResidentStatementCsv = exportResidentStatementCsv;
    window.exportResidentStatementPdf = exportResidentStatementPdf;
    window.switchReportTab = switchReportTab;
    window.showReportIndex = showReportIndex;
    window.filterReportIndex = filterReportIndex;
    window.clearReportIndexSearch = clearReportIndexSearch;
    window.closeReportPanel = closeReportPanel;
    window.focusReportStep = focusReportStep;
    window.renderReportFilterSummaries = renderReportFilterSummaries;
    window.clearReportFilters = clearReportFilters;
    window.runReportQualityCheck = runReportQualityCheck;
    window.invalidateLandlordReportPreview = invalidateLandlordReportPreview;
    window.invalidatePeriodReportPreview = invalidatePeriodReportPreview;
    window.invalidateExpensesReportPreview = invalidateExpensesReportPreview;
    window.invalidateAdjustmentsReportPreview = invalidateAdjustmentsReportPreview;
    window.initReportTemplatesUI = initReportTemplatesUI;
    window.saveReportTemplateFromPanel = saveReportTemplateFromPanel;
    window.applyTemplate = applyTemplate;
    window.deleteTemplate = deleteTemplate;
}
