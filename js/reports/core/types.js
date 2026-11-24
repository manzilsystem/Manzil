// @ts-check
/**
 * Types موحدة لنظام التقارير - Manzil
 * يوفر ثوابت وواجهات مشتركة لجميع أنواع التقارير
 *
 * ملاحظة: هذا المشروع يستخدم JavaScript مع JSDoc (وليس TypeScript modules).
 * هذا الملف يوفر ثوابت (Constants) ودوال مساعدة (Helpers) لل types.
 */

// ============================================
// ثوابت الغرض (Income Purpose)
// ============================================
const REPORT_PURPOSE_CODES = Object.freeze({
  SUBSCRIPTION: 'subscription',
  SETTLEMENT: 'settlement',
  WAIVER: 'waiver',
  DISCOUNT: 'discount',
  OTHER: 'other'
});

const REPORT_PURPOSE_LABELS = Object.freeze({
  subscription: 'اشتراك شهري',
  settlement: 'تسوية',
  waiver: 'إعفاء',
  discount: 'تخفيض',
  other: 'أخرى'
});

// ============================================
// ثوابت طريقة الدفع (Payment Method)
// ============================================
const REPORT_PAYMENT_METHOD_CODES = Object.freeze({
  CASH: 'cash',
  WALLET: 'wallet',
  INSTAPAY: 'instapay',
  BANK_TRANSFER: 'bank_transfer',
  OTHER: 'other'
});

const REPORT_PAYMENT_METHOD_LABELS = Object.freeze({
  cash: 'نقدًا',
  wallet: 'محفظة',
  instapay: 'InstaPay',
  bank_transfer: 'تحويل بنكي',
  other: 'أخرى'
});

// ============================================
// ثوابت الصندوق (Cash Account)
// ============================================
const REPORT_CASH_ACCOUNT_CODES = Object.freeze({
  MAIN: 'main',
  DEVELOPMENT: 'development',
  EMERGENCY: 'emergency'
});

const REPORT_CASH_ACCOUNT_LABELS = Object.freeze({
  main: 'الخزنة الرئيسية',
  development: 'صندوق التطوير',
  emergency: 'صندوق الصيانة الطارئة'
});

// ============================================
// ثوابت نوع الإعفاء (Adjustment Kind)
// ============================================
const REPORT_ADJUSTMENT_KINDS = Object.freeze({
  WAIVER: 'waiver',
  DISCOUNT: 'discount',
  SETTLEMENT: 'settlement'
});

const REPORT_ADJUSTMENT_KIND_LABELS = Object.freeze({
  waiver: 'إعفاء',
  discount: 'تخفيض',
  settlement: 'تسوية'
});

// ============================================
// ثوابت لون التقرير (Report Tone)
// ============================================
const REPORT_TONES = Object.freeze({
  INDIGO: 'indigo',
  EMERALD: 'emerald',
  AMBER: 'amber',
  ROSE: 'rose',
  SKY: 'sky'
});

// ============================================
// دوال التحقق (Validation Helpers)
// ============================================

/**
 * التحقق من صحة كود الغرض
 * @param {string} code
 * @returns {boolean}
 */
function isValidPurposeCode(code) {
  return Object.values(REPORT_PURPOSE_CODES).includes(String(code || '').trim());
}

/**
 * التحقق من صحة كود طريقة الدفع
 * @param {string} code
 * @returns {boolean}
 */
function isValidPaymentMethod(code) {
  return Object.values(REPORT_PAYMENT_METHOD_CODES).includes(String(code || '').trim());
}

/**
 * التحقق من صحة كود الصندوق
 * @param {string} code
 * @returns {boolean}
 */
function isValidCashAccount(code) {
  return Object.values(REPORT_CASH_ACCOUNT_CODES).includes(String(code || '').trim());
}

/**
 * التحقق من صحة نوع الإعفاء
 * @param {string} kind
 * @returns {boolean}
 */
function isValidAdjustmentKind(kind) {
  return Object.values(REPORT_ADJUSTMENT_KINDS).includes(String(kind || '').trim());
}

// ============================================
// دوال تحويل (Conversion Helpers)
// ============================================

/**
 * تحويل مبلغ من السنت إلى وحدات العملة
 * @param {number} cents
 * @returns {number}
 */
function centsToCurrency(cents) {
  return Number(cents || 0) / 100;
}

/**
 * تحويل مبلغ من وحدات العملة إلى السنت
 * @param {number} amount
 * @returns {number}
 */
function currencyToCents(amount) {
  return Math.round(Number(amount || 0) * 100);
}

// ============================================
// دوال التسمية (Label Helpers)
// ============================================

/**
 * الحصول على تسمية الغرض
 * @param {string} code
 * @returns {string}
 */
function getReportPurposeLabel(code) {
  const normalized = String(code || '').trim();
  if (!normalized) return REPORT_PURPOSE_LABELS.subscription;
  return REPORT_PURPOSE_LABELS[normalized] || normalized;
}

/**
 * الحصول على تسمية طريقة الدفع
 * @param {string} code
 * @returns {string}
 */
function getReportPaymentMethodLabel(code) {
  const normalized = String(code || '').trim();
  if (!normalized) return 'غير محدد';
  return REPORT_PAYMENT_METHOD_LABELS[normalized] || normalized;
}

/**
 * الحصول على تسمية الصندوق
 * @param {string} code
 * @returns {string}
 */
function getReportCashAccountLabel(code) {
  const normalized = String(code || '').trim() || 'main';
  return REPORT_CASH_ACCOUNT_LABELS[normalized] || normalized;
}

/**
 * الحصول على تسمية نوع الإعفاء
 * @param {string} kind
 * @returns {string}
 */
function getReportAdjustmentKindLabel(kind) {
  const normalized = String(kind || '').trim();
  if (!normalized) return 'تسوية';
  return REPORT_ADJUSTMENT_KIND_LABELS[normalized] || normalized;
}

// ============================================
// تصدير عالمي (Global Export)
// ============================================
if (typeof window !== 'undefined') {
  window.REPORT_PURPOSE_CODES = REPORT_PURPOSE_CODES;
  window.REPORT_PURPOSE_LABELS = REPORT_PURPOSE_LABELS;
  window.REPORT_PAYMENT_METHOD_CODES = REPORT_PAYMENT_METHOD_CODES;
  window.REPORT_PAYMENT_METHOD_LABELS = REPORT_PAYMENT_METHOD_LABELS;
  window.REPORT_CASH_ACCOUNT_CODES = REPORT_CASH_ACCOUNT_CODES;
  window.REPORT_CASH_ACCOUNT_LABELS = REPORT_CASH_ACCOUNT_LABELS;
  window.REPORT_ADJUSTMENT_KINDS = REPORT_ADJUSTMENT_KINDS;
  window.REPORT_ADJUSTMENT_KIND_LABELS = REPORT_ADJUSTMENT_KIND_LABELS;
  window.REPORT_TONES = REPORT_TONES;
  window.isValidPurposeCode = isValidPurposeCode;
  window.isValidPaymentMethod = isValidPaymentMethod;
  window.isValidCashAccount = isValidCashAccount;
  window.isValidAdjustmentKind = isValidAdjustmentKind;
  window.centsToCurrency = centsToCurrency;
  window.currencyToCents = currencyToCents;
  window.getReportPurposeLabel = getReportPurposeLabel;
  window.getReportPaymentMethodLabel = getReportPaymentMethodLabel;
  window.getReportCashAccountLabel = getReportCashAccountLabel;
  window.getReportAdjustmentKindLabel = getReportAdjustmentKindLabel;
}

console.log('[Reports Core] Types loaded');