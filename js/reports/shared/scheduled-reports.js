// @ts-check
/**
 * التقارير المجدولة - Manzil
 * يوفر نظام جدولة التقارير (يومي/أسبوعي/شهري) مع سجل الإنشاء
 *
 * ملاحظة: التخزين محلي (localStorage). الإرسال الفعلي يحتاج ربطاً بخادم
 * (Edge Function / Cron) ويمكن وصله لاحقاً عبر window.manzilReportDelivery.
 */

// ============================================
// الثوابت
// ============================================

const SCHEDULED_REPORTS_STORAGE_KEY = 'manzil_scheduled_reports';
const SCHEDULED_REPORTS_LOG_KEY = 'manzil_scheduled_reports_log';

const SCHEDULE_FREQUENCIES = Object.freeze({
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly'
});

const SCHEDULE_FREQUENCY_LABELS = Object.freeze({
  daily: 'يومي',
  weekly: 'أسبوعي',
  monthly: 'شهري'
});

const SCHEDULE_DELIVERY_LABELS = Object.freeze({
  download: 'تحميل محلي',
  whatsapp: 'واتساب',
  email: 'بريد إلكتروني'
});

// ============================================
// التخزين (Storage)
// ============================================

/**
 * تحميل التقارير المجدولة
 * @returns {Array}
 */
