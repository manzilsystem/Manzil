const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const reports = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports.js'), 'utf8');
const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function toCents(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function monthLabelToKey(month) {
    const [name, year] = String(month || '').trim().split(/\s+/);
    const index = monthNames.indexOf(name);
    return index < 0 || !/^\d{4}$/.test(year || '') ? null : `${year}-${String(index + 1).padStart(2, '0')}-01`;
}

function makeGetPaidAmountForMonth(state) {
    return (residentId, month) => {
        const paidCents = (state.income || []).reduce((sum, payment) => {
            if (payment.residentId !== residentId || payment.month !== month) return sum;
            const amount = Number(payment.amount);
            return sum + (Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0);
        }, 0);
        return paidCents / 100;
    };
}

function getSubscriptionAmountForMonth(state, resident, month) {
    if (!resident) return 0;
    const monthKey = monthLabelToKey(month);
    const rates = Array.isArray(resident.subscriptionRates) ? resident.subscriptionRates : [];
    if (!monthKey || !rates.length) return Number(resident.monthlyAmount ?? state.defaultSubscription) || 0;
    const applicable = rates
        .filter(rate => /^\d{4}-\d{2}-01$/.test(rate.effectiveMonth) && rate.effectiveMonth <= monthKey)
        .sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
    return applicable.length
        ? Math.max(0, Number(applicable[applicable.length - 1].monthlyAmount) || 0)
        : 0;
}

function loadStatement(options = {}) {
    const preview = { innerHTML: '', dataset: {} };
    const state = {
        buildingName: 'عمارة النور',
        residents: [{
            id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100,
            createdAt: '2024-01-01T00:00:00.000Z'
        }],
        income: [],
        ...options.state
    };
    const sandbox = {
        state,
        monthsNames: monthNames,
        getCurrentMonth: () => options.currentMonth || 'مارس 2024',
        monthLabelToKey,
        toCents,
        fmtNum: value => String(Number(value) || 0),
        fmtMoney: value => `${String(Number(value) || 0)} ج.م`,
        esc: value => String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character])),
        formatDate: () => '01/03/2024',
        getIncomePaymentMethodLabel: method => ({
            cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي'
        }[method] || 'غير محدد'),
        getPaidAmountForMonth: makeGetPaidAmountForMonth(state),
        getSubscriptionAmountForMonth: (resident, month) => getSubscriptionAmountForMonth(state, resident, month),
        requireManager: () => true,
        toast() {},
        setTimeout: () => {},
        Blob: class { constructor(parts, options) { sandbox.__blob = { parts, type: options && options.type }; } },
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }
    };
    const app = vm.runInNewContext(
        reports + '\n({\n            buildResidentStatement, generateResidentStatement, getResidentStatementSignature,\n            renderResidentStatementHtml, renderResidentStatementPdfHtml, renderUnitReportPdfHtml, exportResidentStatementCsv,\n            invalidateResidentStatementIfStale, getResidentStatementSnapshot\n        })',
        sandbox
    );
    const select = { value: options.residentId ?? 'r1' };
    const buttons = {};
    sandbox.document = {
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementById: id => {
            if (id === 'statementResidentSelect') return select;
            if (id === 'residentStatementPreview') return preview;
            if (['statementPrintBtn', 'statementPdfBtn', 'statementCsvBtn'].includes(id)) {
                buttons[id] = buttons[id] || { disabled: true };
                return buttons[id];
            }
            return null;
        },
        createElement: () => ({
            href: '',
            download: '',
            click() {
                sandbox.__download = { filename: this.download, content: String(sandbox.__blob.parts[0]) };
            }
        })
    };
    return { app, sandbox, preview, select, buttons };
}

test('statement bills every month from residency start to the current month', () => {
    const { app } = loadStatement();
    const statement = app.buildResidentStatement('r1');
    assert.equal(statement.months.map(row => row.month).join('|'), 'يناير 2024|فبراير 2024|مارس 2024');
    assert.equal(statement.totals.dueCents, 30000);
    assert.equal(statement.totals.paidCents, 0);
    assert.equal(statement.totals.remainingCents, 30000);
    assert.equal(statement.totals.arrearsMonths, 2);
    assert.equal(statement.rangeLabel, 'يناير 2024 – مارس 2024');
});

