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
const scheduledSource = read('js/reports/shared/scheduled-reports.js');
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
        aoa_to_sheet: rows => ({ rows }),
        book_new: () => ({ sheets: [] }),
        book_append_sheet: (wb, sheet, name) => wb.sheets.push({ name, sheet }),
        decode_range: () => ({ e: { r: 1 } }),
        encode_range: () => 'A1:B2'
      },
      writeFile: () => {}
    } : undefined,
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
// Scheduled reports module
// ---------------------------------------------------------------------------

function loadScheduled() {
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
  vm.runInNewContext(scheduledSource, sandbox, { filename: 'scheduled-reports.js' });
  return sandbox;
}

test('scheduled reports validates and persists schedules', () => {
  const s = loadScheduled();
  assert.equal(s.createScheduledReport({ reportType: 'landlord', frequency: 'invalid' }), null);
  const schedule = s.addScheduledReport({ name: 'شهري', reportType: 'period', frequency: 'monthly', delivery: 'download', dayOfMonth: 31 });
  assert.ok(schedule);
  assert.equal(schedule.dayOfMonth, 28);
  assert.equal(schedule.frequency, 'monthly');
  assert.equal(s.loadScheduledReports().length, 1);
  assert.equal(s.toggleScheduledReport(schedule.id), true);
  assert.equal(s.loadScheduledReports()[0].enabled, false);
  assert.equal(s.deleteScheduledReport(schedule.id), true);
  assert.equal(s.loadScheduledReports().length, 0);
});

test('scheduled reports computes next run and records log', () => {
  const s = loadScheduled();
  const schedule = s.addScheduledReport({ name: 'يومي', reportType: 'landlord', frequency: 'daily' });
  assert.match(schedule.nextRunAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.ok(new Date(schedule.nextRunAt) > new Date());
  assert.equal(s.markScheduledReportRun(schedule.id), true);
  assert.equal(s.loadScheduleLog().length, 1);
  assert.ok(s.loadScheduledReports()[0].lastRunAt);
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
  for (const module of ['charts.js', 'comparison.js', 'excel-exporter.js', 'scheduled-reports.js', 'templates.js']) {
    assert.match(shell, new RegExp(`js/reports/shared/${module}`), `${module} must load in index.html`);
  }
  assert.match(shell, /vendor\/chart\.umd\.js/);
  assert.match(shell, /vendor\/xlsx\.full\.min\.js/);
});

test('report UI exposes comparison, Excel, schedule and template controls', () => {
  const partial = read('src/partials/main-tabs.html');
  assert.match(partial, /id="periodReportComparison"/);
  assert.match(partial, /id="periodReportExcelBtn"/);
  assert.match(partial, /id="scheduledReportsSection"/);
  assert.match(partial, /id="templateNameInput"/);
  assert.match(reportsSource, /function exportPeriodReportExcel\(\)/);
  assert.match(reportsSource, /function buildPeriodComparisonHtml\(/);
  assert.match(reportsSource, /function initScheduledReportsUI\(\)/);
});
