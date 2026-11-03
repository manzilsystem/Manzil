const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const crudSource = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261103230000_building_apartment_numbering.sql'), 'utf8');

function createLayoutHarness({ floorCount = 11, apartmentsPerFloor = 2, residents = [], editingResidentId = null } = {}) {
    const elements = {
        residentFloor: { value: '1', innerHTML: '' },
        residentApartment: { value: '', innerHTML: '' }
    };
    const sandbox = {
        state: { floorCount, apartmentsPerFloor, residents },
        editingResidentId,
        document: { getElementById: id => elements[id] || null },
        esc: value => String(value ?? '').replace(/[&<>"']/g, ''),
    };
    const api = vm.runInNewContext(
        crudSource + '\n({ populateResidentFloorOptions, updateResidentApartmentOptions, getFloorLabel })',
        sandbox,
        { filename: 'js/crud.js' }
    );
    return { api, elements };
}

test('floor dropdown starts at floor one and uses the configured count', () => {
    const { api, elements } = createLayoutHarness();
    api.populateResidentFloorOptions();
    assert.match(elements.residentFloor.innerHTML, /value="1">الدور ١/);
    assert.match(elements.residentFloor.innerHTML, /value="11">الدور ١١/);
    assert.doesNotMatch(elements.residentFloor.innerHTML, /value="0"/);
});

test('apartment numbers are sequential across floors and occupied numbers are hidden', () => {
    const { api, elements } = createLayoutHarness({
        residents: [
            { id: 'a', apartmentNumber: '3', floor: '2' },
            { id: 'b', apartmentNumber: '21', floor: '11' }
        ]
    });
    elements.residentFloor.value = '2';
    api.updateResidentApartmentOptions();
    assert.doesNotMatch(elements.residentApartment.innerHTML, /value="3"/);
    assert.match(elements.residentApartment.innerHTML, /value="4">شقة 4/);

    elements.residentFloor.value = '11';
    api.updateResidentApartmentOptions();
    assert.doesNotMatch(elements.residentApartment.innerHTML, /value="21"/);
    assert.match(elements.residentApartment.innerHTML, /value="22">شقة 22/);
});

test('editing keeps the current apartment available without showing other occupied apartments', () => {
    const { api, elements } = createLayoutHarness({
        editingResidentId: 'current',
        residents: [
            { id: 'current', apartmentNumber: '3', floor: '2' },
            { id: 'other', apartmentNumber: '4', floor: '2' }
        ]
    });
    elements.residentFloor.value = '2';
    api.updateResidentApartmentOptions('3');
    assert.equal(elements.residentApartment.value, '3');
    assert.match(elements.residentApartment.innerHTML, /value="3">شقة 3/);
    assert.doesNotMatch(elements.residentApartment.innerHTML, /value="4"/);
});

test('changing the floor does not retain an apartment number from the previous floor', () => {
    const { api, elements } = createLayoutHarness({
        editingResidentId: 'current',
        residents: [{ id: 'current', apartmentNumber: '3', floor: '2' }]
    });
    elements.residentFloor.value = '3';
    api.updateResidentApartmentOptions();
    assert.doesNotMatch(elements.residentApartment.innerHTML, /value="3"/);
    assert.match(elements.residentApartment.innerHTML, /value="5">شقة 5/);
    assert.match(elements.residentApartment.innerHTML, /value="6">شقة 6/);
});

test('layout configuration is stored per building and only managers can change it', () => {
    assert.match(migration, /ADD COLUMN IF NOT EXISTS floor_count integer/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS apartments_per_floor integer/);
    assert.match(migration, /bm\.role = 'manager'/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.set_building_apartment_layout[^;]+TO authenticated/);
    assert.match(migration, /FROM PUBLIC, anon/);
});
