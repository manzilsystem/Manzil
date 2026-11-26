const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'UTC';

// توحيد الصافي والمحصل بين التقارير (بند ٤٥): نفس القواعد في تقرير الفترة،
// تقرير الملاك، تقرير أداء الشقق وسلوك السداد، على بيانات بشكل الإنتاج:
// دفعة مقسّمة (اشتراك ٣٤٠٠ + إيراد آخر ٣٤٠٠٠ = ٣٧٤٠٠)، حركة سالبة، وتسوية.
const stateSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');
const reportsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const extendedSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-extended.js'), 'utf8');
const insightsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'extended', 'reports-insights.js'), 'utf8');

function domStub() {
    return {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        createElement: () => ({ style: {}, classList: { add: () => {} }, setAttribute: () => {}, appendChild: () => {} }),
        body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
        head: { appendChild: () => {} },
        documentElement: { style: { setProperty: () => {} }, setAttribute: () => {}, dir: 'rtl', lang: 'ar' }
    };
}

function load() {
    const sandbox = {
        Date,
        console,
        setTimeout: () => {},
        document: domStub(),
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
        getIncomePaymentMethodLabel: method => ({ cash: 'نقدًا', wallet: 'محفظة إلكترونية' }[method] || 'غير محدد'),
        formatApartmentLabel: value => `شقة ${String(value ?? '').trim()}`
    };
    const api = vm.runInNewContext(
        `${stateSource}\n${reportsSource}\n${extendedSource}\n${insightsSource}\n({
            state, monthLabelToKey,
            buildPeriodReport, buildLandlordReportModel, normalizeServerPeriodReport,
            buildApartmentPerformanceReport, buildPayerBehaviorReport, clearReportModelCache
        })`,
        sandbox,
        { filename: 'net-collected-consistency.js' }
    );
    return { api, sandbox };
}

