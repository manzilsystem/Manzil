// @ts-check
/**
 * حسابات التقارير المشتركة - Manzil
 * يوفر دوال حسابية مشتركة لجميع أنواع التقارير
 */

// ============================================
// حسابات المستحقات (Billing Calculations)
// ============================================

/**
 * التحقق من نشاط المالك في شهر معين
 * @param {Object} resident
 * @param {string} monthKey
 * @returns {boolean}
 */
function isResidentActiveInMonth(resident, monthKey) {
  if (!resident || !monthKey) return false;
  if (!resident.createdAt && !resident.billingStartMonth) return true;
  const startKey = typeof getResidentBillingStartKey === 'function'
    ? getResidentBillingStartKey(resident)
    : null;
  if (!startKey) return true;
  return startKey <= monthKey;
}

/**
 * حساب إجماليات الفوترة الشهرية
 * @param {string} month
 * @param {string} residentFilter
 * @returns {{grossExpectedCents: number, adjustmentCents: number, expectedCents: number, outstandingCents: number}}
 */
function getMonthlyBillingTotals(month, residentFilter = '') {
  const monthKey = typeof monthLabelToKey === 'function' ? monthLabelToKey(month) : '';
  const totals = { grossExpectedCents: 0, adjustmentCents: 0, expectedCents: 0, outstandingCents: 0 };
  (state.residents || []).forEach(resident => {
    if (residentFilter && resident.id !== residentFilter) return;
    if (!isResidentActiveInMonth(resident, monthKey)) return;
    const grossCents = currencyToCents(getSubscriptionAmountForMonth(resident, month));
    totals.grossExpectedCents += grossCents;
    const settlement = typeof getSettlementAdjustmentForMonth === 'function'
      ? getSettlementAdjustmentForMonth(resident.id, month) : null;
    if (settlement) {
      totals.adjustmentCents += Math.max(0, grossCents - currencyToCents(settlement.amount));
    } else if (typeof getAdjustmentAmountForMonth === 'function') {
      totals.adjustmentCents += currencyToCents(getAdjustmentAmountForMonth(resident.id, month));
    }
    totals.outstandingCents += currencyToCents(getMonthOutstanding(resident, month));
  });
  totals.expectedCents = Math.max(0, totals.grossExpectedCents - totals.adjustmentCents);
  return totals;
}

/**
 * حساب إجماليات التصنيف
 * @param {Array} expenses
 * @returns {Array<[string, {count: number, cents: number}]>}
 */
function getExpenseCategoryTotals(expenses) {
  const totals = new Map();
  (expenses || []).forEach(expense => {
    const label = String(expense.category || '').trim() || 'غير مصنف';
    const current = totals.get(label) || { count: 0, cents: 0 };
    current.count += 1;
    current.cents += currencyToCents(expense.amount);
    totals.set(label, current);
  });
  return Array.from(totals.entries()).sort((a, b) => b[1].cents - a[1].cents);
}

/**
 * بناء فهرس الملاك
 * @returns {Map<string, Object>}
 */
function buildResidentIndex() {
  return new Map((state.residents || []).map(resident => [resident.id, resident]));
}

// ============================================
// حسابات الفترات (Period Calculations)
// ============================================

/**
 * حساب عدد الأشهر في فترة
 * @param {string} fromKey
 * @param {string} toKey
 * @returns {number|null}
 */
function getPeriodMonthSpan(fromKey, toKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromKey) || !/^\d{4}-\d{2}-\d{2}$/.test(toKey)) return null;
  return (Number(toKey.slice(0, 4)) - Number(fromKey.slice(0, 4))) * 12 +
    (Number(toKey.slice(5, 7)) - Number(fromKey.slice(5, 7))) + 1;
}

/**
 * بناء مفاتيح الأشهر في فترة
 * @param {string} fromMonth
 * @param {string} toMonth
 * @param {number} maxMonths
 * @returns {string[]|null}
 */
