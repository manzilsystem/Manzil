// Behavioral tests for the monthly close preview: money formatting, missing accounts, reconciliation flag.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule() {
    const sandbox = {
        state: { buildingName: 'عمارة الاختبار' },
        fmtNum: value => String(value),
        esc: value => String(value),
        renderReportHeader: (title, lines) => `<header>${title}|${lines.join('|')}</header>`,
        renderReportStatTiles: tiles => `<tiles>${tiles.map(t => `${t.label}=${t.text}`).join('|')}</tiles>`,
        renderSheetBlock: (title, head, rows, options) => `<sheet title="${title}">${rows.map(r => r.join(',')).join(';')}|foot=${options.foot.join(',')}</sheet>`,
        renderChartFoldContainer: (id, title, options) => `<chart hasData="${options.hasData}">${options.empty}</chart>`,
        renderReportNotes: notes => `<notes>${notes.join('')}</notes>`,
        document: { getElementById: () => null },
        REPORT_PDF_PALETTE: { sky: '#0ea5e9', emerald: '#10b981', rose: '#f43f5e', amber: '#f59e0b' },
        console, Number, JSON
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'monthly-close.js'), 'utf8'), sandbox);
    return code => vm.runInContext(code, sandbox);
}

const fixtureReport = {
    month: 'نوفمبر 2026',
    time_zone: 'Africa/Cairo',
    reconciled: true,
    totals: { opening_balance: 1000, income: 500, expenses: 200, transfers_in: 0, transfers_out: 0, net_movement: 300, closing_balance: 1300 },
    accounts: {
        main: { opening_balance: 700, income: 500, expenses: 200, transfers_in: 0, transfers_out: 0, net_movement: 300, closing_balance: 1000 },
        development: { opening_balance: 300, income: 0, expenses: 0, transfers_in: 0, transfers_out: 0, net_movement: 0, closing_balance: 300 }
    }
};

test('monthlyCloseMoney renders non-finite and missing values as zero, never NaN or undefined', () => {
    const run = loadModule();
    assert.equal(run('monthlyCloseMoney(undefined)'), '0');
    assert.equal(run('monthlyCloseMoney("abc")'), '0');
    assert.equal(run('monthlyCloseMoney(NaN)'), '0');
    assert.equal(run('monthlyCloseMoney(-250.5)'), '-250.5');
});

test('an account with no row in the report renders zero cells, not NaN or undefined', () => {
    const run = loadModule();
    const html = run(`renderMonthlyClosePreview(${JSON.stringify(fixtureReport)})`);
    assert.doesNotMatch(html, /NaN|undefined/, 'missing emergency account must not leak NaN/undefined into the sheet');
    assert.match(html, /صندوق الصيانة الطارئة,0 ج.م,/, 'the missing account still renders as a zero row');
    assert.match(html, /رصيد أول الشهر=1000 ج.م/);
    assert.match(html, /إجمالي رصيد الصناديق في نهاية الشهر: <strong class="report-amount">1300 ج.م/);
});

test('the reconciliation flag switches the status line between matching and review-needed', () => {
    const run = loadModule();
    const matched = run(`renderMonthlyClosePreview(${JSON.stringify(fixtureReport)})`);
    assert.match(matched, /✓ إجمالي الصناديق مطابق للحركة النقدية/);
    const off = run(`renderMonthlyClosePreview(${JSON.stringify({ ...fixtureReport, reconciled: false })})`);
    assert.match(off, /⚠ يوجد فرق في المطابقة/);
    assert.doesNotMatch(off, /✓ إجمالي الصناديق مطابق/);
});

test('the chart fold is empty when every fund closes at zero, and the top fund is the highest balance', () => {
    const run = loadModule();
    const zeroReport = { ...fixtureReport, totals: { ...fixtureReport.totals, closing_balance: 0 }, accounts: {} };
    const zeroChart = run(`getMonthlyCloseChart(${JSON.stringify(zeroReport)})`);
    assert.equal(zeroChart.hasData, false);
    assert.equal(zeroChart.summary.length, 0);
    const chart = run(`getMonthlyCloseChart(${JSON.stringify(fixtureReport)})`);
    assert.equal(chart.hasData, true);
    const top = chart.summary.find(row => row.label === 'أعلى صندوق');
    assert.equal(top.text, 'الخزنة الرئيسية');
    assert.equal(top.note, '1000 ج.م');
    const html = run(`renderMonthlyClosePreview(${JSON.stringify(zeroReport)})`);
    assert.match(html, /لا توجد أرصدة كافية لعرض الرسم/);
});
