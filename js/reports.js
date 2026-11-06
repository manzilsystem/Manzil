// @ts-check
let landlordReportMonth = '';
let landlordReportSignature = '';
let landlordReportPurposeFilter = '';
let landlordReportCashAccountFilter = '';
let landlordReportPaymentMethodFilter = '';
let landlordReportResidentFilter = '';

const REPORT_TABS = ['landlord', 'period', 'expenses', 'adjustments', 'statement', 'monthlyClose', 'arrears', 'audit'];
const REPORT_PANEL_IDS = {
    landlord: 'landlordReportPrint',
    period: 'periodReportCard',
    expenses: 'expensesReportCard',
    adjustments: 'adjustmentsReportCard',
    statement: 'residentStatementCard',
    monthlyClose: 'monthlyClosePanel',
    arrears: 'arrearsPanel',
    audit: 'auditLogPanel'
};
const REPORT_OUTPUT_BUTTON_IDS = {
    landlord: 'reportPrintBtn',
    period: 'periodReportPrintBtn',
    expenses: 'expensesReportPrintBtn',
    adjustments: 'adjustmentsReportPrintBtn',
    statement: 'statementPrintBtn',
    monthlyClose: 'monthlyClosePdfButton'
};

const REPORT_TONE_CLASSES = ['report-tone-indigo', 'report-tone-emerald', 'report-tone-amber', 'report-tone-rose', 'report-tone-sky'];

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
    if (typeof isSubscriptionIncome === 'function') return isSubscriptionIncome(payment);
    const purpose = String(payment?.purposeCode || '').trim();
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

function getReportView() {
    return document.getElementById('tab-reports')?.dataset.reportView === 'panel' ? 'panel' : 'grid';
}

function renderReportViewBar(tab) {
    const bar = document.getElementById('reportViewBar');
    const item = document.querySelector(`[data-report-nav="${tab}"]`);
    if (!bar || !item) return;
    REPORT_TONE_CLASSES.forEach(tone => bar.classList.remove(tone));
    const tone = REPORT_TONE_CLASSES.find(name => item.classList.contains(name));
    if (tone) bar.classList.add(tone);
    document.getElementById('reportViewIcon').innerHTML = item.querySelector('.report-nav-icon')?.innerHTML || '';
    document.getElementById('reportViewTitle').textContent = item.querySelector('.report-nav-copy b')?.textContent || '';
    document.getElementById('reportViewMeta').textContent = item.querySelector('.report-nav-copy small')?.textContent || '';
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
    document.getElementById('tab-reports')?.setAttribute('data-report-view', 'grid');
    if (focusCard && opened) opened.focus();
}

function showReportGrid() {
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

function handleReportTabKeydown(event) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const items = [...document.querySelectorAll('[data-report-nav]')];
    const current = document.activeElement?.closest?.('[data-report-nav]');
    const currentIndex = items.indexOf(current);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
            ? items.length - 1
            : (currentIndex + (event.key === 'ArrowLeft' ? 1 : -1) + items.length) % items.length;
    /** @type {HTMLElement} */ (items[nextIndex]).focus();
}

function handleReportViewKeydown(event) {
    if (event.key !== 'Escape' || getReportView() !== 'panel') return;
    if (typeof getTopmostOpenModal === 'function' && getTopmostOpenModal()) return;
    if (document.getElementById('tab-reports')?.classList.contains('hidden')) return;
    event.preventDefault();
    showReportGrid();
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
        item.classList.toggle('is-stale', !ready && /** @type {HTMLElement} */ (preview)?.dataset.stale === 'true');
    });
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
        totals.grossExpectedCents += toCents(getSubscriptionAmountForMonth(resident, month));
        if (typeof getAdjustmentAmountForMonth === 'function') {
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
    const showDues = reportShowsSubscriptionDues(purposeFilter) && !cashAccountFilter && !paymentMethodFilter;
    const filterLabel = reportPurposeFilterLabel(purposeFilter);
    const cashAccountLabel = reportCashAccountFilterLabel(cashAccountFilter);
    const paymentMethodLabel = reportPaymentMethodFilterLabel(paymentMethodFilter);
    const residentLabel = reportResidentFilterLabel(residentFilter);
    const { income: inc, expenses: exp } = getLandlordReportData(month, purposeFilter, cashAccountFilter, paymentMethodFilter, residentFilter);
    const totalIncCents = inc.reduce((sum, i) => sum + toCents(i.amount), 0);
    const subscriptionIncCents = inc
        .filter(item => reportIsSubscriptionPayment(item))
        .reduce((sum, item) => sum + toCents(item.amount), 0);
    const totalExpCents = exp.reduce((sum, e) => sum + toCents(e.amount), 0);
    const netCents = totalIncCents - totalExpCents;
    const { expectedCents, outstandingCents, adjustmentCents } = showDues
        ? getMonthlyBillingTotals(month, residentFilter)
        : { expectedCents: 0, outstandingCents: 0, adjustmentCents: 0 };
    const collectionRate = showDues && expectedCents > 0 ? Math.round((subscriptionIncCents / expectedCents) * 100) : null;
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
        totalExpCents,
        netCents,
        expectedCents,
        outstandingCents,
        adjustmentCents,
        collectionRate,
        expenseCategories: getExpenseCategoryTotals(exp),
        paymentMethodTotals,
        purposeTotals
    };
}

function getLandlordSummaryItems(model) {
    if (model.showDues) {
        return [
            { label: 'تحصيل', cents: model.totalIncCents, tone: 'emerald', detail: { label: 'منها اشتراكات', cents: model.subscriptionIncCents } },
            { label: 'مصروف', cents: model.totalExpCents, tone: 'rose' },
            { label: 'صافي', cents: model.netCents, tone: model.netCents >= 0 ? 'emerald' : 'rose' },
            { label: 'المستحق', cents: model.expectedCents },
            ...(model.adjustmentCents > 0
                ? [{ label: 'إعفاء/تخفيض', cents: model.adjustmentCents, tone: 'amber' }]
                : []),
            { label: 'غير المحصّل', cents: model.outstandingCents, tone: model.outstandingCents > 0 ? 'amber' : 'emerald' },
            { label: 'نسبة التحصيل', text: model.collectionRate === null ? '—' : fmtNum(model.collectionRate) + '%' }
        ];
    }
    return [
        { label: model.paymentMethodFilter ? 'تحصيل الطريقة' : model.residentFilter ? 'تحصيل الشقة' : 'تحصيل الغرض', cents: model.totalIncCents, tone: 'emerald' },
        { label: 'عدد الحركات', text: fmtNum(model.inc.length) },
        { label: 'مصروف الشهر', cents: model.totalExpCents, tone: 'rose' },
        { label: 'صافي الحركة', cents: model.netCents, tone: model.netCents >= 0 ? 'emerald' : 'rose' }
    ];
}

