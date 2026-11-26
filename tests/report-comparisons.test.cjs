const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'UTC';

// بند ٢٧: توسيع مقارنة الفترات لتقارير المصروفات والتدفق النقدي وأداء الشقق.
// التحقق بحساب يدوي على بيانات بشكل حقيقي: الفترة الحالية يناير–فبراير 2024
// مقابل الفترة السابقة نوفمبر–ديسمبر 2023 ونفس الفترة من العام الماضي.
const stateSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');
const reportsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const comparisonSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'shared', 'comparison.js'), 'utf8');
const extendedSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-extended.js'), 'utf8');

function load(selectValues = {}) {
    const selects = {
        expensesReportComparison: { value: 'none' },
        cashFlowComparison: { value: 'none' },
        apartmentsReportComparison: { value: 'none' },
        ...selectValues
    };
    const sandbox = {
        Date,
        console,
        setTimeout: () => {},
        document: {
            getElementById: id => selects[id] || null,
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: () => {},
            createElement: () => ({ style: {}, classList: { add: () => {} }, setAttribute: () => {}, appendChild: () => {} }),
            body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
            head: { appendChild: () => {} },
            documentElement: { style: { setProperty: () => {} }, setAttribute: () => {}, dir: 'rtl', lang: 'ar' }
        },
        window: {},
        localStorage: { getItem: () => null, setItem: () => {} },
        sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        HTMLSelectElement: class HTMLSelectElement {},
        requireManager: () => true,
        CASH_ACCOUNTS: {
            main: { label: 'الخزنة الرئيسية' },
            development: { label: 'صندوق التطوير' },
            emergency: { label: 'صندوق الطوارئ' }
        },
        getCashAccountLabel: code => ({
            main: 'الخزنة الرئيسية', development: 'صندوق التطوير', emergency: 'صندوق الطوارئ'
        }[code || 'main']),
        getIncomePurposeLabel: code => ({
            subscription: 'اشتراك شهري', development: 'تطوير', emergency: 'طوارئ', settlement: 'تسوية', other: 'أخرى'
        }[code] || 'أخرى'),
        getIncomePaymentMethodLabel: method => ({ cash: 'نقدًا' }[method] || 'غير محدد'),
        formatApartmentLabel: value => `شقة ${String(value ?? '').trim()}`
    };
    const api = vm.runInNewContext(
        `${stateSource}\n${reportsSource}\n${comparisonSource}\n${extendedSource}\n({
            state,
            getComparisonRange, buildComparisonModel, buildReportComparisonHtml,
            buildExpensesReport, buildExpensesComparisonHtml, EXPENSES_COMPARISON_METRICS,
            buildCashFlowReport, buildCashFlowComparisonHtml, CASH_FLOW_COMPARISON_METRICS,
            buildApartmentPerformanceReport, buildApartmentsComparisonHtml, APARTMENTS_COMPARISON_METRICS,
            clearReportModelCache
        })`,
        sandbox,
        { filename: 'report-comparisons.js' }
    );
    return { api, selects };
}

