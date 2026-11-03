const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'cashbox.js'), 'utf8');

function createTransferHarness(options = {}) {
    const calls = { rpc: [], refreshes: 0, renders: 0, toasts: [] };
    const elements = new Map();
    const storage = options.sessionStore || new Map();
    const sessionStorage = {
        getItem(key) { return storage.has(key) ? storage.get(key) : null; },
        setItem(key, value) { storage.set(key, String(value)); },
        removeItem(key) { storage.delete(key); }
    };
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
        sessionStorage,
        persistedAuditLogIds: new Set(),
        document: { getElementById: id => elements.get(id) || null },
        requireManager: () => true,
        generateId: () => 'request-123',
        fmtNum: value => Number(value).toFixed(2),
        formatDate: value => String(value || ''),
        esc: value => String(value ?? ''),
        toast: (message, type) => calls.toasts.push({ message, type }),
        renderAll: () => { calls.renders += 1; },
        refreshCashboxSummary: async () => {
            calls.refreshes += 1;
            if (options.refreshThrows) throw options.refreshThrows;
            return options.refreshResult ?? true;
        },
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
                if (options.onRpc) return options.onRpc(sandbox, name, args);
                if (options.rpcThrows?.length) throw options.rpcThrows.shift();
                if (options.rpcResults?.length) return options.rpcResults.shift();
                return options.rpcResult || {
                    data: {
                        ok: true,
                        version: 5,
                        balances: { main: 90, development: 30, emergency: 30 },
                        transfer_id: 'transfer-123',
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
    return { api, sandbox, elements, calls, event, options, storage };
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


test('cash transfer rejects malformed insufficient-balance data without mutating state or losing its request id', async () => {
    const harness = createTransferHarness({
        rpcResults: [
            {
                data: { insufficient_balance: true, available_balance: null, version: 5 },
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
    assert.equal(harness.calls.loads, 1);
    assert.equal(harness.calls.reset, true);
    assert.equal(harness.calls.toasts.at(-1).type, 'success');
});

function createCashboxSummaryHarness(response) {
    const cashboxSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'cashbox.js'), 'utf8');
    const supabaseSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase.js'), 'utf8');
    const mapStart = supabaseSource.indexOf('function mapCashTransfer(');
    const refreshStart = supabaseSource.indexOf('async function refreshCashboxSummary()');
    const nextFunction = supabaseSource.indexOf('function mapNotice(', refreshStart);
    assert.ok(mapStart >= 0 && refreshStart > mapStart && nextFunction > refreshStart);

    const calls = [];
    const sandbox = {
        state: {
            cashAccountBalances: { main: 10, development: 20, emergency: 30 },
            cashTransfers: [{ id: 'existing-transfer' }]
        },
        currentUserRole: 'manager',
        activeBuildingId: 'building-1',
        supabaseClient: {
            rpc: async (name, args) => {
                calls.push({ name, args });
                return typeof response === 'function' ? response() : response;
            }
        },
        console
    };
    const refreshCode = supabaseSource.slice(mapStart, nextFunction);
    const api = vm.runInNewContext(
        [cashboxSource, refreshCode, '({ normalizeCashboxSummary, refreshCashboxSummary })'].join(String.fromCharCode(10)),
        sandbox,
        { filename: 'cashbox-summary-harness.js' }
    );
    return { api, sandbox, calls };
}

const validCashboxSummary = {
    balances: { main: 100, development: 25, emergency: 5 },
    transfers: [{
        id: 'transfer-1',
        from_account_code: 'main',
        to_account_code: 'development',
        amount: '25.00',
        notes: 'allocation',
        transferred_at: '2026-11-03T12:00:00.000Z'
    }]
};

test('cashbox summary refresh validates and applies the complete authoritative summary', async () => {
    const harness = createCashboxSummaryHarness({ data: validCashboxSummary, error: null });

    const refreshed = await harness.api.refreshCashboxSummary();

    assert.equal(refreshed, true);
    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.sandbox.state.cashAccountBalances)),
        { main: 100, development: 25, emergency: 5 }
    );
    assert.equal(harness.sandbox.state.cashTransfers.length, 1);
    assert.equal(harness.sandbox.state.cashTransfers[0].amount, 25);
    assert.equal(harness.sandbox.state.cashTransfers[0].fromAccountCode, 'main');
    assert.equal(harness.calls[0].name, 'get_cashbox_summary');
    assert.equal(harness.calls[0].args.p_building_id, 'building-1');
});

test('cashbox summary refresh preserves last known balances and transfers on malformed responses', async () => {
    const malformedSummaries = [
        { balances: { main: 100, development: 25 }, transfers: [] },
        { balances: { main: 100, development: null, emergency: 5 }, transfers: [] },
        { balances: { main: 100, development: 25, emergency: 5, extra: 1 }, transfers: [] },
        { balances: { main: 100, development: -1, emergency: 5 }, transfers: [] },
        { balances: { main: 100, development: 25, emergency: -0.01 }, transfers: [] },
        { balances: { main: 100, development: 25, emergency: 5 }, transfers: [{ id: 'bad' }] }
    ];

    for (const summary of malformedSummaries) {
        const harness = createCashboxSummaryHarness({ data: summary, error: null });
        const previousBalances = { ...harness.sandbox.state.cashAccountBalances };
        const previousTransfers = JSON.parse(JSON.stringify(harness.sandbox.state.cashTransfers));

        await assert.rejects(harness.api.refreshCashboxSummary(), /Invalid cashbox summary/);

        assert.deepEqual(
            JSON.parse(JSON.stringify(harness.sandbox.state.cashAccountBalances)),
            previousBalances
        );
        assert.deepEqual(
            JSON.parse(JSON.stringify(harness.sandbox.state.cashTransfers)),
            previousTransfers
        );
    }
});

test('cashbox summary refresh does not apply a response after the active building changes', async () => {
    let resolveRpc;
    const harness = createCashboxSummaryHarness(() => new Promise(resolve => { resolveRpc = resolve; }));
    const previousBalances = { ...harness.sandbox.state.cashAccountBalances };
    const refresh = harness.api.refreshCashboxSummary();

    harness.sandbox.activeBuildingId = 'another-building';
    resolveRpc({ data: validCashboxSummary, error: null });

    assert.equal(await refresh, false);
    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.sandbox.state.cashAccountBalances)),
        previousBalances
    );
});

