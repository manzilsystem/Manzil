const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261106160000_partial_settlement_income.sql'),
    'utf8'
);
const atomic = fs.readFileSync(path.join(root, 'tests/atomic-persistence.integration.sql'), 'utf8');
const integration = fs.readFileSync(path.join(root, 'tests/partial-settlement.integration.sql'), 'utf8');
const tableGrants = fs.readFileSync(path.join(root, 'tests/table-grants.integration.sql'), 'utf8');
const restore = fs.readFileSync(path.join(root, 'tests/post-restore-verify.sql'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const state = fs.readFileSync(path.join(root, 'js/state.js'), 'utf8');
const crud = fs.readFileSync(path.join(root, 'js/crud.js'), 'utf8');
const supabase = fs.readFileSync(path.join(root, 'js/supabase.js'), 'utf8');
const reports = fs.readFileSync(path.join(root, 'js/reports.js'), 'utf8');

test('settlement income has a nullable FK and remains in the existing income ledger', () => {
    assert.match(migration, /ADD COLUMN IF NOT EXISTS settlement_adjustment_id uuid/);
    assert.match(migration, /FOREIGN KEY \(settlement_adjustment_id\)[\s\S]*ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED/);
    assert.match(migration, /income_settlement_adjustment_id_idx/);
    assert.match(migration, /'other', 'settlement'/);
    assert.match(migration, /resident_adjustments_one_settlement_per_month_idx/);
});

test('snapshot RPC validates linked settlement income and cumulative cap atomically', () => {
    assert.match(migration, /invalid_settlement_payment_link/);
    assert.match(migration, /settlement_payment_exceeds_agreement/);
    assert.match(migration, /settlement_conflicts_with_subscription_income/);
    assert.match(migration, /settlement_exceeds_month_due/);
    assert.match(migration, /FOR UPDATE/);
    assert.match(migration, /COALESCE\(EXCLUDED\.settlement_adjustment_id, current_income\.settlement_adjustment_id\)/);
    assert.match(migration, /WHEN current_income\.settlement_adjustment_id IS NOT NULL[\s\S]*?THEN current_income\.purpose_code/);

});

test('PostgreSQL integration harness applies and tests the settlement migration', () => {
    assert.match(atomic, /20261106160000_partial_settlement_income\.sql/);
    assert.match(tableGrants, /partial-settlement\.integration\.sql/);
    assert.match(integration, /settlement_payment_exceeds_agreement/);
    assert.match(integration, /settlement_exceeds_month_due/);
    assert.match(integration, /settlement_conflicts_with_adjustment/);
    assert.match(integration, /settlement_conflicts_with_subscription_income/);
    assert.match(integration, /unlinked settlement income was accepted/);
    assert.match(integration, /whole snapshot/);
});

test('restore verification requires the settlement link and its index', () => {
    assert.match(restore, /settlement_adjustment_id/);
    assert.match(restore, /income_settlement_adjustment_id_idx/);
});

test('application links each settlement payment to one agreement and displays the remaining balance', () => {
    assert.match(html, /id="incomeSettlementSelect"/);
    assert.match(html, /<option value="settlement">سداد تسوية<\/option>/);
    assert.match(html, /<option value="settlement">تسوية متفق عليها<\/option>/);
    assert.match(crud, /settlementAdjustmentId: row\.settlementAdjustmentId/);
    assert.match(crud, /getSettlementRemainingAmount\(settlementAdjustment\)/);
    assert.match(crud, /purpose !== 'settlement'\) amountInput\?\.removeAttribute\('max'\)/);
    assert.match(crud, /const first = labels\.find\(month => getMonthOutstanding\(resident, month\) > 0[\s\S]*?getSettlementAdjustmentForMonth\(resident\.id, month\)/);
    assert.match(crud, /const payable = new Set\(labels\.filter\(month => getMonthOutstanding\(resident, month\) > 0[\s\S]*?getSettlementAdjustmentForMonth\(resident\.id, month\)/);
    assert.match(crud, /refreshIncomeSettlementOptions\(resident\?\.id \|\| ''\);\s*handleIncomeSettlementChange\(\);/);
    assert.match(state, /function getSettlementRemainingAmount/);
    assert.match(supabase, /settlement_adjustment_id: i\.settlementAdjustmentId/);
    assert.match(reports, /settlementAgreedCents/);
    assert.match(reports, /settlementRemainingCents/);
});
