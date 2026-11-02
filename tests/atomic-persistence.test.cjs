const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261102220500_atomic_building_snapshot.sql'), 'utf8');
const supabaseSource = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8');

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
    assert.match(migration, /INSERT INTO public\\.residents AS current_resident/);
    assert.match(migration, /INSERT INTO public\\.income AS current_income/);
    assert.match(migration, /INSERT INTO public\\.expenses AS current_expense/);
    assert.ok(migration.indexOf('DELETE FROM public.residents r') < migration.indexOf('DELETE FROM public.building_members bm'));
    assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.persist_building_snapshot[\s\S]*?SECURITY DEFINER/);
});

test('client uses one idempotent RPC instead of multi-request full-table reconciliation', () => {
    assert.match(supabaseSource, /supabaseClient\.rpc\('persist_building_snapshot'/);
    assert.match(supabaseSource, /p_expected_version:\s*activeBuildingVersion/);
    assert.match(supabaseSource, /p_request_id:\s*requestId/);
    assert.doesNotMatch(supabaseSource, /async function deleteMissing/);
    assert.doesNotMatch(supabaseSource, /from\('income'\)\.delete/);
});

test('audit history cannot be cleared from the UI and paid apartments cannot be deleted', () => {
    assert.match(stateSource, /سجل التدقيق محفوظ للمراجعة ولا يمكن مسحه/);
    const crudSource = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');
    assert.match(crudSource, /لا يمكن حذف شقة لها تحصيلات مسجلة/);
    assert.match(crudSource, /state\.income\.some\(payment => payment\.residentId === id\)/);
});


test('snapshot payload preparation failures are handled before any RPC call', () => {
    assert.match(supabaseSource, /let payload;\\s*try \\{\\s*payload = \\{/);
    assert.match(supabaseSource, /Could not prepare Supabase snapshot/);
    assert.match(supabaseSource, /تعذر تجهيز البيانات للحفظ/);
});

test('snapshot payload construction is guarded against invalid timestamps and fields', () => {
    assert.match(supabaseSource, /let payload;\\s*try \\{\\s*payload = \\{/);
    assert.match(supabaseSource, /Could not prepare Supabase snapshot/);
    assert.match(supabaseSource, /تعذر تجهيز البيانات للحفظ/);
});
