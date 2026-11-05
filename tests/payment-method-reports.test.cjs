const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const reports = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const access = fs.readFileSync(path.join(__dirname, '..', 'js', 'access.js'), 'utf8');
const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function loadReport(overrides = {}) {
    const preview = { innerHTML: '' };
    const sandbox = {
        state: {
            buildingName: 'عمارة النور',
            residents: [{ id: 'r1', name: 'أحمد', apartmentNumber: '3' }],
            income: [
                { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' },
                { id: 'i2', residentId: 'r1', month: 'يناير 2024', amount: 250, paymentMethod: 'instapay' },
                { id: 'i3', residentId: 'r1', month: 'يناير 2024', amount: 50, paymentMethod: 'instapay' }
            ],
            expenses: [],
            ...overrides
        },
        document: {
            getElementById: id => id === 'reportMonthSelect'
                ? { value: 'يناير 2024' }
                : id === 'landlordReportPreview' ? preview : null
        },
        requireManager: () => true,
        toast() {},
        esc: value => String(value ?? ''),
        fmtNum: value => String(value),
        fmtMoney: value => `${value} ج.م`,
        toCents: value => {
            const amount = Number(value);
            return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
        },
        formatDate: () => '01/01/2024',
        monthLabelToKey: month => {
            const [name, year] = String(month || '').trim().split(/\s+/);
            const index = monthNames.indexOf(name);
            return index < 0 || !/^\d{4}$/.test(year || '') ? null : `${year}-${String(index + 1).padStart(2, '0')}-01`;
        },
        getSubscriptionAmountForMonth: (resident, month) => {
            if (!resident) return 0;
            const rates = Array.isArray(resident.subscriptionRates) ? resident.subscriptionRates : [];
            const key = sandbox.monthLabelToKey(month);
            const applicable = rates.filter(rate => rate.effectiveMonth <= key).sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
            if (applicable.length) return Math.max(0, Number(applicable[applicable.length - 1].monthlyAmount) || 0);
            return rates.length ? 0 : Number(resident.monthlyAmount ?? sandbox.state.defaultSubscription) || 0;
        },
        getMonthOutstanding: (resident, month) => {
            const due = sandbox.getSubscriptionAmountForMonth(resident, month);
            const paid = sandbox.state.income
                .filter(i => i.residentId === resident.id && i.month === month)
                .reduce((sum, i) => sum + (Number.isFinite(Number(i.amount)) ? Number(i.amount) : 0), 0);
            return Math.max(0, Math.round(due * 100) - Math.round(paid * 100)) / 100;
        },
        getIncomePaymentMethodLabel: method => ({
            cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay',
            bank_transfer: 'تحويل بنكي'
        })[method] || 'غير محدد'
    };
    const app = vm.runInNewContext(
        reports + String.fromCharCode(10) + '({ generateLandlordReport, getLandlordReportSignature })',
        sandbox
    );
    return { app, sandbox, preview };
}

function renderReport(overrides = {}) {
    const { app, preview } = loadReport(overrides);
    app.generateLandlordReport();
    return preview.innerHTML;
}

test('monthly report shows collection channel totals and each payment channel', () => {
    const html = renderReport();
    assert.match(html, /توزيع طرق الدفع/);
    assert.match(html, /نقدًا/);
    assert.match(html, /InstaPay/);
    assert.match(html, /100 ج\.م/);
    assert.match(html, /300 ج\.م/);
});

test('monthly report totals are aggregated in cents without float drift', () => {
    const html = renderReport({
        income: [
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 0.1, paymentMethod: 'cash' },
            { id: 'i2', residentId: 'r1', month: 'يناير 2024', amount: 0.2, paymentMethod: 'cash' }
        ],
        expenses: [{ title: 'كهرباء', month: 'يناير 2024', amount: 0.05 }]
    });

    assert.match(html, /0\.3 ج\.م/);
    assert.match(html, /0\.05 ج\.م/);
    assert.match(html, /0\.25 ج\.م/);
    assert.doesNotMatch(html, /0\.30000000000000004/);
});