function seedBuilding(state) {
    state.buildingName = 'عمارة النور';
    state.managerName = 'المدير';
    state.defaultSubscription = 0;
    state.residents = [
        { id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2023-11-01T00:00:00.000Z' }
    ];
    state.income = [
        { id: 'i1', residentId: 'r1', month: 'نوفمبر 2023', amount: 100, purposeCode: 'subscription', paymentMethod: 'cash', date: '2023-11-05' },
        { id: 'i2', residentId: 'r1', month: 'ديسمبر 2023', amount: 100, purposeCode: 'subscription', paymentMethod: 'cash', date: '2023-12-05' },
        { id: 'i3', residentId: 'r1', month: 'يناير 2024', amount: 100, purposeCode: 'subscription', paymentMethod: 'cash', date: '2024-01-05' },
        { id: 'i4', residentId: 'r1', month: 'فبراير 2024', amount: 50, purposeCode: 'subscription', paymentMethod: 'cash', date: '2024-02-05' }
    ];
    state.expenses = [
        { id: 'e1', month: 'نوفمبر 2023', title: 'مصعد', amount: 40, category: 'صيانة' },
        { id: 'e2', month: 'نوفمبر 2023', title: 'نظافة', amount: 60, category: 'مرافق' },
        { id: 'e3', month: 'ديسمبر 2023', title: 'كهرباء', amount: 100, category: 'مرافق' },
        { id: 'e4', month: 'يناير 2024', title: 'مياه', amount: 50, category: 'مرافق' },
        { id: 'e5', month: 'فبراير 2024', title: 'حراسة', amount: 25, category: 'تشغيل' },
        { id: 'e6', month: 'فبراير 2024', title: 'زي طليقة', amount: 25, category: 'تشغيل' }
    ];
    state.adjustments = [];
}

test('expenses comparison matches manual calculation for the previous period', () => {
    const { api } = load({ expensesReportComparison: { value: 'previous' } });
    seedBuilding(api.state);
    api.clearReportModelCache();

    const current = api.buildExpensesReport('يناير 2024', 'فبراير 2024');
    // حساب يدوي: الحالية ٥٠+٢٥+٢٥=١٠٠ (٣ حركات، شهران، متوسط ٥٠)
    assert.equal(current.totals.expenseCents, 10000);
    assert.equal(current.totals.count, 3);
    assert.equal(current.totals.monthCount, 2);
    assert.equal(current.totals.averageCents, 5000);

    const previous = api.buildExpensesReport('نوفمبر 2023', 'ديسمبر 2023');
    // السابقة ٤٠+٦٠+١٠٠=٢٠٠ (٣ حركات، شهران، متوسط ١٠٠)
    assert.equal(previous.totals.expenseCents, 20000);
    assert.equal(previous.totals.averageCents, 10000);

    const model = api.buildComparisonModel(current, previous, api.EXPENSES_COMPARISON_METRICS);
    const total = model.rows.find(row => row.key === 'expenseCents');
    // التغير: ١٠٠ - ٢٠٠ = -١٠٠ أي ‎-٥٠٪‎، والانخفاض في المصروفات تحسن (أخضر).
    assert.equal(total.delta, -10000);
    assert.equal(total.rate, -50);
    assert.equal(total.direction, 'down');
    assert.equal(total.className, 'report-change-positive');
    const count = model.rows.find(row => row.key === 'count');
    assert.equal(count.delta, 0);
    assert.equal(count.direction, 'flat');
    assert.equal(count.className, 'report-change-neutral');

    const html = api.buildExpensesComparisonHtml(current, '', '');
    assert.ok(html.includes('مقارنة الفترات'));
    assert.ok(html.includes('نوفمبر 2023 – ديسمبر 2023'));
    assert.ok(html.includes('إجمالي المصروفات'));
});

test('cashflow comparison matches manual calculation for the previous period', () => {
    const { api } = load({ cashFlowComparison: { value: 'previous' } });
    seedBuilding(api.state);
    api.clearReportModelCache();

    const current = api.buildCashFlowReport('يناير 2024', 'فبراير 2024');
    // حساب يدوي: تحصيل ١٠٠+٥٠=١٥٠، مصروفات ١٠٠، صافي ٥٠، حركات ٥
    assert.equal(current.totals.incomeCents, 15000);
    assert.equal(current.totals.expenseCents, 10000);
    assert.equal(current.totals.netCents, 5000);
    assert.equal(current.totals.count, 5);

    const previous = api.buildCashFlowReport('نوفمبر 2023', 'ديسمبر 2023');
    // السابقة: تحصيل ٢٠٠، مصروفات ٢٠٠، صافي ٠، حركات ٥
    assert.equal(previous.totals.incomeCents, 20000);
    assert.equal(previous.totals.expenseCents, 20000);
    assert.equal(previous.totals.netCents, 0);

    const model = api.buildComparisonModel(current, previous, api.CASH_FLOW_COMPARISON_METRICS);
    const income = model.rows.find(row => row.key === 'incomeCents');
    // التحصيل نزل من ٢٠٠ إلى ١٥٠: ‎-٢٥٪‎ تراجع (أحمر).
    assert.equal(income.delta, -5000);
    assert.equal(income.rate, -25);
    assert.equal(income.className, 'report-change-negative');
    const net = model.rows.find(row => row.key === 'netCents');
    // الصافي من صفر إلى ٥٠: previous=0 يعطي معدل ١٠٠٪ تحسن.
    assert.equal(net.delta, 5000);
    assert.equal(net.rate, 100);
    assert.equal(net.className, 'report-change-positive');
    const expense = model.rows.find(row => row.key === 'expenseCents');
    assert.equal(expense.delta, -10000);
    assert.equal(expense.className, 'report-change-positive');

    const html = api.buildCashFlowComparisonHtml(current);
    assert.ok(html.includes('مقارنة الفترات'));
    assert.ok(html.includes('الصافي'));
});

test('apartments comparison matches manual calculation for the previous period', () => {
    const { api } = load({ apartmentsReportComparison: { value: 'previous' } });
    seedBuilding(api.state);
    api.clearReportModelCache();

    const current = api.buildApartmentPerformanceReport('يناير 2024', 'فبراير 2024');
    // حساب يدوي: مستحق ٢٠٠، محصّل ١٥٠، متبقٍ ٥٠
    assert.equal(current.totals.dueCents, 20000);
    assert.equal(current.totals.paidCents, 15000);
    assert.equal(current.totals.remainingCents, 5000);

    const previous = api.buildApartmentPerformanceReport('نوفمبر 2023', 'ديسمبر 2023');
    // السابقة: مستحق ٢٠٠، محصّل ٢٠٠، متبقٍ صفر
    assert.equal(previous.totals.dueCents, 20000);
    assert.equal(previous.totals.paidCents, 20000);
    assert.equal(previous.totals.remainingCents, 0);

    const model = api.buildComparisonModel(current, previous, api.APARTMENTS_COMPARISON_METRICS);
    const remaining = model.rows.find(row => row.key === 'remainingCents');
    // المتبقي من صفر إلى ٥٠: سابق صفر يعطي معدل ١٠٠٪، والارتفاع في المتبقي تراجع (أحمر).
    assert.equal(remaining.delta, 5000);
    assert.equal(remaining.rate, 100);
    assert.equal(remaining.className, 'report-change-negative');

    const html = api.buildApartmentsComparisonHtml(current);
    assert.ok(html.includes('مقارنة الفترات'));
    assert.ok(html.includes('المتبقٍ'));
});

test('previous-year mode compares with the same months last year', () => {
    const { api } = load({ expensesReportComparison: { value: 'previous_year' } });
    seedBuilding(api.state);
    api.clearReportModelCache();

    const range = api.getComparisonRange('يناير 2024', 'فبراير 2024', 'previous_year');
    assert.equal(range.fromMonth, 'يناير 2023');
    assert.equal(range.toMonth, 'فبراير 2023');

    // لا بيانات في 2023: الفترة السابقة أصفار والمقارنة تُبنى بلا أخطاء.
    const current = api.buildExpensesReport('يناير 2024', 'فبراير 2024');
    const html = api.buildExpensesComparisonHtml(current, '', '');
    assert.ok(html.includes('مقارنة الفترات'));
    assert.ok(html.includes('يناير 2023 – فبراير 2023'));
});

test('comparison stays empty when mode is none or range cannot be built', () => {
    const { api } = load();
    seedBuilding(api.state);
    api.clearReportModelCache();

    const current = api.buildExpensesReport('يناير 2024', 'فبراير 2024');
    assert.equal(api.buildExpensesComparisonHtml(current, '', ''), '');

    const cash = api.buildCashFlowReport('يناير 2024', 'فبراير 2024');
    assert.equal(api.buildCashFlowComparisonHtml(cash), '');

    const apartments = api.buildApartmentPerformanceReport('يناير 2024', 'فبراير 2024');
    assert.equal(api.buildApartmentsComparisonHtml(apartments), '');
});

test('custom metrics render counts as numbers, not money', () => {
    const { api } = load();
    seedBuilding(api.state);
    api.clearReportModelCache();

    const current = api.buildExpensesReport('يناير 2024', 'فبراير 2024');
    const previous = api.buildExpensesReport('نوفمبر 2023', 'ديسمبر 2023');
    const model = api.buildComparisonModel(current, previous, [
        { key: 'count', label: 'عدد الحركات', lowerIsBetter: false },
        { key: 'monthCount', label: 'شهور بها مصروفات', lowerIsBetter: false }
    ]);
    assert.equal(model.rows.length, 2);
    model.rows.forEach(row => {
        // أعداد بلا كسور عشرية ولا عملة
        assert.ok(!row.currentText.includes('.'));
        assert.ok(!row.previousText.includes('.'));
    });
});
