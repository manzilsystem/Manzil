// @ts-check
/**
 * مصدّر CSV مشترك - Manzil
 * يوفر دوال مشتركة لتصدير التقارير إلى CSV
 */

// ============================================
// دوال CSV (CSV Functions)
// ============================================

/**
 * تصدير تقرير إلى CSV مع تحقق
 * @param {string} filename
 * @param {Array<Array>} rows
 * @param {string} [successMessage]
 */
function exportReportCsv(filename, rows, successMessage) {
  if (!rows || !rows.length) {
    if (typeof toast === 'function') toast('لا توجد بيانات للتصدير', 'error');
    return;
  }
  downloadCsv(filename, rows);
  if (successMessage && typeof toast === 'function') toast(successMessage, 'success');
}

// ============================================
// تصدير عالمي (Global Export)
// ============================================
if (typeof window !== 'undefined') {
  window.exportReportCsv = exportReportCsv;
}