function seedProdShapedBuilding(state) {
    state.buildingName = 'عمارة النور';
    state.managerName = 'المدير';
    state.defaultSubscription = 0;
    state.subscriptionDueDay = 1;
    state.subscriptionGraceDays = 0;
    state.residents = [
        { id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z' },
        { id: 'r2', name: 'سارة', apartmentNumber: '5', monthlyAmount: 200, createdAt: '2024-01-01T00:00:00.000Z' }
    ];
    state.income = [
        { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, purposeCode: 'subscription', paymentMethod: 'cash', date: '2024-01-05' },
        { id: 'i2', residentId: 'r2', month: 'يناير 2024', amount: 100, purposeCode: 'subscription', paymentMethod: 'cash', date: '2024-01-06' },
        // الدفعة المقسّمة من فحص الجودة: اشتراك ٣٤٠٠ + إيراد آخر ٣٤٠٠٠ = ٣٧٤٠٠ إجمالي حركات.
        { id: 'i3', residentId: 'r1', month: 'فبراير 2024', amount: 3400, purposeCode: 'subscription', paymentMethod: 'cash', date: '2024-02-05' },
        { id: 'i4', residentId: 'r1', month: 'فبراير 2024', amount: 34000, purposeCode: 'other', paymentMethod: 'cash', date: '2024-02-05' },
        // تسوية فبراير للشقة ٥: ١٥٠ بدل ٢٠٠، مدفوعة كاملة بدفعة مرتبطة بالتسوية.
        { id: 'i5', residentId: 'r2', month: 'فبراير 2024', amount: 150, purposeCode: 'settlement', settlementAdjustmentId: 'adj1', paymentMethod: 'cash', date: '2024-02-03' },
        // حركة سالبة: لا تُحسب تحصيلًا في أي تقرير.
        { id: 'i6', residentId: 'r1', month: 'مارس 2024', amount: -50, purposeCode: 'subscription', paymentMethod: 'cash', date: '2024-03-02' }
    ];
    state.expenses = [
        { id: 'e1', month: 'فبراير 2024', title: 'كهرباء', amount: 20, category: 'مرافق' }
    ];
    state.adjustments = [
        { id: 'adj1', residentId: 'r2', kind: 'settlement', amount: 150, effectiveMonth: '2024-02-01', reason: 'اتفاق' }
    ];
}

test('split payment: every report reads collected as subscription-family only and keeps the 34,000 visible', () => {
    const { api } = load();
    seedProdShapedBuilding(api.state);
    api.clearReportModelCache();

    const period = api.buildPeriodReport('يناير 2024', 'مارس 2024');
    const feb = period.months.find(row => row.key === '2024-02-01');
    // ٣٧٥٥٠ إجمالي حركات فبراير؛ المحصّل ٣٥٥٠ (٣٤٠٠ اشتراك + ١٥٠ تسوية) وليس ٣٧٥٥٠.
    assert.equal(feb.totalIncomeCents, 3755000);
    assert.equal(feb.collectedCents, 355000);
    assert.equal(feb.otherIncomeCents, 3400000);
    assert.equal(feb.netCents, 3755000 - 2000);

    const landlord = api.buildLandlordReportModel('فبراير 2024');
    assert.equal(landlord.totalIncCents, feb.totalIncomeCents);
    assert.equal(landlord.subscriptionIncCents, feb.collectedCents);
    assert.equal(landlord.netCents, feb.netCents);

    const apartments = api.buildApartmentPerformanceReport('يناير 2024', 'مارس 2024');
    // مجموع «المحصّل» في تقرير الشقق يساوي مجموع المحصّل في تقرير الفترة.
    assert.equal(apartments.totals.paidCents, period.totals.collectedCents);
    // ومجموع «المتبقي» يساوي غير المحصّل في تقرير الفترة.
    assert.equal(apartments.totals.remainingCents, period.totals.outstandingCents);
    // الإيرادات الأخرى لكل شقة تطابق بند إيرادات أخرى في الفترة.
    const r1 = apartments.rows.find(row => row.resident.id === 'r1');
    const r2 = apartments.rows.find(row => row.resident.id === 'r2');
    assert.equal(r1.otherIncomeCents, 3395000);
    assert.equal(r2.otherIncomeCents, 0);
    assert.equal(r1.otherIncomeCents + r2.otherIncomeCents, period.totals.otherIncomeCents);
});

test('settlement month: paid and remaining agree across apartments, period and payer behavior', () => {
    const { api } = load();
    seedProdShapedBuilding(api.state);
    api.clearReportModelCache();

    const apartments = api.buildApartmentPerformanceReport('يناير 2024', 'مارس 2024');
    const r2 = apartments.rows.find(row => row.resident.id === 'r2');
    const feb = r2.months.find(row => row.key === '2024-02-01');
    // شهر التسوية: المستحق ١٥٠ والمحصّل ١٥٠ (دفعة التسوية) فيتبقى صفر.
    assert.equal(feb.dueCents, 15000);
    assert.equal(feb.paidCents, 15000);
    assert.equal(feb.remainingCents, 0);

    const period = api.buildPeriodReport('فبراير 2024', 'فبراير 2024');
    assert.equal(period.months[0].outstandingCents, 34000 * 0); // r1 سدد ٣٤٠٠ ≥ ١٠٠ وr2 سدد تسويته
    assert.equal(period.months[0].collectedCents, 355000);

    const behavior = api.buildPayerBehaviorReport('r2', new Date('2024-03-10T12:00:00.000Z'));
    const febRow = behavior.rows[0].months.find(row => row.key === '2024-02-01');
    // دفعة التسوية تحسب سدادًا: الشهر مسدد بالكامل، والتأخير يقاس من تاريخ الدفعة.
    assert.equal(febRow.paidCents, 15000);
    assert.equal(febRow.outstandingCents, 0);
    assert.equal(febRow.status, 'late');
    assert.equal(febRow.delayDays, 2);
});

test('negative payments never count as collected in period, landlord or apartments reports', () => {
    const { api } = load();
    seedProdShapedBuilding(api.state);
    api.clearReportModelCache();

    const period = api.buildPeriodReport('مارس 2024', 'مارس 2024');
    assert.equal(period.months[0].collectedCents, 0);
    assert.equal(period.months[0].negativePaymentCount, 1);
    assert.equal(period.months[0].totalIncomeCents, -5000);
    assert.equal(period.months[0].otherIncomeCents, -5000);

    const landlord = api.buildLandlordReportModel('مارس 2024');
    assert.equal(landlord.subscriptionIncCents, 0);
    assert.equal(landlord.negativePaymentCount, 1);
    assert.equal(landlord.totalIncCents, -5000);

    const apartments = api.buildApartmentPerformanceReport('مارس 2024', 'مارس 2024');
    const r1 = apartments.rows.find(row => row.resident.id === 'r1');
    assert.equal(r1.months[0].paidCents, 0);
    assert.equal(r1.months[0].remainingCents, 10000);
});

test('server period report drops server-side dues when the local filters hide dues', () => {
    const { api } = load();
    seedProdShapedBuilding(api.state);
    api.clearReportModelCache();

    const local = api.buildPeriodReport('يناير 2024', 'مارس 2024', '', 'main');
    assert.equal(local.showDues, false);
    const serverReport = {
        months: local.months.map(row => ({
            ...row,
            expectedCents: 9000,
            adjustmentCents: 500,
            outstandingCents: 4000,
            rate: 55
        })),
        methods: [],
        purposes: [],
        generatedAt: '2024-04-01T00:00:00.000Z'
    };
    const normalized = api.normalizeServerPeriodReport(serverReport, local);
    assert.ok(normalized);
    assert.equal(normalized.months.every(row => row.expectedCents === 0
        && row.adjustmentCents === 0
        && row.outstandingCents === 0
        && row.rate === null), true);
    assert.equal(normalized.totals.expectedCents, 0);
    assert.equal(normalized.totals.outstandingCents, 0);
    assert.equal(normalized.totals.rate, null);
});

test('server period report keeps dues when dues are shown', () => {
    const { api } = load();
    seedProdShapedBuilding(api.state);
    api.clearReportModelCache();

    const local = api.buildPeriodReport('يناير 2024', 'مارس 2024');
    assert.equal(local.showDues, true);
    const serverReport = {
        months: local.months.map(row => ({ ...row })),
        methods: [],
        purposes: [],
        generatedAt: '2024-04-01T00:00:00.000Z'
    };
    const normalized = api.normalizeServerPeriodReport(serverReport, local);
    assert.ok(normalized);
    assert.equal(normalized.totals.expectedCents, local.totals.expectedCents);
    assert.equal(normalized.totals.outstandingCents, local.totals.outstandingCents);
    assert.equal(normalized.dataSource, 'database');
});
