const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261126010000_settlement_counts_subscription_payments.sql'), 'utf8'
);
const atomic = fs.readFileSync(path.join(root, 'tests/atomic-persistence.integration.sql'), 'utf8');
const tableGrants = fs.readFileSync(path.join(root, 'tests/table-grants.integration.sql'), 'utf8');
const snapshotMigration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261106203433_partial_settlement_income.sql'), 'utf8'
);
const reportMigration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261119232103_period_report_rpc.sql'), 'utf8'
);

test('the migration retires the subscription-income ban and redefines the cap', () => {
    // Both rewrites are fail-closed pg_get_functiondef replacements.
    assert.match(migration, /pg_get_functiondef/);
    assert.match(migration, /refusing an unsafe rewrite/);
    assert.match(migration, /private\.persist_building_snapshot\(uuid,bigint,uuid,jsonb\)/);
    assert.match(migration, /private\.get_period_report\(uuid,date,date,text,text,uuid\)/);
    // The ban block is carried verbatim as the replacement target.
    assert.match(migration, /settlement_conflicts_with_subscription_income/);
    // The new cap subtracts the month's subscription payments from the agreement.
    assert.match(migration, /sub_payment\.purpose_code = 'subscription'/);
    assert.match(migration, /SUM\(payment\.amount\) \+ COALESCE/);
    // The report outstanding counts subscription income on settled months too.
    assert.match(migration, /income_rows\.purpose_code = 'subscription'[\s\S]*?income_rows\.settlement_adjustment_id = scoped_resident_months\.settlement_id/);
    // Privileges are restored after the rewrites.
    assert.match(migration, /GRANT EXECUTE ON FUNCTION private\.persist_building_snapshot\(uuid, bigint, uuid, jsonb\)\s+TO authenticated/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION private\.get_period_report\(uuid, date, date, text, text, uuid\)\s+TO authenticated/);
});

test('replacement targets match the deployed function sources verbatim', () => {
    // Guard against drift: the patterns the migration searches for must exist in the
    // migrations that created the deployed bodies, or the fail-closed guard aborts.
    const conflictPattern = /RAISE EXCEPTION 'settlement_conflicts_with_subscription_income'/;
    const capPattern = /GROUP BY settlement\.id, settlement\.amount\s+HAVING SUM\(payment\.amount\) > settlement\.amount/;
    const outstandingPattern = /scoped_resident_months\.settlement_id IS NULL\s+AND income_rows\.purpose_code = 'subscription'/;
    assert.match(snapshotMigration, conflictPattern);
    assert.match(snapshotMigration, capPattern);
    assert.match(reportMigration, outstandingPattern);
    // The migration embeds those exact blocks.
    assert.match(migration, conflictPattern);
    assert.match(migration, capPattern);
    assert.ok(migration.includes("AND (\n                      (scoped_resident_months.settlement_id IS NOT NULL"));
});

test('integration harnesses replay the migration after its dependencies', () => {
    assert.match(atomic, /20261119232103_period_report_rpc\.sql[\s\S]*?20261120090000_period_report_method_share_fix\.sql[\s\S]*?20261126010000_settlement_counts_subscription_payments\.sql/);
    assert.match(tableGrants, /20261120090000_period_report_method_share_fix\.sql[\s\S]*?20261126010000_settlement_counts_subscription_payments\.sql/);
});
