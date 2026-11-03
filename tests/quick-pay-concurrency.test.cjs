const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const crud = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');
const start = crud.indexOf('async function quickPayResident(residentId) {');
const end = crud.indexOf('\n}\n\nfunction previewIncomeAllocation()', start);
if (start < 0 || end < 0) throw new Error('quickPayResident function not found');
const source = crud.slice(start, end + 2);

test('quick pay ignores duplicate clicks while the first payment is saving', async () => {
    let releaseSave;
    let saveCalls = 0;
    const sandbox = {
        state: {
            residents: [{ id: 'resident-1', name: 'Resident A' }],
            income: []
        },
        requireManager: () => true,
        getCurrentMonth: () => '2026-11',
        getMonthOutstanding: () => 250,
        cloneStateSnapshot: () => JSON.parse(JSON.stringify(sandbox.state)),
        generateId: (() => { let id = 0; return () => `payment-${++id}`; })(),
        logAction() {},
        fmtNum: value => String(value),
        toast() {},
        saveWithRollback: () => {
            saveCalls += 1;
            return new Promise(resolve => { releaseSave = resolve; });
        }
    };
    const quickPayResident = vm.runInNewContext(
        `${crud.slice(0, crud.indexOf('function openResidentModal'))}\n${source}\nquickPayResident`,
        sandbox,
        { filename: 'js/crud.js' }
    );

    const first = quickPayResident('resident-1');
    const duplicate = quickPayResident('resident-1');
    await Promise.resolve();

    assert.equal(saveCalls, 1);
    assert.equal(sandbox.state.income.length, 1);
    assert.equal(sandbox.state.income[0].amount, 250);

    releaseSave(true);
    await Promise.all([first, duplicate]);
    assert.equal(sandbox.state.income.length, 1);

    await quickPayResident('resident-1');
    assert.equal(saveCalls, 2);
    assert.equal(sandbox.state.income.length, 2);
});
