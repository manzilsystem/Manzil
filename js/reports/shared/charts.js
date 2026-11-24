// @ts-check
/**
 * مكونات الرسم البياني - Manzil
 * يوفر دوال مشتركة لعرض مخططات بيانية في التقارير
 *
 * ملاحظة: هذا الملف يوفر infrastructure لـ Chart.js
 * يجب تضمين Chart.js في HTML قبل هذا الملف
 */

// ============================================
// إعدادات الرسم (Chart Configuration)
// ============================================

/**
 * الألوان الافتراضية للرسوم
 */
const REPORT_CHART_COLORS = Object.freeze({
  emerald: '#10b981',
  rose: '#f43f5e',
  amber: '#f59e0b',
  sky: '#0ea5e9',
  indigo: '#6366f1',
  slate: '#64748b'
});

/**
 * إعدادات Chart.js الافتراضية (RTL)
 */
const REPORT_CHART_DEFAULTS = Object.freeze({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      rtl: true,
      labels: {
        font: { family: 'Cairo, sans-serif', size: 11 },
        usePointStyle: true,
        padding: 12
      }
    },
    tooltip: {
      rtl: true,
      titleFont: { family: 'Cairo, sans-serif' },
      bodyFont: { family: 'Cairo, sans-serif' },
      callbacks: {
        label: function(context) {
          const value = context.parsed?.y ?? context.parsed ?? 0;
          return `${context.dataset.label}: ${Number(value).toLocaleString('ar-EG')}`;
        }
      }
    }
  },
  scales: {
    x: {
      ticks: { font: { family: 'Cairo, sans-serif', size: 10 } },
      grid: { display: false }
    },
    y: {
      ticks: {
        font: { family: 'Cairo, sans-serif', size: 10 },
        callback: function(value) {
          return Number(value).toLocaleString('ar-EG');
        }
      },
      grid: { color: 'rgba(148, 163, 184, 0.1)' }
    }
  }
});

// ============================================
// دوال إنشاء الرسوم (Chart Creation)
// ============================================

/**
 * التأكد من تحميل Chart.js قبل إنشاء الرسم (Lazy Loading)
 * @returns {Promise<boolean>}
 */
async function ensureChartLoaded() {
  if (typeof Chart !== 'undefined') return true;
  if (typeof window !== 'undefined' && typeof window.ensureChartJs === 'function') {
    return window.ensureChartJs();
  }
  return false;
}

/**
 * تدمير الرسم السابق وإنشاء context جديد
 * @param {HTMLCanvasElement} canvas
 * @returns {CanvasRenderingContext2D|null}
 */
function prepareChartCanvas(canvas) {
  if (!canvas) return null;
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  return canvas.getContext('2d');
}

/**
 * تسجيل استدعاء مخطط للرسم في المكالمات العالمية (لاختبارات الوحدة)
 * @param {Object} config
 */
function recordChartCall(config) {
  if (typeof window !== 'undefined' && window.__chartCalls) {
    window.__chartCalls.push(config);
  }
}

/**
 * إنشاء مخطط أعمدة (Bar Chart) مع Lazy Loading لـ Chart.js
 * @param {string} canvasId
 * @param {Object} data
 * @param {Object} [options]
 * @returns {Promise<Object|null>}
 */
async function createBarChart(canvasId, data, options = {}) {
  if (!(await ensureChartLoaded())) {
    console.warn('[Charts] Chart.js not loaded');
    return null;
  }
  const canvas = document.getElementById(canvasId);
  const ctx = prepareChartCanvas(canvas);
  if (!ctx) return null;

  const chart = new Chart(ctx, {
    type: 'bar',
    data: data,
    options: {
      ...REPORT_CHART_DEFAULTS,
      ...options,
      indexAxis: options.horizontal ? 'y' : 'x'
    }
  });
  recordChartCall({ type: 'bar', data });
  return chart;
}

