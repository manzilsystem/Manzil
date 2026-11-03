const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');

test('editing a resident that disappeared does not report a successful save', async () => {
    const messages = [];
    let saveCalls = 0;
    const elements = {
        residentName: { value: 'Apartment' },
        residentApartment: { value: '1' },
        residentFloor: { value: '1' },
        residentPhone: { value: '' },
        residentAmount: { value: '0' },
        residentNotes: { value: '' }
    };
    const sandbox = {
        state: { residents: [], floorCount: 1, apartmentsPerFloor: 1, defaultSubscription: 0 },
        editingResidentId: 'missing-resident',
        ownerProvisionRequested: false,
        requireManager: () => true,
        cloneStateSnapshot: () => ({}),
        document: { getElementById: id => elements[id] || null },
        toast: (message, type) => messages.push({ message, type }),
        saveWithRollback: async () => { saveCalls += 1; return true; },
        normalizeApartmentDigits: value => String(value ?? '').trim(),
        getLocalMonthKey: () => '2026-11',
        getCurrentSubscriptionAmount: () => 0,
        canEditInitialSubscriptionInline: () => true,
        logAction() {},
        closeModal() {},
        renderAll() {},
        console
    };
    const api = vm.runInNewContext(source + '\\n({ handleResidentSubmit })', sandbox, {
        filename: 'js/crud.js'
    });

    await api.handleResidentSubmit({ preventDefault() {} });

    assert.equal(saveCalls, 0);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'error');
    assert.match(messages[0].message, /تعذر العثور على الشقة/);
});
