const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'backup.js'), 'utf8');
const isValidBackup = vm.runInNewContext(`${source}\nisValidBackup`, {}, {
    filename: 'js/backup.js',
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

test('backup validation accepts an optional floor and rejects invalid floor types', () => {
    const resident = { id: 'resident-1', name: 'ساكن', apartmentNumber: '1', floor: 'الثاني', monthlyAmount: 100 };
    assert.equal(isValidBackup(validBackup({ residents: [resident] })), true);
    assert.equal(isValidBackup(validBackup({ residents: [{ ...resident, floor: 2 }] })), false);
    assert.equal(isValidBackup(validBackup({ residents: [{ ...resident, floor: null }] })), true);
});

test('backup validation rejects empty or null financial values instead of coercing them to zero', () => {
    const resident = { id: 'resident-1', name: 'ساكن', apartmentNumber: '1', monthlyAmount: 100 };
    assert.equal(isValidBackup(validBackup({ residents: [resident], income: [{ id: 'income-1', residentId: 'resident-1', month: 'يناير 2024', amount: null }] })), false);
    assert.equal(isValidBackup(validBackup({ expenses: [{ id: 'expense-1', title: 'مصروف', month: 'يناير 2024', amount: '' }] })), false);
    assert.equal(isValidBackup(validBackup({ defaultSubscription: '' })), false);
});
