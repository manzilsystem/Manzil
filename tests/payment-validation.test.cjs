const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');

function loadHandler(residents, saveWithRollback = async () => true) {
    const values = {
        incomeResident: 'missing-resident',
        incomeAmount: '50',
        incomeMonth: 'يناير 2024',
        incomeNotes: '',
        incomePaymentMethod: 'instapay',
    };
    const messages = [];
    const sandbox = {
        state: { residents, income: [], expenses: [], notices: [], auditLogs: [] },
        requireManager: () => true,
        document: { getElementById: id => ({
            value: values[id] ?? '',
            reset() {},
            classList: { add() {}, remove() {} },
            disabled: false,
            textContent: '',
        }) },
        cloneStateSnapshot: () => JSON.parse(JSON.stringify(sandbox.state)),
        generateId: () => 'income-id',
        logAction: (...args) => { sandbox.state.auditLogs.push(args); },
        saveWithRollback,
        closeModal() {},
        renderAll() {},
        toast: (...args) => messages.push(args),
        fmtNum: value => String(value),
        INCOME_PAYMENT_METHOD_LABELS: { cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي' },
        getIncomePaymentMethodLabel: method => ({ cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي' })[method] || 'غير محدد',
        getCashAccountLabel: code => ({ main: 'الخزنة الرئيسية', development: 'صندوق التطوير', emergency: 'صندوق الصيانة الطارئة' })[code] || 'الخزنة الرئيسية',
        calculateIncomeAllocationPreview: (residentId, amount, month) => ({
            invalid: false,
            allocations: [{ month, amount: Number(amount) }],
            remainingCents: 0,
        }),
    };
    const app = vm.runInNewContext(`${source}\n({ handleIncomeSubmit })`, sandbox, {
        filename: 'js/crud.js',
    });
    return { app, sandbox, messages };
}

test('income submission rejects a resident id that is not in the current unit list', async () => {
    const { app, sandbox, messages } = loadHandler([{ id: 'resident-1', name: 'شقة 1' }]);
    let prevented = false;

    await app.handleIncomeSubmit({ preventDefault() { prevented = true; } });

    assert.equal(prevented, true);
    assert.deepEqual(sandbox.state.income, []);
    assert.match(messages.at(-1)?.[0] || '', /الشقة/);
});

test('income submission still accepts a valid resident id', async () => {
    const { app, sandbox } = loadHandler([{ id: 'missing-resident', name: 'شقة 1' }]);

    await app.handleIncomeSubmit({ preventDefault() {} });

    assert.equal(sandbox.state.income.length, 1);
    assert.equal(sandbox.state.income[0].residentId, 'missing-resident');
    assert.equal(sandbox.state.income[0].amount, 50);
    assert.equal(sandbox.state.income[0].paymentMethod, 'instapay');
});


test('income submission rejects an unsupported payment method', async () => {
    const { app, sandbox, messages } = loadHandler([{ id: 'missing-resident', name: 'شقة 1' }]);
    const originalGetElementById = sandbox.document.getElementById;
    sandbox.document.getElementById = id => id === 'incomePaymentMethod'
        ? { value: 'crypto' }
        : originalGetElementById(id);
    await app.handleIncomeSubmit({ preventDefault() {} });
    assert.equal(sandbox.state.income.length, 0);
    assert.match(messages.at(-1)?.[0] || '', /اختر الشقة/);
});


test('rapid duplicate submit while the first income save is pending records only one payment', async () => {
    let resolveSave;
    let saveCalls = 0;
    const pendingSave = new Promise(resolve => { resolveSave = resolve; });
    const { app, sandbox } = loadHandler(
        [{ id: 'missing-resident', name: 'شقة 1' }],
        async () => {
            saveCalls += 1;
            return pendingSave;
        }
    );

    const firstSubmit = app.handleIncomeSubmit({ preventDefault() {} });
    const secondSubmit = app.handleIncomeSubmit({ preventDefault() {} });

    assert.equal(saveCalls, 1);
    assert.equal(sandbox.state.income.length, 1);
    assert.equal(sandbox.state.income[0].amount, 50);

    resolveSave(true);
    await Promise.all([firstSubmit, secondSubmit]);

    assert.equal(sandbox.state.income.length, 1);
    assert.equal(saveCalls, 1);
});
