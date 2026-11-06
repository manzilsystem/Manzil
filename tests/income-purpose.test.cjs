const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const stateSource = fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8');
const crudSource = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');
const supabaseSource = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261105150000_income_purpose_cashbox_mapping.sql'), 'utf8');

function loadState() {
    return vm.runInNewContext(
        `${stateSource}\n({
            state, getPaidAmountForMonth, normalizeIncomePurpose, getIncomePurposeLabel,
            getIncomePurposeFormCode, isSubscriptionIncome, getIncomePurposeCashAccount,
            isIncomePurposeCashAccountLocked, populateIncomePurposeOptions
        })`,
        {},
        { filename: 'js/state.js' }
    );
}

function makeElement(initial = {}) {
    return {
        value: '', innerHTML: '', textContent: '', disabled: false,
        options: [],
        classList: { add() {}, remove() {} },
        setAttribute() {},
        reset() {},
        ...initial
    };
}

function createCrudHarness({ income = [], elements = {} } = {}) {
    const messages = [];
    const calls = { save: 0, opened: [], closed: [], actions: [], allocations: 0 };
    const state = {
        residents: [{ id: 'r1', name: 'Resident', apartmentNumber: '1', monthlyAmount: 100, createdAt: '2024-01-01T00:00:00.000Z' }],
        income: structuredClone(income),
        expenses: [], notices: [], auditLogs: [], paymentAllocationPolicy: 'oldest_first'
    };
    const defaults = {
        incomeForm: makeElement(),
        incomeResident: makeElement({ value: 'r1' }),
        incomeAmount: makeElement({ value: '250' }),
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
        incomeEditResidentSummary: makeElement(),
        incomeEditMonth: makeElement({ value: 'يناير 2024' }),
        incomeEditAmount: makeElement({ value: '100' }),
        incomeEditPaymentMethod: makeElement({ value: 'cash' }),
        incomeEditCashAccount: makeElement({ value: 'main' }),
        incomeEditPurpose: makeElement({ value: 'subscription' }),
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
        getMonthOutstanding: () => 250,
        calculateCumulativeDebt: () => ({ totalDebt: 0, count: 0 }),
        getSubscriptionAmountForMonth: () => 100,
        monthLabelToKey: month => ({ 'يناير 2024': '2024-01-01', 'فبراير 2024': '2024-02-01' })[month] || null,
        calculateIncomeAllocationPreview: (residentId, amount, month) => {
            calls.allocations += 1;
            return { invalid: false, allocations: [{ month, amount: Number(amount) }], totalAllocated: Number(amount), remainingCents: 0, remainingAmount: 0 };
        },
        cloneStateSnapshot: () => JSON.parse(JSON.stringify(state)),
        saveWithRollback: async () => { calls.save += 1; return true; },
        generateId: () => 'income-new',
        logAction: (...args) => calls.actions.push(args),
        openModal: id => calls.opened.push(id),
        closeModal: id => calls.closed.push(id),
        renderAll() {},
        toast: (...args) => messages.push(args),
        fmtNum: value => String(Number(value) || 0),
        esc: value => String(value ?? ''),
        document: { getElementById: id => registry[id] || null },
        INCOME_PAYMENT_METHOD_LABELS: { cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي' },
        getIncomePaymentMethodLabel: method => ({ cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي' })[method] || 'غير محدد',
        getCashAccountLabel: code => ({ main: 'الخزنة الرئيسية', development: 'صندوق التطوير', emergency: 'صندوق الصيانة الطارئة' })[code] || 'الخزنة الرئيسية'
    };
    const api = vm.runInNewContext(
        `${crudSource}\n({ handleIncomeSubmit, openNewIncomeModal, openIncomeEditModal, handleIncomeEditSubmit, syncIncomePurposeCashAccount })`,
        sandbox,
        { filename: 'js/crud.js' }
    );
    return { api, state, elements: registry, messages, calls };
}

test('legacy collections without a purpose behave as monthly subscriptions', () => {
    const app = loadState();
    assert.equal(app.normalizeIncomePurpose(undefined), 'subscription');
    assert.equal(app.normalizeIncomePurpose(''), 'subscription');
    assert.equal(app.normalizeIncomePurpose('not-a-purpose'), 'subscription');
    assert.equal(app.getIncomePurposeLabel('development'), 'تطوير');
    assert.equal(app.getIncomePurposeLabel('services'), 'أخرى');
    assert.equal(app.getIncomePurposeLabel('penalty'), 'أخرى');
    assert.equal(app.getIncomePurposeLabel('donation'), 'أخرى');
    assert.equal(app.getIncomePurposeFormCode('services'), 'other');
    assert.equal(app.getIncomePurposeFormCode('development'), 'development');
    assert.equal(app.isSubscriptionIncome({ purposeCode: undefined }), true);
    assert.equal(app.isSubscriptionIncome({ purposeCode: 'development' }), false);
});

test('the purpose form offers only three main purposes plus other', () => {
    const app = loadState();
    const select = makeElement();
    app.populateIncomePurposeOptions(select, 'services');
    assert.equal(select.value, 'other');
    const options = Array.from(select.innerHTML.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g));
    assert.deepEqual(options.map(match => match[1]), ['subscription', 'development', 'emergency', 'other']);
    assert.deepEqual(options.map(match => match[2]), ['اشتراك شهري', 'تطوير', 'صيانة طارئة', 'أخرى']);
});

test('paid-month totals only count subscription collections', () => {
    const app = loadState();
    app.state.income = [
        { residentId: 'a', month: 'يناير 2024', amount: 40 },
        { residentId: 'a', month: 'يناير 2024', amount: 10, purposeCode: 'subscription' },
        { residentId: 'a', month: 'يناير 2024', amount: 500, purposeCode: 'development' },
        { residentId: 'a', month: 'يناير 2024', amount: 300, purposeCode: 'emergency' }
    ];

    assert.equal(app.getPaidAmountForMonth('a', 'يناير 2024'), 50);
});

test('each purpose owns exactly one cash account and restricted purposes stay locked', () => {
    const app = loadState();
    assert.equal(app.getIncomePurposeCashAccount('development'), 'development');
    assert.equal(app.getIncomePurposeCashAccount('emergency'), 'emergency');
    assert.equal(app.getIncomePurposeCashAccount('services'), 'main');
    assert.equal(app.getIncomePurposeCashAccount('donation'), 'main');
    assert.equal(app.isIncomePurposeCashAccountLocked('development'), true);
    assert.equal(app.isIncomePurposeCashAccountLocked('subscription'), true);
    assert.equal(app.isIncomePurposeCashAccountLocked('services'), false);
    assert.equal(app.isIncomePurposeCashAccountLocked('other'), false);
});

test('new collection form resets to a subscription in the main cashbox', () => {
    const harness = createCrudHarness({ elements: {
        incomePurpose: makeElement({ value: 'development' }),
        incomeCashAccount: makeElement({ value: 'development' })
    } });

    harness.api.openNewIncomeModal();

    assert.equal(harness.elements.incomePurpose.value, 'subscription');
    assert.equal(harness.elements.incomeCashAccount.value, 'main');
    assert.equal(harness.elements.incomeCashAccount.disabled, true);
    assert.deepEqual(harness.calls.opened, ['incomeModal']);
});

test('development purpose pins the collection to the development fund', () => {
    const harness = createCrudHarness({ elements: {
        incomePurpose: makeElement({ value: 'development' }),
        incomeCashAccount: makeElement({ value: 'main' })
    } });

    const purpose = harness.api.syncIncomePurposeCashAccount('incomePurpose', 'incomeCashAccount', {
        hintId: 'incomePurposeCashHint'
    });

    assert.equal(purpose, 'development');
    assert.equal(harness.elements.incomeCashAccount.value, 'development');
    assert.equal(harness.elements.incomeCashAccount.disabled, true);
});

test('non-subscription collections save once without monthly allocation', async () => {
    const harness = createCrudHarness({ elements: {
        incomeAmount: makeElement({ value: '500' }),
        incomePurpose: makeElement({ value: 'other' }),
        incomeCashAccount: makeElement({ value: 'main' }),
        incomeNotes: makeElement({ value: 'نظافة المبنى' })
    } });

    await harness.api.handleIncomeSubmit({ preventDefault() {} });

    assert.equal(harness.calls.allocations, 0);
    assert.equal(harness.calls.save, 1);
    assert.equal(harness.state.income.length, 1);
    assert.equal(harness.state.income[0].purposeCode, 'other');
    assert.equal(harness.state.income[0].cashAccountCode, 'main');
    assert.equal(harness.state.income[0].amount, 500);
    assert.equal(harness.state.income[0].month, 'يناير 2024');
});

test('the other purpose requires its detailed reason in the notes', async () => {
    const harness = createCrudHarness({ elements: {
        incomeAmount: makeElement({ value: '500' }),
        incomePurpose: makeElement({ value: 'other' }),
        incomeCashAccount: makeElement({ value: 'main' }),
        incomeNotes: makeElement({ value: '' })
    } });

    await harness.api.handleIncomeSubmit({ preventDefault() {} });

    assert.equal(harness.calls.save, 0);
    assert.equal(harness.state.income.length, 0);
    assert.match(harness.messages.at(-1)[0], /الغرض بالتفصيل في الملاحظات/);
});

test('subscription collections still distribute over unpaid months', async () => {
    const harness = createCrudHarness({ elements: {
        incomeAmount: makeElement({ value: '100' }),
        incomePurpose: makeElement({ value: 'subscription' }),
        incomeCashAccount: makeElement({ value: 'main' })
    } });

    await harness.api.handleIncomeSubmit({ preventDefault() {} });

    assert.equal(harness.calls.allocations, 1);
    assert.equal(harness.state.income[0].purposeCode, 'subscription');
});

test('restricted purposes pin the collection to their own cash account', async () => {
    const harness = createCrudHarness({ elements: {
        incomePurpose: makeElement({ value: 'emergency' }),
        incomeCashAccount: makeElement({ value: 'main' })
    } });

    await harness.api.handleIncomeSubmit({ preventDefault() {} });

    assert.equal(harness.calls.save, 1);
    assert.equal(harness.state.income[0].purposeCode, 'emergency');
    assert.equal(harness.state.income[0].cashAccountCode, 'emergency');
});

test('editing a collection can move it to another purpose and fund', async () => {
    const harness = createCrudHarness({
        income: [{ id: 'i1', residentId: 'r1', amount: 500, month: 'يناير 2024', notes: '', paymentMethod: 'cash', cashAccountCode: 'main', purposeCode: 'services', date: '2024-01-15T10:00:00.000Z' }],
        elements: {
            incomeEditPurpose: makeElement({ value: 'development' }),
            incomeEditCashAccount: makeElement({ value: 'development' }),
            incomeEditAmount: makeElement({ value: '600' })
        }
    });

    harness.api.openIncomeEditModal('i1');
    harness.elements.incomeEditAmount.value = '600';
    await harness.api.handleIncomeEditSubmit({ preventDefault() {} });

    assert.equal(harness.calls.save, 1);
    assert.equal(harness.state.income[0].purposeCode, 'development');
    assert.equal(harness.state.income[0].cashAccountCode, 'development');
    assert.equal(harness.state.income[0].amount, 600);
});

test('a distributed subscription payment cannot change its purpose', async () => {
    const harness = createCrudHarness({
        income: [{
            id: 'i1', residentId: 'r1', amount: 100, month: 'يناير 2024',
            notes: 'دفعة موزعة AB12CD34 (1/2)', paymentMethod: 'cash',
            cashAccountCode: 'main', purposeCode: 'subscription', date: '2024-01-15T10:00:00.000Z'
        }],
        elements: {
            incomeEditPurpose: makeElement({ value: 'services' }),
            incomeEditNotes: makeElement({ value: '' })
        }
    });

    harness.api.openIncomeEditModal('i1');
    assert.equal(harness.elements.incomeEditPurpose.disabled, true);
    harness.elements.incomeEditPurpose.value = 'services';
    await harness.api.handleIncomeEditSubmit({ preventDefault() {} });

    assert.equal(harness.calls.save, 0);
    assert.equal(harness.state.income[0].purposeCode, 'subscription');
    assert.match(harness.messages.at(-1)[0], /لا يمكن تغيير غرض/);
});

test('income rows keep their purpose when read from the database', () => {
    const sandbox = {
        window: { supabase: { createClient: () => ({}) } },
        console
    };
    const api = vm.runInNewContext(`${supabaseSource}\n({ mapIncome })`, sandbox, { filename: 'js/supabase.js' });

    assert.equal(api.mapIncome({ purpose_code: 'emergency' }).purposeCode, 'emergency');
    assert.equal(api.mapIncome({}).purposeCode, 'subscription');
    assert.equal(api.mapIncome({ purpose_code: 'unknown' }).purposeCode, 'subscription');
    assert.match(supabaseSource, /purpose_code: supabaseIncomePurpose\(i\.purposeCode\)/);
});

test('the migration is additive and protects purpose/cashbox consistency', () => {
    assert.match(migration, /ADD COLUMN IF NOT EXISTS purpose_code text NOT NULL DEFAULT 'subscription'/);
    assert.match(migration, /income_purpose_code_check/);
    assert.match(migration, /invalid_income_purpose_code/);
    assert.match(migration, /income_purpose_cash_account_mismatch/);
    assert.match(migration, /COALESCE\(NULLIF\(btrim\(x\.purpose_code\), ''\), 'subscription'\)/);
    assert.match(migration, /UPDATE public\.income purposed_income/);
    assert.doesNotMatch(migration, /UPDATE public\.income\s+SET purpose_code\s*=/);
});
