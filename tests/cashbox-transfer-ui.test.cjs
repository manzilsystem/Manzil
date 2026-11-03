const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'cashbox.js'), 'utf8');

function createTransferHarness(options = {}) {
    const calls = { rpc: [], refreshes: 0, renders: 0, toasts: [] };
    const elements = new Map();
    const makeElement = (id, initial = {}) => {
        const element = {
            id, value: '', textContent: '', disabled: false,
            className: '', classes: new Set(),
            classList: {
                add(name) { element.classes.add(name); },
                remove(name) { element.classes.delete(name); },
                contains(name) { return element.classes.has(name); }
            },
            ...initial
        };
        elements.set(id, element);
        return element;
    };
    makeElement('cashTransferFrom', { value: 'main' });
    makeElement('cashTransferTo', { value: 'development' });
    makeElement('cashTransferAmount', { value: options.amount ?? '10' });
    makeElement('cashTransferNotes', { value: 'monthly allocation' });
    makeElement('cashTransferPreview');
    makeElement('cashTransferPreviewText');
    makeElement('cashTransferSubmitButton', { textContent: 'تنفيذ التحويل' });
    makeElement('cashTransferForm', { reset() { calls.reset = true; } });

    const sandbox = {
        state: {
            cashAccountBalances: { main: 100, development: 20, emergency: 30 },
            cashTransfers: [],
            auditLogs: []
        },
        currentUserRole: 'manager',
        activeBuildingId: 'building-1',
        activeBuildingVersion: 4,
        persistedAuditLogIds: new Set(),
        document: { getElementById: id => elements.get(id) || null },
        requireManager: () => true,
        generateId: () => 'request-123',
        fmtNum: value => Number(value).toFixed(2),
        formatDate: value => String(value || ''),
        esc: value => String(value ?? ''),
        toast: (message, type) => calls.toasts.push({ message, type }),
        renderAll: () => { calls.renders += 1; },
        refreshCashboxSummary: async () => { calls.refreshes += 1; },
        supabaseClient: {
            rpc: async (name, args) => {
                calls.rpc.push({ name, args });
                return options.rpcResult || {
                    data: {
                        ok: true,
                        version: 5,
                        balances: { main: 90, development: 30, emergency: 30 },
                        audit_log_id: 'audit-123'
                    },
                    error: null
                };
            }
        },
        console
    };
    const api = vm.runInNewContext(`${source}\n({ submitCashTransfer })`, sandbox, {
        filename: 'js/cashbox.js'
    });
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    return { api, sandbox, elements, calls, event };
}

test('cash transfer form submits the expected RPC payload and refreshes the UI after confirmation', async () => {
    const harness = createTransferHarness();

    await harness.api.submitCashTransfer(harness.event);

    assert.equal(harness.event.prevented, true);
    assert.equal(harness.calls.rpc.length, 1);
    assert.equal(harness.calls.rpc[0].name, 'transfer_cash_between_accounts');
    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.calls.rpc[0].args)),
        {
            p_building_id: 'building-1',
            p_request_id: 'request-123',
            p_expected_version: 4,
            p_from_account_code: 'main',
            p_to_account_code: 'development',
            p_amount: 10,
            p_notes: 'monthly allocation'
        }
    );
    assert.equal(harness.sandbox.activeBuildingVersion, 5);
    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.sandbox.state.cashAccountBalances)),
        { main: 90, development: 30, emergency: 30 }
    );
    assert.equal(harness.sandbox.state.auditLogs[0].id, 'audit-123');
    assert.equal(harness.sandbox.persistedAuditLogIds.has('audit-123'), true);
    assert.equal(harness.calls.refreshes, 1);
    assert.equal(harness.calls.renders, 1);
    assert.equal(harness.calls.reset, true);
    assert.equal(harness.calls.toasts.at(-1).type, 'success');
});

test('cash transfer form rejects an amount above the local balance before calling the backend', async () => {
    const harness = createTransferHarness({ amount: '100.01' });

    await harness.api.submitCashTransfer(harness.event);

    assert.equal(harness.calls.rpc.length, 0);
    assert.equal(harness.calls.refreshes, 0);
    assert.equal(harness.calls.renders, 0);
    assert.equal(harness.calls.toasts.at(-1).type, 'error');
});
