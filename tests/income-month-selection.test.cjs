const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'UTC';
const root = path.join(__dirname, '..');
const stateSource = fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8');
const crudSource = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');
const fixedNow = new Date('2024-05-15T12:00:00.000Z');
class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow.getTime(); }
}

function resident(overrides = {}) {
    return {
        id: 'r1',
        name: 'أحمد',
        apartmentNumber: '3',
        createdAt: '2024-01-01T00:00:00.000Z',
        monthlyAmount: 100,
        subscriptionRates: [{ effectiveMonth: '2024-01-01', monthlyAmount: 100 }],
        ...overrides
    };
}

function loadState() {
    return vm.runInNewContext(
        `${stateSource}\n({ state, getIncomeCollectionMonthLabels, calculateSelectedMonthsAllocation, monthKeyToLabel, monthLabelToKey })`,
        { Date: FixedDate },
        { filename: 'income-month-selection.js' }
    );
}

function makeElement(initial = {}) {
    return {
        value: '', innerHTML: '', textContent: '', disabled: false,
        options: [],
        classList: { add() {}, remove() {}, toggle() {} },
        setAttribute() {},
        reset() {},
        focus() {},
        ...initial
    };
}

function createSubmitHarness(selectedMonths, { confirmResult = false } = {}) {
    const grid = makeElement({
        innerHTML: selectedMonths
            .map(month => `<input type="checkbox" data-income-month="${month}" checked>`)
            .join('')
    });
    grid.querySelectorAll = () => Array.from(
        String(grid.innerHTML).matchAll(/data-income-month="([^"]+)"[^>]*\bchecked\b/g)
    ).map(match => ({ getAttribute: () => match[1] }));
    const registry = {
        incomeResident: makeElement({ value: 'r1' }),
        incomeAmount: makeElement({ value: '200' }),
        incomeMonth: makeElement({ value: 'مايو 2024' }),
        incomePurpose: makeElement({ value: 'subscription' }),
        incomeCashAccount: makeElement({ value: 'main' }),
        incomePaymentMethod: makeElement({ value: 'cash' }),
        incomeNotes: makeElement({ value: '' }),
        incomeMonthsGrid: grid,
        incomeMonthPicker: makeElement({ value: '' }),
        incomeMonthPickerHint: makeElement(),
        incomeAllocationPreview: makeElement(),
        incomeSubmitButton: makeElement()
    };
    const calls = { saved: 0, actions: [], messages: [], confirms: [] };
    const state = {
        residents: [resident()],
        income: [],
        expenses: [],
        notices: [],
        auditLogs: [],
        paymentAllocationPolicy: 'oldest_first',
        cashAccountBalances: { main: 0, development: 0, emergency: 0 }
    };
    const sandbox = {
        Date: FixedDate,
        __testHooks: calls,
        __testState: state,
        requireManager: () => true,
        logAction: (...args) => calls.actions.push(args),
        cloneStateSnapshot: () => JSON.parse(JSON.stringify(state)),
        confirm: (...args) => { calls.confirms.push(args); return confirmResult; },
        closeModal() {},
        renderAll() {},
        setTimeout: () => 0,
        clearTimeout() {},
        document: {
            getElementById: id => id === 'toastContainer' ? { appendChild() {} } : registry[id] || null,
            createElement: () => ({ className: '', textContent: '', style: {}, remove() {} })
        }
    };
    const api = vm.runInNewContext(
        `${stateSource}\n${crudSource}\n`
        + 'state = __testState;\n'
        + 'saveWithRollback = async () => { __testHooks.saved += 1; return true; };\n'
        + 'toast = (...args) => __testHooks.messages.push(args);\n'
        + '({ handleIncomeSubmit, handleIncomeMonthPickerChange, syncIncomeMonthPicker, getIncomeMonthPickerStatus, monthKeyToLabel, __selected: () => Array.from(incomeSelectedMonths) })',
        sandbox,
        { filename: 'income-month-submit.js' }
    );
    return { api, state, calls, registry };
}

