const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const backupSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'backup.js'), 'utf8');

function createImportHarness(fileContent, options = {}) {
    const calls = { saves: 0, layoutUpdates: 0, layoutArgs: [], renders: 0, closes: 0, toasts: [] };
    const sandbox = {
        state: {
            buildingName: 'Current building',
            residents: [],
            income: [],
            expenses: [],
            notices: [],
            auditLogs: []
        },
        requireManager: () => true,
        activeBuildingId: 'building-id',
        supabaseClient: {
            rpc: async (name, args) => {
                calls.layoutUpdates += 1;
                calls.layoutArgs.push({ name, args });
                return { data: { ok: true }, error: null };
            }
        },
        confirm: () => options.confirm ?? true,
        cloneStateSnapshot: () => JSON.parse(JSON.stringify(sandbox.state)),
        saveWithRollback: async previous => {
            calls.saves += 1;
            if (options.saveResult === false) {
                sandbox.state = previous;
                return false;
            }
            return true;
        },
        toast: (message, type) => calls.toasts.push({ message, type }),
        renderAll: () => { calls.renders += 1; },
        closeModal: () => { calls.closes += 1; },
        console,
        document: {
            body: { setAttribute() {} },
            querySelector: () => ({ setAttribute() {} })
        },
        FileReader: class {
            constructor() { sandbox.reader = this; }
            readAsText() { this.result = fileContent; this.done = this.onload(); }
        }
    };
    const api = vm.runInNewContext(`${backupSource}\n({ importJSON })`, sandbox, {
        filename: 'js/backup.js'
    });
    const event = { target: { files: [{ size: Buffer.byteLength(fileContent) }], value: 'selected' } };
    return { api, sandbox, event, calls };
}

test('invalid JSON backup is rejected without mutating current state or saving', async () => {
    const harness = createImportHarness(JSON.stringify({ residents: [] }));
    const before = JSON.stringify(harness.sandbox.state);

    harness.api.importJSON(harness.event);
    await harness.sandbox.reader.done;

    assert.equal(JSON.stringify(harness.sandbox.state), before);
    assert.equal(harness.calls.saves, 0);
    assert.equal(harness.calls.renders, 0);
    assert.equal(harness.calls.closes, 0);
    assert.equal(harness.event.target.value, '');
    assert.equal(harness.calls.toasts.at(-1).type, 'error');
});

test('cancelled JSON import leaves current state untouched', async () => {
    const valid = {
        buildingName: 'Imported building',
        residents: [],
        income: [],
        expenses: [],
        notices: []
    };
    const harness = createImportHarness(JSON.stringify(valid), { confirm: false });
    const before = JSON.stringify(harness.sandbox.state);

    harness.api.importJSON(harness.event);
    await harness.sandbox.reader.done;

    assert.equal(JSON.stringify(harness.sandbox.state), before);
    assert.equal(harness.calls.saves, 0);
    assert.equal(harness.calls.renders, 0);
    assert.equal(harness.calls.closes, 0);
});

test('failed persistence rolls JSON import back to the previous state', async () => {
    const valid = {
        buildingName: 'Imported building',
        residents: [],
        income: [],
        expenses: [],
        notices: []
    };
    const harness = createImportHarness(JSON.stringify(valid), { saveResult: false });
    const before = JSON.stringify(harness.sandbox.state);

    harness.api.importJSON(harness.event);
    await harness.sandbox.reader.done;

    assert.equal(JSON.stringify(harness.sandbox.state), before);
    assert.equal(harness.calls.saves, 1);
    assert.equal(harness.calls.renders, 0);
    assert.equal(harness.calls.closes, 0);
    assert.equal(harness.event.target.value, '');
    assert.equal(harness.calls.toasts.at(-1).type, 'error');
});

test('successful JSON import validates, persists, renders and closes the backup dialog', async () => {
    const valid = {
        buildingName: 'Imported building',
        residents: [],
        income: [],
        expenses: [],
        notices: []
    };
    const harness = createImportHarness(JSON.stringify(valid));

    harness.api.importJSON(harness.event);
    await harness.sandbox.reader.done;

    assert.equal(harness.sandbox.state.buildingName, 'Imported building');
    assert.equal(harness.calls.saves, 1);
    assert.equal(harness.calls.renders, 1);
    assert.equal(harness.calls.closes, 1);
    assert.equal(harness.calls.toasts.at(-1).type, 'success');
});
