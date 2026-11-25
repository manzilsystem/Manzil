// @ts-check
/**
 * تحميل Chart.js عند الحاجة فقط - Manzil
 * (كان الملف يحوي أيضًا memoization وتخزينًا مؤقتًا لم يُستدعَ من أي مكان، فحُذف.)
 */

let chartJsPromise = null;
let chartJsLoaded = false;

/**
 * تحميل Chart.js عند الحاجة فقط (Lazy Loading)
 * @returns {Promise<boolean>}
 */
async function ensureChartJs() {
  if (chartJsLoaded && typeof Chart !== 'undefined') return true;
  if (chartJsPromise) return chartJsPromise;

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
      script.remove();
      chartJsPromise = null;
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return chartJsPromise;
}

if (typeof window !== 'undefined') {
  window.ensureChartJs = ensureChartJs;
}
