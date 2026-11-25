// @ts-check
/**
 * حسابات التقارير المشتركة - Manzil
 * يوفر دوال حسابية مشتركة لجميع أنواع التقارير
 */

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
  // Stats
  window.calculateAverage = calculateAverage;
  window.calculatePercentage = calculatePercentage;
  window.calculateNet = calculateNet;
}
