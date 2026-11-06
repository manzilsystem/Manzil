const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261106030000_resident_adjustments.sql'),
    'utf8'
);
const restoreVerify = fs.readFileSync(path.join(root, 'tests/post-restore-verify.sql'), 'utf8');
const pgIntegration = fs.readFileSync(path.join(root, 'tests/table-grants.integration.sql'), 'utf8');

test('resident adjustments keep one ledger row per settlement month', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.resident_adjustments/);
    assert.match(migration, /resident_id uuid NOT NULL REFERENCES public\.residents\(id\) ON DELETE CASCADE/);
    assert.match(migration, /effective_month date NOT NULL/);
    assert.match(migration, /kind IN \('waiver', 'discount', 'settlement'\)/);
    assert.match(migration, /amount numeric\(12,2\) NOT NULL/);
    assert.match(migration, /resident_adjustments_amount_check CHECK \(amount > 0\)/);
    assert.match(migration, /EXTRACT\(DAY FROM effective_month\) = 1/);
    assert.match(migration, /resident_adjustments_reason_check CHECK \(btrim\(reason\) <> ''\)/);
    assert.match(migration, /REFERENCES auth\.users\(id\)/);
    assert.match(migration, /resident_adjustments_building_month_idx/);
    assert.match(migration, /resident_adjustments_resident_month_idx/);
});

test('resident adjustments are manager/owner readable and never directly writable', () => {
    assert.match(migration, /ALTER TABLE public\.resident_adjustments ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /REVOKE ALL ON public\.resident_adjustments FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /GRANT SELECT ON public\.resident_adjustments TO authenticated/);
    assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE|ALL)[\s\S]{0,40}resident_adjustments/i);
    assert.match(migration, /CREATE POLICY resident_adjustments_manager_or_owner_select/);
    assert.match(migration, /member\.role = 'manager'/);
    assert.match(migration, /resident\.user_id = \(SELECT auth\.uid\(\)\)/);
});

test('restore verification and CI cover the settlement ledger', () => {
    assert.match(restoreVerify, /'resident_adjustments'/);
    assert.match(restoreVerify, /resident_adjustments table missing/);
    assert.match(restoreVerify, /resident_adjustments_building_month_idx/);
    assert.match(pgIntegration, /\\ir \.\.\/supabase\/migrations\/20261106030000_resident_adjustments\.sql/);
    assert.match(pgIntegration, /resident_adjustments/);
});
