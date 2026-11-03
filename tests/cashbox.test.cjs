const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20261103105908_cashbox_funds_and_transfers.sql');
const cashbox = read('js/cashbox.js');
const supabase = read('js/supabase.js');
const state = read('js/state.js');
const crud = read('js/crud.js');
const render = read('js/render.js');
const app = read('js/app.js');
const html = read('index.html');

test('cash accounts use the existing financial source of truth', () => {
    assert.match(migration, /cash_account_code text NOT NULL DEFAULT 'main'/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.cash_transfers/);
    assert.match(migration, /UNIQUE \(building_id, request_id\)/);
    assert.match(migration, /private\.get_cashbox_summary/);
    assert.match(migration, /public\.get_cashbox_summary/);
    assert.match(migration, /private\.transfer_cash_between_accounts/);
    assert.match(migration, /public\.transfer_cash_between_accounts/);
    assert.match(migration, /cash_account_code = EXCLUDED\.cash_account_code/);
    assert.match(migration, /insufficient_fund_balance/);
    assert.match(migration, /state_version = state_version \+ 1/);
    assert.match(migration, /INSERT INTO public\.audit_logs/);
});

test('cash transfers are manager-only, read-only to clients, and idempotent', () => {
    assert.match(migration, /ALTER TABLE public\.cash_transfers ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /REVOKE ALL ON public\.cash_transfers FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /GRANT SELECT ON public\.cash_transfers TO authenticated/);
    assert.match(migration, /cash_transfers_manager_read[\s\S]*?member\.role = 'manager'/);
    assert.match(migration, /transfer\.request_id = p_request_id/);
    assert.match(migration, /v_version <> p_expected_version/);
    assert.match(cashbox, /p_expected_version: activeBuildingVersion/);
    assert.match(cashbox, /if \(data\?\.conflict\)[\s\S]*?await loadState\(\)/);
    assert.match(cashbox, /if \(data\.duplicate\)[\s\S]*?await loadState\(\)/);
    assert.match(migration, /FOR UPDATE/);
    assert.match(migration, /insufficient_balance/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.transfer_cash_between_accounts/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.transfer_cash_between_accounts[\s\S]*TO authenticated/);
    assert.doesNotMatch(migration, /GRANT (?:ALL|INSERT|UPDATE|DELETE) ON public\.cash_transfers TO authenticated/);
});

test('expense submissions preserve the selected cash account and preview its balance', () => {
    assert.match(html, /id="expenseCashAccount"/);
    assert.match(crud, /cashAccountCode = document\.getElementById\('expenseCashAccount'\)/);
    assert.match(crud, /getCashAccountBalance\(cashAccountCode\)/);
    assert.match(crud, /cashAccountCode, date: new Date\(\)\.toISOString\(\)/);
    assert.match(supabase, /cash_account_code: e\.cashAccountCode \|\| 'main'/);
    assert.match(supabase, /cashAccountCode: row\.cash_account_code \|\| 'main'/);
});

test('cashbox screens and summaries are manager-only in the application', () => {
    assert.match(state, /cashAccountBalances: \{ main: 0, development: 0, emergency: 0 \}/);
    assert.match(state, /cashTransfers: \[\]/);
    assert.match(supabase, /currentUserRole === 'manager'[\s\S]*?get_cashbox_summary/);
    assert.match(supabase, /initializeCashboxAccountingSnapshot\(\)/);
    assert.match(cashbox, /if \(currentUserRole !== 'manager'\) return/);
    assert.match(render, /renderCashbox\(\)/);
    assert.match(app, /'dashboard','income','expenses','cashbox','residents','reports'/);
    assert.match(html, /id="tab-cashbox"/);
    assert.match(html, /id="cashTransfersList"/);
    assert.match(html, /id="cashBalance-total"/);
    assert.match(cashbox, /reduce\(\(sum, code\) => sum \+ getCashAccountBalance\(code\), 0\)/);
    assert.match(html, /src="js\/cashbox\.js"/);
});

test('main balance includes all income while fund balances are backed by transfers', () => {
    assert.match(migration, /'main',[\s\S]*?SUM\(payment\.amount\)/);
    assert.match(migration, /'development',[\s\S]*?to_account_code = 'development'/);
    assert.match(migration, /'emergency',[\s\S]*?to_account_code = 'emergency'/);
    assert.match(migration, /-- Fund accounts may only spend money explicitly transferred into them/);
});

test('all client-side JavaScript modules parse without syntax errors', () => {
    const jsDirectory = path.join(root, 'js');
    for (const file of fs.readdirSync(jsDirectory).filter(name => name.endsWith('.js'))) {
        assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(jsDirectory, file), 'utf8'), { filename: file }), file);
    }
});


