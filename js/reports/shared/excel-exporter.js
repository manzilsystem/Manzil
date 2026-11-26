// @ts-check
/**
 * مصدّر Excel المتقدم - Manzil
 * يوفر تصدير تقارير متعددة الأوراق بتنسيق احترافي
 * يعتمد على مكتبة SheetJS (xlsx) إن وُجدت، وإلا يستخدم CSV كبديل
 *
 * ملاحظات التنفيذ:
 * - اتجاه الورقة من اليمين لليسار عبر Workbook.Views (تدعمه SheetJS).
 * - تجميد الصف الأول وإعدادات الطباعة (أفقي + احتواء العرض) لا تكتبها SheetJS،
 *   لذلك تُحقن في XML داخل ملف xlsx بعد توليده (patchXlsxArchive). عند أي فشل
 *   في الحقن يُستخدم الملف الأصلي كما هو، فلا يتعطل التصدير أبدًا.
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

let xlsxLoadPromise = null;

/**
 * تحميل مكتبة SheetJS عند أول طلب تصدير فقط، فلا تُحمَّل مع التطبيق.
 * @returns {Promise<boolean>} هل أصبحت المكتبة متاحة؟
 */
function loadXlsxLibrary() {
  if (isXlsxAvailable()) return Promise.resolve(true);
  if (typeof document === 'undefined' || !document.head || typeof document.createElement !== 'function') return Promise.resolve(false);
  if (!xlsxLoadPromise) {
    xlsxLoadPromise = new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'vendor/xlsx.full.min.js';
      script.onload = () => resolve(isXlsxAvailable());
      script.onerror = () => { xlsxLoadPromise = null; script.remove(); resolve(false); };
      document.head.appendChild(script);
    });
  }
  return xlsxLoadPromise;
}

// ============================================
// تنسيقات الخلايا وأنواع الأعمدة
// ============================================

const EXCEL_MONEY_FORMAT = '#,##0 "ج.م"';
const EXCEL_PERCENT_FORMAT = '0"%"';
const EXCEL_INTEGER_FORMAT = '#,##0';
const EXCEL_DATE_FORMAT = 'yyyy-mm-dd';

/** رؤوس أعمدة تحدد نوع العمود (تُستخدم أيضًا لاكتشاف صف العنوان). */
const EXCEL_MONEY_HEADERS = new Set([
  'المستحق', 'المحصّل', 'غير المحصّل', 'المتبقٍ', 'المصروف', 'المصروفات', 'الصافي',
  'التحصيل', 'تحصيل', 'مصروفات', 'المبلغ', 'المبلغ المستحق', 'إيرادات أخرى', 'متوسط التحصيل'
]);
const EXCEL_PERCENT_HEADERS = new Set(['نسبة التحصيل %', 'نسبة التحصيل']);
const EXCEL_INTEGER_HEADERS = new Set(['عدد الحركات', 'الحركات', 'أيام التأخر']);
const EXCEL_DATE_HEADERS = new Set(['آخر تحصيل']);
const EXCEL_APARTMENT_HEADERS = new Set(['الشقة']);
/** كلمات رؤوس غير رقمية تساعد على اكتشاف صف العنوان فقط. */
const EXCEL_TEXT_HEADERS = new Set([
  'الشهر', 'البيان', 'التصنيف', 'ملاحظات', 'اسم المالك', 'النوع', 'السبب', 'الشهر غير المسدد'
]);

