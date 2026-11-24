// @ts-check
/**
 * مقارنة الفترات - Manzil
 * يوفر دوال لمقارنة فترة تقرير بفترة سابقة مع مؤشرات التغير
 */

// ============================================
// أنواع المقارنة
// ============================================

const REPORT_COMPARISON_MODES = Object.freeze({
  NONE: 'none',
  PREVIOUS_PERIOD: 'previous',      // الفترة السابقة مباشرة
  PREVIOUS_YEAR: 'previous_year',  // نفس الفترة من العام الماضي
  CUSTOM: 'custom'                 // فترة مخصصة للمقارنة
});

const REPORT_COMPARISON_LABELS = Object.freeze({
  none: 'بدون مقارنة',
  previous: 'الفترة السابقة',
  previous_year: 'نفس الفترة من العام الماضي',
  custom: 'فترة مخصصة'
});

// ============================================
// دوال حساب التغير
// ============================================

/**
 * حساب القيمة المطلقة للتغير
 * @param {number} current - القيمة الحالية
 * @param {number} previous - القيمة السابقة
 * @returns {number}
 */
function computeDelta(current, previous) {
  return (current || 0) - (previous || 0);
}

/**
 * حساب نسبة التغير المئوية
 * @param {number} current - القيمة الحالية
 * @param {number} previous - القيمة السابقة
 * @returns {number|null} - null إذا كان previous = 0
 */
function computeChangeRate(current, previous) {
  const prev = previous || 0;
  if (prev === 0) return current ? 100 : null;
  return Math.round(((current - prev) / Math.abs(prev)) * 100);
}

/**
 * الحصول على اتجاه التغير
 * @param {number} delta
 * @returns {'up'|'down'|'flat'}
 */
