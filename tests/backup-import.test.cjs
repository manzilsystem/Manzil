const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const backupSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'backup.js'), 'utf8');

function createImportHarness(fileContent, options = {}) {
    const calls = { saves: 0, layoutUpdates: 0, layoutArgs: [], renders: 0, closes: 0, toasts: [], themes: [] };
    const sandbox = {
        state: {
            buildingName: 'Current building',
            residents: [],
            income: [],
            expenses: [],
            notices: [],
            auditLogs: [],
            adjustments: options.adjustments || []
        },
        normalizeBillingStartMonth: value => {
            const match = String(value || '').trim().match(/^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/);
            return match ? `${match[1]}-${match[2]}-01` : null;
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
        applyThemeToDocument: theme => { calls.themes.push(theme); },
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

test('importing a file without adjustments clears the current settlement ledger', async () => {
    const valid = {
        buildingName: 'Imported building',
        residents: [],
        income: [],
        expenses: [],
        notices: []
    };
    const harness = createImportHarness(JSON.stringify(valid), {
        adjustments: [{ id: 'adjustment-old', residentId: 'resident-old', effectiveMonth: '2026-01-01', kind: 'waiver', amount: 50, reason: 'قديم' }]
    });

    harness.api.importJSON(harness.event);
    await harness.sandbox.reader.done;

    assert.deepEqual(JSON.parse(JSON.stringify(harness.sandbox.state.adjustments)), []);
    assert.equal(harness.calls.saves, 1);
});

test('imported adjustments are normalized before they are persisted', async () => {
    const valid = {
        buildingName: 'Imported building',
        residents: [{ id: 'resident-1', name: 'ساكن', apartmentNumber: '1', monthlyAmount: 100 }],
        income: [],
        expenses: [],
        notices: [],
        adjustments: [{
            id: 'adjustment-1',
            residentId: 'resident-1',
            effectiveMonth: '2026-10',
            kind: 'discount',
            amount: '25.005',
            reason: '  تخفيض تعاوني  '
        }]
    };
    const harness = createImportHarness(JSON.stringify(valid));

    harness.api.importJSON(harness.event);
    await harness.sandbox.reader.done;

    const [adjustment] = harness.sandbox.state.adjustments;
    assert.equal(adjustment.effectiveMonth, '2026-10-01');
    assert.equal(adjustment.amount, 25.01);
    assert.equal(adjustment.reason, 'تخفيض تعاوني');
    assert.equal(typeof adjustment.createdAt, 'string');
    assert.equal(harness.calls.saves, 1);
    assert.equal(harness.calls.toasts.at(-1).type, 'success');
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

test('a successful import applies the imported theme through the canonical applier', async () => {
    const valid = {
        buildingName: 'Imported building',
        currentTheme: 'emerald',
        residents: [],
        income: [],
        expenses: [],
        notices: []
    };
    const harness = createImportHarness(JSON.stringify(valid));

    harness.api.importJSON(harness.event);
    await harness.sandbox.reader.done;

    assert.deepEqual(harness.calls.themes, ['emerald']);
});

test('the theme colour palette is declared once and reused on import', () => {
    assert.doesNotMatch(backupSource, /dark:\s*'#0b1020'/,
        'backup.js must not redeclare the theme colour palette');
    assert.match(backupSource, /applyThemeToDocument\(/,
        'backup.js must apply the imported theme through the canonical applier');
});
