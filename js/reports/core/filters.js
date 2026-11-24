// @ts-check
/**
 * فلاتر التقارير المشتركة - Manzil
 * يوفر منطق فلترة مشترك لجميع أنواع التقارير
 */

// ============================================
// فلاتر الغرض (Purpose Filters)
// ============================================

/**
 * تطبيع فلتر الغرض
 * @param {string} value
 * @returns {string}
 */
function normalizeReportPurposeFilter(value) {
  const purpose = String(value || '').trim();
  if (!purpose) return '';
  const codes = (typeof INCOME_PURPOSE_FORM_CODES !== 'undefined' ? INCOME_PURPOSE_FORM_CODES : Object.values(REPORT_PURPOSE_CODES));
  return codes.includes(purpose) ? purpose : '';
}

/**
 * الحصول على فلتر الغرض من عنصر DOM
 * @param {string} id
 * @returns {string}
 */
function getReportPurposeFilter(id) {
  if (typeof document === 'undefined') return '';
  const select = document.getElementById(id);
  return normalizeReportPurposeFilter(select?.value || '');
}

/**
 * التحقق من تطابق دفعة مع فلتر الغرض
 * @param {Object} payment
 * @param {string} purposeFilter
 * @returns {boolean}
 */
function reportPaymentMatchesPurpose(payment, purposeFilter) {
  if (!purposeFilter) return true;
  const purpose = typeof getIncomePurposeFormCode === 'function'
    ? getIncomePurposeFormCode(payment?.purposeCode)
    : (String(payment?.purposeCode || '').trim() || 'subscription');
  return purpose === purposeFilter;
}

/**
 * تسمية فلتر الغرض
 * @param {string} purposeFilter
 * @returns {string}
 */
function reportPurposeFilterLabel(purposeFilter) {
  return purposeFilter ? getReportPurposeLabel(purposeFilter) : 'كل الأغراض';
}

// ============================================
// فلاتر الصندوق (Cash Account Filters)
// ============================================

/**
 * تطبيع فلتر الصندوق
 * @param {string} value
 * @returns {string}
 */
function normalizeReportCashAccountFilter(value) {
  const code = String(value || '').trim();
  if (!code) return '';
  const accounts = typeof CASH_ACCOUNTS !== 'undefined' ? CASH_ACCOUNTS : null;
  if (accounts) return accounts[code] ? code : '';
  return Object.values(REPORT_CASH_ACCOUNT_CODES).includes(code) ? code : '';
}

/**
 * الحصول على فلتر الصندوق من عنصر DOM
 * @param {string} id
 * @returns {string}
 */
function getReportCashAccountFilter(id) {
  if (typeof document === 'undefined') return '';
  const select = document.getElementById(id);
  return normalizeReportCashAccountFilter(select?.value || '');
}

/**
 * التحقق من تطابق عنصر مع فلتر الصندوق
 * @param {Object} item
 * @param {string} cashAccountFilter
 * @returns {boolean}
 */
function reportCashAccountMatches(item, cashAccountFilter) {
  if (!cashAccountFilter) return true;
  return (String(item?.cashAccountCode || '').trim() || 'main') === cashAccountFilter;
}

/**
 * تسمية فلتر الصندوق
 * @param {string} cashAccountFilter
 * @returns {string}
 */
function reportCashAccountFilterLabel(cashAccountFilter) {
  return cashAccountFilter ? getReportCashAccountLabel(cashAccountFilter) : 'كل الصناديق';
}

/**
 * تعبئة فلاتر الصندوق في DOM
 * @param {string[]} ids
 */
function populateReportCashAccountFilters(ids = ['landlordReportCashAccount', 'periodReportCashAccount', 'expensesReportCashAccount']) {
  const accounts = typeof CASH_ACCOUNTS !== 'undefined' ? CASH_ACCOUNTS : null;
  if (!accounts) return;
  const options = Object.keys(accounts)
    .map(code => `<option value="${escapeHtml(code)}">${escapeHtml(getReportCashAccountLabel(code))}</option>`)
    .join('');
  ids.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const selected = normalizeReportCashAccountFilter(select.value || '');
    select.innerHTML = '<option value="">كل الصناديق</option>' + options;
    select.value = selected;
  });
}

// ============================================
// فلاتر طريقة الدفع (Payment Method Filters)
// ============================================

/**
 * تطبيع فلتر طريقة الدفع
 * @param {string} value
 * @returns {string}
 */
