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
        loadState: async () => {
            calls.loads = (calls.loads || 0) + 1;
            if (options.loadStateResult === false) return false;
            sandbox.state.cashAccountBalances = options.loadedBalances || {
                main: 90, development: 30, emergency: 30
            };
            sandbox.activeBuildingVersion = options.loadedVersion ?? 5;
            return true;
        },
        supabaseClient: {
            rpc: async (name, args) => {
                calls.rpc.push({ name, args });
                if (options.rpcThrows?.length) throw options.rpcThrows.shift();
                if (options.rpcResults?.length) return options.rpcResults.shift();
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
    return { api, sandbox, elements, calls, event, options };
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


test('cash transfer preserves the pending request and local balances after an uncertain network failure', async () => {
    const networkError = new Error('network unavailable');
    const harness = createTransferHarness({
        rpcResults: [
            { data: null, error: networkError },
            {
                data: {
                    ok: true,
                    duplicate: true,
                    version: 5,
                    balances: { main: 90, development: 30, emergency: 30 }
                },
                error: null
            }
        ]
    });
    const initialBalances = { ...harness.sandbox.state.cashAccountBalances };

    await harness.api.submitCashTransfer(harness.event);

    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.sandbox.state.cashAccountBalances)),
        initialBalances
    );
    assert.equal(harness.calls.reset, undefined);
    assert.equal(harness.calls.toasts.at(-1).type, 'error');
    assert.equal(harness.calls.rpc.length, 1);

    await harness.api.submitCashTransfer(harness.event);

    assert.equal(harness.calls.rpc.length, 2);
    assert.equal(
        harness.calls.rpc[0].args.p_request_id,
        harness.calls.rpc[1].args.p_request_id
    );
    assert.equal(harness.calls.reset, true);
    assert.equal(harness.calls.toasts.at(-1).type, 'success');
    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.sandbox.state.cashAccountBalances)),
        { main: 90, development: 30, emergency: 30 }
    );
});

test('cash transfer applies the authoritative insufficient-balance response without reporting success', async () => {
    const harness = createTransferHarness({
        rpcResult: {
            data: {
                ok: false,
                insufficient_balance: true,
                available_balance: 7.25,
                version: 4
            },
            error: null
        }
    });

    await harness.api.submitCashTransfer(harness.event);

    assert.equal(harness.calls.rpc.length, 1);
    assert.equal(harness.sandbox.state.cashAccountBalances.main, 7.25);
    assert.equal(harness.sandbox.state.cashAccountBalances.development, 20);
    assert.equal(harness.calls.reset, undefined);
    assert.equal(harness.calls.renders, 0);
    assert.equal(harness.calls.toasts.at(-1).type, 'error');
    assert.notEqual(harness.calls.toasts.at(-1).type, 'success');
});


test('cash transfer version conflict reloads authoritative state and never reports success', async () => {
    const harness = createTransferHarness({
        rpcResult: {
            data: { ok: false, conflict: true, version: 6 },
            error: null
        },
        loadedBalances: { main: 80, development: 40, emergency: 30 },
        loadedVersion: 6
    });

    await harness.api.submitCashTransfer(harness.event);

    assert.equal(harness.calls.loads, 1);
    assert.equal(harness.calls.renders, 1);
    assert.equal(harness.sandbox.activeBuildingVersion, 6);
    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.sandbox.state.cashAccountBalances)),
        { main: 80, development: 40, emergency: 30 }
    );
    assert.equal(harness.calls.reset, undefined);
    assert.equal(harness.calls.toasts.at(-1).type, 'error');
    assert.notEqual(harness.calls.toasts.at(-1).type, 'success');
});

