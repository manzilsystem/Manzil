const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');
const isValidBackup = vm.runInNewContext(`${source}\nisValidBackup`, {}, {
    filename: 'js/crud.js',
});

function validBackup(overrides = {}) {
    return {
        residents: [],
        income: [],
        expenses: [],
        notices: [],
        ...overrides,
    };
}

test('backup validation rejects a nonnumeric opening balance without rejecting valid balances', () => {
    assert.equal(isValidBackup(validBackup({ startingBalance: 'not-a-number' })), false);
    assert.equal(isValidBackup(validBackup({ startingBalance: -125.5 })), true);
    assert.equal(isValidBackup(validBackup()), true);
});