function getChangeDirection(delta) {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

/**
 * تنسيق مؤشر التغير بصرياً
 * @param {number} current - القيمة الحالية
 * @param {number} previous - القيمة السابقة
 * @param {boolean} [lowerIsBetter=false] - هل الانخفاض أفضل؟ (مثل المصروفات)
 * @returns {{text: string, className: string, direction: string, rate: number|null, delta: number}}
 */
function formatChangeIndicator(current, previous, lowerIsBetter = false) {
  const delta = computeDelta(current, previous);
  const rate = computeChangeRate(current, previous);
  const direction = getChangeDirection(delta);

  // تحديد اللون: الأخضر للتحسن، الأحمر للتراجع
  let isPositive;
  if (direction === 'flat') {
    isPositive = null;
  } else if (lowerIsBetter) {
    isPositive = direction === 'down';
  } else {
    isPositive = direction === 'up';
  }

  let className = 'report-change-neutral';
  if (isPositive === true) className = 'report-change-positive';
  if (isPositive === false) className = 'report-change-negative';

  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '—';
  const rateText = rate === null ? '' : `${compareFormatNumber(rate)}%`;
  const text = `${arrow} ${rateText}`.trim();

  return { text, className, direction, rate, delta };
}

// ============================================
// حساب فترات المقارنة
// ============================================

/**
 * الحصول على مفتاح الشهر
 * @param {string} monthLabel
 * @returns {string}
 */
function monthLabelToKeySafe(monthLabel) {
  if (typeof monthLabelToKey === 'function') return monthLabelToKey(monthLabel);
  return '';
}

/**
 * الحصول على تسمية الشهر من المفتاح
 * @param {string} key
 * @returns {string}
 */
function keyToMonthLabelSafe(key) {
  if (typeof getStatementMonthLabel === 'function') return getStatementMonthLabel(key);
  return '';
}

/**
 * حساب فترة المقارنة بناءً على الوضع
 * @param {string} fromMonth - شهر البداية الحالي
 * @param {string} toMonth - شهر النهاية الحالي
 * @param {string} mode - وضع المقارنة
 * @param {string} [customFrom] - شهر بداية مخصص
 * @param {string} [customTo] - شهر نهاية مخصص
 * @returns {{fromMonth: string, toMonth: string, label: string}|null}
 */
function getComparisonRange(fromMonth, toMonth, mode, customFrom = '', customTo = '') {
  const fromKey = monthLabelToKeySafe(fromMonth);
  const toKey = monthLabelToKeySafe(toMonth);
  if (!fromKey || !toKey) return null;

  const span = typeof getPeriodMonthSpan === 'function'
    ? getPeriodMonthSpan(fromKey, toKey)
    : null;
  if (!span) return null;

  const shift = typeof shiftStatementMonthKey === 'function' ? shiftStatementMonthKey : null;
  if (!shift) return null;

  let compareFromKey = '';
  let compareToKey = '';

  switch (mode) {
    case REPORT_COMPARISON_MODES.PREVIOUS_PERIOD:
      // الفترة السابقة مباشرة: نقل الفترة كاملة للخلف بقدر طولها
      compareToKey = shift(fromKey, -1);
      compareFromKey = shift(compareToKey, -(span - 1));
      break;

    case REPORT_COMPARISON_MODES.PREVIOUS_YEAR:
      // نفس الفترة من العام الماضي
      compareFromKey = `${Number(fromKey.slice(0, 4)) - 1}-${fromKey.slice(5)}`;
      compareToKey = `${Number(toKey.slice(0, 4)) - 1}-${toKey.slice(5)}`;
      break;

    case REPORT_COMPARISON_MODES.CUSTOM:
      if (!customFrom || !customTo) return null;
      compareFromKey = monthLabelToKeySafe(customFrom);
      compareToKey = monthLabelToKeySafe(customTo);
      break;

    default:
      return null;
  }

  if (!compareFromKey || !compareToKey || compareFromKey > compareToKey) return null;

  return {
    fromMonth: keyToMonthLabelSafe(compareFromKey),
    toMonth: keyToMonthLabelSafe(compareToKey),
    label: REPORT_COMPARISON_LABELS[mode] || 'مقارنة'
  };
}

// ============================================
// بناء بيانات المقارنة
// ============================================

/**
 * بناء نموذج مقارنة بين تقريرين
 * @param {Object} currentReport - التقرير الحالي
 * @param {Object} previousReport - تقرير المقارنة
 * @returns {Object|null}
 */
function buildComparisonModel(currentReport, previousReport) {
  if (!currentReport || !previousReport) return null;

  const currentTotals = currentReport.totals || {};
  const previousTotals = previousReport.totals || {};

  const metrics = [
    { key: 'expectedCents', label: 'المستحق', lowerIsBetter: false },
    { key: 'collectedCents', label: 'المحصّل', lowerIsBetter: false },
    { key: 'outstandingCents', label: 'غير المحصّل', lowerIsBetter: true },
    { key: 'expenseCents', label: 'المصروف', lowerIsBetter: true },
    { key: 'netCents', label: 'الصافي', lowerIsBetter: false },
    { key: 'totalIncomeCents', label: 'إجمالي التحصيل', lowerIsBetter: false },
    { key: 'movementCount', label: 'عدد الحركات', lowerIsBetter: false }
  ];

  const rows = metrics
    .filter(metric => currentTotals[metric.key] !== undefined || previousTotals[metric.key] !== undefined)
    .map(metric => {
      const current = currentTotals[metric.key] || 0;
      const previous = previousTotals[metric.key] || 0;
      const isMoney = metric.key !== 'movementCount';
      return {
        key: metric.key,
        label: metric.label,
        current,
        previous,
        currentText: isMoney ? compareFormatMoney(current / 100) : compareFormatNumber(current),
        previousText: isMoney ? compareFormatMoney(previous / 100) : compareFormatNumber(previous),
        ...formatChangeIndicator(current, previous, metric.lowerIsBetter)
      };
    });

  return {
    currentRange: currentReport.rangeLabel || '',
    previousRange: previousReport.rangeLabel || '',
    rows,
    generatedAt: new Date().toISOString()
  };
}

// ============================================
// عرض المقارنة (HTML)
// ============================================

/**
 * عرض جدول المقارنة
 * @param {Object} comparison - نموذج المقارنة
 * @returns {string}
 */
function renderComparisonHtml(comparison) {
  if (!comparison || !comparison.rows.length) return '';

  const rows = comparison.rows.map(row => `
    <tr>
      <td>${esc(row.label)}</td>
      <td class="report-compare-prev">${esc(row.previousText)}</td>
      <td class="report-compare-current">${esc(row.currentText)}</td>
      <td class="${row.className}">${esc(row.text)}</td>
    </tr>
  `).join('');

  return `
    <div class="report-block report-comparison-block">
      <p class="report-block-title">
        <span>مقارنة الفترات</span>
        <span class="report-block-count">${esc(comparison.previousRange)}</span>
      </p>
      <div class="report-table-wrap">
        <table class="statement-table report-comparison-table">
          <thead><tr><th>البند</th><th>${esc(comparison.previousRange)}</th><th>${esc(comparison.currentRange)}</th><th>التغير</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="report-note">▲ تحسن · ▼ تراجع · الألوان: <span class="report-change-positive">أخضر = تحسن</span>، <span class="report-change-negative">أحمر = تراجع</span>. المصروفات والمتبقي: الانخفاض أفضل.</p>
    </div>
  `;
}

// ============================================
// دوال مساعدة
// ============================================

/**
 * تنسيق رقم للعرض داخل المقارنة
 * لا نستدعي window.fmtNum هنا لأنه قد يشير إلى هذه الدالة نفسها في سكربتات المتصفح
 * (التصريح الأعلى مستوى يصبح خاصية على window)، مما يسبب استدعاءً ذاتياً.
 * @param {number} num
 * @returns {string}
 */
function compareFormatNumber(num) {
  return Number(num || 0).toLocaleString('ar-EG');
}

/**
 * تنسيق مبلغ للعرض داخل المقارنة
 * @param {number} amount
 * @returns {string}
 */
function compareFormatMoney(amount) {
  return Number(amount || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * escape HTML
 * @param {string} value
 * @returns {string}
 */
function esc(value) {
  // لا نستدعي window.escapeHtml هنا: تلك الدالة في filters.js تستدعي esc بدورها،
  // مما يخلق حلقة استدعاء ذاتي في سكربتات المتصفح. نطبّق التهريب محلياً.
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]);
}

// ============================================
// تصدير عالمي (Global Export)
// ============================================
if (typeof window !== 'undefined') {
  window.REPORT_COMPARISON_MODES = REPORT_COMPARISON_MODES;
  window.REPORT_COMPARISON_LABELS = REPORT_COMPARISON_LABELS;
  window.computeDelta = computeDelta;
  window.computeChangeRate = computeChangeRate;
  window.getChangeDirection = getChangeDirection;
  window.formatChangeIndicator = formatChangeIndicator;
  window.getComparisonRange = getComparisonRange;
  window.buildComparisonModel = buildComparisonModel;
  window.renderComparisonHtml = renderComparisonHtml;
}