/** تسميات العمود الأول في أوراق الملخص (بند/قيمة) ونوع قيمتها. */
const EXCEL_MONEY_LABELS = new Set([
  'المستحق', 'المحصّل', 'غير المحصّل', 'المصروف', 'المصروفات', 'الصافي',
  'إجمالي المصروف', 'متوسط الشهر', 'إجمالي المبلغ', 'إجمالي المتأخرات',
  'تحصيل الصندوق', 'تحصيل الغرض', 'إيرادات أخرى', 'التحصيل', 'متوسط التحصيل'
]);
const EXCEL_PERCENT_LABELS = new Set(['نسبة التحصيل %', 'نسبة التحصيل']);
const EXCEL_INTEGER_LABELS = new Set([
  'عدد الحركات', 'عدد البنود', 'عدد الشقق', 'عدد الشقق المتأخرة', 'عدد الأشهر المتأخرة'
]);
const EXCEL_DATE_LABELS = new Set(['تاريخ الإنشاء']);

/**
 * نوع العمود من عنوانه
 * @param {*} header
 * @returns {'money'|'percent'|'integer'|'date'|'apartment'|null}
 */
function excelColumnType(header) {
  const text = String(header == null ? '' : header).trim();
  if (!text) return null;
  if (EXCEL_MONEY_HEADERS.has(text)) return 'money';
  if (EXCEL_PERCENT_HEADERS.has(text)) return 'percent';
  if (EXCEL_INTEGER_HEADERS.has(text)) return 'integer';
  if (EXCEL_DATE_HEADERS.has(text)) return 'date';
  if (EXCEL_APARTMENT_HEADERS.has(text)) return 'apartment';
  return null;
}

/**
 * نوع قيمة صف بند/قيمة من تسميته
 * @param {*} label
 * @returns {'money'|'percent'|'integer'|'date'|null}
 */
function excelLabelType(label) {
  const text = String(label == null ? '' : label).trim();
  if (!text) return null;
  if (EXCEL_MONEY_LABELS.has(text)) return 'money';
  if (EXCEL_PERCENT_LABELS.has(text)) return 'percent';
  if (EXCEL_INTEGER_LABELS.has(text)) return 'integer';
  if (EXCEL_DATE_LABELS.has(text)) return 'date';
  return null;
}

/**
 * اكتشاف صف العنوان: أول صف فيه خليتان أو أكثر من كلمات الرؤوس المعروفة
 * @param {Array<Array>} rows
 * @returns {number} فهرس الصف أو -1
 */
function detectExcelHeaderRow(rows) {
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    let hits = 0;
    for (let c = 0; c < row.length; c += 1) {
      const text = String(row[c] == null ? '' : row[c]).trim();
      if (excelColumnType(text) || EXCEL_TEXT_HEADERS.has(text)) hits += 1;
    }
    if (hits >= 2) return r;
  }
  return -1;
}

/**
 * تحويل قيمة إلى رقم إن كانت رقمًا أو نصًا رقميًا (مع دعم اللاحقة %)
 * @param {*} value
 * @returns {*}
 */
function coerceExcelNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'string') {
    const text = value.trim().replace(/%$/, '').trim();
    if (text !== '' && /^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  }
  return value;
}

/**
 * تحويل قيمة إلى كائن Date إن كانت تاريخًا صالحًا
 * @param {*} value
 * @returns {*}
 */
function isExcelDateValue(value) {
  return Object.prototype.toString.call(value) === '[object Date]';
}

function coerceExcelDate(value) {
  if (isExcelDateValue(value)) return Number.isNaN(value.getTime()) ? '' : value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      const date = new Date(text);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return value;
}

/**
 * تنظيف الصفوف: إزالة undefined/null والقيم غير المنتهية (NaN/Infinity)
 * @param {Array<Array>} rows
 * @returns {Array<Array>}
 */
function sanitizeExcelRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => (Array.isArray(row) ? row : [row]).map(cell => {
    if (cell === undefined || cell === null) return '';
    if (typeof cell === 'number' && !Number.isFinite(cell)) return '';
    return cell;
  }));
}

/**
 * تطبيق نوع على خلية في الورقة
 * @param {Object} sheet
 * @param {number} r
 * @param {number} c
 * @param {string} type
 */
