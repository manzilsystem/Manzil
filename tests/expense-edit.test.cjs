const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const crud = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');

function createApp() {
    let sandbox;
    const elements = Object.fromEntries([
        'expenseTitle','expenseAmount','expenseCategory','expenseMonth','expenseCashAccount',
        'expenseNotes','expenseSubmitButton','expenseModalTitle','expenseForm','expenseOverdraftRow'
    ].map(id => [id, { value: '', textContent: '', disabled: false, checked: false, reset() {}, classList: { add() {}, remove() {} } }]));
    elements.expensePreview = { classList: { add() {}, remove() {} } };
    elements.expenseOverdraftConfirm = { checked: false, classList: { add() {}, remove() {} } };
    sandbox = {
        state: { expenses: [{ id: 'expense-1', title: 'كهرباء', amount: 100, category: 'كهرباء',
            month: 'أكتوبر 2026', notes: 'فاتورة', cashAccountCode: 'development',
            date: '2026-10-15T10:00:00.000Z' }] },
        requireManager: () => true,
        document: { getElementById: id => elements[id] || null },
        openModal() {}, closeModal() {}, previewExpense() {},
        getCurrentMonth: () => 'نوفمبر 2026',
        getCashAccountBalance: () => 50, getCashAccountLabel: () => 'صندوق التطوير',
        cloneStateSnapshot: () => JSON.parse(JSON.stringify(sandbox.state)),
        saveWithRollback: async () => true,
        logAction: (action, details) => sandbox.audits.push({ action, details }),
        fmtNum: value => String(value),
        toast: message => sandbox.toasts.push(message), renderAll() {}, generateId: () => 'new-expense',
        toasts: [], audits: []
    };
    const app = vm.runInNewContext(crud + '\n({ openExpenseEditModal, handleExpenseSubmit })', sandbox);
    return { app, sandbox, elements };
}

test('expense edit preserves record identity and original date while updating fields', async () => {
    const { app, sandbox, elements } = createApp();
    app.openExpenseEditModal('expense-1');
    assert.equal(elements.expenseTitle.value, 'كهرباء');
    assert.equal(elements.expenseAmount.value, '100');
    assert.equal(elements.expenseModalTitle.textContent, 'تعديل المصروف');
    elements.expenseTitle.value = 'فاتورة كهرباء';
    elements.expenseAmount.value = '120';
    elements.expenseMonth.value = 'نوفمبر 2026';
    elements.expenseNotes.value = 'تم التصحيح';
    await app.handleExpenseSubmit({ preventDefault() {} });
    assert.equal(sandbox.state.expenses.length, 1);
    assert.equal(sandbox.state.expenses[0].id, 'expense-1');
    assert.equal(sandbox.state.expenses[0].title, 'فاتورة كهرباء');
    assert.equal(sandbox.state.expenses[0].amount, 120);
    assert.equal(sandbox.state.expenses[0].month, 'نوفمبر 2026');
    assert.equal(sandbox.state.expenses[0].date, '2026-10-15T10:00:00.000Z');
});

test('expense edit credits the previous amount before checking the same cash account balance', async () => {
    const { app, sandbox, elements } = createApp();
    app.openExpenseEditModal('expense-1');
    elements.expenseAmount.value = '151';
    await app.handleExpenseSubmit({ preventDefault() {} });
    assert.equal(sandbox.state.expenses[0].amount, 100);
    assert.match(sandbox.toasts[0], /غير كافٍ/);
});

test('expense from the main vault beyond its balance needs an explicit confirmation recorded in the audit log', async () => {
    const { app, sandbox, elements } = createApp();
    elements.expenseTitle.value = 'سباكة طارئة';
    elements.expenseAmount.value = '200';
    elements.expenseCategory.value = 'أخرى';
    elements.expenseMonth.value = 'نوفمبر 2026';
    elements.expenseCashAccount.value = 'main';

    await app.handleExpenseSubmit({ preventDefault() {} });
    assert.equal(sandbox.state.expenses.length, 1);
    assert.equal(sandbox.audits.length, 0);
    assert.match(sandbox.toasts[sandbox.toasts.length - 1], /تأكيدًا صريحًا/);

    elements.expenseOverdraftConfirm.checked = true;
    await app.handleExpenseSubmit({ preventDefault() {} });
    assert.equal(sandbox.state.expenses.length, 2);
    assert.equal(sandbox.state.expenses[1].amount, 200);
    assert.equal(sandbox.state.expenses[1].cashAccountCode, 'main');
    const audit = sandbox.audits.find(entry => entry.action === 'تجاوز رصيد الخزنة');
    assert.ok(audit, 'the overdraft confirmation must be recorded in the audit log');
    assert.match(audit.details, /سباكة طارئة/);
});

test('expense from the main vault within its balance saves with no overdraft audit', async () => {
    const { app, sandbox, elements } = createApp();
    elements.expenseTitle.value = 'نظافة';
    elements.expenseAmount.value = '30';
    elements.expenseCategory.value = 'نظافة';
    elements.expenseMonth.value = 'نوفمبر 2026';
    elements.expenseCashAccount.value = 'main';
    await app.handleExpenseSubmit({ preventDefault() {} });
    assert.equal(sandbox.state.expenses.length, 2);
    assert.equal(sandbox.audits.some(entry => entry.action === 'تجاوز رصيد الخزنة'), false);
});