function normalizeReportPaymentMethodFilter(value) {
  const code = String(value || '').trim();
  if (!code) return '';
  const labels = typeof INCOME_PAYMENT_METHOD_LABELS !== 'undefined' ? INCOME_PAYMENT_METHOD_LABELS : null;
  if (labels) return Object.prototype.hasOwnProperty.call(labels, code) ? code : '';
  return Object.values(REPORT_PAYMENT_METHOD_CODES).includes(code) ? code : '';
}

/**
 * الحصول على فلتر طريقة الدفع من عنصر DOM
 * @param {string} id
 * @returns {string}
 */
function getReportPaymentMethodFilter(id) {
  if (typeof document === 'undefined') return '';
  const select = document.getElementById(id);
  return normalizeReportPaymentMethodFilter(select?.value || '');
}

/**
 * التحقق من تطابق دفعة مع فلتر طريقة الدفع
 * @param {Object} payment
 * @param {string} paymentMethodFilter
 * @returns {boolean}
 */
function reportPaymentMatchesMethod(payment, paymentMethodFilter) {
  if (!paymentMethodFilter) return true;
  return String(payment?.paymentMethod || '').trim() === paymentMethodFilter;
}

/**
 * تسمية فلتر طريقة الدفع
 * @param {string} paymentMethodFilter
 * @returns {string}
 */
function reportPaymentMethodFilterLabel(paymentMethodFilter) {
  return paymentMethodFilter ? getReportPaymentMethodLabel(paymentMethodFilter) : 'كل الطرق';
}

// ============================================
// فلاتر الشقة (Resident Filters)
// ============================================

/**
 * الحصول على معلومات الشقة
 * @param {string} residentFilter
 * @returns {Object|null}
 */
function getReportResident(residentFilter) {
  const id = String(residentFilter || '').trim();
  if (!id || typeof state === 'undefined') return null;
  return (state.residents || []).find(resident => resident.id === id) || null;
}

/**
 * تطبيع فلتر الشقة
 * @param {string} value
 * @returns {string}
 */
function normalizeReportResidentFilter(value) {
  return getReportResident(value) ? String(value).trim() : '';
}

/**
 * الحصول على فلتر الشقة من عنصر DOM
 * @param {string} id
 * @returns {string}
 */
function getReportResidentFilter(id) {
  if (typeof document === 'undefined') return '';
  const select = document.getElementById(id);
  return normalizeReportResidentFilter(select?.value || '');
}

/**
 * تسمية فلتر الشقة
 * @param {string} residentFilter
 * @returns {string}
 */
function reportResidentFilterLabel(residentFilter) {
  const resident = getReportResident(residentFilter);
  return resident ? `شقة ${resident.apartmentNumber} · ${resident.name}` : 'كل الشقق';
}

/**
 * slug للملف (لتصدير CSV/PDF)
 * @param {string} residentFilter
 * @returns {string}
 */
function reportResidentFileSlug(residentFilter) {
  const resident = getReportResident(residentFilter);
  return resident ? String(resident.apartmentNumber || resident.id).trim() : '';
}

/**
 * التحقق من تطابق دفعة مع فلتر الشقة
 * @param {Object} payment
 * @param {string} residentFilter
 * @returns {boolean}
 */
function reportPaymentMatchesResident(payment, residentFilter) {
  if (!residentFilter) return true;
  return String(payment?.residentId || '').trim() === residentFilter;
}

/**
 * تعبئة فلاتر الشقق في DOM
 * @param {string[]} ids
 */
function populateReportResidentFilters(ids = ['landlordReportResident', 'periodReportResident', 'adjustmentsReportResident']) {
  const residents = typeof state !== 'undefined' ? (state.residents || []) : [];
  const options = residents
    .slice()
    .sort((a, b) => String(a.apartmentNumber || '').localeCompare(String(b.apartmentNumber || ''), 'ar', { numeric: true }))
    .map(resident => `<option value="${escapeHtml(resident.id)}">شقة ${escapeHtml(resident.apartmentNumber)} · ${escapeHtml(resident.name)}</option>`)
    .join('');
  ids.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const selected = normalizeReportResidentFilter(select.value || '');
    select.innerHTML = '<option value="">كل الشقق</option>' + options;
    select.value = selected;
  });
}

/**
 * تعبئة فلاتر الغرض في DOM
 * @param {string[]} ids
 */
