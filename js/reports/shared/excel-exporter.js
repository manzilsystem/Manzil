// @ts-check
/**
 * مصدّر Excel المتقدم - Manzil
 * يوفر تصدير تقارير متعددة الأوراق بتنسيق احترافي
 * يعتمد على مكتبة SheetJS (xlsx) إن وُجدت، وإلا يستخدم CSV كبديل
 */

// ============================================
// فحص توفر المكتبة
// ============================================

/**
 * هل مكتبة XLSX متاحة؟
 * @returns {boolean}
 */
function isXlsxAvailable() {
  return typeof XLSX !== 'undefined' && XLSX && typeof XLSX.utils !== 'undefined';
}

// ============================================
// بناء أوراق العمل
// ============================================

/**
 * تحويل صفوف إلى ورقة عمل
 * @param {Array<Array>} rows
 * @returns {Object|null}
 */
function rowsToSheet(rows) {
  if (!isXlsxAvailable()) return null;
  return XLSX.utils.aoa_to_sheet(rows || []);
}

/**
 * إضافة أنماط للورقة (عناوين، عرض أعمدة)
 * @param {Object} sheet
 * @param {Object} [options]
 */
function styleWorksheet(sheet, options = {}) {
  if (!sheet || !isXlsxAvailable()) return;

  const columnWidths = options.columnWidths || [];
  if (columnWidths.length) {
    sheet['!cols'] = columnWidths.map(width => ({ wch: width }));
  }

  // تجميد الصف الأول إن طُلب
  if (options.freezeHeader) {
    sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  }

  // نطاق الفلاتر
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  if (options.autoFilter && range.e.r > 0) {
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
  }
}

// ============================================
// تصدير مصنف كامل
// ============================================

/**
 * إنشاء مصنف Excel من أوراق متعددة
 * @param {string} filename - اسم الملف (بدون الامتداد)
 * @param {Array<{name: string, rows: Array<Array>, options?: Object}>} sheets - الأوراق
 * @returns {boolean} - هل نجح التصدير؟
 */
function exportReportExcel(filename, sheets) {
  if (!isXlsxAvailable()) {
    console.warn('[Excel] XLSX library not available, falling back to CSV');
    if (sheets.length === 1) {
      downloadCsv(`${filename}.csv`, sheets[0].rows);
      return true;
    }
    // عدة أوراق: تصدير الورقة الأولى كـ CSV مع تنبيه
    downloadCsv(`${filename}.csv`, sheets[0].rows);
    if (typeof toast === 'function') toast('تم التصدير بصيغة CSV (مكتبة Excel غير متاحة)', 'info');
    return false;
  }

  try {
    const workbook = XLSX.utils.book_new();

    (sheets || []).forEach(sheetDef => {
      const sheet = rowsToSheet(sheetDef.rows);
      if (!sheet) return;
      styleWorksheet(sheet, sheetDef.options || {});
      // اسم الورقة (حد أقصى 31 حرفاً في Excel)
      const name = String(sheetDef.name || 'Sheet').slice(0, 31);
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    });

    XLSX.writeFile(workbook, `${filename}.xlsx`);
    if (typeof toast === 'function') toast('تم تصدير ملف Excel', 'success');
    return true;
  } catch (error) {
    console.error('[Excel] Export failed:', error);
    if (typeof toast === 'function') toast('تعذر تصدير Excel', 'error');
    return false;
  }
}

/**
 * تصدير تقرير إلى Excel مع ورقة ملخص وورقة تفاصيل
 * @param {string} filename
 * @param {string} title - عنوان التقرير
 * @param {Array<Array>} summaryRows - صفوف الملخص
 * @param {Array<Array>} detailRows - صفوف التفاصيل
 * @param {Object} [meta] - معلومات إضافية (فلاتر، تاريخ)
 * @returns {boolean}
 */
function exportReportWithDetailExcel(filename, title, summaryRows, detailRows, meta = {}) {
  // بناء ورقة الملخص مع العنوان والبيانات الوصفية
  const summarySheet = [
    [title],
    [],
    ...Object.entries(meta).map(([key, value]) => [key, value]),
    [],
    ...summaryRows
  ];

  const sheets = [
    {
      name: 'الملخص',
      rows: summarySheet,
      options: { columnWidths: [24, 18, 18], freezeHeader: false }
    },
    {
      name: 'التفاصيل',
      rows: detailRows,
      options: { columnWidths: [16, 24, 16, 16, 16, 30], autoFilter: true, freezeHeader: true }
    }
  ];

  return exportReportExcel(filename, sheets);
}

// ============================================
// دوال مساعدة لتحويل نماذج التقارير
// ============================================

/**
 * تحويل نموذج تقرير الفترة إلى صفوف Excel
 * @param {Object} report
 * @returns {{summary: Array, details: Array}}
 */