/**
 * إنشاء مخطط خطي (Line Chart) مع Lazy Loading لـ Chart.js
 * @param {string} canvasId
 * @param {Object} data
 * @param {Object} [options]
 * @returns {Promise<Object|null>}
 */
async function createLineChart(canvasId, data, options = {}) {
  if (!(await ensureChartLoaded())) {
    console.warn('[Charts] Chart.js not loaded');
    return null;
  }
  const canvas = document.getElementById(canvasId);
  const ctx = prepareChartCanvas(canvas);
  if (!ctx) return null;

  const chart = new Chart(ctx, {
    type: 'line',
    data: data,
    options: {
      ...REPORT_CHART_DEFAULTS,
      ...options,
      elements: {
        line: { tension: 0.3, borderWidth: 2 },
        point: { radius: 3, hoverRadius: 5 }
      }
    }
  });
  recordChartCall({ type: 'line', data });
  return chart;
}

/**
 * إنشاء مخطط دائري (Doughnut/Pie Chart) مع Lazy Loading لـ Chart.js
 * @param {string} canvasId
 * @param {Object} data
 * @param {Object} [options]
 * @returns {Promise<Object|null>}
 */
async function createDoughnutChart(canvasId, data, options = {}) {
  if (!(await ensureChartLoaded())) {
    console.warn('[Charts] Chart.js not loaded');
    return null;
  }
  const canvas = document.getElementById(canvasId);
  const ctx = prepareChartCanvas(canvas);
  if (!ctx) return null;

  const chart = new Chart(ctx, {
    type: 'doughnut',
    data: data,
    options: {
      ...REPORT_CHART_DEFAULTS,
      ...options,
      cutout: options.cutout || '60%'
    }
  });
  recordChartCall({ type: 'doughnut', data });
  return chart;
}

/**
 * إنشاء مخطط مساحة (Area Chart) مع Lazy Loading لـ Chart.js
 * @param {string} canvasId
 * @param {Object} data
 * @param {Object} [options]
 * @returns {Promise<Object|null>}
 */
async function createAreaChart(canvasId, data, options = {}) {
  if (!(await ensureChartLoaded())) {
    console.warn('[Charts] Chart.js not loaded');
    return null;
  }
  const canvas = document.getElementById(canvasId);
  const ctx = prepareChartCanvas(canvas);
  if (!ctx) return null;

  const chart = new Chart(ctx, {
    type: 'line',
    data: data,
    options: {
      ...REPORT_CHART_DEFAULTS,
      ...options,
      fill: true,
      elements: {
        line: { tension: 0.3, borderWidth: 2 },
        point: { radius: 0, hoverRadius: 4 }
      }
    }
  });
  recordChartCall({ type: 'line', data, area: true });
  return chart;
}

// ============================================
// دوال بناء البيانات عالية المستوى (High-level builders)
// تبنى 내부 datasets بحيث لا تحتاج ملفات التقارير إلى كتابة
// خصائص ألوان Chart.js مباشرة.
// ============================================

/**
 * رسم مخطط دائري من قيم بسيطة
 * إذا كان Chart.js محملاً يتم الإنشاء بشكل متزامن، وإلا يتم التحميل أولاً (Lazy Loading)
 * @param {string} canvasId
 * @param {string[]} labels
 * @param {number[]} values
 * @param {string[]} palette - ألوان من REPORT_CHART_COLORS
 * @param {Object} [options]
 * @returns {Object|null|Promise<Object|null>}
 */
function renderDoughnutValues(canvasId, labels, values, palette, options = {}) {
  const data = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: palette,
      borderWidth: 0
    }]
  };
  if (typeof Chart !== 'undefined') return createDoughnutChart(canvasId, data, options);
  return (async () => {
    await ensureChartLoaded();
    return createDoughnutChart(canvasId, data, options);
  })();
}

