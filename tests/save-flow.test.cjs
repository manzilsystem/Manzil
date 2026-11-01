const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const stateSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');
const crudSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');

function loadSaveHelper() {
    const sandbox = {
        renderCount: 0,
        saveState: async () => false,
        renderAll: () => { sandbox.renderCount += 1; },
    };
    const app = vm.runInNewContext(
        `${stateSource}\n({ getState: () => state, cloneStateSnapshot, saveWithRollback, getRenderCount: () => renderCount })`,
        sandbox,
        { filename: 'js/state.js' }
    );
    return app;
}

test('saveWithRollback restores the previous state when persistence fails', async () => {
    const app = loadSaveHelper();
    app.getState().buildingName = 'قبل التعديل';
    const previousState = app.cloneStateSnapshot();
    app.getState().buildingName = 'تعديل فاشل';

    assert.equal(await app.saveWithRollback(previousState), false);
    assert.equal(JSON.stringify(app.getState()), JSON.stringify(previousState));
    assert.equal(app.getRenderCount(), 1);
});

test('mutating CRUD handlers await the rollback-aware save path', () => {
    for (const name of [
        'deleteResident', 'quickPayResident', 'handleIncomeSubmit', 'deleteIncome',
        'handleExpenseSubmit', 'deleteExpense', 'handleNoticeSubmit', 'deleteNotice', 'saveSettings'
    ]) {
        assert.match(crudSource, new RegExp(`async function ${name}\\b`));
    }
    assert.doesNotMatch(crudSource, /(^|[^\w])saveState\s*\(/);
    assert.match(crudSource, /const previousState = cloneStateSnapshot\(\);/);
    assert.match(crudSource, /if \(!await saveWithRollback\(previousState\)\) return;/);
});
