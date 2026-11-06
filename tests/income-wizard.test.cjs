const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const modal = fs.readFileSync(path.join(root, 'src', 'partials', 'modals.html'), 'utf8');
const crud = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');
const generated = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('income collection form is split into three explicit wizard steps', () => {
    for (const id of ['incomeWizardStep1', 'incomeWizardStep2', 'incomeWizardStep3']) {
        assert.match(modal, new RegExp('id="' + id + '"'));
        assert.match(generated, new RegExp('id="' + id + '"'));
    }
    assert.match(modal, /id="incomeWizardProgress"/);
    assert.match(modal, /id="incomeWizardBack"/);
    assert.match(modal, /id="incomeWizardNext"/);
    assert.match(modal, /id="incomeWizardSummary"/);
    assert.match(modal, /<form id="incomeForm" novalidate/);
});

test('wizard validates stages and retains final submit guards', () => {
    assert.match(crud, /function validateIncomeWizardStep\(step\)/);
    assert.match(crud, /function changeIncomeWizardStep\(direction\)/);
    assert.match(crud, /validateIncomeWizardStep\(1\).*validateIncomeWizardStep\(2\)/s);
    assert.match(crud, /Object\.prototype\.hasOwnProperty\.call\(INCOME_PAYMENT_METHOD_LABELS, paymentMethod\)/);
    assert.match(crud, /if \(!requireManager\(\) \|\| incomeSaving\) return;/);
    assert.match(crud, /setIncomeWizardStep\(1\);/);
});
