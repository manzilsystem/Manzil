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

test('settlement income has a nullable FK and remains in the existing income ledger', () => {
    assert.match(migration, /ADD COLUMN IF NOT EXISTS settlement_adjustment_id uuid/);
    assert.match(migration, /FOREIGN KEY \(settlement_adjustment_id\)[\s\S]*ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED/);
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
});

test('PostgreSQL integration harness applies and tests the settlement migration', () => {
    assert.match(atomic, /20261106160000_partial_settlement_income\.sql/);
    assert.match(tableGrants, /partial-settlement\.integration\.sql/);
    assert.match(integration, /settlement_payment_exceeds_agreement/);
    assert.match(integration, /unlinked settlement income was accepted/);
    assert.match(integration, /whole snapshot/);
});

test('restore verification requires the settlement link and its index', () => {
    assert.match(restore, /settlement_adjustment_id/);
    assert.match(restore, /income_settlement_adjustment_id_idx/);
});
