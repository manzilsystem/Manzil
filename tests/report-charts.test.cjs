const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const chartsSource = read('js/reports/shared/charts.js');
const reportsSource = read('js/reports.js');
const extendedSource = read('js/reports/extended/reports-extended.js');
const renderSource = read('js/render.js');
const monthlyCloseSource = read('js/monthly-close.js');
const css = read('css/style.css');
const packageJson = JSON.parse(read('package.json'));

function loadChartModule() {
    const sandbox = {
        console,
        window: { __chartCalls: [] },
        document: { getElementById: () => null },
        Chart: { getChart: () => null }
    };
    vm.createContext(sandbox);
    vm.runInContext(chartsSource, sandbox, { filename: 'js/reports/shared/charts.js' });
    return sandbox;
}

test('chart helpers reuse Chart.js and refuse empty numeric series', () => {
    const charts = loadChartModule();
    const palette = vm.runInContext('REPORT_CHART_PALETTE', charts);
    assert.equal(palette.length, 6);
    assert.deepEqual(Array.from(charts.reportChartPalette(8).slice(0, 6)), Array.from(palette));
    assert.equal(charts.reportChartPalette(8)[6], palette[0]);
    assert.equal(charts.hasReportChartData([]), false);
    assert.equal(charts.hasReportChartData([0, 0]), false);
    assert.equal(charts.hasReportChartData([0, 125]), true);
    assert.equal(typeof charts.destroyChartById, 'function');
    assert.match(packageJson.devDependencies['chart.js'], /^\^?\d/);
    assert.equal(packageJson.dependencies && packageJson.dependencies['chart.js'], undefined);
});

test('chart folds pair every visualization with numeric summaries and a real empty state', () => {
    assert.match(reportsSource, /function renderChartMetricStrip\(items\)/);
    assert.match(reportsSource, /class="report-chart-metrics"/);
    assert.match(reportsSource, /class="report-chart-empty"/);
    assert.match(css, /\.report-chart-metrics \{/);
    assert.match(css, /\.report-chart-empty \{/);

    const sources = [reportsSource, extendedSource, renderSource, monthlyCloseSource];
    sources.forEach(source => {
        assert.ok((source.match(/hasData:/g) || []).length > 0, 'each chart source must declare data presence');
        assert.ok((source.match(/empty:/g) || []).length > 0, 'each chart source must declare an empty message');
    });

    assert.match(reportsSource, /renderChartFold\('residentStatementChart'/);
    assert.match(renderSource, /renderChartFoldContainer\('arrearsChartContainer'/);
    assert.match(monthlyCloseSource, /renderChartFoldContainer\('monthlyCloseChartContainer'/);
});

test('old Chart.js instances are destroyed before preview replacement', () => {
    ['landlordReportChart', 'periodReportChart', 'expensesReportChart', 'adjustmentsReportChart', 'residentStatementChart']
        .forEach(id => assert.ok(reportsSource.includes(`reportPreviewDestroyChart('${id}')`), id));
    assert.match(extendedSource, /destroyChartsInContainer\('extendedCashFlowChartContainer'\)/);
    assert.match(extendedSource, /destroyChartsInContainer\('extendedApartmentsChartContainer'\)/);
    assert.match(monthlyCloseSource, /destroyMonthlyCloseChart\(\)/);
    assert.match(renderSource, /destroyArrearsChart\(\)/);
});

test('detailed tables remain the default report view', () => {
    const all = [reportsSource, extendedSource, renderSource, monthlyCloseSource].join('\n');
    assert.match(all, /renderSheetBlock\('التحصيل حسب الغرض'/);
    assert.match(all, /renderSheetBlock\('تفاصيل المصروفات'/);
    assert.match(all, /renderSheetBlock\('تفاصيل كل شقة'/);
    assert.match(all, /renderSheetBlock\('تفاصيل الأشهر غير المسددة'/);
    assert.match(all, /renderSheetBlock\('أرصدة الصناديق وحركتها'/);
    assert.doesNotMatch(reportsSource, /<details class="report-chart-fold" open/);
});
