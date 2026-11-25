// @ts-check
/**
 * تحسينات الأداء لنظام التقارير - Manzil
 * يوفرMemoization و Lazy Loading وتخزين مؤقت للحسابات الثقيلة
 */

// ============================================
// نظام التخزين المؤقت (Memoization Cache)
// ============================================

/**
 * إنشاء دالة مخزنة مؤقتاً (memoized) مع حد أقصى لحجم التخزين
 * @param {Function} fn - الدالة الأصلية
 * @param {number} [maxSize=50] - أقصى عدد من entradas المخزنة
 * @returns {Function} - الدالة المخزنة مؤقتاً مع خصائص cache و clear
 */
function memoize(fn, maxSize = 50) {
  const cache = new Map();
  const order = [];

  const memoized = function (...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      // نقل المفتاح إلى النهاية (LRU)
      const index = order.indexOf(key);
      if (index !== -1) order.splice(index, 1);
      order.push(key);
      return cache.get(key);
    }

    const result = fn.apply(this, args);

    if (cache.size >= maxSize) {
      const oldest = order.shift();
      if (oldest) cache.delete(oldest);
    }
    cache.set(key, result);
    order.push(key);

    return result;
  };

  memoized.cache = cache;
  memoized.clear = () => {
    cache.clear();
    order.length = 0;
  };
  memoized.size = () => cache.size;

  return memoized;
}

/**
 * تخزين مؤقت سريع للحسابات الشهرية (بصمة شهر + فلاتر)
 * يستخدم للتقارير التي تُعاد مع نفس المدخلات عدة مرات
 */
const REPORT_CALCULATION_CACHE = Object.freeze({
  MAX_SIZE: 100,
  enabled: true
});

// ============================================
// دوال مساعدة للتخزين المؤقت
// ============================================

/**
 * إنشاء بصمة (signature) سريعة لحساب التقرير
 * تشمل فقط البيانات الأساسية التي تؤثر في النتيجة
 * @param {string} reportType
 * @param {Array} args
 * @returns {string}
 */
function createReportSignature(reportType, args) {
  return JSON.stringify([reportType, args]);
}

/**
 * مسح جميع تخزينات التقارير عند تحديث البيانات
 * يُستدعى من دوال حفظ البيانات (crud.js, saveWithRollback, إلخ)
 */
function clearAllReportCaches() {
  if (typeof window.clearReportCaches === 'function') {
    window.clearReportCaches();
  }
}

// ============================================
// Lazy Loading لـ Chart.js
// ============================================

let chartJsPromise = null;
let chartJsLoaded = false;

/**
 * تحميل Chart.js عند الحاجة فقط (Lazy Loading)
 * @returns {Promise<boolean>}
 */
async function ensureChartJs() {
  if (chartJsLoaded && typeof Chart !== 'undefined') return true;
  if (chartJsPromise) return chartJsPromise.then(() => true);

  chartJsPromise = new Promise((resolve) => {
    if (typeof Chart !== 'undefined') {
      chartJsLoaded = true;
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'vendor/chart.umd.js';
    script.onload = () => {
      chartJsLoaded = true;
      resolve(true);
    };
    script.onerror = () => {
      console.warn('[Performance] Chart.js failed to load');
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return chartJsPromise;
}

/**
 * التحقق من توفر Chart.js بشكل متزامن
 * @returns {boolean}
 */
function isChartJsReady() {
  return chartJsLoaded && typeof Chart !== 'undefined';
}

// ============================================
// تصدير عالمي (Global Export)
// ============================================
if (typeof window !== 'undefined') {
  window.memoize = memoize;
  window.ensureChartJs = ensureChartJs;
  window.isChartJsReady = isChartJsReady;
  window.clearAllReportCaches = clearAllReportCaches;
  window.REPORT_CALCULATION_CACHE = REPORT_CALCULATION_CACHE;
}