test('month labels start at the oldest unpaid month and cover the next twelve months', () => {
    const app = loadState();
    app.state.residents = [resident()];
    app.state.income = [{ id: 'i1', residentId: 'r1', month: 'يناير 2024', amount: 100 }];

    const labels = Array.from(app.getIncomeCollectionMonthLabels(app.state.residents[0], 12));

    assert.equal(labels[0], 'فبراير 2024');
    assert.equal(labels.at(-1), 'مايو 2025');
    assert.ok(labels.includes('مايو 2024'));
    assert.ok(labels.includes('يناير 2025'));
    assert.equal(labels.length, 16);
});

test('a resident with no arrears starts from the current month', () => {
    const app = loadState();
    app.state.residents = [resident({ createdAt: '2024-05-01T00:00:00.000Z' })];

    const labels = Array.from(app.getIncomeCollectionMonthLabels(app.state.residents[0], 12));

    assert.equal(labels[0], 'مايو 2024');
    assert.equal(labels.at(-1), 'مايو 2025');
});

test('explicitly selected months are settled in order without touching unselected arrears', () => {
    const app = loadState();
    app.state.residents = [resident()];

    const result = app.calculateSelectedMonthsAllocation('r1', ['مارس 2024', 'مايو 2024'], 200, 12);

    assert.deepEqual(
        JSON.parse(JSON.stringify(result.allocations.map(item => [item.month, item.amount]))),
        [['مارس 2024', 100], ['مايو 2024', 100]]
    );
    assert.equal(result.remainingCents, 0);
    assert.ok(!result.allocations.some(item => item.month === 'يناير 2024'));
    assert.ok(!result.allocations.some(item => item.month === 'أبريل 2024'));
});

test('selecting only the current month leaves old arrears unpaid', () => {
    const app = loadState();
    app.state.residents = [resident()];

    const result = app.calculateSelectedMonthsAllocation('r1', ['مايو 2024'], 100, 12);

    assert.deepEqual(
        JSON.parse(JSON.stringify(result.allocations.map(item => item.month))),
        ['مايو 2024']
    );
});

test('excess over the selected month becomes an advance payment for the following months', () => {
    const app = loadState();
    app.state.residents = [resident()];

    const result = app.calculateSelectedMonthsAllocation('r1', ['مايو 2024'], 250, 12);

    assert.deepEqual(
        JSON.parse(JSON.stringify(result.allocations.map(item => [item.month, item.amount]))),
        [['مايو 2024', 100], ['يونيو 2024', 100], ['يوليو 2024', 50]]
    );
    assert.equal(result.horizonExceeded, false);
});

test('selecting a month before the apartment creation date is rejected', () => {
    const app = loadState();
    app.state.residents = [resident({ createdAt: '2024-05-01T00:00:00.000Z' })];

    const result = app.calculateSelectedMonthsAllocation('r1', ['أبريل 2024'], 100, 12);

    assert.equal(result.invalidStart, true);
    assert.equal(result.allocations.length, 0);
});

test('an amount beyond the supported future horizon is rejected instead of dropping money', () => {
    const app = loadState();
    app.state.residents = [resident()];

    const result = app.calculateSelectedMonthsAllocation('r1', ['مايو 2024'], 500000, 12);

    assert.equal(result.horizonExceeded, true);
    assert.ok(result.remainingCents > 0);
});

test('saving a subscription collection writes one row per selected month only', async () => {
    const harness = createSubmitHarness(['مارس 2024', 'مايو 2024']);

    await harness.api.handleIncomeSubmit({ preventDefault() {} });

    assert.equal(harness.calls.saved, 1);
    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.state.income.map(item => [item.month, item.amount]))),
        [['مارس 2024', 100], ['مايو 2024', 100]]
    );
    assert.ok(harness.state.income.every(item => item.purposeCode === 'subscription'));
});

test('calendar month keys convert to Arabic labels and back', () => {
    const app = loadState();

    assert.equal(app.monthKeyToLabel('2026-10'), 'أكتوبر 2026');
    assert.equal(app.monthKeyToLabel('2026-10-01'), 'أكتوبر 2026');
    assert.equal(app.monthLabelToKey('أكتوبر 2026'), '2026-10-01');
    assert.equal(app.monthKeyToLabel('2026-13'), '');
});