test('monthly report compares expected, collected, and uncollected amounts', () => {
    const html = renderReport({
        residents: [
            { id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2023-01-01T00:00:00.000Z' },
            { id: 'r2', name: 'سارة', apartmentNumber: '7', monthlyAmount: 100, createdAt: '2023-01-01T00:00:00.000Z' }
        ],
        income: [
            { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' },
            { id: 'i2', residentId: 'r2', month: 'يناير 2024', amount: 40, paymentMethod: 'cash' }
        ]
    });

    assert.match(html, /المستحق/);
    assert.match(html, /200 ج\.م/);
    assert.match(html, /60 ج\.م/);
    assert.match(html, /70%/);
    assert.match(html, /غير المحصّل/);
});

test('expected dues exclude residents created after the report month', () => {
    const html = renderReport({
        residents: [
            { id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2023-01-01T00:00:00.000Z' },
            { id: 'r2', name: 'سارة', apartmentNumber: '7', monthlyAmount: 100, createdAt: '2024-03-01T00:00:00.000Z' }
        ],
        income: []
    });

    assert.match(html, /100 ج\.م/);
    assert.doesNotMatch(html, /200 ج\.م/);
});

test('monthly report groups expenses by category', () => {
    const html = renderReport({
        expenses: [
            { title: 'صيانة المصعد', category: 'صيانة', month: 'يناير 2024', amount: 0.1 },
            { title: 'صيانة السلم', category: 'صيانة', month: 'يناير 2024', amount: 0.2 },
            { title: 'كهرباء', category: 'مرافق', month: 'يناير 2024', amount: 5 }
        ]
    });

    assert.match(html, /تصنيفات المصروفات/);
    assert.match(html, /صيانة <span[^>]*>\(2\)/);
    assert.match(html, /0\.3 ج\.م/);
    assert.match(html, /5 ج\.م/);
});

test('resident and default subscription changes invalidate preview freshness', () => {
    const { app, sandbox } = loadReport({
        defaultSubscription: 100,
        residents: [{ id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2023-01-01T00:00:00.000Z' }]
    });
    const initial = app.getLandlordReportSignature('يناير 2024');

    sandbox.state.residents[0].monthlyAmount = 150;
    const afterResident = app.getLandlordReportSignature('يناير 2024');
    assert.notEqual(afterResident, initial);

    sandbox.state.defaultSubscription = 200;
    assert.notEqual(app.getLandlordReportSignature('يناير 2024'), afterResident);
});

test('monthly report resolves each payment to its resident through the index', () => {
    const html = renderReport({
        residents: [
            { id: 'r1', name: 'أحمد', apartmentNumber: '3' },
            { id: 'r2', name: 'سارة', apartmentNumber: '7' },
        ],
        income: [
            { id: 'i1', residentId: 'r2', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' },
            { id: 'i2', residentId: 'r1', month: 'يناير 2024', amount: 200, paymentMethod: 'cash' },
            { id: 'i3', residentId: 'missing', month: 'يناير 2024', amount: 50, paymentMethod: 'cash' }
        ]
    });

    assert.match(html, /سارة/);
    assert.match(html, /أحمد/);
    assert.match(html, /—/);
});

test('report lookups use a single residents index instead of repeated scans', () => {
    assert.equal((reports.match(/const residentsById = buildResidentIndex\(\)/g) || []).length, 2);
    assert.doesNotMatch(reports, /state\.residents\.find\(/);
});

test('CSV export includes a payment method column for collections', () => {
    assert.match(reports, /\['النوع','الوصف','الشقة','الشهر','المبلغ','طريقة الدفع','ملاحظات'\]/);
    assert.match(reports, /getIncomePaymentMethodLabel\(i\.paymentMethod\)/);
});

test('owner read-only payment history displays the recorded payment method', () => {
    assert.match(access, /getIncomePaymentMethodLabel\(payment\.paymentMethod\)/);
});
