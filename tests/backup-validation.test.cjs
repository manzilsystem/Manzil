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

test('backup validation accepts well-formed adjustments and rejects unsafe ledger rows', () => {
    const resident = { id: 'resident-1', name: 'ساكن', apartmentNumber: '1', monthlyAmount: 100 };
    const adjustment = {
        id: 'adjustment-1',
        residentId: 'resident-1',
        effectiveMonth: '2026-10-01',
        kind: 'discount',
        amount: 25,
        reason: 'تخفيض تعاوني'
    };
    assert.equal(isValidBackup(validBackup({ residents: [resident], adjustments: [adjustment] })), true);
    assert.equal(isValidBackup(validBackup({ residents: [resident], adjustments: [{ ...adjustment, effectiveMonth: '2026-10' }] })), true);
    assert.equal(isValidBackup(validBackup({ residents: [resident], adjustments: [{ ...adjustment, residentId: 'missing' }] })), false);
    assert.equal(isValidBackup(validBackup({ residents: [resident], adjustments: [{ ...adjustment, kind: 'bonus' }] })), false);
    assert.equal(isValidBackup(validBackup({ residents: [resident], adjustments: [{ ...adjustment, effectiveMonth: '2026-10-05' }] })), false);
    assert.equal(isValidBackup(validBackup({ residents: [resident], adjustments: [{ ...adjustment, amount: 0 }] })), false);
    assert.equal(isValidBackup(validBackup({ residents: [resident], adjustments: [{ ...adjustment, reason: '   ' }] })), false);
    assert.equal(isValidBackup(validBackup({ residents: [resident], adjustments: [adjustment, { ...adjustment }] })), false);
    assert.equal(isValidBackup(validBackup({ residents: [resident], adjustments: 'none' })), false);
});

test('backup validation rejects duplicate apartment numbers written with different digit systems', () => {
    const first = { id: 'resident-1', name: 'أول', apartmentNumber: '1', monthlyAmount: 100 };
    const second = { id: 'resident-2', name: 'ثان', apartmentNumber: '١', monthlyAmount: 100 };
    assert.equal(isValidBackup(validBackup({ residents: [first, second] })), false);
});