function populateReportPurposeFilters(ids = ['landlordReportPurpose', 'periodReportPurpose', 'statementPurpose']) {
  if (typeof INCOME_PURPOSE_FORM_CODES === 'undefined') return;
  const options = INCOME_PURPOSE_FORM_CODES
    .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(getReportPurposeLabel(value))}</option>`)
    .join('');
  ids.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const selected = normalizeReportPurposeFilter(select.value || '');
    select.innerHTML = '<option value="">كل الأغراض</option>' + options;
    select.value = selected;
  });
}

// ============================================
// فلاتر مشتركة (Combined Filters)
// ============================================

/**
 * فلترة التحصيلات حسب جميع الفلاتر
 * @param {Array} income
 * @param {string} purposeFilter
 * @param {string} cashAccountFilter
 * @param {string} paymentMethodFilter
 * @param {string} residentFilter
 * @returns {Array}
 */
function filterReportIncome(income, purposeFilter = '', cashAccountFilter = '', paymentMethodFilter = '', residentFilter = '') {
  if (!purposeFilter && !cashAccountFilter && !paymentMethodFilter && !residentFilter) return income;
  return (income || []).filter(payment =>
    reportPaymentMatchesPurpose(payment, purposeFilter) &&
    reportCashAccountMatches(payment, cashAccountFilter) &&
    reportPaymentMatchesMethod(payment, paymentMethodFilter) &&
    reportPaymentMatchesResident(payment, residentFilter)
  );
}

/**
 * فلترة المصروفات حسب الصندوق
 * @param {Array} expenses
 * @param {string} cashAccountFilter
 * @returns {Array}
 */
function filterReportExpenses(expenses, cashAccountFilter = '') {
  if (!cashAccountFilter) return expenses;
  return (expenses || []).filter(expense => reportCashAccountMatches(expense, cashAccountFilter));
}

/**
 * هل يعرض التقرير مستحقات الاشتراك؟
 * @param {string} purposeFilter
 * @returns {boolean}
 */
function reportShowsSubscriptionDues(purposeFilter) {
  return !purposeFilter || purposeFilter === 'subscription';
}

// ============================================
// دوال مساعدة (Utility Helpers)
// ============================================

/**
 * escape HTML (يستخدم esc من الكود الأصلي)
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (typeof esc === 'function') return esc(value);
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================
// تصدير عالمي (Global Export)
// ============================================
if (typeof window !== 'undefined') {
  // Purpose
  window.normalizeReportPurposeFilter = normalizeReportPurposeFilter;
  window.getReportPurposeFilter = getReportPurposeFilter;
  window.reportPaymentMatchesPurpose = reportPaymentMatchesPurpose;
  window.reportPurposeFilterLabel = reportPurposeFilterLabel;
  window.populateReportPurposeFilters = populateReportPurposeFilters;

  // Cash Account
  window.normalizeReportCashAccountFilter = normalizeReportCashAccountFilter;
  window.getReportCashAccountFilter = getReportCashAccountFilter;
  window.reportCashAccountMatches = reportCashAccountMatches;
  window.reportCashAccountFilterLabel = reportCashAccountFilterLabel;
  window.populateReportCashAccountFilters = populateReportCashAccountFilters;

  // Payment Method
  window.normalizeReportPaymentMethodFilter = normalizeReportPaymentMethodFilter;
  window.getReportPaymentMethodFilter = getReportPaymentMethodFilter;
  window.reportPaymentMatchesMethod = reportPaymentMatchesMethod;
  window.reportPaymentMethodFilterLabel = reportPaymentMethodFilterLabel;

  // Resident
  window.getReportResident = getReportResident;
  window.normalizeReportResidentFilter = normalizeReportResidentFilter;
  window.getReportResidentFilter = getReportResidentFilter;
  window.reportResidentFilterLabel = reportResidentFilterLabel;
  window.reportResidentFileSlug = reportResidentFileSlug;
  window.reportPaymentMatchesResident = reportPaymentMatchesResident;
  window.populateReportResidentFilters = populateReportResidentFilters;

  // Combined
  window.filterReportIncome = filterReportIncome;
  window.filterReportExpenses = filterReportExpenses;
  window.reportShowsSubscriptionDues = reportShowsSubscriptionDues;

  // Utility
  window.escapeHtml = escapeHtml;
}

console.log('[Reports Core] Filters loaded');