function applyExcelCellType(sheet, r, c, type) {
  const ref = XLSX.utils.encode_cell({ r, c });
  const cell = sheet[ref];
  if (!cell) return;
  if (type === 'date') {
    const date = coerceExcelDate(cell.v);
    if (isExcelDateValue(date)) {
      sheet[ref] = { t: 'd', v: date, z: EXCEL_DATE_FORMAT };
    }
    return;
  }
  if (type === 'apartment') {
    if (typeof cell.v === 'string' && /^\d+$/.test(cell.v.trim())) {
      cell.v = Number(cell.v.trim());
      cell.t = 'n';
      cell.z = EXCEL_INTEGER_FORMAT;
    }
    return;
  }
  const number = coerceExcelNumber(cell.v);
  if (typeof number === 'number') {
    cell.v = number;
    cell.t = 'n';
    cell.z = type === 'money' ? EXCEL_MONEY_FORMAT : type === 'percent' ? EXCEL_PERCENT_FORMAT : EXCEL_INTEGER_FORMAT;
  }
}

/**
 * تنسيق خلايا الورقة: أعمدة الجداول تحت صف العنوان، وصفوف بند/قيمة في الملخصات
 * @param {Object} sheet
 * @param {Array<Array>} rows
 * @param {number} headerRow
 */
function applyExcelTyping(sheet, rows, headerRow) {
  if (!sheet || !sheet['!ref']) return;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  /** @param {number} r */
  const applyLabel = r => {
    const labelCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!labelCell || typeof labelCell.v !== 'string') return;
    const type = excelLabelType(labelCell.v);
    if (type) applyExcelCellType(sheet, r, 1, type);
  };
  if (headerRow >= 0) {
    const types = (rows[headerRow] || []).map(excelColumnType);
    for (let r = headerRow + 1; r <= range.e.r; r += 1) {
      for (let c = 0; c < types.length; c += 1) {
        if (types[c]) applyExcelCellType(sheet, r, c, types[c]);
      }
    }
    for (let r = 0; r < headerRow; r += 1) applyLabel(r);
  } else {
    for (let r = 0; r <= range.e.r; r += 1) applyLabel(r);
  }
}

// ============================================
// أسماء الأوراق
// ============================================

/**
 * تنظيف اسم الورقة من الرموز الممنوعة في Excel وإزالة التكرار
 * @param {*} name
 * @param {Set<string>} [used]
 * @returns {string}
 */