test('cashbox summary loader validates server data before assigning global state', () => {
    const supabaseSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase.js'), 'utf8');
    const validationAt = supabaseSource.indexOf("const cashboxSummary = currentUserRole === 'manager'");
    const assignmentAt = supabaseSource.indexOf('    state = {', validationAt);
    assert.ok(validationAt >= 0 && assignmentAt > validationAt);
    assert.ok(supabaseSource.includes('cashAccountBalances: cashboxSummary.balances'));
    assert.ok(supabaseSource.includes('cashTransfers: cashboxSummary.transfers.map(mapCashTransfer)'));
});


test('cashbox summary rejects negative balances in restricted funds', () => {
    const api = vm.runInNewContext(
        [source, '({ hasValidCashboxBalances })'].join(String.fromCharCode(10)),
        {},
        { filename: 'cashbox-negative-balance-test.js' }
    );
    for (const balances of [
        { main: 100, development: -1, emergency: 0 },
        { main: 100, development: 0, emergency: -0.01 }
    ]) {
        assert.equal(
            api.hasValidCashboxBalances(balances),
            false,
            'restricted fund balances cannot be negative'
        );
    }
    assert.equal(api.hasValidCashboxBalances({ main: -1, development: 0, emergency: 0 }), true);
});


test('confirmed cash transfer keeps its history visible when summary refresh is unavailable', async () => {
    const harness = createTransferHarness({ refreshResult: false });

    await harness.api.submitCashTransfer(harness.event);

    assert.equal(harness.sandbox.state.cashTransfers.length, 1);
    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.sandbox.state.cashTransfers[0])),
        {
            id: 'transfer-123',
            fromAccountCode: 'main',
            toAccountCode: 'development',
            amount: 10,
            notes: 'monthly allocation',
            transferredAt: harness.sandbox.state.cashTransfers[0].transferredAt
        }
    );
    assert.ok(Number.isFinite(Date.parse(harness.sandbox.state.cashTransfers[0].transferredAt)));
    assert.equal(harness.calls.toasts.at(-1).type, 'success');
});