function renderReportStatTiles(items, compact = false) {
    const body = items.map(item => {
        const value = item.text !== undefined ? esc(item.text) : fmtMoney(item.cents / 100);
        const tone = item.tone ? ' text-' + item.tone + '-400' : '';
        return '<div class="report-stat"><p class="report-stat-label">' + esc(item.label) +
            '</p><p class="report-stat-value' + tone + '">' + value + '</p></div>';
    }).join('');
    return '<div class="' + (compact ? 'report-stats report-stats-4' : 'report-stats') + '">' + body + '</div>';
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
                ? [{ label: 'إعفاء/تخفيض', cents: statement.totals.adjustmentCents, tone: 'amber' }]
                : []),
            { label: 'مدفوع الاشتراكات', cents: statement.totals.paidCents, tone: 'emerald' },
            ...(!statement.purposeFilter ? [{ label: 'إجمالي حركات التحصيل', cents: statement.totals.filteredPaidCents, tone: 'emerald' }] : []),
            { label: 'إجمالي المتبقي', cents: statement.totals.remainingCents, tone: statement.totals.remainingCents ? 'rose' : 'emerald' },
            { label: 'أشهر متأخرة', text: fmtNum(statement.totals.arrearsMonths), tone: statement.totals.arrearsMonths ? 'amber' : 'emerald' }
        ];
    }
    return [
        { label: 'مدفوع الغرض', cents: statement.totals.filteredPaidCents, tone: 'emerald' },
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

function generateLandlordReport() {
    if (!requireManager()) return;
    const m = /** @type {HTMLSelectElement} */ (document.getElementById('reportMonthSelect')).value;
    if (!m) { toast('اختر شهر','error'); return; }
    const purposeFilter = getReportPurposeFilter('landlordReportPurpose');
    const cashAccountFilter = getReportCashAccountFilter('landlordReportCashAccount');
    const paymentMethodFilter = getReportPaymentMethodFilter('landlordReportPaymentMethod');
    const residentFilter = getReportResidentFilter('landlordReportResident');
    const model = buildLandlordReportModel(m, purposeFilter, cashAccountFilter, paymentMethodFilter, residentFilter);
    const { showDues, filterLabel, cashAccountLabel, paymentMethodLabel, residentLabel, inc, exp, residentsById, purposeTotals, paymentMethodTotals, expenseCategories } = model;
    const expenseCategorySummary = expenseCategories.map(([label, totals]) =>
        '<div class="report-list-row"><span class="report-list-title">' +
        esc(label) + ' <span class="report-list-meta">(' + totals.count + ')</span></span>' +
        '<span class="report-list-value text-rose-400 report-amount">' + fmtMoney(totals.cents / 100) + '</span></div>'
    ).join('');
    const paymentMethodSummary = Array.from(paymentMethodTotals.entries()).map(([label, totals]) =>
        '<div class="report-list-row"><span class="report-list-title">' +
        esc(label) + ' <span class="report-list-meta">(' + totals.count + ')</span></span>' +
        '<span class="report-list-value text-emerald-400 report-amount">' + fmtMoney(totals.cents / 100) + '</span></div>'
    ).join('');
    const purposeSummary = Array.from(purposeTotals.entries()).map(([label, totals]) =>
        '<div class="report-list-row"><span class="report-list-title">' +
        esc(label) + ' <span class="report-list-meta">(' + totals.count + ')</span></span>' +
        '<span class="report-list-value text-emerald-400 report-amount">' + fmtMoney(totals.cents / 100) + '</span></div>'
    ).join('');
    const statsHtml = renderReportStatTiles(getLandlordSummaryItems(model), !showDues);
    document.getElementById('landlordReportPreview').innerHTML = `
        <div class="space-y-3">
            <header class="report-preview-header">
                <h3 class="report-preview-title">${esc(state.buildingName||'العمارة')}</h3>
                <p class="report-preview-meta">تقرير ${esc(m)}${purposeFilter ? ' • الغرض: ' + esc(filterLabel) : ''}${cashAccountFilter ? ' • الصندوق: ' + esc(cashAccountLabel) : ''}${paymentMethodFilter ? ' • طريقة الدفع: ' + esc(paymentMethodLabel) : ''}${residentFilter ? ' • الشقة: ' + esc(residentLabel) : ''} • تم الإنشاء ${formatDate(new Date().toISOString())}</p>
            </header>
            ${statsHtml}
            <div class="report-block">
                <p class="report-block-title"><span>التحصيل حسب الغرض</span><span class="report-block-count">${fmtNum(purposeTotals.size)}</span></p>
                ${purposeSummary ? '<div class="report-list">' + purposeSummary + '</div>' : '<p class="report-note">لا يوجد</p>'}
            </div>
            <div class="report-block">
                <p class="report-block-title"><span>توزيع طرق الدفع</span><span class="report-block-count">${fmtNum(paymentMethodTotals.size)}</span></p>
                ${paymentMethodSummary ? '<div class="report-list">' + paymentMethodSummary + '</div>' : '<p class="report-note">لا يوجد</p>'}
            </div>
            <div class="report-block">
                <p class="report-block-title"><span>تصنيفات المصروفات</span><span class="report-block-count">${fmtNum(expenseCategories.length)}</span></p>
                ${expenseCategorySummary ? '<div class="report-list">' + expenseCategorySummary + '</div>' : '<p class="report-note">لا يوجد</p>'}
            </div>
            <div class="report-block">
                <p class="report-block-title"><span>تفاصيل التحصيلات</span><span class="report-block-count">${fmtNum(inc.length)}</span></p>
                ${inc.length ? '<div class="report-list">' + inc.map(i => { const r = residentsById.get(i.residentId); return '<div class="report-list-row"><span class="report-list-title">' + esc(r?.name || '—') + ' <span class="report-list-meta">· ' + esc(reportPurposeLabel(i.purposeCode)) + ' · ' + esc(getIncomePaymentMethodLabel(i.paymentMethod)) + '</span></span><span class="report-list-value text-emerald-400 report-amount">' + fmtMoney(toCents(i.amount) / 100) + '</span></div>'; }).join('') + '</div>' : '<p class="report-note">لا يوجد</p>'}
            </div>
            <div class="report-block">
                <p class="report-block-title"><span>تفاصيل المصروفات</span><span class="report-block-count">${fmtNum(exp.length)}</span></p>
                ${exp.length ? '<div class="report-list">' + exp.map(e => '<div class="report-list-row"><span class="report-list-title">' + esc(e.title) + '</span><span class="report-list-value text-rose-400 report-amount">' + fmtMoney(toCents(e.amount) / 100) + '</span></div>').join('') + '</div>' : '<p class="report-note">لا يوجد</p>'}
            </div>
            <div class="report-note report-divider text-center"><p>${residentFilter
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
                        : 'المستحق محسوب بقيمة الاشتراك السارية في شهر التقرير، ونسبة التحصيل تعتمد على تحصيلات الاشتراك فقط.'}</p></div>
        </div>`;
    landlordReportMonth = m;
    landlordReportPurposeFilter = purposeFilter;
    landlordReportCashAccountFilter = cashAccountFilter;
    landlordReportPaymentMethodFilter = paymentMethodFilter;
    landlordReportResidentFilter = residentFilter;
    landlordReportSignature = getLandlordReportSignature(m, purposeFilter, cashAccountFilter, paymentMethodFilter, residentFilter);
    setLandlordReportActionsEnabled(true);
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

function printCurrentView() {
    document.body.classList.remove('print-landlord');
    const title = document.getElementById('printBuildingTitle');
    const meta = document.getElementById('printBuildingMeta');
    if (title) title.textContent = `كشف حساب مالي - ${state.buildingName || 'Manzil'}`;
    if (meta) meta.textContent = `المدير: ${state.managerName || '—'} • ${getCurrentMonth()}`;
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
    ).join('') || '<tr><td colspan="2" style="padding:8px;border:1px solid #cbd5e1;text-align:center;color:#475569">لا يوجد</td></tr>';

    const expenseCategoryRows = expenseCategories.map(([label, totals]) =>
        '<tr>' + statementPdfCell(esc(label) + ' (' + totals.count + ')') +
        statementPdfCell(fmtMoney(totals.cents / 100), 'color:#be123c;font-weight:700') + '</tr>'
    ).join('') || '<tr><td colspan="2" style="padding:8px;border:1px solid #cbd5e1;text-align:center;color:#475569">لا يوجد</td></tr>';

    const purposeRows = Array.from(purposeTotals.entries()).map(([label, totals]) =>
        '<tr>' + statementPdfCell(esc(label) + ' (' + totals.count + ')') +
        statementPdfCell(fmtMoney(totals.cents / 100), 'color:#047857;font-weight:700') + '</tr>'
    ).join('') || '<tr><td colspan="2" style="padding:8px;border:1px solid #cbd5e1;text-align:center;color:#475569">لا يوجد</td></tr>';

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
        : '<tr><td colspan="4" style="padding:8px;border:1px solid #cbd5e1;text-align:center;color:#475569">لا يوجد</td></tr>';

    const expenseRows = exp.length
        ? exp.map(e =>
            '<tr>' +
            statementPdfCell(esc(e.title || '—')) +
            statementPdfCell(esc(e.category || 'غير مصنف')) +
            statementPdfCell(fmtMoney(toCents(e.amount) / 100), 'color:#be123c;font-weight:700') +
            '</tr>').join('')
        : '<tr><td colspan="3" style="padding:8px;border:1px solid #cbd5e1;text-align:center;color:#475569">لا يوجد</td></tr>';

    return [
        '<div dir="rtl" lang="ar" style="font-family:Cairo,Arial,sans-serif;color:#111827;background:#fff;line-height:1.8">',
        '<header style="text-align:center;border-bottom:2px solid #334155;padding-bottom:12px;margin-bottom:18px">',
        '<h1 style="font-size:22px;font-weight:800;margin:0">', esc(state.buildingName || 'Manzil'), '</h1>',
        '<h2 style="font-size:17px;font-weight:700;margin:4px 0">تقرير الملاك — ', esc(month),
        purposeFilter ? ' • الغرض: ' + esc(filterLabel) : '',
        cashAccountFilter ? ' • الصندوق: ' + esc(cashAccountLabel) : '',
        paymentMethodFilter ? ' • طريقة الدفع: ' + esc(paymentMethodLabel) : '',
        residentFilter ? ' • الشقة: ' + esc(residentLabel) : '', '</h2>',
        '<p style="font-size:11px;color:#475569;margin:0">المدير: ', esc(state.managerName || '—'),
        ' • تم الإنشاء ', esc(formatDate(new Date().toISOString())), '</p></header>',
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
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#e2e8f0">',
        '<th style="padding:6px;border:1px solid #cbd5e1">الساكن</th><th style="padding:6px;border:1px solid #cbd5e1">الغرض</th><th style="padding:6px;border:1px solid #cbd5e1">طريقة الدفع</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">المبلغ</th></tr></thead><tbody>', incomeRows, '</tbody></table></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">تفاصيل المصروفات</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#e2e8f0">',
        '<th style="padding:6px;border:1px solid #cbd5e1">البيان</th><th style="padding:6px;border:1px solid #cbd5e1">التصنيف</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">المبلغ</th></tr></thead><tbody>', expenseRows, '</tbody></table></section>',
        '<p style="font-size:10px;color:#475569;border-top:1px solid #cbd5e1;padding-top:10px">',
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
        '</p><footer style="font-size:9px;color:#64748b;margin-top:18px;text-align:center">Manzil — ',
        esc(formatDate(new Date().toISOString())), '</footer></div>'
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
        if (document.fonts && document.fonts.ready) await document.fonts.ready;

        root = document.createElement('section');
        root.dir = 'rtl';
        root.lang = 'ar';
        root.style.cssText = 'position:fixed;top:0;left:0;width:190mm;padding:8mm;box-sizing:border-box;background:#fff;z-index:-1';
        root.innerHTML = renderLandlordReportPdfHtml(landlordReportMonth, landlordReportPurposeFilter, landlordReportCashAccountFilter, landlordReportPaymentMethodFilter, landlordReportResidentFilter);
        document.body.appendChild(root);

        const pdfBlob = await window.html2pdf().set({
            margin: 8,
            filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        }).from(root).outputPdf('blob');

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
        if (root) root.remove();
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

function getPeriodCollectionRate(expectedCents, collectedCents) {
    return expectedCents > 0 ? Math.round((collectedCents / expectedCents) * 100) : null;
}

function buildPeriodReport(fromMonth, toMonth, purposeFilter = '', cashAccountFilter = '', residentFilter = '') {
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
            .filter(item => reportIsSubscriptionPayment(item))
            .reduce((sum, item) => sum + toCents(item.amount), 0);
        const otherIncomeCents = totalIncomeCents - collectedCents;
        const expenseCents = filterReportExpenses(
            (state.expenses || []).filter(item => item.month === month),
            normalizedCashAccount
        ).reduce((sum, item) => sum + toCents(item.amount), 0);
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
        acc.outstandingCents += row.outstandingCents;
        acc.expenseCents += row.expenseCents;
        if (row.outstandingCents > 0) acc.unpaidMonths += 1;
        return acc;
    }, { expectedCents: 0, adjustmentCents: 0, totalIncomeCents: 0, movementCount: 0, collectedCents: 0, otherIncomeCents: 0, outstandingCents: 0, expenseCents: 0, unpaidMonths: 0, netCents: 0, rate: null });
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
    ['periodReportPrintBtn', 'periodReportExportBtn'].forEach(id => {
        const button = /** @type {HTMLButtonElement} */ (document.getElementById(id));
        if (button) button.disabled = !enabled;
    });
    markReportPreviewStale('periodReportPreview', !enabled);
    syncReportNavStatus();
}

function clearPeriodReportPreview(message) {
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
    const monthRows = showDues
        ? report.months.map(row => `
        <tr>
            <td>${esc(row.month)}</td>
            <td>${fmtMoney(row.expectedCents / 100)}</td>
            <td class="text-emerald-400">${fmtMoney(row.collectedCents / 100)}</td>
            <td class="${row.outstandingCents ? 'text-rose-400' : ''}">${fmtMoney(row.outstandingCents / 100)}</td>
            <td>${row.rate === null ? '—' : fmtNum(row.rate) + '%'}</td>
            <td class="${row.expenseCents ? 'text-rose-400' : ''}">${fmtMoney(row.expenseCents / 100)}</td>
            <td class="${row.netCents >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${fmtMoney(row.netCents / 100)}</td>
        </tr>`).join('')
        : report.months.map(row => `
        <tr>
            <td>${esc(row.month)}</td>
            <td class="text-emerald-400">${fmtMoney(row.totalIncomeCents / 100)}</td>
            <td>${fmtNum(row.movementCount)}</td>
            <td class="${row.expenseCents ? 'text-rose-400' : ''}">${fmtMoney(row.expenseCents / 100)}</td>
            <td class="${row.netCents >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${fmtMoney(row.netCents / 100)}</td>
        </tr>`).join('');
    const totals = report.totals;
    const methodSummary = report.methods.map(item => `
        <div class="report-list-row">
            <span class="report-list-title">${esc(item.label)} <span class="report-list-meta">· ${fmtNum(item.count)} حركة · ${item.share === null ? '—' : fmtNum(item.share) + '%'}</span></span>
            <span class="report-list-value text-emerald-400 report-amount">${fmtMoney(item.cents / 100)}</span>
        </div>`).join('');
    const purposeSummary = (report.purposes || []).map(item => `
        <div class="report-list-row">
            <span class="report-list-title">${esc(item.label)} <span class="report-list-meta">· ${fmtNum(item.count)} حركة</span></span>
            <span class="report-list-value text-emerald-400 report-amount">${fmtMoney(item.cents / 100)}</span>
        </div>`).join('');
    const unpaidNote = showDues && totals.unpaidMonths > 0
        ? `<p>${fmtNum(totals.unpaidMonths)} شهر من الفترة فيه متبقٍّ غير محصّل.</p>`
        : '';
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
        ? `<div class="report-stats">
                <div class="report-stat"><p class="report-stat-label">المستحق</p><p class="report-stat-value">${fmtMoney(totals.expectedCents / 100)}</p></div>
                ${totals.adjustmentCents > 0 ? `<div class="report-stat"><p class="report-stat-label">إعفاء/تخفيض</p><p class="report-stat-value text-amber-400">${fmtMoney(totals.adjustmentCents / 100)}</p></div>` : ''}
                <div class="report-stat"><p class="report-stat-label">المحصّل</p><p class="report-stat-value text-emerald-400">${fmtMoney(totals.collectedCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">غير المحصّل</p><p class="report-stat-value ${totals.outstandingCents > 0 ? 'text-amber-400' : 'text-emerald-400'}">${fmtMoney(totals.outstandingCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">نسبة التحصيل</p><p class="report-stat-value">${totals.rate === null ? '—' : fmtNum(totals.rate) + '%'}</p></div>
                <div class="report-stat"><p class="report-stat-label">إيرادات أخرى</p><p class="report-stat-value text-sky-400">${fmtMoney(totals.otherIncomeCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">المصروف</p><p class="report-stat-value text-rose-400">${fmtMoney(totals.expenseCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">الصافي</p><p class="report-stat-value ${totals.netCents >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${fmtMoney(totals.netCents / 100)}</p></div>
            </div>`
        : `<div class="report-stats report-stats-4">
                <div class="report-stat"><p class="report-stat-label">${incomeStatLabel}</p><p class="report-stat-value text-emerald-400">${fmtMoney(totals.totalIncomeCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">عدد الحركات</p><p class="report-stat-value">${fmtNum(totals.movementCount)}</p></div>
                <div class="report-stat"><p class="report-stat-label">المصروف</p><p class="report-stat-value text-rose-400">${fmtMoney(totals.expenseCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">الصافي</p><p class="report-stat-value ${totals.netCents >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${fmtMoney(totals.netCents / 100)}</p></div>
            </div>`;
    const tableHtml = showDues
        ? `<div class="report-table-wrap">
                <table class="statement-table">
                    <thead><tr><th>الشهر</th><th>المستحق</th><th>المحصّل</th><th>غير المحصّل</th><th>نسبة التحصيل</th><th>المصروف</th><th>الصافي</th></tr></thead>
                    <tbody>${monthRows}</tbody>
                    <tfoot><tr><td>الإجمالي</td><td>${fmtMoney(totals.expectedCents / 100)}</td><td>${fmtMoney(totals.collectedCents / 100)}</td><td>${fmtMoney(totals.outstandingCents / 100)}</td><td>${totals.rate === null ? '—' : fmtNum(totals.rate) + '%'}</td><td>${fmtMoney(totals.expenseCents / 100)}</td><td>${fmtMoney(totals.netCents / 100)}</td></tr></tfoot>
                </table>
            </div>`
        : `<div class="report-table-wrap">
                <table class="statement-table">
                    <thead><tr><th>الشهر</th><th>${incomeStatLabel}</th><th>عدد الحركات</th><th>المصروف</th><th>الصافي</th></tr></thead>
                    <tbody>${monthRows}</tbody>
                    <tfoot><tr><td>الإجمالي</td><td>${fmtMoney(totals.totalIncomeCents / 100)}</td><td>${fmtNum(totals.movementCount)}</td><td>${fmtMoney(totals.expenseCents / 100)}</td><td>${fmtMoney(totals.netCents / 100)}</td></tr></tfoot>
                </table>
            </div>`;
    return `
        <div class="space-y-3">
            <header class="report-preview-header">
                <h3 class="report-preview-title">${esc(state.buildingName || 'العمارة')}</h3>
                <p class="report-preview-meta">تقرير الفترة ${esc(report.rangeLabel)}${report.purposeFilter ? ' • الغرض: ' + esc(report.purposeLabel) : ''}${report.cashAccountFilter ? ' • الصندوق: ' + esc(report.cashAccountLabel) : ''}${report.residentFilter ? ' • الشقة: ' + esc(report.residentLabel) : ''} • تم الإنشاء ${esc(formatDate(report.generatedAt))}</p>
            </header>
            ${statsHtml}
            ${tableHtml}
            <div class="report-block">
                <p class="report-block-title"><span>التحصيل حسب الغرض</span><span class="report-block-count">${fmtNum((report.purposes || []).length)}</span></p>
                ${purposeSummary ? '<div class="report-list">' + purposeSummary + '</div>' : '<p class="report-note">لا تحصيلات في هذه الفترة.</p>'}
            </div>
            <div class="report-block">
                <p class="report-block-title"><span>التحصيل حسب الطريقة</span><span class="report-block-count">${fmtNum(report.methods.length)}</span></p>
                ${methodSummary ? '<div class="report-list">' + methodSummary + '</div>' : '<p class="report-note">لا تحصيلات في هذه الفترة.</p>'}
            </div>
            <div class="report-note report-divider text-center">
                ${report.residentFilter
                    ? `<p>${showDues ? 'المستحق ونسبة التحصيل يخصان الشقة المحددة.' : 'المستحق ونسبة التحصيل لا يظهران عند تصفية الصندوق مع الشقة.'} المصروفات معروضة كاملة لأنها غير مرتبطة بشقة محددة.</p>`
                    : report.cashAccountFilter
                    ? '<p>المستحق ونسبة التحصيل يخصان العمارة كلها لذلك لا يظهران عند تصفية الصندوق، والمصروفات معروضة لهذا الصندوق فقط.</p>'
                    : showDues
                        ? '<p>عمود «المحصّل» يحتسب الاشتراكات فقط؛ أما الإيرادات الأخرى فتُعرض في بند مستقل وتُضاف إلى الصافي.</p>'
                        : '<p>المستحق ونسبة التحصيل يخصان الاشتراكات الشهرية لذلك لا يظهران عند تصفية غرض آخر. المصروفات معروضة كاملة لأنها غير مرتبطة بأغراض التحصيل.</p>'}
                <p>كل شهر محسوب بسعر الاشتراك السارية فيه وحصيلته من حركات الشهر نفسه، مثل تقرير الملاك الشهري.</p>
                <p>نسبة تزيد على 100% تعني تحصيلًا أعلى من مستحق الشهر (مقدمة أو متأخرات مسددة).</p>
                <p>توزيع الطرق يغطي كل تحصيلات أشهر الفترة، ومجموعه يساوي إجمالي التحصيل.</p>
                ${filterNote}
                ${cashFilterNote}
                ${residentFilterNote}
                ${unpaidNote}
                ${adjustmentNote}
            </div>
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

function generatePeriodReport() {
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
    preview.innerHTML = renderPeriodReportHtml(report);
    periodReportSnapshot = report;
    periodReportSignature = getPeriodReportSignature(from, to, purposeFilter, cashAccountFilter, residentFilter);
    setPeriodReportActionsEnabled(true);
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
        ? [['الشهر','المستحق','المحصّل','غير المحصّل','نسبة التحصيل %','المصروف','الصافي']]
        : [['الشهر', report.cashAccountFilter ? 'تحصيل الصندوق' : report.residentFilter ? 'تحصيل الشقة' : 'تحصيل الغرض','عدد الحركات','المصروف','الصافي']];
    report.months.forEach(row => {
        if (showDues) {
            rows.push([row.month, row.expectedCents / 100, row.collectedCents / 100, row.outstandingCents / 100,
                row.rate ?? '', row.expenseCents / 100, row.netCents / 100]);
        } else {
            rows.push([row.month, row.totalIncomeCents / 100, row.movementCount, row.expenseCents / 100, row.netCents / 100]);
        }
    });
    if (showDues) {
        rows.push(['الإجمالي', totals.expectedCents / 100, totals.collectedCents / 100, totals.outstandingCents / 100,
            totals.rate ?? '', totals.expenseCents / 100, totals.netCents / 100]);
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
        select.innerHTML = months.map(month => `<option value="${esc(month)}">${esc(month)}</option>`).join('');
        const currentValue = select.value || defaults[id];
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
    ['expensesReportPrintBtn', 'expensesReportExportBtn'].forEach(id => {
        const button = /** @type {HTMLButtonElement} */ (document.getElementById(id));
        if (button) button.disabled = !enabled;
    });
}

function clearExpensesReportPreview(message) {
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
    const categorySummary = report.categories.map(item => `
        <div class="report-list-row">
            <span class="report-list-title">${esc(item.label)} <span class="report-list-meta">· ${fmtNum(item.count)} حركة · ${item.share === null ? '—' : fmtNum(item.share) + '%'}</span></span>
            <span class="report-list-value text-rose-400 report-amount">${fmtMoney(item.cents / 100)}</span>
        </div>`).join('');
    const fundSummary = report.funds.map(item => `
        <div class="report-list-row">
            <span class="report-list-title">${esc(item.label)} <span class="report-list-meta">· ${fmtNum(item.count)} حركة · ${item.share === null ? '—' : fmtNum(item.share) + '%'}</span></span>
            <span class="report-list-value text-rose-400 report-amount">${fmtMoney(item.cents / 100)}</span>
        </div>`).join('');
    const detailSummary = report.list.map(expense => `
        <div class="report-list-row">
            <span class="report-list-title">${esc(expense.title)} <span class="report-list-meta">· ${esc(expense.month)} · ${esc(getExpenseCategoryValue(expense))} · ${esc(reportCashAccountLabel(expense.cashAccountCode))}</span></span>
            <span class="report-list-value text-rose-400 report-amount">${fmtMoney(toCents(expense.amount) / 100)}</span>
        </div>`).join('');
    const monthRows = report.months.map(row => `
        <tr>
            <td>${esc(row.month)}</td>
            <td>${fmtNum(row.count)}</td>
            <td class="${row.expenseCents ? 'text-rose-400' : ''}">${fmtMoney(row.expenseCents / 100)}</td>
            <td>${totals.expenseCents > 0 ? fmtNum(Math.round((row.expenseCents / totals.expenseCents) * 100)) + '%' : '—'}</td>
        </tr>`).join('');
    const fundNote = report.cashAccountFilter
        ? `<p>المصروفات معروضة لصندوق «${esc(report.cashAccountLabel)}» فقط.</p>`
        : '';
    const categoryNote = report.categoryFilter
        ? `<p>المصروفات معروضة لتصنيف «${esc(report.categoryLabel)}» فقط.</p>`
        : '';
    return `
        <div class="space-y-3">
            <header class="report-preview-header">
                <h3 class="report-preview-title">${esc(state.buildingName || 'العمارة')}</h3>
                <p class="report-preview-meta">تقرير المصروفات ${esc(report.rangeLabel)}${report.cashAccountFilter ? ' • الصندوق: ' + esc(report.cashAccountLabel) : ''}${report.categoryFilter ? ' • التصنيف: ' + esc(report.categoryLabel) : ''} • تم الإنشاء ${esc(formatDate(report.generatedAt))}</p>
            </header>
            <div class="report-stats report-stats-4">
                <div class="report-stat"><p class="report-stat-label">إجمالي المصروف</p><p class="report-stat-value text-rose-400">${fmtMoney(totals.expenseCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">عدد الحركات</p><p class="report-stat-value">${fmtNum(totals.count)}</p></div>
                <div class="report-stat"><p class="report-stat-label">متوسط الشهر</p><p class="report-stat-value">${fmtMoney(totals.averageCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">أشهر فيها مصروف</p><p class="report-stat-value">${fmtNum(totals.monthCount)}</p></div>
            </div>
            <div class="report-block">
                <p class="report-block-title"><span>المصروف حسب التصنيف</span><span class="report-block-count">${fmtNum(report.categories.length)}</span></p>
                ${categorySummary ? '<div class="report-list">' + categorySummary + '</div>' : '<p class="report-note">لا يوجد</p>'}
            </div>
            <div class="report-block">
                <p class="report-block-title"><span>المصروف حسب الصندوق</span><span class="report-block-count">${fmtNum(report.funds.length)}</span></p>
                ${fundSummary ? '<div class="report-list">' + fundSummary + '</div>' : '<p class="report-note">لا يوجد</p>'}
            </div>
            <div class="report-table-wrap">
                <table class="statement-table">
                    <thead><tr><th>الشهر</th><th>عدد الحركات</th><th>المصروف</th><th>نسبته من الفترة</th></tr></thead>
                    <tbody>${monthRows}</tbody>
                    <tfoot><tr><td>الإجمالي</td><td>${fmtNum(totals.count)}</td><td>${fmtMoney(totals.expenseCents / 100)}</td><td>100%</td></tr></tfoot>
                </table>
            </div>
            <div class="report-block">
                <p class="report-block-title"><span>تفاصيل المصروفات</span><span class="report-block-count">${fmtNum(report.list.length)}</span></p>
                ${detailSummary ? '<div class="report-list">' + detailSummary + '</div>' : '<p class="report-note">لا يوجد</p>'}
            </div>
            <div class="report-note report-divider text-center">
                <p>تقرير للقراءة فقط ولا يعدل أي بيانات. المصروفات محسوبة على شهر استحقاقها المسجل.</p>
                ${fundNote}
                ${categoryNote}
            </div>
        </div>`;
}

function generateExpensesReport() {
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
    preview.innerHTML = renderExpensesReportHtml(report);
    expensesReportSnapshot = report;
    expensesReportSignature = getExpensesReportSignature(from, to, cashAccountFilter, categoryFilter);
    setExpensesReportActionsEnabled(true);
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
        select.innerHTML = options.map(month => `<option value="${esc(month)}">${esc(month)}</option>`).join('');
        const currentValue = select.value || defaults[id];
        select.value = options.includes(currentValue) ? currentValue : defaults[id];
    });
}

function buildAdjustmentsReport(fromMonth, toMonth, residentFilter = '', kindFilter = '') {
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
    ['adjustmentsReportPrintBtn', 'adjustmentsReportExportBtn'].forEach(id => {
        const button = /** @type {HTMLButtonElement} */ (document.getElementById(id));
        if (button) button.disabled = !enabled;
    });
}

function clearAdjustmentsReportPreview(message) {
    adjustmentsReportSnapshot = null;
    adjustmentsReportSignature = '';
    setAdjustmentsReportActionsEnabled(false);
    const preview = document.getElementById('adjustmentsReportPreview');
    if (!preview) return;
    preview.innerHTML = `<p class="report-preview-empty">${esc(message)}</p>`;
    preview.dataset.stale = 'false';
}

function renderAdjustmentsReportHtml(report) {
    const totals = report.totals;
    const kindSummary = report.kinds.map(item => `
        <div class="report-list-row">
            <span class="report-list-title">${esc(item.label)} <span class="report-list-meta">· ${fmtNum(item.count)} تسجيل · ${item.share === null ? '—' : fmtNum(item.share) + '%'}</span></span>
            <span class="report-list-value text-amber-400 report-amount">${fmtMoney(item.cents / 100)}</span>
        </div>`).join('');
    const monthRows = report.months.map(row => `
        <tr>
            <td>${esc(row.month)}</td>
            <td>${fmtNum(row.count)}</td>
            <td class="${row.amountCents ? 'text-amber-400' : ''}">${fmtMoney(row.amountCents / 100)}</td>
            <td>${totals.amountCents > 0 ? fmtNum(Math.round((row.amountCents / totals.amountCents) * 100)) + '%' : '—'}</td>
        </tr>`).join('');
    const detailSummary = report.list.map(item => `
        <div class="report-list-row">
            <span class="report-list-title">شقة ${esc(item.apartmentNumber)} · ${esc(item.residentName)} <span class="report-list-meta">· ${esc(item.kindLabel)} · ${esc(item.month)}${item.reason ? ' · ' + esc(item.reason) : ''}</span></span>
            <span class="report-list-value text-amber-400 report-amount">${fmtMoney(item.amountCents / 100)}</span>
        </div>`).join('');
    const residentNote = report.residentFilter
        ? `<p>المعروض لشقة «${esc(report.residentLabel)}» فقط.</p>`
        : '';
    const kindNote = report.kindFilter
        ? `<p>المعروض لنوع «${esc(report.kindLabel)}» فقط.</p>`
        : '';
    return `
        <div class="space-y-3">
            <header class="report-preview-header">
                <h3 class="report-preview-title">${esc(state.buildingName || 'العمارة')}</h3>
                <p class="report-preview-meta">تقرير الإعفاءات والتخفيضات ${esc(report.rangeLabel)}${report.residentFilter ? ' • الشقة: ' + esc(report.residentLabel) : ''}${report.kindFilter ? ' • النوع: ' + esc(report.kindLabel) : ''} • تم الإنشاء ${esc(formatDate(report.generatedAt))}</p>
            </header>
            <div class="report-stats report-stats-4">
                <div class="report-stat"><p class="report-stat-label">إجمالي الإعفاءات والتخفيضات</p><p class="report-stat-value text-amber-400">${fmtMoney(totals.amountCents / 100)}</p></div>
                <div class="report-stat"><p class="report-stat-label">عدد التسجيلات</p><p class="report-stat-value">${fmtNum(totals.count)}</p></div>
                <div class="report-stat"><p class="report-stat-label">الشقق المستفيدة</p><p class="report-stat-value">${fmtNum(totals.residentCount)}</p></div>
                <div class="report-stat"><p class="report-stat-label">أشهر مشمولة</p><p class="report-stat-value">${fmtNum(totals.monthCount)}</p></div>
            </div>
            <div class="report-block">
                <p class="report-block-title"><span>التوزيع حسب النوع</span><span class="report-block-count">${fmtNum(report.kinds.length)}</span></p>
                ${kindSummary ? '<div class="report-list">' + kindSummary + '</div>' : '<p class="report-note">لا يوجد</p>'}
            </div>
            <div class="report-table-wrap">
                <table class="statement-table">
                    <thead><tr><th>الشهر</th><th>عدد التسجيلات</th><th>المبلغ</th><th>نسبته من الفترة</th></tr></thead>
                    <tbody>${monthRows}</tbody>
                    <tfoot><tr><td>الإجمالي</td><td>${fmtNum(totals.count)}</td><td>${fmtMoney(totals.amountCents / 100)}</td><td>100%</td></tr></tfoot>
                </table>
            </div>
            <div class="report-block">
                <p class="report-block-title"><span>تفاصيل الإعفاءات والتخفيضات</span><span class="report-block-count">${fmtNum(report.list.length)}</span></p>
                ${detailSummary ? '<div class="report-list">' + detailSummary + '</div>' : '<p class="report-note">لا يوجد</p>'}
            </div>
            <div class="report-note report-divider text-center">
                <p>تقرير للقراءة فقط ولا يعدل أي بيانات. تُخصم الإعفاءات والتخفيضات من مستحق الشهر المسجل فيه الاستحقاق.</p>
                ${residentNote}
                ${kindNote}
            </div>
        </div>`;
}

function generateAdjustmentsReport() {
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
}

function invalidateAdjustmentsReportPreview() {
    if (adjustmentsReportSnapshot) {
        clearAdjustmentsReportPreview('تغيّر الشهر أو الفلتر أو البيانات — اضغط «معاينة» لتحديث التقرير.');
        const preview = document.getElementById('adjustmentsReportPreview');
        if (preview) preview.dataset.stale = 'true';
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

function exportAdjustmentsReportCsv() {
    if (!requireManager()) return;
    const report = getSelectedAdjustmentsReportSnapshot();
    if (!report) return;
    const rows = [
        ['الفترة', report.rangeLabel, 'الشقة', report.residentLabel, 'النوع', report.kindLabel],
        ['الشقة', 'اسم الساكن', 'الشهر', 'النوع', 'المبلغ', 'السبب']
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

function exportArrearsCSV() {
    if (!requireManager()) return;
    const report = buildArrearsReport(getArrearsReportFilters());
    const rows = [['الشقة','اسم الساكن','التصنيف','الشهر غير المسدد','المبلغ المستحق']];
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
        const rowAdjustmentCents = isBilled && showDues && typeof getAdjustmentAmountForMonth === 'function'
            ? toCents(getAdjustmentAmountForMonth(resident.id, month))
            : 0;
        const rowNetDueCents = Math.max(0, rowDueCents - rowAdjustmentCents);
        const rowPaidCents = toCents(getPaidAmountForMonth(resident.id, month));
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

    const adjustments = showDues
        ? (Array.isArray(state.adjustments) ? state.adjustments : [])
            .filter(adjustment => adjustment.residentId === resident.id)
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
    residentStatementSnapshot = null;
    residentStatementResidentId = '';
    residentStatementSignature = '';
    setResidentStatementActionsEnabled(false);
    const preview = document.getElementById('residentStatementPreview');
    if (preview) preview.innerHTML = `<p class="report-preview-empty">${esc(message)}</p>`;
}

function invalidateResidentStatementPreview() {
    if (!residentStatementSnapshot) return;
    clearResidentStatement('تغيّر الساكن أو الغرض — اختر ساكنًا ثم اضغط «معاينة» لعرض الكشف.');
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
        toast('اعرض كشف الساكن المحدد أولًا','error');
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

function renderResidentStatementHtml(statement) {
    const resident = statement.resident;
    const showDues = statement.showDues !== false;
    const monthRows = statement.months.map(row => `
        <tr>
            <td>${esc(row.month)}</td>
            <td>${fmtMoney(row.dueCents / 100)}</td>
            <td class="text-amber-400">${row.adjustmentCents ? fmtMoney(row.adjustmentCents / 100) : '—'}</td>
            <td>${fmtMoney(row.netDueCents / 100)}</td>
            <td class="text-emerald-400">${fmtMoney(row.paidCents / 100)}</td>
            <td class="${row.remainingCents ? 'text-rose-400' : ''}">${fmtMoney(row.remainingCents / 100)}</td>
            <td class="${row.status.className}">${esc(row.status.label)}</td>
        </tr>`).join('');
    const paymentRows = statement.payments.length
        ? statement.payments.map(payment => `
            <div class="report-list-row items-start">
                <div class="min-w-0">
                    <p class="report-list-title">${esc(payment.month)}</p>
                    <p class="report-list-meta">${esc(payment.purpose)} · ${esc(payment.method)} · ${esc(payment.cashAccount)} · ${esc(formatDate(payment.date) || '—')}</p>
                    ${payment.notes ? `<p class="report-list-meta break-words">${esc(payment.notes)}</p>` : ''}
                </div>
                <strong class="report-list-value text-emerald-400 report-amount">${fmtMoney(payment.amountCents / 100)}</strong>
            </div>`).join('')
        : '<p class="report-note">لا توجد حركات مسجلة.</p>';
    const unassignedNote = statement.totals.unassignedPaidCents > 0
        ? `<p>مدفوعات بدون شهر استحقاق قابل للقراءة: ${fmtMoney(statement.totals.unassignedPaidCents / 100)}</p>`
        : '';
    const statsHtml = renderReportStatTiles(getResidentStatementSummaryItems(statement), true);
    const monthsBlock = showDues
        ? `<div class="report-table-wrap">
                <table class="statement-table">
                    <thead><tr><th>الشهر</th><th>المستحق</th><th>إعفاء/تخفيض</th><th>الصافي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr></thead>
                    <tbody>${monthRows}</tbody>
                </table>
            </div>`
        : '';
    const adjustmentRows = statement.adjustments.length
        ? statement.adjustments.map(adjustment => `
            <div class="report-list-row items-start">
                <div class="min-w-0">
                    <p class="report-list-title">${esc(adjustment.month)} · ${esc(adjustment.kindLabel)}</p>
                    ${adjustment.reason ? `<p class="report-list-meta break-words">${esc(adjustment.reason)}</p>` : ''}
                </div>
                <strong class="report-list-value text-amber-400 report-amount">${fmtMoney(adjustment.amountCents / 100)}</strong>
            </div>`).join('')
        : '';
    const adjustmentsBlock = showDues && statement.adjustments.length
        ? `<div class="report-block">
                <p class="report-block-title"><span>الإعفاءات والتخفيضات</span><span class="report-block-count">${fmtNum(statement.adjustments.length)}</span></p>
                <div class="report-list">${adjustmentRows}</div>
            </div>`
        : '';
    return `
        <div class="space-y-3">
            <header class="report-preview-header">
                <h3 class="report-preview-title">${esc(state.buildingName || 'العمارة')}</h3>
                <p class="report-preview-meta">كشف حساب ساكن · ${esc(resident.name)} · شقة ${esc(resident.apartmentNumber || '—')}${resident.floor ? ' · الدور ' + esc(resident.floor) : ''}</p>
                <p class="report-preview-meta">الفترة: ${esc(statement.rangeLabel)}${statement.purposeFilter ? ' · الغرض: ' + esc(statement.purposeLabel) : ''}</p>
            </header>
            ${statsHtml}
            ${monthsBlock}
            ${adjustmentsBlock}
            <div class="report-block">
                <p class="report-block-title"><span>حركات الساكن</span><span class="report-block-count">${fmtNum(statement.payments.length)}</span></p>
                <div class="report-list">${paymentRows}</div>
            </div>
            <div class="report-note report-divider text-center">
                ${showDues
                    ? '<p>كل شهر محسوب بقيمة الاشتراك السارية فيه، ويُخصم الإعفاء أو التخفيض المسجل على الشهر قبل احتساب المتبقي، والمدفوع هو المسجل على الشهر نفسه.</p>'
                    : '<p>المستحق الشهري يخص الاشتراكات فقط، لذلك تُعرض هنا حركات غرض «' + esc(statement.purposeLabel) + '» دون جدول المستحقات.</p>'}
                ${showDues && statement.purposeFilter ? '<p>الحركات معروضة للاشتراكات فقط.</p>' : ''}
                ${showDues ? unassignedNote : ''}
                <p>تم الإنشاء: ${esc(formatDate(statement.generatedAt))}</p>
            </div>
        </div>`;
}

function generateResidentStatement() {
    if (!requireManager()) return;
    const residentId = String(/** @type {HTMLSelectElement} */ (document.getElementById('statementResidentSelect'))?.value || '');
    if (!residentId) { toast('اختر ساكنًا','error'); return; }
    const purposeFilter = getReportPurposeFilter('statementPurpose');
    const statement = buildResidentStatement(residentId, purposeFilter);
    if (!statement) { toast('تعذر العثور على الساكن. حدّث البيانات ثم حاول مرة أخرى.','error'); return; }
    const preview = document.getElementById('residentStatementPreview');
    if (!preview) return;
    preview.innerHTML = renderResidentStatementHtml(statement);
    residentStatementSnapshot = statement;
    residentStatementResidentId = residentId;
    residentStatementSignature = getResidentStatementSignature(residentId, purposeFilter);
    setResidentStatementActionsEnabled(true);
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
    if (title) title.textContent = `كشف حساب ساكن - ${state.buildingName || 'Manzil'}`;
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

function statementPdfCell(value, styles = '') {
    return '<td style="padding:6px;border:1px solid #cbd5e1;text-align:right;' + styles + '">' + value + '</td>';
}

function statementPdfHeadCell(value) {
    return '<th style="padding:6px;border:1px solid #cbd5e1;text-align:right;font-weight:600">' + value + '</th>';
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
        : '<tr><td colspan="7" style="padding:8px;border:1px solid #cbd5e1;text-align:center;color:#475569">لا توجد حركات مسجلة.</td></tr>';
}

function renderResidentStatementPdfHtml(statement) {
    const resident = statement.resident;
    const showDues = statement.showDues !== false;
    const monthRows = renderStatementMonthsPdfBody(statement);
    const paymentRows = renderStatementPaymentsPdfBody(statement);
    const summaryRows = renderPdfSummaryRows(getResidentStatementSummaryItems(statement));
    const monthsSection = showDues
        ? [
            '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">حساب الشهور</h3>',
            '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#e2e8f0">',
            '<th style="padding:6px;border:1px solid #cbd5e1">الشهر</th><th style="padding:6px;border:1px solid #cbd5e1">المستحق</th>',
            '<th style="padding:6px;border:1px solid #cbd5e1">إعفاء/تخفيض</th><th style="padding:6px;border:1px solid #cbd5e1">الصافي</th>',
            '<th style="padding:6px;border:1px solid #cbd5e1">المدفوع</th><th style="padding:6px;border:1px solid #cbd5e1">المتبقي</th>',
            '<th style="padding:6px;border:1px solid #cbd5e1">الحالة</th></tr></thead><tbody>', monthRows, '</tbody></table></section>',
            statement.adjustments.length
                ? [
                    '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">الإعفاءات والتخفيضات</h3>',
                    '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#e2e8f0">',
                    '<th style="padding:6px;border:1px solid #cbd5e1">الشهر</th><th style="padding:6px;border:1px solid #cbd5e1">النوع</th>',
                    '<th style="padding:6px;border:1px solid #cbd5e1">المبلغ</th><th style="padding:6px;border:1px solid #cbd5e1">السبب</th>',
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

    return [
        '<div dir="rtl" lang="ar" style="font-family:Cairo,Arial,sans-serif;color:#111827;background:#fff;line-height:1.8">',
        '<header style="text-align:center;border-bottom:2px solid #334155;padding-bottom:12px;margin-bottom:18px">',
        '<h1 style="font-size:22px;font-weight:800;margin:0">', esc(state.buildingName || 'Manzil'), '</h1>',
        '<h2 style="font-size:17px;font-weight:700;margin:4px 0">كشف حساب ساكن — ', esc(resident.name), '</h2>',
        '<p style="font-size:11px;color:#475569;margin:0">',
        'شقة ', esc(resident.apartmentNumber || '—'), resident.floor ? ' • الدور ' + esc(resident.floor) : '',
        ' • الفترة: ', esc(statement.rangeLabel),
        statement.purposeFilter ? ' • الغرض: ' + esc(statement.purposeLabel) : '', '</p></header>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">الملخص</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:11px"><tbody>',
        summaryRows,
        '</tbody></table></section>',
        ...monthsSection,
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">حركات الساكن</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#e2e8f0">',
        '<th style="padding:6px;border:1px solid #cbd5e1">الشهر</th><th style="padding:6px;border:1px solid #cbd5e1">المبلغ</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">الغرض</th><th style="padding:6px;border:1px solid #cbd5e1">طريقة الدفع</th><th style="padding:6px;border:1px solid #cbd5e1">الصندوق</th><th style="padding:6px;border:1px solid #cbd5e1">التاريخ</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">ملاحظات</th></tr></thead><tbody>', paymentRows, '</tbody></table></section>',
        '<p style="font-size:10px;color:#475569;border-top:1px solid #cbd5e1;padding-top:10px">',
        showDues
            ? 'كل شهر محسوب بقيمة الاشتراك السارية فيه، والمدفوع هو المسجل على الشهر نفسه. هذا الكشف للقراءة فقط ولا يعدل أي بيانات.'
            : 'المستحق الشهري يخص الاشتراكات فقط، لذلك يعرض الكشف حركات الغرض المحدد دون جدول المستحقات. هذا الكشف للقراءة فقط ولا يعدل أي بيانات.',
        '</p><footer style="font-size:9px;color:#64748b;margin-top:18px;text-align:center">Manzil — ',
        esc(formatDate(statement.generatedAt)), '</footer></div>'
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
        ['الساكن', esc(resident.name || '—')],
        ['الهاتف', esc(resident.phone || 'غير مسجل')],
        ['تاريخ إضافة الوحدة', esc(formatDate(resident.createdAt) || '—')],
        ['قيمة الاشتراك الحالية', fmtMoney(currentRate)]
    ].map(([label, value]) => '<tr>' + statementPdfHeadCell(label) + statementPdfCell(value) + '</tr>').join('');
    const unpaidHtml = unpaidRows.length
        ? unpaidRows.map(row => '<tr>' + statementPdfCell(esc(row.month)) + statementPdfCell(fmtMoney(row.remainingCents / 100), 'color:#be123c;font-weight:700') + '</tr>').join('')
        : '<tr><td colspan="2" style="padding:8px;border:1px solid #cbd5e1;text-align:center;color:#047857">لا توجد أشهر غير مسددة.</td></tr>';
    const currentSummary = currentRow
        ? `${currentMonth}: مستحق ${fmtMoney(currentRow.dueCents / 100)}${currentRow.adjustmentCents ? ' • إعفاء/تخفيض ' + fmtMoney(currentRow.adjustmentCents / 100) : ''} • مدفوع ${fmtMoney(currentRow.paidCents / 100)} • متبقٍ ${fmtMoney(currentRow.remainingCents / 100)}`
        : 'لا يوجد استحقاق للشهر الحالي.';

    return [
        '<div dir="rtl" lang="ar" style="font-family:Cairo,Arial,sans-serif;color:#111827;background:#fff;line-height:1.8">',
        '<header style="text-align:center;border-bottom:2px solid #334155;padding-bottom:12px;margin-bottom:18px">',
        '<h1 style="font-size:22px;font-weight:800;margin:0">', esc(state.buildingName || 'Manzil'), '</h1>',
        '<h2 style="font-size:17px;font-weight:700;margin:4px 0">تقرير وحدة — شقة ', esc(resident.apartmentNumber || '—'), '</h2>',
        '<p style="font-size:11px;color:#475569;margin:0">',
        esc(resident.name || '—'), resident.floor ? ' • الدور ' + esc(resident.floor) : '',
        ' • الفترة: ', esc(statement.rangeLabel), '</p></header>',
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
        '<p style="font-size:11px;color:#334155;margin:8px 0 0">', esc(currentSummary), '</p></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">المتأخرات</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#e2e8f0">',
        '<th style="padding:6px;border:1px solid #cbd5e1">الشهر</th><th style="padding:6px;border:1px solid #cbd5e1">المتبقي</th>',
        '</tr></thead><tbody>', unpaidHtml, '</tbody></table></section>',
        statement.adjustments.length
            ? [
                '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">الإعفاءات والتخفيضات</h3>',
                '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#e2e8f0">',
                '<th style="padding:6px;border:1px solid #cbd5e1">الشهر</th><th style="padding:6px;border:1px solid #cbd5e1">النوع</th>',
                '<th style="padding:6px;border:1px solid #cbd5e1">المبلغ</th><th style="padding:6px;border:1px solid #cbd5e1">السبب</th>',
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
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#e2e8f0">',
        '<th style="padding:6px;border:1px solid #cbd5e1">الشهر</th><th style="padding:6px;border:1px solid #cbd5e1">المستحق</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">إعفاء/تخفيض</th><th style="padding:6px;border:1px solid #cbd5e1">الصافي</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">المدفوع</th><th style="padding:6px;border:1px solid #cbd5e1">المتبقي</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">الحالة</th></tr></thead><tbody>', renderStatementMonthsPdfBody(statement), '</tbody></table></section>',
        '<section style="margin-bottom:18px"><h3 style="font-size:14px;margin:0 0 8px">حركات الساكن</h3>',
        '<table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr style="background:#e2e8f0">',
        '<th style="padding:6px;border:1px solid #cbd5e1">الشهر</th><th style="padding:6px;border:1px solid #cbd5e1">المبلغ</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">الغرض</th><th style="padding:6px;border:1px solid #cbd5e1">طريقة الدفع</th><th style="padding:6px;border:1px solid #cbd5e1">الصندوق</th><th style="padding:6px;border:1px solid #cbd5e1">التاريخ</th>',
        '<th style="padding:6px;border:1px solid #cbd5e1">ملاحظات</th></tr></thead><tbody>', renderStatementPaymentsPdfBody(statement), '</tbody></table></section>',
        '<p style="font-size:10px;color:#475569;border-top:1px solid #cbd5e1;padding-top:10px">',
        'تقرير وحدة للقراءة فقط ولا يعدل أي بيانات. كل شهر محسوب بقيمة الاشتراك السارية فيه، والمدفوع هو المسجل على الشهر نفسه، ويعرض كل حركات الوحدة بغض النظر عن فلتر الغرض.',
        '</p><footer style="font-size:9px;color:#64748b;margin-top:18px;text-align:center">Manzil — ',
        esc(formatDate(statement.generatedAt)), '</footer></div>'
    ].join('');
}

async function downloadStatementPdf(html, filename, buttonId, successMessage, logLabel) {
    let root = null;
    const button = /** @type {HTMLButtonElement} */ (document.getElementById(buttonId));
    if (button) button.disabled = true;
    try {
        await ensurePdfLibrary();
        if (document.fonts && document.fonts.ready) await document.fonts.ready;

        root = document.createElement('section');
        root.dir = 'rtl';
        root.lang = 'ar';
        root.style.cssText = 'position:fixed;top:0;left:0;width:190mm;padding:8mm;box-sizing:border-box;background:#fff;z-index:-1';
        root.innerHTML = html;
        document.body.appendChild(root);

        const pdfBlob = await window.html2pdf().set({
            margin: 8,
            filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        }).from(root).outputPdf('blob');

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
        if (root) root.remove();
        if (button && residentStatementSnapshot) /** @type {HTMLButtonElement} */ (button).disabled = false;
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
        'Resident statement PDF export failed:'
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
        'Unit report PDF export failed:'
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
            rows.push(['الإعفاءات والتخفيضات','الشهر','النوع','المبلغ','السبب']);
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
