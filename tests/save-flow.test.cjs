const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const stateSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'state.js'), 'utf8');
const crudSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');

function loadSaveHelper(saveResult = false) {
    const sandbox = {
        renderCount: 0,
        saveState: async () => saveResult,
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

test('saveWithRollback rerenders the interface after a successful save', async () => {
    const app = loadSaveHelper(true);
    app.getState().buildingName = 'التعديل المحفوظ';
    const previousState = app.cloneStateSnapshot();

    assert.equal(await app.saveWithRollback(previousState), true);
    assert.equal(app.getState().buildingName, 'التعديل المحفوظ');
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


function loadConcurrentSaveHelper() {
    const pendingSaves = [];
    const sandbox = {
        renderCount: 0,
        saveState: () => new Promise(resolve => pendingSaves.push(resolve)),
        renderAll: () => { sandbox.renderCount += 1; },
        console
    };
    const app = vm.runInNewContext(
        `${stateSource}\n({ getState: () => state, cloneStateSnapshot, saveWithRollback, getRenderCount: () => renderCount })`,
        sandbox,
        { filename: 'js/state.js' }
    );
    return { app, pendingSaves };
}

test('overlapping saves do not let an earlier failure roll back a later successful edit', async () => {
    const { app, pendingSaves } = loadConcurrentSaveHelper();
    app.getState().buildingName = 'التعديل الأول';
    const beforeFirst = app.cloneStateSnapshot();
    const first = app.saveWithRollback(beforeFirst);

    const beforeSecond = app.cloneStateSnapshot();
    app.getState().managerName = 'التعديل الثاني';
    const second = app.saveWithRollback(beforeSecond);

    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pendingSaves.length, 1);
    pendingSaves[0](false);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pendingSaves.length, 2);
    pendingSaves[1](true);

    assert.equal(await first, false);
    assert.equal(await second, true);
    assert.equal(app.getState().buildingName, 'التعديل الأول');
    assert.equal(app.getState().managerName, 'التعديل الثاني');
});

test('overlapping failed saves roll back to the earliest persisted state', async () => {
    const { app, pendingSaves } = loadConcurrentSaveHelper();
    app.getState().buildingName = 'تعديل أول فاشل';
    const beforeFirst = app.cloneStateSnapshot();
    const first = app.saveWithRollback(beforeFirst);

    const beforeSecond = app.cloneStateSnapshot();
    app.getState().managerName = 'تعديل ثانٍ فاشل';
    const second = app.saveWithRollback(beforeSecond);

    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pendingSaves.length, 1);
    pendingSaves[0](false);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pendingSaves.length, 2);
    pendingSaves[1](false);

    assert.equal(await first, false);
    assert.equal(await second, false);
    assert.equal(app.getState().buildingName, beforeFirst.buildingName);
    assert.equal(app.getState().managerName, beforeFirst.managerName);
});