function buildPeriodMonthKeys(fromMonth, toMonth, maxMonths = 60) {
  const fromKey = typeof monthLabelToKey === 'function' ? monthLabelToKey(fromMonth) : '';
  const toKey = typeof monthLabelToKey === 'function' ? monthLabelToKey(toMonth) : '';
  if (!fromKey || !toKey || fromKey > toKey) return null;
  const span = getPeriodMonthSpan(fromKey, toKey);
  if (span === null || span > maxMonths) return null;
  const keys = [];
  const shiftFn = typeof shiftStatementMonthKey === 'function' ? shiftStatementMonthKey : null;
  if (!shiftFn) return null;
  for (let key = fromKey; key <= toKey; key = shiftFn(key, 1)) keys.push(key);
  return keys.length ? keys : null;
}

/**
 * حساب نسبة التحصيل
 * @param {number} expectedCents
 * @param {number} collectedCents
 * @returns {number|null}
 */
function getPeriodCollectionRate(expectedCents, collectedCents) {
  return expectedCents > 0 ? Math.round((collectedCents / expectedCents) * 100) : null;
}

// ============================================
// حسابات كشف الحساب (Statement Calculations)
// ============================================

/**
 * الحصول على مفتاح الشهر من تاريخ
 * @param {Date} date
 * @returns {string}
 */
function getStatementMonthKeyFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * الحصول على تسمية الشهر
 * @param {string} monthKey
 * @returns {string}
 */
function getStatementMonthLabel(monthKey) {
  if (typeof monthsNames === 'undefined') return '';
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!year || !month || !monthsNames[month - 1]) return '';
  return `${monthsNames[month - 1]} ${year}`;
}

/**
 * تحويل مفتاح الشهر
 * @param {string} monthKey
 * @param {number} offset
 * @returns {string}
 */
function shiftStatementMonthKey(monthKey, offset) {
  const [year, month] = String(monthKey).split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * الحصول على حالة السداد
 * @param {number} dueCents
 * @param {number} paidCents
 * @param {string} monthKey
 * @param {string} currentKey
 * @param {number} adjustmentCents
 * @returns {{label: string, className: string}}
 */
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

// ============================================
// حسابات الإحصائيات (Stats Calculations)
// ============================================

/**
 * حساب متوسط
 * @param {number[]} values
 * @returns {number}
 */
function calculateAverage(values) {
  if (!values || !values.length) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * حساب النسبة المئوية
 * @param {number} part
 * @param {number} total
 * @returns {number|null}
 */
function calculatePercentage(part, total) {
  if (!total) return null;
  return Math.round((part / total) * 100);
}

/**
 * حساب صافي
 * @param {number} income
 * @param {number} expense
 * @returns {number}
 */
function calculateNet(income, expense) {
  return (income || 0) - (expense || 0);
}

// ============================================
// تصدير عالمي (Global Export)
// ============================================
if (typeof window !== 'undefined') {
  // Billing
  window.isResidentActiveInMonth = isResidentActiveInMonth;
  window.getMonthlyBillingTotals = getMonthlyBillingTotals;
  window.getExpenseCategoryTotals = getExpenseCategoryTotals;
  window.buildResidentIndex = buildResidentIndex;

  // Period
  window.getPeriodMonthSpan = getPeriodMonthSpan;
  window.buildPeriodMonthKeys = buildPeriodMonthKeys;
  window.getPeriodCollectionRate = getPeriodCollectionRate;

  // Statement
  window.getStatementMonthKeyFromDate = getStatementMonthKeyFromDate;
  window.getStatementMonthLabel = getStatementMonthLabel;
  window.shiftStatementMonthKey = shiftStatementMonthKey;
  window.getResidentStatementStatus = getResidentStatementStatus;

  // Stats
  window.calculateAverage = calculateAverage;
  window.calculatePercentage = calculatePercentage;
  window.calculateNet = calculateNet;
}

console.log('[Reports Core] Calculations loaded');