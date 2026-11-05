const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');

function createHarness({ income = [], values = {}, saveResult = true } = {}) {
    const messages = [];
    const calls = { save: 0, opened: [], closed: [], actions: [] };
    const elements = {
        incomeEditResidentSummary: { textContent: '' },
        incomeEditMonth: { value: values.month || 'يناير 2024', innerHTML: '' },
        incomeEditAmount: { value: values.amount || '50' },
        incomeEditPaymentMethod: { value: values.paymentMethod || 'cash' },
        incomeEditPaymentMethod: { value: values.paymentMethod || 'cash' },
        incomeEditNotes: { value: values.notes || '' },
        incomeEditCashAccount: { value: values.cashAccountCode || 'main', disabled: false, setAttribute() {} },
        incomeEditSubmitButton: { disabled: false, textContent: 'حفظ التعديل' }
    };
    const state = {
        residents: [{ id: 'r1', name: 'Resident', apartmentNumber: '1', createdAt: '2024-01-01T00:00:00.000Z' }],
        income: structuredClone(income),
        expenses: [], notices: [], auditLogs: []
    };
    const sandbox = {
        state,
        requireManager: () => true,
        document: { getElementById: id => elements[id] || null },
        getActiveBuildingMonths: () => ['يناير 2024', 'فبراير 2024', 'ديسمبر 2023'],
        monthLabelToKey: month => ({
            'ديسمبر 2023': '2023-12-01',
            'يناير 2024': '2024-01-01',
            'فبراير 2024': '2024-02-01'
        })[month] || null,
        getLocalMonthKey: () => '2024-01',
        getSubscriptionAmountForMonth: () => 100,
        cloneStateSnapshot: () => JSON.parse(JSON.stringify(state)),
        saveWithRollback: async () => { calls.save += 1; return saveResult; },
        logAction: (...args) => calls.actions.push(args),
        openModal: id => calls.opened.push(id),
        closeModal: id => calls.closed.push(id),
        renderAll: () => {},
        toast: (...args) => messages.push(args),
        fmtNum: value => String(value),
        INCOME_PAYMENT_METHOD_LABELS: { cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي' },
        getIncomePaymentMethodLabel: method => ({ cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي' })[method] || 'غير محدد',
        INCOME_PAYMENT_METHOD_LABELS: { cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي' },
        getIncomePaymentMethodLabel: method => ({ cash: 'نقدًا', wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي' })[method] || 'غير محدد',
        esc: value => String(value ?? ''),
        getCashAccountLabel: code => ({
            main: 'الخزنة الرئيسية', development: 'صندوق التطوير', emergency: 'صندوق الصيانة الطارئة'
        })[code] || 'الخزنة الرئيسية',
        console
    };
    const api = vm.runInNewContext(source + '\n({ openIncomeEditModal, handleIncomeEditSubmit })', sandbox, {
        filename: 'js/crud.js'
    });
    return { api, state, elements, messages, calls };
}

test('opening an income edit dialog loads the linked resident and current payment values', () => {
    const payment = { id: 'i1', residentId: 'r1', amount: 40, month: 'يناير 2024', notes: 'دفعة', paymentMethod: 'cash', date: '2024-01-15T10:00:00.000Z' };
    const h = createHarness({ income: [payment] });

    h.api.openIncomeEditModal('i1');

    assert.equal(h.elements.incomeEditResidentSummary.textContent, 'شقة 1 · Resident');
    assert.equal(h.elements.incomeEditMonth.value, 'يناير 2024');
    assert.equal(h.elements.incomeEditAmount.value, 40);
    assert.equal(h.elements.incomeEditNotes.value, 'دفعة');
    assert.deepEqual(h.calls.opened, ['incomeEditModal']);
});

test('editing a payment preserves its original timestamp and updates amount, month and notes', async () => {
    const payment = { id: 'i1', residentId: 'r1', amount: 40, month: 'يناير 2024', notes: 'قديم', paymentMethod: 'cash', date: '2024-01-15T10:00:00.000Z' };
    const h = createHarness({ income: [payment], values: { amount: '60', month: 'يناير 2024', notes: 'معدل' } });

    h.api.openIncomeEditModal('i1');
    h.elements.incomeEditAmount.value = '60';
    h.elements.incomeEditNotes.value = 'معدل';
    h.elements.incomeEditPaymentMethod.value = 'wallet';
    await h.api.handleIncomeEditSubmit({ preventDefault() {} });

    assert.equal(h.state.income[0].amount, 60);
    assert.equal(h.state.income[0].month, 'يناير 2024');
    assert.equal(h.state.income[0].notes, 'معدل');
    assert.equal(h.state.income[0].paymentMethod, 'wallet');
    assert.equal(h.state.income[0].date, '2024-01-15T10:00:00.000Z');
    assert.equal(h.calls.save, 1);
    assert.deepEqual(h.calls.closed, ['incomeEditModal']);
    assert.equal(h.messages.at(-1)[1], 'success');
});

test('editing rejects an amount greater than the remaining monthly subscription', async () => {
    const h = createHarness({
        income: [
            { id: 'i1', residentId: 'r1', amount: 40, month: 'يناير 2024', notes: '', paymentMethod: 'cash', date: '2024-01-15T10:00:00.000Z' },
            { id: 'i2', residentId: 'r1', amount: 50, month: 'يناير 2024', notes: '', paymentMethod: 'cash', date: '2024-01-16T10:00:00.000Z' }
        ],
        values: { amount: '60', month: 'يناير 2024' }
    });

    h.api.openIncomeEditModal('i1');
    h.elements.incomeEditAmount.value = '60';
    await h.api.handleIncomeEditSubmit({ preventDefault() {} });

    assert.equal(h.calls.save, 0);
    assert.equal(h.state.income[0].amount, 40);
    assert.match(h.messages.at(-1)[0], /المتبقي/);
});

test('editing rejects payments dated before the apartment creation month', async () => {
    const h = createHarness({
        income: [{ id: 'i1', residentId: 'r1', amount: 40, month: 'يناير 2024', notes: '', paymentMethod: 'cash', date: '2024-01-15T10:00:00.000Z' }],
        values: { amount: '20', month: 'ديسمبر 2023' }
    });

    h.api.openIncomeEditModal('i1');
    h.elements.incomeEditAmount.value = '20';
    h.elements.incomeEditMonth.value = 'ديسمبر 2023';
    await h.api.handleIncomeEditSubmit({ preventDefault() {} });

    assert.equal(h.calls.save, 0);
    assert.equal(h.state.income[0].month, 'يناير 2024');
    assert.match(h.messages.at(-1)[0], /قبل تاريخ إنشاء الشقة/);
});

test('editing rejects an invalid month and missing payment without saving', async () => {
    const h = createHarness({
        income: [{ id: 'i1', residentId: 'r1', amount: 40, month: 'يناير 2024', notes: '', date: '2024-01-15T10:00:00.000Z' }],
        values: { amount: '20', month: 'شهر غير صحيح' }
    });

    h.api.openIncomeEditModal('i1');
    h.elements.incomeEditMonth.value = 'شهر غير صحيح';
    await h.api.handleIncomeEditSubmit({ preventDefault() {} });
    assert.equal(h.calls.save, 0);

    h.api.openIncomeEditModal('missing');
    assert.equal(h.calls.save, 0);
    assert.match(h.messages.at(-1)[0], /تعذر العثور على التحصيل/);
});


test('editing one part of a distributed collection preserves its reference and updates the method for every part', async () => {
    const h = createHarness({
        income: [
            { id: 'i1', residentId: 'r1', amount: 40, month: 'يناير 2024', notes: 'دفعة موزعة ABC123 (1/2) · ملاحظة', paymentMethod: 'cash', date: '2024-01-15T10:00:00.000Z' },
            { id: 'i2', residentId: 'r1', amount: 30, month: 'فبراير 2024', notes: 'دفعة موزعة ABC123 (2/2)', paymentMethod: 'cash', date: '2024-01-15T10:00:00.000Z' }
        ],
        values: { amount: '40', month: 'يناير 2024', notes: 'ملاحظة', paymentMethod: 'wallet' }
    });
    h.api.openIncomeEditModal('i1');
    assert.equal(h.elements.incomeEditNotes.value, 'ملاحظة');
    h.elements.incomeEditPaymentMethod.value = 'wallet';
    await h.api.handleIncomeEditSubmit({ preventDefault() {} });
    assert.equal(h.state.income[0].notes, 'دفعة موزعة ABC123 (1/2) · ملاحظة');
    assert.equal(h.state.income[0].paymentMethod, 'wallet');
    assert.equal(h.state.income[1].paymentMethod, 'wallet');
});
