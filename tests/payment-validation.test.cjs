const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');

function loadHandler(residents) {
    const values = {
        incomeResident: 'missing-resident',
        incomeAmount: '50',
        incomeMonth: 'يناير 2024',
        incomeNotes: '',
    };
    const messages = [];
    const sandbox = {
        state: { residents, income: [], expenses: [], notices: [], auditLogs: [] },
        requireManager: () => true,
        document: { getElementById: id => ({ value: values[id] ?? '', reset() {} }) },
        cloneStateSnapshot: () => JSON.parse(JSON.stringify(sandbox.state)),
        generateId: () => 'income-id',
        logAction: (...args) => { sandbox.state.auditLogs.push(args); },
        saveWithRollback: async () => true,
        closeModal() {},
        renderAll() {},
        toast: (...args) => messages.push(args),
        fmtNum: value => String(value),
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
});