function loadScheduledReports() {
  try {
    const raw = localStorage.getItem(SCHEDULED_REPORTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[ScheduledReports] Failed to load:', e);
    return [];
  }
}

/**
 * حفظ التقارير المجدولة
 * @param {Array} schedules
 */
function saveScheduledReports(schedules) {
  try {
    localStorage.setItem(SCHEDULED_REPORTS_STORAGE_KEY, JSON.stringify(schedules));
  } catch (e) {
    console.warn('[ScheduledReports] Failed to save:', e);
  }
}

/**
 * تحميل سجل الإنشاء
 * @returns {Array}
 */
function loadScheduleLog() {
  try {
    const raw = localStorage.getItem(SCHEDULED_REPORTS_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * إضافة سجل إنشاء
 * @param {Object} entry
 */
function appendScheduleLog(entry) {
  const log = loadScheduleLog();
  log.unshift(entry);
  saveSafely(SCHEDULED_REPORTS_LOG_KEY, log.slice(0, 50));
}

/**
 * حفظ آمن
 * @param {string} key
 * @param {*} value
 */
function saveSafely(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[ScheduledReports] Save failed:', e);
  }
}

// ============================================
// إدارة الجداول (Schedule Management)
// ============================================

/**
 * إنشاء جدول تقرير
 * @param {Object} config
 * @returns {Object|null}
 */
function createScheduledReport(config) {
  const reportType = String(config?.reportType || '').trim();
  const frequency = String(config?.frequency || '').trim();
  if (!reportType || !Object.values(SCHEDULE_FREQUENCIES).includes(frequency)) return null;

  return {
    id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(config.name || 'تقرير مجدول').trim(),
    reportType,
    frequency,
    delivery: String(config.delivery || 'download'),
    filters: { ...(config.filters || {}) },
    enabled: config.enabled !== false,
    dayOfMonth: Math.min(28, Math.max(1, Number(config.dayOfMonth) || 1)),
    dayOfWeek: Math.min(6, Math.max(0, Number(config.dayOfWeek) || 1)),
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    nextRunAt: computeNextRun(frequency, config)
  };
}

/**
 * حساب وقت التشغيل القادم
 * @param {string} frequency
 * @param {Object} config
 * @returns {string}
 */
function computeNextRun(frequency, config = {}) {
  const now = new Date();
  let next = new Date(now);

  if (frequency === SCHEDULE_FREQUENCIES.DAILY) {
    next.setDate(next.getDate() + 1);
  } else if (frequency === SCHEDULE_FREQUENCIES.WEEKLY) {
    const targetDay = Math.min(6, Math.max(0, Number(config.dayOfWeek) || 1));
    const currentDay = next.getDay();
    let diff = targetDay - currentDay;
    if (diff <= 0) diff += 7;
    next.setDate(next.getDate() + diff);
  } else if (frequency === SCHEDULE_FREQUENCIES.MONTHLY) {
    const targetDay = Math.min(28, Math.max(1, Number(config.dayOfMonth) || 1));
    next = new Date(now.getFullYear(), now.getMonth() + 1, targetDay);
  }

  next.setHours(8, 0, 0, 0);
  return next.toISOString();
}

/**
 * إضافة جدول
 * @param {Object} config
 * @returns {Object|null}
 */
function addScheduledReport(config) {
  const schedule = createScheduledReport(config);
  if (!schedule) return null;
  const schedules = loadScheduledReports();
  schedules.push(schedule);
  saveScheduledReports(schedules);
  return schedule;
}

/**
 * تحديث جدول
 * @param {string} id
 * @param {Object} updates
 * @returns {boolean}
 */
function updateScheduledReport(id, updates) {
  const schedules = loadScheduledReports();
  const index = schedules.findIndex(s => s.id === id);
  if (index === -1) return false;
  schedules[index] = { ...schedules[index], ...updates };
  saveScheduledReports(schedules);
  return true;
}

/**
 * حذف جدول
 * @param {string} id
 * @returns {boolean}
 */
function deleteScheduledReport(id) {
  const schedules = loadScheduledReports();
  const filtered = schedules.filter(s => s.id !== id);
  if (filtered.length === schedules.length) return false;
  saveScheduledReports(filtered);
  return true;
}

/**
 * تبديل تفعيل جدول
 * @param {string} id
 * @returns {boolean}
 */
function toggleScheduledReport(id) {
  const schedule = loadScheduledReports().find(s => s.id === id);
  if (!schedule) return false;
  return updateScheduledReport(id, { enabled: !schedule.enabled });
}

// ============================================
// التنفيذ (Execution)
// ============================================

/**
 * execution جداول مستحقة (للربط مع Cron لاحقاً)
 * @returns {Array} - الجداول المستحقة
 */
function getDueScheduledReports() {
  const now = new Date().toISOString();
  return loadScheduledReports().filter(s =>
    s.enabled && s.nextRunAt && s.nextRunAt <= now
  );
}

/**
 * تنفيذ جدول (يُحدّث آخر تشغيل ويحسب القادم)
 * @param {string} id
 * @returns {boolean}
 */
function markScheduledReportRun(id) {
  const schedule = loadScheduledReports().find(s => s.id === id);
  if (!schedule) return false;
  const now = new Date().toISOString();
  updateScheduledReport(id, {
    lastRunAt: now,
    nextRunAt: computeNextRun(schedule.frequency, schedule)
  });
  appendScheduleLog({
    id: `log_${Date.now()}`,
    scheduleId: id,
    name: schedule.name,
    reportType: schedule.reportType,
    ranAt: now,
    status: 'success'
  });
  return true;
}

// ============================================
// العرض (UI Rendering)
// ============================================

/**
 * عرض قائمة التقارير المجدولة
 * @param {string} containerId
 */
function renderScheduledReportsList(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const schedules = loadScheduledReports();
  if (!schedules.length) {
    container.innerHTML = '<p class="report-note">لا توجد تقارير مجدولة. أنشئ جدولاً لتوليد التقارير تلقائياً.</p>';
    return;
  }

  const html = schedules.map(s => {
    const statusClass = s.enabled ? 'text-emerald-400' : 'text-slate-500';
    const statusLabel = s.enabled ? 'مفعّل' : 'موقوف';
    const freqLabel = SCHEDULE_FREQUENCY_LABELS[s.frequency] || s.frequency;
    const deliveryLabel = SCHEDULE_DELIVERY_LABELS[s.delivery] || s.delivery;
    return `
      <div class="report-list-row">
        <div class="min-w-0">
          <p class="report-list-title">${escapeHtml(s.name)} <span class="report-list-meta">· ${escapeHtml(freqLabel)} · ${escapeHtml(deliveryLabel)}</span></p>
          <p class="report-list-meta ${statusClass}">${statusLabel}${s.lastRunAt ? ' · آخر تشغيل: ' + new Date(s.lastRunAt).toLocaleDateString('ar-EG') : ''}</p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="report-action report-action-sm" onclick="toggleScheduledReport('${s.id}'); renderScheduledReportsList('${containerId}')">
            <i class="fa-solid ${s.enabled ? 'fa-pause' : 'fa-play'}"></i>
          </button>
          <button type="button" class="report-action report-action-sm report-action-danger" onclick="deleteScheduledReport('${s.id}'); renderScheduledReportsList('${containerId}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div class="report-list">${html}</div>`;
}

/**
 * عرض سجل التشغيل
 * @param {string} containerId
 */
function renderScheduleLog(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const log = loadScheduleLog();
  if (!log.length) {
    container.innerHTML = '<p class="report-note">لا يوجد سجل تشغيل بعد.</p>';
    return;
  }

  container.innerHTML = `<div class="report-list">${log.map(entry => `
    <div class="report-list-row">
      <span class="report-list-title">${escapeHtml(entry.name)} <span class="report-list-meta">· ${new Date(entry.ranAt).toLocaleString('ar-EG')}</span></span>
      <span class="report-list-value text-emerald-400">${escapeHtml(entry.status)}</span>
    </div>
  `).join('')}</div>`;
}

// ============================================
// تصدير عالمي (Global Export)
// ============================================
if (typeof window !== 'undefined') {
  window.SCHEDULE_FREQUENCIES = SCHEDULE_FREQUENCIES;
  window.SCHEDULE_FREQUENCY_LABELS = SCHEDULE_FREQUENCY_LABELS;
  window.SCHEDULE_DELIVERY_LABELS = SCHEDULE_DELIVERY_LABELS;
  window.loadScheduledReports = loadScheduledReports;
  window.saveScheduledReports = saveScheduledReports;
  window.loadScheduleLog = loadScheduleLog;
  window.createScheduledReport = createScheduledReport;
  window.addScheduledReport = addScheduledReport;
  window.updateScheduledReport = updateScheduledReport;
  window.deleteScheduledReport = deleteScheduledReport;
  window.toggleScheduledReport = toggleScheduledReport;
  window.getDueScheduledReports = getDueScheduledReports;
  window.markScheduledReportRun = markScheduledReportRun;
  window.renderScheduledReportsList = renderScheduledReportsList;
  window.renderScheduleLog = renderScheduleLog;
}