/**
 * رسم مخطط أعمدة من قيم بسيطة
 * إذا كان Chart.js محملاً يتم الإنشاء بشكل متزامن، وإلا يتم التحميل أولاً (Lazy Loading)
 * @param {string} canvasId
 * @param {string[]} labels
 * @param {number[]} values
 * @param {string} color
 * @param {string} [label]
 * @param {Object} [options]
 * @returns {Object|null|Promise<Object|null>}
 */
function renderBarValues(canvasId, labels, values, color, label = '', options = {}) {
  const data = {
    labels,
    datasets: [{ label, data: values, backgroundColor: color, borderWidth: 0 }]
  };
  if (typeof Chart !== 'undefined') return createBarChart(canvasId, data, options);
  return (async () => {
    await ensureChartLoaded();
    return createBarChart(canvasId, data, options);
  })();
}

/**
 * رسم مخطط خطي من عدة سلاسل
 * إذا كان Chart.js محملاً يتم الإنشاء بشكل متزامن، وإلا يتم التحميل أولاً (Lazy Loading)
 * @param {string} canvasId
 * @param {string[]} labels
 * @param {Array<{label: string, values: number[], color: string, fill?: string}>} series
 * @param {Object} [options]
 * @returns {Object|null|Promise<Object|null>}
 */
function renderLineSeries(canvasId, labels, series, options = {}) {
  const datasets = series.map(s => ({
    label: s.label,
    data: s.values,
    borderColor: s.color,
    backgroundColor: s.fill || 'transparent',
    fill: Boolean(s.fill),
    tension: 0.3
  }));
  if (typeof Chart !== 'undefined') return createLineChart(canvasId, { labels, datasets }, options);
  return (async () => {
    await ensureChartLoaded();
    return createLineChart(canvasId, { labels, datasets }, options);
  })();
}

// ============================================
// دوال مساعدة (Helper Functions)
// ============================================

/**
 * تحويل بيانات إلى صيغة Chart.js
 * @param {Array<{label: string, value: number}>} items
 * @param {string} [color]
 * @returns {Object}
 */
function toChartData(items, color = REPORT_CHART_COLORS.indigo) {
  return {
    labels: items.map(item => item.label),
    datasets: [{
      data: items.map(item => item.value),
      backgroundColor: Array.isArray(color) ? color : color,
      borderColor: Array.isArray(color) ? color : color,
      borderWidth: 1
    }]
  };
}

/**
 * إنشاء container للرسم
 * @param {string} containerId
 * @param {string} canvasId
 * @param {number} [height]
 * @returns {HTMLElement|null}
 */
function createChartContainer(containerId, canvasId, height = 200) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  // إزالة الرسم السابق
  const existingCanvas = document.getElementById(canvasId);
  if (existingCanvas) existingCanvas.remove();

  const canvas = document.createElement('canvas');
  canvas.id = canvasId;
  canvas.height = height;
  container.appendChild(canvas);
  return canvas;
}

/**
 * تدمير جميع الرسوم في container
 * @param {string} containerId
 */
function destroyChartsInContainer(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const canvases = container.querySelectorAll('canvas');
  canvases.forEach(canvas => {
    const chart = Chart.getChart(canvas);
    if (chart) chart.destroy();
  });
}

// ============================================
// تصدير عالمي (Global Export)
// ============================================
if (typeof window !== 'undefined') {
  window.REPORT_CHART_COLORS = REPORT_CHART_COLORS;
  window.REPORT_CHART_DEFAULTS = REPORT_CHART_DEFAULTS;
  window.createBarChart = createBarChart;
  window.createLineChart = createLineChart;
  window.createDoughnutChart = createDoughnutChart;
  window.createAreaChart = createAreaChart;
  window.renderDoughnutValues = renderDoughnutValues;
  window.renderBarValues = renderBarValues;
  window.renderLineSeries = renderLineSeries;
  window.toChartData = toChartData;
  window.createChartContainer = createChartContainer;
  window.destroyChartsInContainer = destroyChartsInContainer;
}

console.log('[Reports Shared] Charts loaded');