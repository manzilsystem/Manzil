const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'crud.js'), 'utf8');

test('saving a Latin apartment number rejects an existing Arabic-Indic equivalent', async () => {
    const messages = [];
    let saveCalls = 0;
    const elements = {
        residentName: { value: 'New resident' },
        residentApartment: { value: '3' },
        residentFloor: { value: '2' },
        residentPhone: { value: '' },
        residentAmount: { value: '0' },
        residentNotes: { value: '' }
    };
    const sandbox = {
        state: {
            residents: [{ id: 'existing', name: 'Existing', apartmentNumber: '٠٣', floor: '2' }],
            floorCount: 2,
            apartmentsPerFloor: 2,
            defaultSubscription: 0
        },
        editingResidentId: null,
        ownerProvisionRequested: false,
        requireManager: () => true,
        cloneStateSnapshot: () => ({}),
        document: { getElementById: id => elements[id] || null },
        toast: (message, type) => messages.push({ message, type }),
        saveWithRollback: async () => { saveCalls += 1; return true; },
        normalizeApartmentDigits: value => String(value ?? '').replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
            .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776)).trim(),
        console
    };
    const api = vm.runInNewContext(source + String.fromCharCode(10) + '({ handleResidentSubmit })', sandbox, {
        filename: 'js/crud.js'
    });

    await api.handleResidentSubmit({ preventDefault() {} });

    assert.equal(saveCalls, 0);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'error');
    assert.match(messages[0].message, /رقم الشقة مسجل بالفعل/);
});
