const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const crudSource = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');
const noticesSource = fs.readFileSync(path.join(root, 'js', 'notices.js'), 'utf8');
const accessSource = fs.readFileSync(path.join(root, 'js', 'access.js'), 'utf8');

function makeElement(initial = {}) {
    return {
        value: '', innerHTML: '', textContent: '', disabled: false,
        options: [], style: {},
        classList: { add() {}, remove() {} },
        setAttribute() {},
        reset() {},
        ...initial
    };
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function lineElement({ purpose = 'services', amount = '50', cashAccountCode = 'main' } = {}) {
    const fields = {
        '.income-line-purpose': makeElement({ value: purpose }),
        '.income-line-amount': makeElement({ value: amount }),
        '.income-line-cash-account': makeElement({ value: cashAccountCode }),
        '.income-line-hint': makeElement()
    };
    return {
        fields,
        querySelector: selector => fields[selector] || null
    };
}

function createCrudHarness({ income = [], extraLines = [], elements = {} } = {}) {
    const messages = [];
    const calls = { save: 0, actions: [], allocations: 0, nextId: 1 };
    const state = {
        residents: [{ id: 'r1', name: 'Resident', apartmentNumber: '1', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z' }],
        income: structuredClone(income),
        expenses: [], notices: [], auditLogs: [], paymentAllocationPolicy: 'oldest_first'
    };
    const defaults = {
        incomeForm: makeElement(),
        incomeResident: makeElement({ value: 'r1' }),
        incomeAmount: makeElement({ value: '100' }),
        incomeMonth: makeElement({ value: 'يناير 2024', options: [{ value: 'يناير 2024' }] }),
        incomeMonthLabel: makeElement(),
        incomePaymentMethod: makeElement({ value: 'cash' }),
        incomeCashAccount: makeElement({ value: 'main' }),
        incomePurpose: makeElement({ value: 'subscription' }),
        incomePurposeCashHint: makeElement(),
        incomeNotes: makeElement({ value: '' }),
        incomeAllocationPolicyHelp: makeElement(),
        incomeOutstandingHint: makeElement(),
        incomeAllocationPreview: makeElement(),
        incomeAllocationSummary: makeElement(),
        incomeAllocationRows: makeElement(),
        incomeSubmitButton: makeElement(),
        incomeMixedTotal: makeElement(),
        incomeExtraLines: { innerHTML: '', querySelectorAll: () => extraLines },
        incomeEditResidentSummary: makeElement(),
        incomeEditMonth: makeElement({ value: 'يناير 2024' }),
        incomeEditAmount: makeElement({ value: '50' }),
        incomeEditPaymentMethod: makeElement({ value: 'cash' }),
        incomeEditCashAccount: makeElement({ value: 'main' }),
        incomeEditPurpose: makeElement({ value: 'services' }),
        incomeEditPurposeHint: makeElement(),
        incomeEditNotes: makeElement({ value: '' }),
        incomeEditSubmitButton: makeElement()
    };
    const registry = { ...defaults, ...elements };
    const sandbox = {
        state,
        console,
        requireManager: () => true,
        getActiveBuildingMonths: () => ['يناير 2024', 'فبراير 2024'],
        getCurrentMonth: () => 'يناير 2024',
        getLocalMonthKey: () => '2024-01',
        getMonthOutstanding: () => 100,
        calculateCumulativeDebt: () => ({ totalDebt: 0, count: 0 }),
        getSubscriptionAmountForMonth: () => 100,
        monthLabelToKey: month => ({ 'يناير 2024': '2024-01-01', 'فبراير 2024': '2024-02-01' })[month] || null,
        calculateIncomeAllocationPreview: (residentId, amount, month) => {
            calls.allocations += 1;
            return { invalid: false, allocations: [{ month, amount: Number(amount) }], totalAllocated: Number(amount), remainingCents: 0, remainingAmount: 0 };
        },
        cloneStateSnapshot: () => JSON.parse(JSON.stringify(state)),
        saveWithRollback: async () => { calls.save += 1; return true; },
        generateId: () => 'income-' + (calls.nextId++),
        logAction: (...args) => calls.actions.push(args),
        openModal() {},
        closeModal() {},
        renderAll() {},
        toast: (...args) => messages.push(args),
        fmtNum: value => String(Number(value) || 0),
        esc: value => String(value ?? ''),
        document: {
            getElementById: id => id === 'toastContainer'
                ? { appendChild: element => messages.push([element?.textContent || '']) }
                : (registry[id] || null),
            createElement: () => makeElement()
        },
        setTimeout: () => 0,
        INCOME_PAYMENT_METHOD_LABELS: { cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي' },
        getIncomePaymentMethodLabel: method => ({ cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي' })[method] || 'غير محدد',
        getCashAccountLabel: code => ({ main: 'الخزنة الرئيسية', development: 'صندوق التطوير', emergency: 'صندوق الصيانة الطارئة' })[code] || 'الخزنة الرئيسية',
        populateIncomePurposeOptions: (select, purpose) => { select.value = purpose || 'subscription'; },
        populatePaymentMethodOptions: select => select
    };
    const api = vm.runInNewContext(
        `${crudSource}\n({
            handleIncomeSubmit, openIncomeEditModal, handleIncomeEditSubmit, previewIncomeAllocation,
            buildIncomePaymentRows, validateIncomeExtraLines, getIncomeBatchReference,
            getIncomeBatchPayments, isMixedIncomeBatch
        })`,
        sandbox,
        { filename: 'js/crud.js' }
    );
    return { api, state, elements: registry, messages, calls };
}

test('a mixed payment builds one batch with a subscription split plus independent items', () => {
    const harness = createCrudHarness();
    const rows = harness.api.buildIncomePaymentRows({
        residentId: 'r1',
        amount: 100,
        month: 'يناير 2024',
        notes: 'ملاحظة',
        paymentMethod: 'cash',
        purpose: 'subscription',
        cashAccountCode: 'main',
        isSubscription: true,
        allocation: { allocations: [{ month: 'يناير 2024', amount: 100 }] },
        extraLines: [
            { purpose: 'services', amount: 50, cashAccountCode: 'main' },
            { purpose: 'development', amount: 75, cashAccountCode: 'development' }
        ],
        paidAt: '2024-01-15T10:00:00.000Z',
        paymentReference: 'ABCDEF123456'
    });

    assert.equal(rows.length, 3);
    assert.deepEqual(plain(rows.map(row => row.purposeCode)), ['subscription', 'services', 'development']);
    assert.deepEqual(plain(rows.map(row => row.cashAccountCode)), ['main', 'main', 'development']);
    assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 225);
    assert.deepEqual(plain(rows.map(row => row.month)), ['يناير 2024', 'يناير 2024', 'يناير 2024']);
    assert.deepEqual(
        plain(rows.map(row => row.notes.match(/^دفعة موزعة ABCDEF123456 \((\d+)\/3\) · ملاحظة$/)?.[1])),
        ['1', '2', '3']
    );
});

test('a non-subscription item paid alone keeps its plain note, while extras create a batch', () => {
    const harness = createCrudHarness();
    const single = harness.api.buildIncomePaymentRows({
        residentId: 'r1', amount: 50, month: 'يناير 2024', notes: 'نظافة',
        paymentMethod: 'cash', purpose: 'services', cashAccountCode: 'main',
        isSubscription: false, allocation: null, extraLines: [],
        paidAt: '2024-01-15T10:00:00.000Z', paymentReference: 'ABCDEF123456'
    });
    assert.equal(single.length, 1);
    assert.equal(single[0].notes, 'نظافة');

    const mixed = harness.api.buildIncomePaymentRows({
        residentId: 'r1', amount: 50, month: 'يناير 2024', notes: 'نظافة',
        paymentMethod: 'cash', purpose: 'services', cashAccountCode: 'main',
        isSubscription: false, allocation: null,
        extraLines: [{ purpose: 'donation', amount: 25, cashAccountCode: 'main' }],
        paidAt: '2024-01-15T10:00:00.000Z', paymentReference: 'ABCDEF123456'
    });
    assert.equal(mixed.length, 2);
    assert.equal(mixed[0].notes, 'دفعة موزعة ABCDEF123456 (1/2) · نظافة');
    assert.equal(mixed[1].notes, 'دفعة موزعة ABCDEF123456 (2/2) · نظافة');
    assert.deepEqual(plain(mixed.map(row => row.purposeCode)), ['services', 'donation']);
});

test('extra lines reject subscription, zero amounts and misrouted funds', () => {
    const harness = createCrudHarness();
    assert.equal(harness.api.validateIncomeExtraLines([]).valid, true);
    assert.match(
        harness.api.validateIncomeExtraLines([{ purpose: 'subscription', amount: 10, cashAccountCode: 'main' }]).message,
        /الاشتراك/
    );
    assert.match(
        harness.api.validateIncomeExtraLines([{ purpose: 'services', amount: 0, cashAccountCode: 'main' }]).message,
        /أكبر من صفر/
    );
    assert.match(
        harness.api.validateIncomeExtraLines([{ purpose: 'development', amount: 10, cashAccountCode: 'main' }]).message,
        /صندوقه الخاص/
    );
    const valid = harness.api.validateIncomeExtraLines([
        { purpose: 'services', amount: 12.5, cashAccountCode: 'main' },
        { purpose: 'emergency', amount: 7.5, cashAccountCode: 'emergency' }
    ]);
    assert.equal(valid.valid, true);
    assert.equal(valid.totalCents, 2000);
});

test('submitting a mixed payment saves every item under one shared reference', async () => {
    const harness = createCrudHarness({
        extraLines: [
            lineElement({ purpose: 'services', amount: '50', cashAccountCode: 'main' }),
            lineElement({ purpose: 'development', amount: '75', cashAccountCode: 'development' })
        ]
    });

    await harness.api.handleIncomeSubmit({ preventDefault() {} });

    assert.equal(harness.calls.save, 1);
    assert.equal(harness.state.income.length, 3);
    assert.deepEqual(harness.state.income.map(row => row.purposeCode), ['subscription', 'services', 'development']);
    assert.deepEqual(harness.state.income.map(row => row.cashAccountCode), ['main', 'main', 'development']);
    assert.equal(harness.state.income.reduce((sum, row) => sum + row.amount, 0), 225);
    const references = new Set(harness.state.income.map(row => row.notes.match(/^دفعة موزعة ([A-Z0-9]+) \(/)?.[1]));
    assert.equal(references.size, 1);
    assert.equal(harness.state.income.every(row => /\((\d+)\/3\)$/.test(row.notes.split(' · ')[0])), true);
    assert.equal(harness.calls.actions[0][0], 'تحصيل مختلط');
    assert.match(harness.calls.actions[0][1], /225/);
    assert.match(harness.messages.at(-1)[0], /دفعة مختلطة من 3 بندًا/);
});

test('submitting with an invalid extra line saves nothing', async () => {
    const harness = createCrudHarness({
        extraLines: [lineElement({ purpose: 'services', amount: '0', cashAccountCode: 'main' })]
    });

    await harness.api.handleIncomeSubmit({ preventDefault() {} });

    assert.equal(harness.calls.save, 0);
    assert.equal(harness.state.income.length, 0);
    assert.match(harness.messages.at(-1)[0], /أكبر من صفر/);
});

test('a mixed batch locks purpose and cashbox but still allows editing its amount', async () => {
    const date = '2024-01-15T10:00:00.000Z';
    const harness = createCrudHarness({
        income: [
            {
                id: 'i1', residentId: 'r1', amount: 100, month: 'يناير 2024',
                notes: 'دفعة موزعة AB12CD34 (1/2)', paymentMethod: 'cash',
                cashAccountCode: 'main', purposeCode: 'subscription', date
            },
            {
                id: 'i2', residentId: 'r1', amount: 50, month: 'يناير 2024',
                notes: 'دفعة موزعة AB12CD34 (2/2)', paymentMethod: 'cash',
                cashAccountCode: 'main', purposeCode: 'services', date
            }
        ]
    });

    harness.api.openIncomeEditModal('i2');
    assert.equal(harness.elements.incomeEditPurpose.disabled, true);
    assert.equal(harness.elements.incomeEditCashAccount.disabled, true);
    assert.match(harness.elements.incomeEditPurposeHint.textContent, /دفعة مختلطة/);
    assert.equal(harness.api.isMixedIncomeBatch(harness.state.income[1]), true);

    harness.elements.incomeEditAmount.value = '60';
    harness.elements.incomeEditPaymentMethod.value = 'instapay';
    await harness.api.handleIncomeEditSubmit({ preventDefault() {} });

    assert.equal(harness.calls.save, 1);
    assert.equal(harness.state.income[1].amount, 60);
    assert.equal(harness.state.income[1].purposeCode, 'services');
    assert.equal(harness.state.income[0].purposeCode, 'subscription');
    assert.equal(harness.state.income[0].cashAccountCode, 'main');
    assert.equal(harness.state.income[0].paymentMethod, 'instapay');
});

test('a mixed batch rejects a tampered purpose or cashbox', async () => {
    const date = '2024-01-15T10:00:00.000Z';
    const harness = createCrudHarness({
        income: [
            {
                id: 'i1', residentId: 'r1', amount: 100, month: 'يناير 2024',
                notes: 'دفعة موزعة AB12CD34 (1/2)', paymentMethod: 'cash',
                cashAccountCode: 'main', purposeCode: 'subscription', date
            },
            {
                id: 'i2', residentId: 'r1', amount: 50, month: 'يناير 2024',
                notes: 'دفعة موزعة AB12CD34 (2/2)', paymentMethod: 'cash',
                cashAccountCode: 'main', purposeCode: 'services', date
            }
        ]
    });

    harness.api.openIncomeEditModal('i2');
    harness.elements.incomeEditPurpose.value = 'other';
    await harness.api.handleIncomeEditSubmit({ preventDefault() {} });
    assert.equal(harness.calls.save, 0);
    assert.match(harness.messages.at(-1)[0], /دفعة مختلطة/);

    harness.elements.incomeEditPurpose.value = 'services';
    harness.elements.incomeEditCashAccount.value = 'emergency';
    await harness.api.handleIncomeEditSubmit({ preventDefault() {} });
    assert.equal(harness.calls.save, 0);
    assert.match(harness.messages.at(-1)[0], /صندوق بند/);
});

test('WhatsApp receipts list every mixed item with its purpose and funds', () => {
    const opened = [];
    const date = '2024-01-15T10:00:00.000Z';
    const sandbox = {
        state: {
            buildingName: 'عمارة النور',
            residents: [{ id: 'r1', name: 'أحمد', apartmentNumber: '3', phone: '01012345678' }],
            income: [
                {
                    id: 'p1', residentId: 'r1', amount: 100, month: 'يناير 2024', date,
                    paymentMethod: 'cash', cashAccountCode: 'main', purposeCode: 'subscription',
                    notes: 'دفعة موزعة AB12CD34 (1/3)'
                },
                {
                    id: 'p2', residentId: 'r1', amount: 50, month: 'يناير 2024', date,
                    paymentMethod: 'cash', cashAccountCode: 'main', purposeCode: 'services',
                    notes: 'دفعة موزعة AB12CD34 (2/3)'
                },
                {
                    id: 'p3', residentId: 'r1', amount: 75, month: 'يناير 2024', date,
                    paymentMethod: 'cash', cashAccountCode: 'development', purposeCode: 'development',
                    notes: 'دفعة موزعة AB12CD34 (3/3)'
                }
            ]
        },
        requireManager: () => true,
        toast() {},
        fmtNum: value => String(value),
        getIncomePaymentMethodLabel: () => 'نقدًا',
        getIncomePurposeLabel: code => ({
            subscription: 'اشتراك شهري', services: 'خدمات ونظافة', development: 'تطوير'
        })[code] || 'اشتراك شهري',
        getCashAccountLabel: code => ({
            main: 'الخزنة الرئيسية', development: 'صندوق التطوير', emergency: 'صندوق الصيانة الطارئة'
        })[code] || 'الخزنة الرئيسية',
        getReceiptThankYouMessage: () => 'شكراً',
        formatDate: () => '15/01/2024',
        window: { open: url => opened.push(url) },
        encodeURIComponent
    };
    const app = vm.runInNewContext(`${noticesSource}\n({ sendIncomeReceiptOnWhatsApp })`, sandbox, { filename: 'js/notices.js' });
    app.sendIncomeReceiptOnWhatsApp('p2');

    const message = new URL(opened[0]).searchParams.get('text');
    assert.match(message, /تحصيل «دفعة مختلطة»/);
    assert.match(message, /المبلغ المستلم: 225 ج.م/);
    assert.match(message, /الصندوق: الخزنة الرئيسية، صندوق التطوير/);
    assert.ok(message.indexOf('اشتراك شهري · يناير 2024: 100 ج.م') < message.indexOf('خدمات ونظافة · يناير 2024: 50 ج.م'));
    assert.ok(message.indexOf('خدمات ونظافة · يناير 2024: 50 ج.م') < message.indexOf('تطوير · يناير 2024: 75 ج.م'));
    assert.match(message, /رقم الإيصال: AB12CD34/);
});

test('owner receipts summarize mixed purposes and cashboxes', () => {
    const date = '2024-01-15T10:00:00.000Z';
    const sandbox = {
        state: {
            income: [
                { id: 'p1', residentId: 'r1', amount: 100, month: 'يناير 2024', date, cashAccountCode: 'main', purposeCode: 'subscription', notes: 'دفعة موزعة AB12CD34 (1/2)' },
                { id: 'p2', residentId: 'r1', amount: 75, month: 'يناير 2024', date, cashAccountCode: 'development', purposeCode: 'development', notes: 'دفعة موزعة AB12CD34 (2/2)' }
            ]
        },
        getIncomePurposeLabel: code => ({ subscription: 'اشتراك شهري', development: 'تطوير' })[code] || 'اشتراك شهري',
        getCashAccountLabel: code => ({ main: 'الخزنة الرئيسية', development: 'صندوق التطوير' })[code] || '',
        document: {
            getElementById: () => null,
            addEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => []
        },
        window: { addEventListener() {} }
    };
    const api = vm.runInNewContext(`${accessSource}\n({ groupOwnerPaymentsIntoReceipts })`, sandbox, { filename: 'js/access.js' });
    const receipts = api.groupOwnerPaymentsIntoReceipts('r1');

    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].totalAmount, 175);
    assert.equal(receipts[0].purposeSummary, 'دفعة مختلطة');
    assert.equal(receipts[0].cashboxSummary, 'الخزنة الرئيسية، صندوق التطوير');
    assert.equal(receipts[0].reference, 'AB12CD34');
    assert.match(accessSource, /<th>الغرض<\/th><th>شهر \/ بند<\/th><th>الصندوق<\/th><th>المبلغ<\/th>/);
});