test('cashbox UI applies starting balance, collection and expense deltas in cents', () => {
    const sandbox = {
        state: {
            startingBalance: 1000,
            income: [{ amount: 100.10 }],
            expenses: [
                { amount: 50.05, cashAccountCode: 'main' },
                { amount: 20.10, cashAccountCode: 'development' },
                { amount: 10.05, cashAccountCode: 'emergency' }
            ],
            cashAccountBalances: { main: 500, development: 200, emergency: 300 }
        }
    };
    const accounting = vm.runInNewContext(
        `${cashbox}\n({ calculateCashboxAccountingTotals, initializeCashboxAccountingSnapshot, syncCashboxBalancesAfterSnapshot, getState: () => state })`,
        sandbox,
        { filename: 'js/cashbox.js' }
    );

    accounting.initializeCashboxAccountingSnapshot();
    sandbox.state.startingBalance += 25.25;
    sandbox.state.income.push({ amount: 30.30 });
    sandbox.state.expenses.push(
        { amount: 5.05, cashAccountCode: 'main' },
        { amount: 4.04, cashAccountCode: 'development' },
        { amount: 3.03, cashAccountCode: 'emergency' }
    );

    assert.deepEqual(
        JSON.parse(JSON.stringify(accounting.calculateCashboxAccountingTotals())),
        {
            startingBalance: 102525,
            income: 13040,
            expenses: { main: 5510, development: 2414, emergency: 1308 }
        }
    );
    assert.equal(accounting.syncCashboxBalancesAfterSnapshot(), true);
    assert.deepEqual(
        JSON.parse(JSON.stringify(accounting.getState().cashAccountBalances)),
        { main: 550.50, development: 195.96, emergency: 296.97 }
    );
    assert.equal(accounting.syncCashboxBalancesAfterSnapshot(), true);
    assert.deepEqual(
        JSON.parse(JSON.stringify(accounting.getState().cashAccountBalances)),
        { main: 550.50, development: 195.96, emergency: 296.97 }
    );
});


function createCashboxDomSandbox(overrides = {}) {
    const { state: stateOverrides = {}, currentUserRole = 'manager', ...elementOverrides } = overrides;
    const elements = new Map();
    const makeElement = (id, initial = {}) => {
        const element = {
            id,
            textContent: '',
            innerHTML: '',
            value: '',
            disabled: false,
            className: '',
            classes: new Set(),
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
    [
        'cashBalance-main', 'cashBalance-development', 'cashBalance-emergency',
        'cashBalance-total', 'cashTransfersList', 'cashTransferPreview',
        'cashTransferPreviewText', 'cashTransferSubmitButton',
        'cashTransferFrom', 'cashTransferTo', 'cashTransferAmount'
    ].forEach(id => makeElement(id));
    Object.assign(elements.get('cashTransferFrom'), { value: 'main' });
    Object.assign(elements.get('cashTransferTo'), { value: 'development' });
    Object.assign(elements.get('cashTransferAmount'), { value: '10' });
    for (const [id, value] of Object.entries(elementOverrides)) {
        const element = elements.get(id);
        if (!element) throw new Error(`Unknown cashbox test element: ${id}`);
        Object.assign(element, value);
    }

    const sandbox = {
        state: {
            cashAccountBalances: { main: 100, development: 20, emergency: 30 },
            cashTransfers: [],
            ...stateOverrides
        },
        currentUserRole,
        document: { getElementById: id => elements.get(id) || null },
        fmtNum: value => Number(value).toFixed(2),
        formatDate: value => String(value || ''),
        esc: value => String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]),
        console
    };
    const api = vm.runInNewContext(
        `${cashbox}\\n({ renderCashbox, previewCashTransfer, getCashAccountBalance })`,
        sandbox,
        { filename: 'js/cashbox.js' }
    );
    return { api, elements, sandbox };
}

test('cashbox renderer displays all three balances, total and safely escaped transfer history', () => {
    const { api, elements } = createCashboxDomSandbox({
        state: {
            cashAccountBalances: { main: 1120, development: 150, emergency: 175 },
            cashTransfers: [{
                fromAccountCode: 'main',
                toAccountCode: 'development',
                amount: 400,
                notes: '<img src=x onerror=alert(1)>',
                transferredAt: '2026-11-03'
            }]
        }
    });

    api.renderCashbox();

    assert.equal(elements.get('cashBalance-main').textContent, '1120.00 ج.م');
    assert.equal(elements.get('cashBalance-development').textContent, '150.00 ج.م');
    assert.equal(elements.get('cashBalance-emergency').textContent, '175.00 ج.م');
    assert.equal(elements.get('cashBalance-total').textContent, '1445.00 ج.م');
    assert.match(elements.get('cashTransfersList').innerHTML, /&lt;img src=x onerror=alert\\(1\\)&gt;/);
    assert.doesNotMatch(elements.get('cashTransfersList').innerHTML, /<img/);
});

test('cashbox renderer does not expose manager balances in the owner role', () => {
    const { api, elements } = createCashboxDomSandbox({
        currentUserRole: 'owner',
        state: { cashAccountBalances: { main: 900, development: 0, emergency: 0 } }
    });

    api.renderCashbox();

    assert.equal(elements.get('cashBalance-main').textContent, '');
    assert.equal(elements.get('cashBalance-total').textContent, '');
});

test('cash transfer preview disables invalid and over-balance transfers', () => {
    const { api, elements } = createCashboxDomSandbox();

    elements.get('cashTransferAmount').value = '125';
    api.previewCashTransfer();
    assert.equal(elements.get('cashTransferSubmitButton').disabled, true);
    assert.match(elements.get('cashTransferPreviewText').textContent, /الرصيد المتاح/);

    elements.get('cashTransferTo').value = 'main';
    elements.get('cashTransferAmount').value = '10';
    api.previewCashTransfer();
    assert.equal(elements.get('cashTransferSubmitButton').disabled, true);
    assert.match(elements.get('cashTransferPreviewText').textContent, /صندوقين مختلفين/);

    elements.get('cashTransferTo').value = 'development';
    elements.get('cashTransferAmount').value = '25';
    api.previewCashTransfer();
    assert.equal(elements.get('cashTransferSubmitButton').disabled, false);
    assert.match(elements.get('cashTransferPreviewText').textContent, /الرصيد بعد التحويل/);
});
