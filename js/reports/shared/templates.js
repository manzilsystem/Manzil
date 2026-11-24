// @ts-check
/**
 * قوالب التقارير المحفوظة - Manzil
 * يوفر نظام حفظ واسترجاع قوالب التقارير (فلاتر محفوظة)
 */

// ============================================
// مفاتيح localStorage
// ============================================
const REPORT_TEMPLATES_STORAGE_KEY = 'manzil_report_templates';

// ============================================
// دوال التخزين (Storage Functions)
// ============================================

/**
 * تحميل قوالب التقارير من localStorage
 * @returns {Array}
 */
function loadReportTemplates() {
  try {
    const raw = localStorage.getItem(REPORT_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[Templates] Failed to load templates:', e);
    return [];
  }
}

/**
 * حفظ قوالب التقارير في localStorage
 * @param {Array} templates
 */
function saveReportTemplates(templates) {
  try {
    localStorage.setItem(REPORT_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch (e) {
    console.warn('[Templates] Failed to save templates:', e);
  }
}

// ============================================
// دوال إدارة القوالب (Template Management)
// ============================================

/**
 * إنشاء قالب تقرير
 * @param {string} name - اسم القالب
 * @param {string} reportType - نوع التقرير (landlord, period, expenses, etc.)
 * @param {Object} filters - الفلاتر
 * @returns {Object}
 */
function createReportTemplate(name, reportType, filters) {
  return {
    id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || '').trim(),
    reportType: String(reportType || '').trim(),
    filters: { ...filters },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * إضافة قالب
 * @param {string} name
 * @param {string} reportType
 * @param {Object} filters
 * @returns {Object|null}
 */
function addReportTemplate(name, reportType, filters) {
  if (!name || !reportType) return null;
  const templates = loadReportTemplates();
  const template = createReportTemplate(name, reportType, filters);
  templates.push(template);
  saveReportTemplates(templates);
  return template;
}

/**
 * حذف قالب
 * @param {string} templateId
 * @returns {boolean}
 */
function deleteReportTemplate(templateId) {
  const templates = loadReportTemplates();
  const index = templates.findIndex(t => t.id === templateId);
  if (index === -1) return false;
  templates.splice(index, 1);
  saveReportTemplates(templates);
  return true;
}

/**
 * الحصول على قوالب لنوع تقرير معين
 * @param {string} reportType
 * @returns {Array}
 */
function getTemplatesForReport(reportType) {
  const templates = loadReportTemplates();
  return templates.filter(t => t.reportType === reportType);
}

/**
 * تطبيق قالب (إرجاع الفلاتر)
 * @param {string} templateId
 * @returns {Object|null}
 */
function applyReportTemplate(templateId) {
  const templates = loadReportTemplates();
  const template = templates.find(t => t.id === templateId);
  if (!template) return null;
  return { ...template.filters };
}

// ============================================
// دوال UI (UI Helpers)
// ============================================

/**
 * عرض قائمة قوالب التقرير
 * @param {string} reportType
 * @param {string} containerId
 */
function renderTemplateList(reportType, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const templates = getTemplatesForReport(reportType);

  if (templates.length === 0) {
    container.innerHTML = '<p class="report-note">لا توجد قوالب محفوظة. احفظ مجموعة الفلاتر الحالية كقالب.</p>';
    return;
  }

  const html = templates.map(tpl => `
    <div class="report-list-row">
      <span class="report-list-title">
        ${escapeHtml(tpl.name)}
        <span class="report-list-meta">· ${new Date(tpl.createdAt).toLocaleDateString('ar-EG')}</span>
      </span>
      <div class="flex gap-2">
        <button type="button" class="report-action report-action-sm" onclick="applyTemplate('${tpl.id}')">
          <i class="fa-solid fa-play"></i> تطبيق
        </button>
        <button type="button" class="report-action report-action-sm report-action-danger" onclick="deleteTemplate('${tpl.id}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');

  container.innerHTML = `<div class="report-list">${html}</div>`;
}

/**
 * حفظ قالب من واجهة المستخدم
 * @param {string} reportType
 * @param {Object} filters
 * @param {string} [name]
 */
function saveTemplateFromUI(reportType, filters, name) {
  const templateName = name || prompt('اسم القالب:');
  if (!templateName) return null;
  const template = addReportTemplate(templateName, reportType, filters);
  if (template) {
    if (typeof toast === 'function') toast('تم حفظ القالب', 'success');
  }
  return template;
}

// ============================================
// تصدير عالمي (Global Export)
// ============================================
if (typeof window !== 'undefined') {
  window.loadReportTemplates = loadReportTemplates;
  window.saveReportTemplates = saveReportTemplates;
  window.createReportTemplate = createReportTemplate;
  window.addReportTemplate = addReportTemplate;
  window.deleteReportTemplate = deleteReportTemplate;
  window.getTemplatesForReport = getTemplatesForReport;
  window.applyReportTemplate = applyReportTemplate;
  window.renderTemplateList = renderTemplateList;
  window.saveTemplateFromUI = saveTemplateFromUI;
}
