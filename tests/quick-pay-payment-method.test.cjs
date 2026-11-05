const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const crud = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');
const start = crud.indexOf('const CRUD_INCOME_PURPOSES =');
const end = crud.indexOf('\n}\n\nfunction previewIncomeAllocation()', start);
if (start < 0 || end < 0) throw new Error('quickPayResident function not found');
const source = crud.slice(start, end + 2);

function createHarness({ outstanding = 250, hasResident = true } = {}) {
    const elements = {
        incomeResident: { value: '' },
        incomeAmount: { value: '' },
        incomeMonth: { value: '' },
        incomePaymentMethod: { value: 'cash' },
        incomeNotes: { value: '' }
    };
    const calls = { populated: 0, previewed: 0, opened: [], messages: [] };
    const sandbox = {
        state: { residents: hasResident ? [{ id: 'resident-1', name: 'Resident A' }] : [], income: [] },
        requireManager: () => true,
        getCurrentMonth: () => 'نوفمبر 2026',
        getMonthOutstanding: () => outstanding,
        populateSelects: () => { calls.populated += 1; },
        previewIncomeAllocation: () => { calls.previewed += 1; },
        openModal: id => calls.opened.push(id),
        toast: (...args) => calls.messages.push(args),
        document: { getElementById: id => elements[id] || null }
    };
    const quickPayResident = vm.runInNewContext(source + '\nquickPayResident', sandbox, {
        filename: 'js/crud.js'
    });
    return { quickPayResident, elements, calls, sandbox };
}

test('quick pay opens the regular collection form and requires an explicit payment method', () => {
    const h = createHarness();
    h.quickPayResident('resident-1');

    assert.equal(h.elements.incomeResident.value, 'resident-1');
    assert.equal(h.elements.incomeAmount.value, '250.00');
    assert.equal(h.elements.incomeMonth.value, 'نوفمبر 2026');
    assert.equal(h.elements.incomePaymentMethod.value, '');
    assert.equal(h.elements.incomeNotes.value, 'دفع سريع');
    assert.deepEqual(h.calls.opened, ['incomeModal']);
    assert.equal(h.calls.populated, 1);
    assert.equal(h.calls.previewed, 1);
    assert.equal(h.sandbox.state.income.length, 0);
});

test('quick pay does not open a form for a missing apartment or a fully paid month', () => {
    const missing = createHarness({ hasResident: false });
    missing.quickPayResident('missing');
    assert.deepEqual(missing.calls.opened, []);
    assert.match(missing.calls.messages.at(-1)[0], /تعذر العثور على الشقة/);

    const paid = createHarness({ outstanding: 0 });
    paid.quickPayResident('resident-1');
    assert.deepEqual(paid.calls.opened, []);
    assert.match(paid.calls.messages.at(-1)[0], /بالكامل/);
});
