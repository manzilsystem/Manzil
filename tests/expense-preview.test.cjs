const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const crud = fs.readFileSync(path.join(root, 'js/crud.js'), 'utf8');

test('expense form provides a live review of all fields before saving', () => {
    for (const id of ['expensePreview', 'expensePreviewSummary', 'expensePreviewDetails', 'expenseSubmitButton']) {
        assert.ok(html.includes(`id="${id}"`), id);
    }
    for (const handler of ['expenseTitle', 'expenseAmount', 'expenseCategory', 'expenseMonth', 'expenseNotes']) {
        const element = html.slice(html.indexOf(`id="${handler}"`), html.indexOf('>', html.indexOf(`id="${handler}"`)) + 1);
        assert.match(element, /(?:oninput|onchange)="previewExpense\(\)"/);
    }
    assert.match(crud, /function previewExpense\(\)/);
    assert.match(crud, /summary\.textContent = `معاينة المصروف/);
});

test('expense submit prevents concurrent duplicate submissions and resets preview only after save', () => {
    assert.match(crud, /if \(!requireManager\(\) \|\| expenseSaving\) return/);
    assert.match(crud, /expenseSaving = true/);
    assert.match(crud, /expenseSaving = false/);
    assert.match(crud, /expensePreview.*classList\.add\('hidden'\)/);
});


test('expense records can be edited and the previous account amount is credited during validation', () => {
    assert.match(crud, /function openExpenseModal\(\)/);
    assert.match(crud, /function openExpenseEditModal\(id\)/);
    assert.match(crud, /state\.expenses = state\.expenses\.map\(item => item\.id === editingExpenseId/);
    assert.match(crud, /getCashAccountBalance\(cashAccountCode\) \+\s*\(existingExpense && \(existingExpense\.cashAccountCode \|\| 'main'\) === cashAccountCode/);
    assert.match(html, /onclick="openExpenseModal\(\)"/);
    assert.match(crud, /تعديل المصروف/);
});