function sanitizeSheetName(name, used = new Set()) {
  let base = String(name == null || name === '' ? 'Sheet' : name)
    .replace(/[\[\]\:\*\?\/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^'+|'+$/g, '');
  if (!base) base = 'Sheet';
  let candidate = base.slice(0, 31);
  let counter = 2;
  while (used.has(candidate)) {
    const suffix = ` (${counter})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
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
  return XLSX.utils.aoa_to_sheet(rows || [], { cellDates: true });
}

/**
 * إضافة أنماط للورقة (عرض أعمدة، فلاتر من صف العنوان)
 * @param {Object} sheet
 * @param {Object} [options]
 * @param {number} [headerRow]
 */
function styleWorksheet(sheet, options = {}, headerRow = -1) {
  if (!sheet || !isXlsxAvailable()) return;

  const columnWidths = options.columnWidths || [];
  if (columnWidths.length) {
    sheet['!cols'] = columnWidths.map(width => ({ wch: width }));
  }

  // نطاق الفلاتر يبدأ من صف العنوان حتى لا يبتلع العناوين العلوية
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  if (options.autoFilter && range.e.r > 0) {
    const from = headerRow >= 0 ? headerRow : 0;
    if (range.e.r > from) {
      sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: from, c: 0 }, e: range.e }) };
    }
  }
}

// ============================================
// حقن XML: تجميد الصف الأول وإعدادات الطباعة
// ============================================

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * حساب CRC32 (مطلوب لإعادة بناء حزمة zip بعد الحقن)
 * @param {Uint8Array} data
 * @returns {number}
 */
function crc32Bytes(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i += 1) crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * قراءة سجلات zip المحلية (الملفات مخزنة بدون ضغط: compression:false)
 * @param {Uint8Array} u8
 * @returns {Array<Object>}
 */
function readZipEntries(u8) {
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const entries = [];
  let offset = 0;
  while (offset + 30 <= u8.length && view.getUint32(offset, true) === 0x04034b50) {
    const version = view.getUint16(offset + 4, true);
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const modTime = view.getUint16(offset + 10, true);
    const modDate = view.getUint16(offset + 12, true);
    const crc = view.getUint32(offset + 14, true);
    const csize = view.getUint32(offset + 18, true);
    const usize = view.getUint32(offset + 22, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameBytes = u8.slice(offset + 30, offset + 30 + nameLen);
    const name = new TextDecoder('utf-8').decode(nameBytes);
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = u8.slice(dataStart, dataStart + csize);
    entries.push({ name, nameBytes, version, flags, method, modTime, modDate, crc, csize, usize, data });
    offset = dataStart + csize;
    if (flags & 0x08) {
      // واصف بيانات لاحق للمحتوى (لا تولّده SheetJS، احتياط فقط)
      offset += view.getUint32(offset, true) === 0x08074b50 ? 16 : 12;
    }
  }
  return entries;
}

/**
 * إعادة بناء حزمة zip من السجلات (مع إعادة حساب الإزاحات)
 * @param {Array<Object>} entries
 * @returns {Uint8Array}
 */
function buildZipArchive(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  entries.forEach(entry => {
    const flags = (entry.flags & ~0x08) | 0x800; // بدون واصف بيانات + أسماء UTF-8
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, entry.version || 20, true);
    header.setUint16(6, flags, true);
    header.setUint16(8, entry.method, true);
    header.setUint16(10, entry.modTime, true);
    header.setUint16(12, entry.modDate, true);
    header.setUint32(14, entry.crc >>> 0, true);
    header.setUint32(18, entry.csize, true);
    header.setUint32(22, entry.usize, true);
    header.setUint16(26, entry.nameBytes.length, true);
    header.setUint16(28, 0, true);
    chunks.push(new Uint8Array(header.buffer), entry.nameBytes, entry.data);
    central.push({ entry, flags, localOffset: offset });
    offset += 30 + entry.nameBytes.length + entry.data.length;
  });
  const centralStart = offset;
  central.forEach(({ entry, flags, localOffset }) => {
    const record = new DataView(new ArrayBuffer(46));
    record.setUint32(0, 0x02014b50, true);
    record.setUint16(4, 20, true);
    record.setUint16(6, entry.version || 20, true);
    record.setUint16(8, flags, true);
    record.setUint16(10, entry.method, true);
    record.setUint16(12, entry.modTime, true);
    record.setUint16(14, entry.modDate, true);
    record.setUint32(16, entry.crc >>> 0, true);
    record.setUint32(20, entry.csize, true);
    record.setUint32(24, entry.usize, true);
    record.setUint16(28, entry.nameBytes.length, true);
    record.setUint32(42, localOffset, true);
    chunks.push(new Uint8Array(record.buffer), entry.nameBytes);
    offset += 46 + entry.nameBytes.length;
  });
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, offset - centralStart, true);
  eocd.setUint32(16, centralStart, true);
  chunks.push(new Uint8Array(eocd.buffer));
  const out = new Uint8Array(offset + 22);
  let pos = 0;
  chunks.forEach(chunk => { out.set(chunk, pos); pos += chunk.length; });
  return out;
}

/**
 * حقن تجميد الصفوف وإعدادات الطباعة الأفقية في XML ورقة واحدة
 * @param {string} xml
 * @param {{freezeRows?: number, landscape?: boolean}} patch
 * @returns {string}
 */
function patchSheetXml(xml, patch) {
  let out = xml;
  if (patch.freezeRows && patch.freezeRows > 0) {
    const topLeft = `A${patch.freezeRows + 1}`;
    const pane = `<pane ySplit="${patch.freezeRows}" topLeftCell="${topLeft}" activePane="bottomLeft" state="frozen"/>` +
      `<selection pane="bottomLeft" activeCell="${topLeft}" sqref="${topLeft}"/>`;
    out = out.replace(/<sheetView ([^>]*)\/>/, (match, attrs) => `<sheetView ${attrs}>${pane}</sheetView>`);
  }
  if (patch.landscape) {
    if (/<sheetPr\/>/.test(out)) {
      out = out.replace('<sheetPr/>', '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    } else if (!/<sheetPr[ >]/.test(out)) {
      out = out.replace(/<worksheet([^>]*)>/, '<worksheet$1><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    }
    out = out.replace('</worksheet>',
      '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>');
  }
  return out;
}

/**
 * تعديل ملف xlsx المولّد: حقن إعدادات الأوراق التي لا تكتبها SheetJS.
 * عند أي خلل يعاد الملف الأصلي دون تغيير.
 * @param {ArrayBuffer|Uint8Array} bytes
 * @param {Array<{path: string, freezeRows?: number, landscape?: boolean}>} patches
 * @returns {Uint8Array}
 */
function patchXlsxArchive(bytes, patches) {
  const original = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    if (!Array.isArray(patches) || !patches.length) return original;
    const entries = readZipEntries(original);
    if (!entries.length || entries.some(entry => entry.method !== 0)) return original;
    const patchMap = new Map(patches.map(patch => [patch.path, patch]));
    let changed = false;
    entries.forEach(entry => {
      const patch = patchMap.get(entry.name);
      if (!patch) return;
      const xml = new TextDecoder('utf-8').decode(entry.data);
      const patched = patchSheetXml(xml, patch);
      if (patched === xml) return;
      changed = true;
      entry.data = new TextEncoder().encode(patched);
      entry.crc = crc32Bytes(entry.data);
      entry.csize = entry.data.length;
      entry.usize = entry.data.length;
    });
    return changed ? buildZipArchive(entries) : original;
  } catch (error) {
    console.warn('[Excel] تعذّر حقن إعدادات الورقة؛ سيُستخدم الملف الأصلي', error);
    return original;
  }
}

// ============================================
// تصدير مصنف كامل
// ============================================

/**
 * إضافة اسم معرّف لتكرار صفوف العنوان عند الطباعة (Print Titles)
 * @param {Object} workbook
 * @param {number} sheetIndex
 * @param {string} sheetName
 * @param {number} rowCount - عدد الصفوف المتكررة (1..rowCount)
 */
function addPrintTitles(workbook, sheetIndex, sheetName, rowCount) {
  workbook.Workbook = workbook.Workbook || {};
  workbook.Workbook.Names = workbook.Workbook.Names || [];
  const quoted = `'${String(sheetName).replace(/'/g, "''")}'`;
  workbook.Workbook.Names.push({ Name: '_xlnm.Print_Titles', Sheet: sheetIndex, Ref: `${quoted}!$1:$${rowCount}` });
}

