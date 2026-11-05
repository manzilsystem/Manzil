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
    assert.match(crud, /cashAccountCode = (?:\/\*\* @type \{any\} \*\/ \()?document\.getElementById\('expenseCashAccount'\)/);
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

test('cashbox exposes per-fund monthly income, expenses and net transfers', () => {
    assert.match(html, /id="cashboxSummaryMonth"/);
    assert.match(html, /id="cashboxSummaryRows"/);
    assert.match(render, /'cashboxSummaryMonth'/);
    assert.match(cashbox, /function calculateFundMovement\(month\)/);
    assert.match(cashbox, /function renderCashboxMovementSummary\(\)/);
    assert.match(cashbox, /transfersIn/);
    assert.match(cashbox, /transfersOut/);
    assert.match(cashbox, /cashMonthLabelFromIso\(item\.transferredAt\) !== month/);
    assert.match(cashbox, /renderCashboxMovementSummary\(\);/);
});

test('income form shows the selected resident outstanding balance before saving', () => {
    assert.match(html, /id="incomeOutstandingHint"/);
    assert.match(crud, /getMonthOutstanding\(resident, month\)/);
    assert.match(crud, /calculateCumulativeDebt\(resident\.id\)/);
    assert.match(crud, /متأخرات سابقة/);
});

test('hasValidCashboxBalances validates all required cash accounts', () => {
    const sandbox = { module: { exports: {} } };
    const src = cashbox.replace('// @ts-check', '');
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    const fn = vm.runInContext('hasValidCashboxBalances', sandbox);

    assert.equal(fn(null), false);
    assert.equal(fn({}), false);
    assert.equal(fn({ main: 0 }), false);
    assert.equal(fn({ main: 0, development: 0, emergency: 0 }), true);
    assert.equal(fn({ main: -100, development: 0, emergency: 0 }), true);
    assert.equal(fn({ main: 0, development: -50, emergency: 0 }), false);
    assert.equal(fn({ main: 0, development: 0, emergency: -1 }), false);
    assert.equal(fn({ main: 0, development: '100', emergency: 0 }), false);
    assert.equal(fn({ main: 0, development: NaN, emergency: 0 }), false);
    assert.equal(fn({ main: 0, development: 0, emergency: 0, extra: 100 }), false);
});

test('normalizeCashboxSummary validates structure and converts amounts', () => {
    const sandbox = { module: { exports: {} } };
    const src = cashbox.replace('// @ts-check', '');
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    const fn = vm.runInContext('normalizeCashboxSummary', sandbox);

    const valid = {
        balances: { main: 1000, development: 200, emergency: 50 },
        transfers: [{
            id: 't1', from_account_code: 'main', to_account_code: 'development',
            amount: '150.50', transferred_at: '2026-11-01T10:00:00Z', notes: null
        }]
    };
    const result = fn(valid);
    assert.equal(result.balances.main, 1000);
    assert.equal(result.transfers[0].amount, 150.5);

    assert.throws(() => fn(null), /Invalid cashbox summary/);
    assert.throws(() => fn({ balances: { main: 0, development: 0, emergency: 0 }, transfers: 'not-array' }), /Invalid cashbox summary/);
    assert.throws(() => fn({ balances: { main: 0, development: -1, emergency: 0 }, transfers: [] }), /Invalid cashbox summary/);
});

test('collections route into the cash account chosen at collection time', () => {
    const incomeMigration = read('supabase/migrations/20261105090000_income_cash_account_allocation.sql');
    assert.match(incomeMigration, /ALTER TABLE public\.income\s+ADD COLUMN IF NOT EXISTS cash_account_code text NOT NULL DEFAULT 'main'/);
    assert.match(incomeMigration, /income_cash_account_code_check/);
    assert.match(incomeMigration, /CREATE OR REPLACE FUNCTION private\.get_cashbox_summary/);
    assert.match(incomeMigration, /COALESCE\(NULLIF\(payment\.cash_account_code, ''\), 'main'\) = 'main'/);
    assert.match(incomeMigration, /AND payment\.cash_account_code = 'development'/);
    assert.match(incomeMigration, /AND payment\.cash_account_code = 'emergency'/);
    assert.match(incomeMigration, /CREATE OR REPLACE FUNCTION private\.get_monthly_cashbox_close/);
    assert.match(incomeMigration, /SELECT COALESCE\(NULLIF\(payment\.cash_account_code, ''\), 'main'\)::text, 'income'::text/);
    assert.match(incomeMigration, /CREATE OR REPLACE FUNCTION private\.persist_building_snapshot/);
    assert.match(incomeMigration, /RAISE EXCEPTION 'invalid_income_cash_account_code'/);
    assert.match(incomeMigration, /UPDATE public\.income allocated_income/);
    assert.match(incomeMigration, /-- Fund accounts may only spend money explicitly transferred or collected into them\./);
});

test('income forms, snapshots and accounting carry the destination cash account', () => {
    assert.match(html, /id="incomeCashAccount"/);
    assert.match(html, /id="incomeEditCashAccount"/);
    assert.match(crud, /cashAccountCode = (?:\/\*\* @type \{any\} \*\/ \()?document\.getElementById\('incomeCashAccount'\)/);
    assert.match(crud, /cashAccountCode = (?:\/\*\* @type \{any\} \*\/ \()?document\.getElementById\('incomeEditCashAccount'\)/);
    assert.match(crud, /paymentMethod,\s+cashAccountCode,\s+notes: allocationNote/);
    assert.match(supabase, /cash_account_code: i\.cashAccountCode \|\| 'main'/);
    assert.match(supabase, /id,resident_id,amount,month,notes,payment_method,cash_account_code,paid_at/);
    assert.match(cashbox, /income: byAccount\(\)/);
    assert.match(cashbox, /next\.income\[code\] - previous\.income\[code\]/);
    assert.match(render, /getCashAccountLabel\(i\.cashAccountCode \|\| 'main'\)/);
});

test('main balance still sums income and expenses while fund balances follow their own rows', () => {
    assert.match(migration, /'main',[\s\S]*?SUM\(payment\.amount\)/);
    assert.match(migration, /'development',[\s\S]*?to_account_code = 'development'/);
    assert.match(migration, /'emergency',[\s\S]*?to_account_code = 'emergency'/);
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
            income: [{ amount: 100.10 }, { amount: 40.05, cashAccountCode: 'development' }],
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
    sandbox.state.income.push({ amount: 30.30 }, { amount: 12.12, cashAccountCode: 'emergency' });
    sandbox.state.expenses.push(
        { amount: 5.05, cashAccountCode: 'main' },
        { amount: 4.04, cashAccountCode: 'development' },
        { amount: 3.03, cashAccountCode: 'emergency' }
    );

    assert.deepEqual(
        JSON.parse(JSON.stringify(accounting.calculateCashboxAccountingTotals())),
        {
            startingBalance: 102525,
            income: { main: 13040, development: 4005, emergency: 1212 },
            expenses: { main: 5510, development: 2414, emergency: 1308 }
        }
    );
    assert.equal(accounting.syncCashboxBalancesAfterSnapshot(), true);
    assert.deepEqual(
        JSON.parse(JSON.stringify(accounting.getState().cashAccountBalances)),
        { main: 550.50, development: 195.96, emergency: 309.09 }
    );
    assert.equal(accounting.syncCashboxBalancesAfterSnapshot(), true);
    assert.deepEqual(
        JSON.parse(JSON.stringify(accounting.getState().cashAccountBalances)),
        { main: 550.50, development: 195.96, emergency: 309.09 }
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
        `${cashbox}\n({ renderCashbox, previewCashTransfer, getCashAccountBalance })`,
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
    assert.ok(elements.get('cashTransfersList').innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'));
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


test('cash transfer idempotency keys cannot be reused with a different payload', () => {
    const migration = read('supabase/migrations/20261103153941_cash_transfer_idempotency_payload.sql');
    const integration = read('tests/atomic-persistence.integration.sql');
    assert.match(migration, /transfer\.from_account_code, transfer\.to_account_code/);
    assert.match(migration, /v_existing_from_account_code IS DISTINCT FROM p_from_account_code/);
    assert.match(migration, /v_existing_to_account_code IS DISTINCT FROM p_to_account_code/);
    assert.match(migration, /v_existing_amount IS DISTINCT FROM p_amount/);
    assert.match(migration, /v_existing_notes IS DISTINCT FROM NULLIF\(btrim\(p_notes\), ''\)/);
    assert.match(migration, /cash_transfer_idempotency_key_reused/);
    assert.match(integration, /changed cash transfer payload reused an existing request id/);
    assert.match(integration, /cash_transfer_idempotency_key_reused/);
});