function periodReportToExcelRows(report) {
  const showDues = report.showDues !== false;
  const totals = report.totals || {};

  const summary = showDues
    ? [
        ['البند', 'القيمة'],
        ['الفترة', report.rangeLabel],
        ['المستحق', totals.expectedCents / 100],
        ['المحصّل', totals.collectedCents / 100],
        ['غير المحصّل', totals.outstandingCents / 100],
        ['نسبة التحصيل %', totals.rate ?? ''],
        ['المصروف', totals.expenseCents / 100],
        ['الصافي', totals.netCents / 100]
      ]
    : [
        ['البند', 'القيمة'],
        ['الفترة', report.rangeLabel],
        [report.cashAccountFilter ? 'تحصيل الصندوق' : 'تحصيل الغرض', totals.totalIncomeCents / 100],
        ['عدد الحركات', totals.movementCount],
        ['المصروف', totals.expenseCents / 100],
        ['الصافي', totals.netCents / 100]
      ];

  const details = showDues
    ? [
        ['الشهر', 'المستحق', 'المحصّل', 'غير المحصّل', 'نسبة التحصيل %', 'المصروف', 'الصافي'],
        ...report.months.map(m => [m.month, m.expectedCents / 100, m.collectedCents / 100,
          m.outstandingCents / 100, m.rate ?? '', m.expenseCents / 100, m.netCents / 100])
      ]
    : [
        ['الشهر', 'التحصيل', 'عدد الحركات', 'المصروف', 'الصافي'],
        ...report.months.map(m => [m.month, m.totalIncomeCents / 100, m.movementCount,
          m.expenseCents / 100, m.netCents / 100])
      ];

  return { summary, details };
}

/**
 * تحويل نموذج تقرير المصروفات إلى صفوف Excel
 * @param {Object} report
 * @returns {{summary: Array, details: Array}}
 */
function expensesReportToExcelRows(report) {
  const totals = report.totals || {};
  const summary = [
    ['البند', 'القيمة'],
    ['الفترة', report.rangeLabel],
    ['الصندوق', report.cashAccountLabel],
    ['التصنيف', report.categoryLabel],
    ['إجمالي المصروف', totals.expenseCents / 100],
    ['عدد الحركات', totals.count],
    ['متوسط الشهر', totals.averageCents / 100]
  ];

  const details = [
    ['الشهر', 'البيان', 'التصنيف', 'الصندوق', 'المبلغ', 'ملاحظات'],
    ...report.list.map(e => [e.month, e.title, getExpenseCategoryValue(e),
      getReportCashAccountLabel(e.cashAccountCode), toCents(e.amount) / 100, e.notes || ''])
  ];

  return { summary, details };
}

/**
 * تحويل نموذج تقرير الإعفاءات والتخفيضات إلى صفوف Excel
 * @param {Object} report
 * @returns {{summary: Array, details: Array}}
 */
function adjustmentsReportToExcelRows(report) {
  const totals = report.totals || {};
  const summary = [
    ['البند', 'القيمة'],
    ['الفترة', report.rangeLabel],
    ['الشقة', report.residentLabel],
    ['النوع', report.kindLabel],
    ['إجمالي المبلغ', (totals.amountCents || 0) / 100],
    ['عدد البنود', totals.count || 0],
    ['عدد الشقق', totals.residentCount || 0]
  ];

  const details = [
    ['الشقة', 'اسم المالك', 'الشهر', 'النوع', 'المبلغ', 'السبب'],
    ...(report.list || []).map(item => [item.apartmentNumber, item.residentName, item.month,
      item.kindLabel, (item.amountCents || 0) / 100, item.reason || ''])
  ];

  return { summary, details };
}

/**
 * تحويل نموذج تقرير المتأخرات إلى صفوف Excel
 * @param {Object} report نتيجة buildArrearsReport
 * @returns {{summary: Array, details: Array}}
 */
function arrearsReportToExcelRows(report) {
  const buckets = report.buckets || {};
  const summary = [
    ['البند', 'القيمة'],
    ['إجمالي المتأخرات', report.totalDebt || 0],
    ['عدد الشقق المتأخرة', report.overdueResidents || 0],
    ['عدد الأشهر المتأخرة', report.overdueMonths || 0],
    ...Object.keys(buckets).map(label => [label, buckets[label]])
  ];

  const details = [['الشقة', 'اسم المالك', 'التصنيف', 'الشهر غير المسدد', 'المبلغ المستحق', 'أيام التأخر']];
  (report.residents || []).forEach(item => (item.unpaidMonths || []).forEach(month => {
    details.push([item.resident.apartmentNumber, item.resident.name, item.bucket,
      month.month, month.amount, month.daysOverdue || 0]);
  }));

  return { summary, details };
}

// ============================================
// تصدير عالمي (Global Export)
// ============================================
if (typeof window !== 'undefined') {
  window.isXlsxAvailable = isXlsxAvailable;
  window.rowsToSheet = rowsToSheet;
  window.styleWorksheet = styleWorksheet;
  window.exportReportExcel = exportReportExcel;
  window.exportReportWithDetailExcel = exportReportWithDetailExcel;
  window.periodReportToExcelRows = periodReportToExcelRows;
  window.expensesReportToExcelRows = expensesReportToExcelRows;
  window.adjustmentsReportToExcelRows = adjustmentsReportToExcelRows;
  window.arrearsReportToExcelRows = arrearsReportToExcelRows;
}
