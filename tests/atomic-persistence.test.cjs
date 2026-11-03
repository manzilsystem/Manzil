const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261103000000_atomic_building_snapshot.sql'), 'utf8');
const subscriptionMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261103025013_atomic_subscription_rate_snapshot.sql'), 'utf8');
const supabaseSource = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8');

const themeMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261103050000_allow_all_five_themes.sql'), 'utf8');

test('snapshot writes are atomic and guarded by a per-building optimistic version', () => {
    assert.match(migration, /ADD COLUMN IF NOT EXISTS state_version bigint NOT NULL DEFAULT 1/);
    assert.match(migration, /UNIQUE \(building_id, request_id\)/);
    assert.match(migration, /FOR UPDATE/);
    assert.match(migration, /IF v_version <> p_expected_version THEN/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION private\.persist_building_snapshot/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.persist_building_snapshot/);
    assert.match(migration, /SECURITY INVOKER/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.persist_building_snapshot/);
    assert.match(migration, /REVOKE ALL ON FUNCTION private\.persist_building_snapshot/);
    assert.match(migration, /AS \$fn\$[\s\S]*?\$fn\$;/);
    assert.match(migration, /SET search_path = pg_catalog, public/);
    assert.match(migration, /income_resident_not_in_snapshot/);
    assert.match(migration, /cannot_delete_resident_with_income_history/);
    assert.match(subscriptionMigration, /subscription_rate_(resident|month|amount)/);
    assert.match(subscriptionMigration, /INSERT INTO public\.resident_subscription_rates AS current_rate/);
    assert.match(subscriptionMigration, /p_payload->'subscription_rates'/);
    assert.match(subscriptionMigration, /CREATE OR REPLACE FUNCTION private\.persist_building_snapshot/);
    assert.ok(migration.includes('INSERT INTO public.residents AS current_resident'));
    assert.ok(migration.includes('INSERT INTO public.income AS current_income'));
    assert.ok(migration.includes('INSERT INTO public.expenses AS current_expense'));
    assert.ok(migration.indexOf('DELETE FROM public.residents r') < migration.indexOf('DELETE FROM public.building_members bm'));
    assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.persist_building_snapshot[\s\S]*?SECURITY DEFINER/);
});

test('client uses one idempotent RPC instead of multi-request full-table reconciliation', () => {
    assert.match(supabaseSource, /supabaseClient\.rpc\('persist_building_snapshot'/);
    assert.match(supabaseSource, /p_expected_version:\s*activeBuildingVersion/);
    assert.match(supabaseSource, /p_request_id:\s*requestId/);
    assert.doesNotMatch(supabaseSource, /async function deleteMissing/);
    assert.doesNotMatch(supabaseSource, /from\('income'\)\.delete/);
    assert.match(supabaseSource, /subscription_rates:\s*state\.residents\.flatMap/);
    const rateAdapter = fs.readFileSync(path.join(root, 'js', 'subscription-rates.js'), 'utf8');
    assert.doesNotMatch(rateAdapter, /originalSaveState|set_resident_subscription_rate/);
});

test('audit history cannot be cleared from the UI and paid apartments cannot be deleted', () => {
    assert.match(stateSource, /سجل التدقيق محفوظ للمراجعة ولا يمكن مسحه/);
    const crudSource = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');
    assert.match(crudSource, /لا يمكن حذف شقة لها تحصيلات مسجلة/);
    assert.match(crudSource, /state\.income\.some\(payment => payment\.residentId === id\)/);
});


test('snapshot payload construction is guarded against invalid timestamps and fields', () => {
    assert.ok(supabaseSource.includes('let payload;'));
    assert.ok(supabaseSource.includes("console.error('Could not prepare Supabase snapshot:'"));
    assert.ok(supabaseSource.includes('تعذر تجهيز البيانات للحفظ'));
});

test('database constraint accepts all five themes supported by the UI', () => {
    for (const theme of ['dark', 'light', 'emerald', 'ocean', 'sand']) {
        assert.ok(themeMigration.includes(`'${theme}'`));
    }
    assert.match(supabaseSource, /\['dark', 'light', 'emerald', 'ocean', 'sand'\]\.includes\(building\.current_theme\)/);
});

test('subscription rate RLS caches auth identity and indexes created_by foreign key', () => {
    const optimization = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261103025143_optimize_subscription_rate_rls.sql'), 'utf8');
    assert.match(optimization, /bm\.user_id = \(SELECT auth\.uid\(\)\)/);
    assert.match(optimization, /resident_subscription_rates_created_by_idx/);
});

test('unused legacy subscription SECURITY DEFINER RPC is removed', () => {
    const cleanup = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261103030212_drop_legacy_subscription_rate_rpc.sql'), 'utf8');
    assert.match(cleanup, /DROP FUNCTION IF EXISTS public\.set_resident_subscription_rate\(uuid, uuid, date, numeric\)/);
    assert.doesNotMatch(supabaseSource, /set_resident_subscription_rate/);
});