test('statement excludes months before the resident joined', () => {
    const { app } = loadStatement({
        state: {
            residents: [{
                id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100,
                createdAt: '2024-02-01T00:00:00.000Z'
            }],
            income: [{ id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' }]
        }
    });
    const statement = app.buildResidentStatement('r1');
    const january = statement.months.find(row => row.month === 'يناير 2024');
    assert.equal(january.dueCents, 0);
    assert.equal(statement.totals.dueCents, 20000);
    assert.equal(statement.totals.paidCents, 10000);
});

test('statement applies the subscription rate active in each month', () => {
    const { app } = loadStatement({
        state: {
            residents: [{
                id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100,
                createdAt: '2024-01-01T00:00:00.000Z',
                subscriptionRates: [
                    { effectiveMonth: '2024-01-01', monthlyAmount: 100 },
                    { effectiveMonth: '2024-03-01', monthlyAmount: 150 }
                ]
            }],
            income: []
        }
    });
    const statement = app.buildResidentStatement('r1');
    assert.equal(statement.months.map(row => row.dueCents).join('|'), '10000|10000|15000');
    assert.equal(statement.totals.dueCents, 35000);
});

test('statement status distinguishes paid, partial, and unpaid months', () => {
    const { app } = loadStatement({
        state: {
            income: [
                { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' },
                { id: 'i2', residentId: 'r1', month: 'فبراير 2024', amount: 40, paymentMethod: 'instapay' }
            ]
        }
    });
    const statement = app.buildResidentStatement('r1');
    assert.equal(statement.months.map(row => row.status.label).join('|'), 'مسدد|سداد جزئي|غير مسدد');
    assert.equal(statement.totals.paidCents, 14000);
    assert.equal(statement.totals.remainingCents, 16000);
});

test('statement totals use cents without floating point drift', () => {
    const { app } = loadStatement({
        state: {
            residents: [{ id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 0.3, createdAt: '2024-01-01T00:00:00.000Z' }],
            income: [
                { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 0.1, paymentMethod: 'cash' },
                { id: 'i2', residentId: 'r1', month: 'يناير 2024', amount: 0.2, paymentMethod: 'cash' }
            ]
        }
    });
    const statement = app.buildResidentStatement('r1');
    assert.equal(statement.totals.dueCents, 90);
    assert.equal(statement.totals.paidCents, 30);
    assert.equal(statement.totals.remainingCents, 60);
    const html = app.renderResidentStatementHtml(statement);
    assert.match(html, /0\.3 ج\.م/);
    assert.doesNotMatch(html, /0\.30000000000000004/);
});

test('statement includes advance payments recorded for future months', () => {
    const { app } = loadStatement({
        state: {
            income: [{ id: 'i1', residentId: 'r1', month: 'مايو 2024', amount: 100, paymentMethod: 'cash' }]
        }
    });
    const statement = app.buildResidentStatement('r1');
    assert.equal(statement.months[statement.months.length - 1].month, 'مايو 2024');
    const may = statement.months.find(row => row.month === 'مايو 2024');
    assert.equal(may.dueCents, 0);
    assert.equal(may.paidCents, 10000);
    assert.equal(may.status.label, 'مدفوع مقدماً');
    assert.equal(statement.totals.paidCents, 10000);
});

test('statement preview renders the monthly ledger and the payment ledger', () => {
    const { app, preview, sandbox } = loadStatement({
        state: {
            income: [
                { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash', date: '2024-01-05T00:00:00.000Z', notes: 'دفعة أولى' },
                { id: 'i2', residentId: 'r2', month: 'يناير 2024', amount: 50, paymentMethod: 'cash' }
            ],
            residents: [
                { id: 'r1', name: 'أحمد', apartmentNumber: '3', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z' },
                { id: 'r2', name: 'سارة', apartmentNumber: '7', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z' }
            ]
        }
    });
    app.generateResidentStatement();
    assert.match(preview.innerHTML, /كشف حساب ساكن/);
    assert.match(preview.innerHTML, /إجمالي المستحق/);
    assert.match(preview.innerHTML, /300 ج\.م/);
    assert.match(preview.innerHTML, /دفعة أولى/);
    assert.doesNotMatch(preview.innerHTML, /سارة/);
    assert.equal(sandbox.document.getElementById('statementCsvBtn').disabled, false);
});

test('statement signature changes when payments or the resident change', () => {
    const { app, sandbox } = loadStatement();
    const initial = app.getResidentStatementSignature('r1');
    sandbox.state.income.push({ id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' });
    const afterPayment = app.getResidentStatementSignature('r1');
    assert.notEqual(afterPayment, initial);
    sandbox.state.residents[0].monthlyAmount = 150;
    assert.notEqual(app.getResidentStatementSignature('r1'), afterPayment);
});

test('statement invalidates when its data becomes stale', () => {
    const { app, preview, sandbox } = loadStatement();
    app.generateResidentStatement();
    assert.match(preview.innerHTML, /كشف حساب ساكن/);
    sandbox.state.income.push({ id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' });
    app.invalidateResidentStatementIfStale();
    assert.match(preview.innerHTML, /تغيّرت البيانات/);
    assert.equal(sandbox.document.getElementById('statementPrintBtn').disabled, true);
    assert.equal(app.getResidentStatementSnapshot(), null);
});

test('statement CSV exports cents and a monthly-then-transactions layout', () => {
    const { app, sandbox } = loadStatement({
        state: {
            income: [{ id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash', date: '2024-01-05T00:00:00.000Z' }]
        }
    });
    app.generateResidentStatement();
    app.exportResidentStatementCsv();
    assert.equal(sandbox.__download.filename, 'manzil_statement_3_2024-03.csv');
    const csv = sandbox.__download.content;
    assert.match(csv, /"الشهر","المستحق","المدفوع","المتبقي","الحالة"/);
    assert.match(csv, /"يناير 2024","100","100","0","مسدد"/);
    assert.match(csv, /\r\n\r\n/);
    assert.match(csv, /"الحركات","الشهر","المبلغ","الغرض","طريقة الدفع","التاريخ","ملاحظات"/);
    assert.match(csv, /"تحصيل","يناير 2024","100","اشتراك شهري","نقدًا"/);
    assert.doesNotMatch(csv, /100\.00000000000001/);
});

test('statement PDF keeps the same figures as the preview', () => {
    const { app } = loadStatement({
        state: {
            income: [{ id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 40, paymentMethod: 'cash' }]
        }
    });
    const statement = app.buildResidentStatement('r1');
    const pdfHtml = app.renderResidentStatementPdfHtml(statement);
    assert.match(pdfHtml, /كشف حساب ساكن/);
    assert.match(pdfHtml, /300 ج\.م/);
    assert.match(pdfHtml, /40 ج\.م/);
    assert.match(pdfHtml, /260 ج\.م/);
    assert.match(pdfHtml, /نقدًا/);
});

test('statement builder uses the shared residents index instead of repeated scans', () => {
    assert.match(reports, /buildResidentIndex\(\)\.get\(String\(residentId \|\| ''\)\)/);
    assert.doesNotMatch(reports, /state\.residents\.find\(/);
});

test('unit report PDF combines unit identity, current month, and arrears', () => {
    const { app } = loadStatement({
        state: {
            residents: [{
                id: 'r1', name: 'أحمد', apartmentNumber: '3', floor: '2', phone: '01000000001',
                monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z'
            }],
            income: [{ id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 40, paymentMethod: 'cash' }]
        }
    });
    const statement = app.buildResidentStatement('r1');
    const html = app.renderUnitReportPdfHtml(statement);
    assert.match(html, /تقرير وحدة — شقة 3/);
    assert.match(html, /بيانات الوحدة/);
    assert.match(html, /01000000001/);
    assert.match(html, /قيمة الاشتراك الحالية/);
    assert.match(html, /مارس 2024: مستحق 100 ج\.م/);
    assert.match(html, /المتأخرات/);
    assert.match(html, /260 ج\.م/);
    assert.match(html, /سداد جزئي/);
});

test('unit report PDF states when the unit has no unpaid months', () => {
    const { app } = loadStatement({
        state: {
            income: [
                { id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100, paymentMethod: 'cash' },
                { id: 'i2', residentId: 'r1', month: 'فبراير 2024', amount: 100, paymentMethod: 'cash' },
                { id: 'i3', residentId: 'r1', month: 'مارس 2024', amount: 100, paymentMethod: 'cash' }
            ]
        }
    });
    const statement = app.buildResidentStatement('r1');
    const html = app.renderUnitReportPdfHtml(statement);
    assert.match(html, /لا توجد أشهر غير مسددة/);
    assert.match(html, /مارس 2024: مستحق 100 ج\.م • مدفوع 100 ج\.م • متبقٍ 0 ج\.م/);
});