test('an explicitly included month stays visible even when it sits before the arrears window', () => {
    const app = loadState();
    app.state.residents = [resident()];

    const labels = Array.from(app.getIncomeCollectionMonthLabels(app.state.residents[0], 12, ['ديسمبر 2023']));

    assert.equal(labels[0], 'ديسمبر 2023');
    assert.ok(labels.includes('يناير 2024'));
});

test('the picker selects an old unpaid month and reports it in the hint', () => {
    const harness = createSubmitHarness([]);

    harness.api.syncIncomeMonthPicker(harness.state.residents[0], 'مارس 2024');

    assert.equal(harness.registry.incomeMonthPicker.value, '2024-03');
    assert.match(harness.registry.incomeMonthPickerHint.textContent, /متبقٍ 100 ج\.م/);
    assert.match(harness.registry.incomeMonthPickerHint.textContent, /مستحق 100 ج\.م/);
});

test('changing the picker to an old unpaid month selects exactly that month', async () => {
    const harness = createSubmitHarness(['مارس 2024']);
    harness.registry.incomeMonthPicker.value = '2024-03';

    await harness.api.handleIncomeMonthPickerChange();

    assert.deepEqual(JSON.parse(JSON.stringify(harness.api.__selected())), ['مارس 2024']);
    assert.equal(harness.registry.incomeAmount.value, '100');
    assert.equal(harness.calls.messages.length, 0);
});

test('changing the picker to a fully paid month clears the selection with an info message', async () => {
    const harness = createSubmitHarness([]);
    harness.state.income = [{ id: 'i1', residentId: 'r1', month: 'مايو 2024', amount: 100, purposeCode: 'subscription' }];
    harness.registry.incomeMonthPicker.value = '2024-05';

    await harness.api.handleIncomeMonthPickerChange();

    assert.deepEqual(JSON.parse(JSON.stringify(harness.api.__selected())), []);
    assert.equal(harness.registry.incomeAmount.value, '');
    assert.equal(harness.calls.messages.at(-1)[1], 'info');
    assert.match(harness.calls.messages.at(-1)[0], /مسدد بالكامل/);
});

test('cancelling the billing-start prompt keeps the billing start and selects nothing', async () => {
    const harness = createSubmitHarness([], { confirmResult: false });
    harness.registry.incomeMonthPicker.value = '2023-12';

    await harness.api.handleIncomeMonthPickerChange();

    assert.equal(harness.calls.confirms.length, 1);
    assert.match(harness.calls.confirms[0][0], /قبل بداية محاسبة الشقة/);
    assert.equal(harness.state.residents[0].billingStartMonth, undefined);
    assert.equal(harness.calls.saved, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(harness.api.__selected())), []);
    assert.equal(harness.registry.incomeAmount.value, '');
    assert.match(harness.registry.incomeMonthPickerHint.textContent, /قبل بداية محاسبة الشقة/);
});

test('confirming the billing-start prompt moves the start and selects the old month', async () => {
    const harness = createSubmitHarness([], { confirmResult: true });
    harness.registry.incomeMonthPicker.value = '2023-12';

    await harness.api.handleIncomeMonthPickerChange();

    assert.equal(harness.state.residents[0].billingStartMonth, '2023-12-01');
    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.state.residents[0].subscriptionRates)),
        [
            { effectiveMonth: '2023-12-01', monthlyAmount: 100 },
            { effectiveMonth: '2024-01-01', monthlyAmount: 100 }
        ]
    );
    assert.equal(harness.calls.saved, 1);
    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.state.auditLogs.map(entry => [entry.action, entry.details]))),
        [['تعديل بداية المحاسبة', `أحمد - شقة 3: ${harness.api.monthKeyToLabel('2023-12')} · سعر تاريخي 100 ج.م`]]
    );
    assert.deepEqual(JSON.parse(JSON.stringify(harness.api.__selected())), ['ديسمبر 2023']);
    assert.equal(harness.registry.incomeAmount.value, '100');
    assert.equal(harness.calls.messages.at(-1)[1], 'success');
    assert.match(harness.calls.messages.at(-1)[0], /تم تعديل بداية المحاسبة/);
});