test('malformed RPC success response keeps balances and form intact for a safe retry', async () => {
    const harness = createTransferHarness({
        rpcResults: [
            { data: { ok: true, version: 'not-a-version' }, error: null },
            {
                data: {
                    ok: true, duplicate: true, version: 5,
                    balances: { main: 90, development: 30, emergency: 30 }
                },
                error: null
            }
        ]
    });
    const initialBalances = { ...harness.sandbox.state.cashAccountBalances };

    await harness.api.submitCashTransfer(harness.event);

    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.sandbox.state.cashAccountBalances)),
        initialBalances
    );
    assert.equal(harness.calls.reset, undefined);
    assert.equal(harness.calls.toasts.at(-1).type, 'error');
    const requestId = harness.calls.rpc[0].args.p_request_id;

    await harness.api.submitCashTransfer(harness.event);

    assert.equal(harness.calls.rpc[1].args.p_request_id, requestId);
    assert.equal(harness.calls.reset, true);
    assert.equal(harness.calls.toasts.at(-1).type, 'success');
});

test('duplicate response with failed reload retains the request id until authoritative reload succeeds', async () => {
    const harness = createTransferHarness({
        loadStateResult: false,
        rpcResults: [
            {
                data: {
                    ok: true, duplicate: true, version: 5,
                    balances: { main: 90, development: 30, emergency: 30 }
                },
                error: null
            },
            {
                data: {
                    ok: true, duplicate: true, version: 5,
                    balances: { main: 90, development: 30, emergency: 30 }
                },
                error: null
            }
        ]
    });

    await harness.api.submitCashTransfer(harness.event);
    const requestId = harness.calls.rpc[0].args.p_request_id;
    assert.equal(harness.calls.reset, undefined);
    assert.equal(harness.calls.toasts.at(-1).type, 'error');

    harness.options.loadStateResult = undefined;
    await harness.api.submitCashTransfer(harness.event);

    assert.equal(harness.calls.rpc[1].args.p_request_id, requestId);
    assert.equal(harness.calls.reset, true);
    assert.equal(harness.calls.toasts.at(-1).type, 'success');
});

test('thrown transport errors do not mutate balances or discard the idempotency key', async () => {
    const harness = createTransferHarness({
        rpcThrows: [new Error('connection reset')],
        rpcResults: [{
            data: {
                ok: true, duplicate: true, version: 5,
                balances: { main: 90, development: 30, emergency: 30 }
            },
            error: null
        }]
    });
    const initialBalances = { ...harness.sandbox.state.cashAccountBalances };

    await harness.api.submitCashTransfer(harness.event);
    const requestId = harness.calls.rpc[0].args.p_request_id;
    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.sandbox.state.cashAccountBalances)),
        initialBalances
    );
    assert.equal(harness.calls.reset, undefined);

    await harness.api.submitCashTransfer(harness.event);
    assert.equal(harness.calls.rpc[1].args.p_request_id, requestId);
    assert.equal(harness.calls.reset, true);
    assert.equal(harness.calls.toasts.at(-1).type, 'success');
});


test('cash transfer rejects incomplete authoritative balances or audit metadata', async () => {
    const harness = createTransferHarness({
        rpcResults: [
            {
                data: { ok: true, version: 5, balances: { main: 90, development: 30 } },
                error: null
            },
            {
                data: {
                    ok: true, duplicate: true, version: 5,
                    balances: { main: 90, development: 30, emergency: 30 }
                },
                error: null
            }
        ]
    });
    const initialBalances = { ...harness.sandbox.state.cashAccountBalances };

    await harness.api.submitCashTransfer(harness.event);

    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.sandbox.state.cashAccountBalances)),
        initialBalances
    );
    assert.equal(harness.calls.reset, undefined);
    assert.equal(harness.calls.toasts.at(-1).type, 'error');

    await harness.api.submitCashTransfer(harness.event);

    assert.equal(harness.calls.rpc[1].args.p_request_id, harness.calls.rpc[0].args.p_request_id);
    assert.equal(harness.calls.reset, true);
    assert.equal(harness.calls.toasts.at(-1).type, 'success');
});
