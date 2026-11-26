const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const chartsSource = read('js/reports/shared/charts.js');
const comparisonSource = read('js/reports/shared/comparison.js');
const excelSource = read('js/reports/shared/excel-exporter.js');
const templatesSource = read('js/reports/shared/templates.js');
const reportsSource = read('js/reports.js');

// ---------------------------------------------------------------------------
// Comparison module
// ---------------------------------------------------------------------------

function loadComparison() {
  const sandbox = {
    window: {},
    fmtNum: n => String(n),
    fmtMoney: n => String(n),
    escapeHtml: s => String(s),
    monthLabelToKey: label => {
      const m = /(\d{4})/.exec(label);
      return m ? `${m[1]}-01-01` : '';
    },
    getStatementMonthLabel: key => String(key).slice(0, 4),
    getPeriodMonthSpan: () => 3,
    shiftStatementMonthKey: (key, offset) => {
      const year = Number(key.slice(0, 4)) + offset;
      return `${year}-01-01`;
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(comparisonSource, sandbox, { filename: 'comparison.js' });
  return sandbox;
}

test('comparison computes deltas, rates and directions', () => {
  const c = loadComparison();
  assert.equal(c.computeDelta(150, 100), 50);
  assert.equal(c.computeDelta(50, 100), -50);
  assert.equal(c.computeChangeRate(150, 100), 50);
  assert.equal(c.computeChangeRate(0, 0), null);
  assert.equal(c.computeChangeRate(10, 0), 100);
  assert.equal(c.getChangeDirection(5), 'up');
  assert.equal(c.getChangeDirection(-5), 'down');
  assert.equal(c.getChangeDirection(0), 'flat');
});

test('comparison indicator reverses tone when lower is better', () => {
  const c = loadComparison();
  const higher = c.formatChangeIndicator(150, 100, false);
  assert.equal(higher.direction, 'up');
  assert.equal(higher.className, 'report-change-positive');
  const lowerBetter = c.formatChangeIndicator(50, 100, true);
  assert.equal(lowerBetter.direction, 'down');
  assert.equal(lowerBetter.className, 'report-change-positive');
  const worse = c.formatChangeIndicator(150, 100, true);
  assert.equal(worse.className, 'report-change-negative');
});

test('comparison range resolves previous period and previous year', () => {
  const c = loadComparison();
  const prev = c.getComparisonRange('يناير 2024', 'مارس 2024', c.REPORT_COMPARISON_MODES.PREVIOUS_PERIOD);
  assert.ok(prev);
  assert.equal(prev.label, 'الفترة السابقة');
  const year = c.getComparisonRange('يناير 2024', 'مارس 2024', c.REPORT_COMPARISON_MODES.PREVIOUS_YEAR);
  assert.ok(year);
  assert.equal(year.label, 'نفس الفترة من العام الماضي');
});

test('comparison model and html render a table', () => {
  const c = loadComparison();
  const current = { rangeLabel: 'A', totals: { collectedCents: 15000, expenseCents: 5000 } };
  const previous = { rangeLabel: 'B', totals: { collectedCents: 10000, expenseCents: 8000 } };
  const model = c.buildComparisonModel(current, previous);
  assert.equal(model.rows.length, 2);
  const html = c.renderComparisonHtml(model);
  assert.match(html, /report-comparison-table/);
  assert.match(html, /مقارنة الفترات/);
});

// ---------------------------------------------------------------------------
// Charts module
// ---------------------------------------------------------------------------

function loadCharts() {
  const calls = [];
  const chartInstances = [];
  const sandbox = {
    window: {},
    console,
    document: { getElementById: id => ({ id, getContext: () => ({}) }) },
    Chart: function (ctx, config) {
      (sandbox.window.__chartCalls || calls).push(config);
      const chart = { destroy() {}, getChart() { return chart; } };
      chartInstances.push(chart);
      return chart;
    }
  };
  sandbox.Chart.getChart = () => null;
  sandbox.window = sandbox;
  sandbox.window.__chartCalls = calls;
  vm.runInNewContext(chartsSource, sandbox, { filename: 'charts.js' });
  return { sandbox, calls };
}

test('chart high-level builders produce datasets without inline color literals in reports.js', () => {
  // التحقق من وجود دوال الرسم عالية المستوى في charts.js
  assert.match(chartsSource, /function renderDoughnutValues/);
  assert.match(chartsSource, /function renderBarValues/);
  assert.match(chartsSource, /function renderLineSeries/);
  // التحقق من استخدام هذه الدوال في reports.js بدون ألوان مضمنة
  assert.match(reportsSource, /renderDoughnutValues\(/);
  assert.match(reportsSource, /renderLineSeries\(/);
  assert.match(reportsSource, /renderBarValues\(/);
  assert.doesNotMatch(reportsSource, /backgroundColor:\s*\[/);
  // التحقق من أن الألوان تأتي من REPORT_CHART_COLORS، لا Literals مباشرة
  assert.match(reportsSource, /REPORT_CHART_COLORS\.(emerald|rose|amber|sky|indigo|slate)/);
});

// ---------------------------------------------------------------------------
// Excel exporter module
// ---------------------------------------------------------------------------

function loadExcel(withXlsx) {
  const downloads = [];
  const sandbox = {
    window: {},
    console,
    XLSX: withXlsx ? {
      utils: {
        aoa_to_sheet: rows => ({ rows, '!ref': 'A1:A1' }),
        book_new: () => ({ SheetNames: [], Sheets: {} }),
        book_append_sheet: (wb, sheet, name) => { wb.SheetNames.push(name); wb.Sheets[name] = sheet; },
        decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 1, c: 1 } }),
        encode_range: () => 'A1:B2',
        encode_cell: ({ r, c }) => `R${r}C${c}`
      },
      write: () => new Uint8Array([80, 75, 3, 4]).buffer
    } : undefined,
    Blob: class { constructor(parts) { this.parts = parts; } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
    document: { createElement: () => ({ href: '', download: '', click: () => {} }) },
    setTimeout: () => 0,
    TextEncoder,
    TextDecoder,
    downloadCsv: (name, rows) => downloads.push({ name, rows }),
    toast: () => {}
  };
  sandbox.window = sandbox;
  vm.runInNewContext(excelSource, sandbox, { filename: 'excel-exporter.js' });
  return { sandbox, downloads };
}

test('excel exporter falls back to CSV when SheetJS is unavailable', () => {
  const { sandbox, downloads } = loadExcel(false);
  assert.equal(sandbox.isXlsxAvailable(), false);
  sandbox.exportReportExcel('report', [{ name: 'sheet', rows: [['a']] }]);
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].name, 'report.csv');
});

test('excel exporter builds multi-sheet workbooks when SheetJS is available', () => {
  const { sandbox } = loadExcel(true);
  assert.equal(sandbox.isXlsxAvailable(), true);
  const result = sandbox.exportReportWithDetailExcel('report', 'title', [['a']], [['b']], { key: 'value' });
  assert.equal(result, true);
});

// ---------------------------------------------------------------------------
// Templates module
// ---------------------------------------------------------------------------

function loadTemplates() {
  const store = {};
  const sandbox = {
    window: {},
    console,
    Date,
    Math,
    JSON,
    localStorage: {
      getItem: key => store[key] || null,
      setItem: (key, value) => { store[key] = value; }
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(templatesSource, sandbox, { filename: 'templates.js' });
  return sandbox;
}

test('templates support create, filter, apply and delete', () => {
  const t = loadTemplates();
  const template = t.addReportTemplate('قالب', 'period', { fromMonth: 'يناير 2024' });
  assert.ok(template);
  assert.equal(t.getTemplatesForReport('period').length, 1);
  assert.equal(t.getTemplatesForReport('landlord').length, 0);
  const applied = t.applyReportTemplate(template.id);
  assert.equal(applied.fromMonth, 'يناير 2024');
  assert.equal(t.deleteReportTemplate(template.id), true);
  assert.equal(t.loadReportTemplates().length, 0);
});

// ---------------------------------------------------------------------------
// Wiring checks
// ---------------------------------------------------------------------------

test('all enhancement modules are wired into the generated shell', () => {
  const shell = read('index.html');
  for (const module of ['charts.js', 'comparison.js', 'excel-exporter.js', 'templates.js']) {
    assert.match(shell, new RegExp(`js/reports/shared/${module}`), `${module} must load in index.html`);
  }
  assert.match(shell, /vendor\/chart\.umd\.js/);
  assert.doesNotMatch(shell, /<script[^>]+xlsx\.full\.min\.js/, 'SheetJS loads on demand, not with the shell');
  assert.match(excelSource, /script\.src = 'vendor\/xlsx\.full\.min\.js'/);
});

test('report UI exposes comparison, Excel and relocated template controls', () => {
  const partial = read('src/partials/main-tabs.html');
  assert.match(partial, /id="periodReportComparison"/);
  assert.match(partial, /id="periodReportExcelBtn"/);
  assert.doesNotMatch(partial, /scheduledReportsSection|scheduleFormContainer|openScheduleForm/);
  assert.doesNotMatch(partial, /id="periodReportTemplates"|id="templateNameInput"/);
  assert.match(reportsSource, /data-report-template-save/);
  assert.match(reportsSource, /REPORT_TEMPLATE_TABS/);
  assert.match(reportsSource, /function exportPeriodReportExcel\(\)/);
  assert.match(reportsSource, /function buildPeriodComparisonHtml\(/);
  assert.match(reportsSource, /function initReportTemplatesUI\(\)/);
  assert.doesNotMatch(reportsSource, /initScheduledReportsUI|openScheduleForm|saveNewSchedule/);
});

test('scheduled reports are gone from the shell and reports sources', () => {
  const shell = read('index.html');
  const partial = read('src/partials/main-tabs.html');
  assert.doesNotMatch(shell, /scheduled-reports\.js/);
  assert.doesNotMatch(shell, /loadScheduledReports|toggleScheduledReportsSection/);
  assert.doesNotMatch(partial, /reportScheduledCount|scheduledReportsBody|scheduleName/);
});
