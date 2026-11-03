const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase.js'), 'utf8');

function classList() {
    const values = new Set(['hidden']);
    return {
        add: name => values.add(name),
        remove: name => values.delete(name),
        contains: name => values.has(name),
    };
}

function makeHarness(buildings) {
    const select = { innerHTML: '', value: '', focus() {} };
    const modal = {
        classList: classList(),
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
    };
    const document = {
        getElementById(id) {
            return id === 'buildingContextSelect' ? select
                : id === 'buildingContextModal' ? modal : null;
        },
    };
    const supabaseClient = {
        from(table) {
            assert.equal(table, 'buildings');
            return {
                select(columns) {
                    assert.equal(columns, 'id,name');
                    return {
                        in(column, ids) {
                            assert.equal(column, 'id');
                            return Promise.resolve({ data: buildings.filter(item => ids.includes(item.id)), error: null });
                        },
                    };
                },
            };
        },
    };
    const sandbox = { window: { supabase: { createClient: () => supabaseClient } }, document, console: { warn() {}, error() {} } };
    const api = vm.runInNewContext(`${source}
        ({
            chooseBuildingMembership,
            confirmBuildingSelection,
            setSession(session, generation) { activeSession = session; authGeneration = generation; }
        })`, sandbox, { filename: 'js/supabase.js' });
    return { api, select, modal };
}

test('a single membership does not require a building-selection dialog', async () => {
    const h = makeHarness([]);
    const membership = { building_id: 'building-1', role: 'manager' };
    h.api.setSession({ user: { id: 'user-1' } }, 0);

    const selected = await h.api.chooseBuildingMembership([membership], { user: { id: 'user-1' } }, 0);

    assert.equal(selected, membership);
    assert.equal(h.modal.classList.contains('hidden'), true);
});

test('multiple memberships require explicit selection and display escaped building names', async () => {
    const session = { user: { id: 'user-1' } };
    const memberships = [
        { building_id: 'building-1', role: 'manager' },
        { building_id: 'building-2', role: 'owner' },
    ];
    const h = makeHarness([
        { id: 'building-1', name: 'العمارة الأولى' },
        { id: 'building-2', name: '<script>alert(1)</script>' },
    ]);
    h.api.setSession(session, 4);

    const selection = h.api.chooseBuildingMembership(memberships, session, 4);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(h.modal.classList.contains('hidden'), false);
    assert.match(h.select.innerHTML, /العمارة الأولى — مدير/);
    assert.match(h.select.innerHTML, /&lt;script&gt;/);
    assert.doesNotMatch(h.select.innerHTML, /<script>/);

    h.select.value = 'building-2';
    assert.equal(h.api.confirmBuildingSelection(), true);
    assert.equal(await selection, memberships[1]);
    assert.equal(h.modal.classList.contains('hidden'), true);
    assert.equal(h.modal.attributes['aria-hidden'], 'true');
});

test('a stale authentication session cannot confirm a building selection', async () => {
    const session = { user: { id: 'user-1' } };
    const h = makeHarness([
        { id: 'building-1', name: 'العمارة الأولى' },
        { id: 'building-2', name: 'العمارة الثانية' },
    ]);
    h.api.setSession(session, 1);

    const selection = h.api.chooseBuildingMembership([
        { building_id: 'building-1', role: 'manager' },
        { building_id: 'building-2', role: 'manager' },
    ], session, 1);
    await new Promise(resolve => setImmediate(resolve));
    h.api.setSession({ user: { id: 'user-2' } }, 2);

    h.select.value = 'building-1';
    assert.equal(h.api.confirmBuildingSelection(), false);
    assert.equal(await selection, null);
    assert.equal(h.modal.classList.contains('hidden'), true);
    assert.equal(h.modal.attributes['aria-hidden'], 'true');
});
