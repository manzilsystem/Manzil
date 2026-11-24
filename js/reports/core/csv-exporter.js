// @ts-check
/**
 * مصدّر CSV مشترك - Manzil
 * يوفر دوال مشتركة لتصدير التقارير إلى CSV
 */

// ============================================
// دوال CSV (CSV Functions)
// ============================================

/**
 * escape خلية CSV
 * @param {*} value
 * @returns {string}
 */
function escapeCsvCell(value) {
  let text = String(value ?? '');
  if (typeof value === 'string' && /^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * بناء محتوى CSV
 * @param {Array<Array>} rows
 * @returns {string}
 */
function buildCsv(rows) {
  return '\uFEFF' + (rows || []).map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
}

/**
 * تنزيل CSV
 * @param {string} filename
 * @param {Array<Array>} rows
 */
function downloadCsv(filename, rows) {
  const blob = new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
  window.escapeCsvCell = escapeCsvCell;
  window.buildCsv = buildCsv;
  window.downloadCsv = downloadCsv;
  window.exportReportCsv = exportReportCsv;
}