test('late cash transfer responses cannot overwrite a different active building', async () => {
    const harness = createTransferHarness({
        onRpc: async sandbox => {
            sandbox.activeBuildingId = 'building-2';
            return {
                data: {
                    ok: true,
                    version: 5,
                    balances: { main: 90, development: 30, emergency: 30 },
                    transfer_id: 'transfer-123',
                    audit_log_id: 'audit-123'
                },
                error: null
            };
        }
    });
    const previousBalances = { ...harness.sandbox.state.cashAccountBalances };

    await harness.api.submitCashTransfer(harness.event);

    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.sandbox.state.cashAccountBalances)),
        previousBalances
    );
    assert.deepEqual(harness.sandbox.state.cashTransfers, []);
    assert.deepEqual(harness.sandbox.state.auditLogs, []);
    assert.equal(harness.sandbox.activeBuildingVersion, 4);
    assert.equal(harness.calls.renders, 0);
    assert.notEqual(harness.calls.toasts.at(-1)?.type, 'success');
});

test('cash transfer requires the server transfer id before acknowledging a committed write', async () => {
    const harness = createTransferHarness({
        rpcResult: {
            data: {
                ok: true,
                version: 5,
                balances: { main: 90, development: 30, emergency: 30 },
                audit_log_id: 'audit-123'
            },
            error: null
        }
    });

    await harness.api.submitCashTransfer(harness.event);

    assert.equal(harness.calls.toasts.at(-1).type, 'error');
    assert.equal(harness.calls.reset, undefined);
});

test('uncertain cash transfer retries reuse the same idempotency key after a page reload', async () => {
    const storage = new Map();
    const first = createTransferHarness({ sessionStore: storage, rpcThrows: [new Error('connection reset')] });
    await first.api.submitCashTransfer(first.event);
    const requestId = first.calls.rpc[0].args.p_request_id;
    assert.ok(storage.has('manzil:cash-transfer-pending:building-1'));

    const reloaded = createTransferHarness({
        sessionStore: storage,
        rpcResults: [{ data: { ok: true, duplicate: true, version: 5, balances: { main: 90, development: 30, emergency: 30 } }, error: null }]
    });
    await reloaded.api.submitCashTransfer(reloaded.event);
    assert.equal(reloaded.calls.rpc[0].args.p_request_id, requestId);
    assert.equal(storage.has('manzil:cash-transfer-pending:building-1'), false);
    assert.equal(reloaded.calls.toasts.at(-1).type, 'success');
});

test('pending cash transfer retry state is isolated by building id', async () => {
    const storage = new Map();
    const first = createTransferHarness({ sessionStore: storage, rpcThrows: [new Error('connection reset')] });
    await first.api.submitCashTransfer(first.event);

    const otherBuilding = createTransferHarness({ sessionStore: storage });
    otherBuilding.sandbox.activeBuildingId = 'building-2';
    await otherBuilding.api.submitCashTransfer(otherBuilding.event);

    assert.equal(otherBuilding.calls.rpc[0].args.p_building_id, 'building-2');
    assert.notEqual(otherBuilding.calls.rpc[0].args.p_request_id, first.calls.rpc[0].args.p_request_id);
    assert.equal(storage.has('manzil:cash-transfer-pending:building-1'), true);
    assert.equal(storage.has('manzil:cash-transfer-pending:building-2'), false);
});

test('pending transfer payload is restored into the form after reload when form values differ', async () => {
    const storage = new Map();
    const first = createTransferHarness({ sessionStore: storage, rpcThrows: [new Error('connection reset')] });
    await first.api.submitCashTransfer(first.event);

    const reloaded = createTransferHarness({ sessionStore: storage, amount: 15 });
    await reloaded.api.submitCashTransfer(reloaded.event);
    assert.equal(reloaded.calls.rpc.length, 0);
    assert.equal(reloaded.elements.get('cashTransferAmount').value, '15');
    assert.equal(reloaded.calls.toasts.at(-1).type, 'error');
});