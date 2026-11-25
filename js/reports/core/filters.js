// @ts-check
/**
 * فلاتر التقارير المشتركة - Manzil
 * دوال الفلترة نفسها (الغرض والصندوق وطريقة الدفع والمالك) معرّفة في js/reports.js وهي النسخة الوحيدة المستخدمة.
 */

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
  // Utility
  window.escapeHtml = escapeHtml;
}