/**
 * بناء مصنف Excel من أوراق متعددة مع الاتجاه RTL والتنسيقات
 * @param {Array<{name: string, rows: Array<Array>, options?: Object}>} sheets
 * @returns {{workbook: Object, patches: Array<Object>}|null}
 */
function buildExcelWorkbook(sheets) {
  if (!isXlsxAvailable()) return null;
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set();
  const patches = [];

  (sheets || []).forEach(sheetDef => {
    const rows = sanitizeExcelRows(sheetDef.rows);
    const sheet = rowsToSheet(rows);
    if (!sheet) return;
    const options = sheetDef.options || {};
    const headerRow = detectExcelHeaderRow(rows);
    applyExcelTyping(sheet, rows, headerRow);
    styleWorksheet(sheet, options, headerRow);
    const name = sanitizeSheetName(sheetDef.name, usedNames);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
    const sheetIndex = workbook.SheetNames.length - 1;
    const freezeRows = options.freezeHeader === false ? 0 : (headerRow >= 0 ? headerRow + 1 : 0);
    patches.push({ path: `xl/worksheets/sheet${sheetIndex + 1}.xml`, freezeRows, landscape: true });
    if (headerRow >= 0) addPrintTitles(workbook, sheetIndex, name, headerRow + 1);
  });

  // اتجاه من اليمين لليسار لكل الأوراق
  workbook.Workbook = workbook.Workbook || {};
  workbook.Workbook.Views = [{ RTL: true }];

  return { workbook, patches };
}

/**
 * توليد بايتات ملف xlsx النهائية (مع حقن التجميد والطباعة)
 * @param {{workbook: Object, patches: Array<Object>}} built
 * @returns {Uint8Array}
 */
function writeExcelBytes(built) {
  const bytes = XLSX.write(built.workbook, { type: 'array', bookType: 'xlsx', compression: false });
  return patchXlsxArchive(bytes, built.patches);
}

/**
 * تنزيل بايتات xlsx كملف
 * @param {string} filename - اسم الملف مع الامتداد
 * @param {Uint8Array} bytes
 */
function downloadXlsxBlob(filename, bytes) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * إنشاء مصنف Excel من أوراق متعددة
 * @param {string} filename - اسم الملف (بدون الامتداد)
 * @param {Array<{name: string, rows: Array<Array>, options?: Object}>} sheets - الأوراق
 * @returns {boolean} - هل نجح التصدير؟
 */
function exportReportExcel(filename, sheets) {
  if (!isXlsxAvailable() && typeof document !== 'undefined' && document.head && !exportReportExcel.retrying) {
    // أول تصدير: تحميل المكتبة ثم إعادة المحاولة. إن فشل التحميل نرجع إلى CSV.
    if (typeof toast === 'function') toast('جاري تجهيز ملف Excel...', 'info');
    loadXlsxLibrary().then(() => {
      exportReportExcel.retrying = true;
      try { exportReportExcel(filename, sheets); } finally { exportReportExcel.retrying = false; }
    });
    return true;
  }
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
    const built = buildExcelWorkbook(sheets);
    if (!built) return false;
    downloadXlsxBlob(`${filename}.xlsx`, writeExcelBytes(built));
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
 * @param {Object} [meta] - معلومات إضافية (فلاتر، تاريخ). القيمة من نوع Date تُكتب كخلية تاريخ حقيقية.
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
        ['إيرادات أخرى', (totals.otherIncomeCents || 0) / 100],
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
        ['الشهر', 'المستحق', 'المحصّل', 'غير المحصّل', 'نسبة التحصيل %', 'إيرادات أخرى', 'المصروف', 'الصافي'],
        ...report.months.map(m => [m.month, m.expectedCents / 100, m.collectedCents / 100,
          m.outstandingCents / 100, m.rate ?? '', (m.otherIncomeCents || 0) / 100, m.expenseCents / 100, m.netCents / 100])
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
  window.sanitizeSheetName = sanitizeSheetName;
  window.buildExcelWorkbook = buildExcelWorkbook;
  window.writeExcelBytes = writeExcelBytes;
  window.patchXlsxArchive = patchXlsxArchive;
  window.downloadXlsxBlob = downloadXlsxBlob;
  window.exportReportExcel = exportReportExcel;
  window.exportReportWithDetailExcel = exportReportWithDetailExcel;
  window.periodReportToExcelRows = periodReportToExcelRows;
  window.expensesReportToExcelRows = expensesReportToExcelRows;
  window.adjustmentsReportToExcelRows = adjustmentsReportToExcelRows;
  window.arrearsReportToExcelRows = arrearsReportToExcelRows;
}
