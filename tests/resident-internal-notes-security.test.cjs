const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261103062659_manager_only_resident_notes.sql'),
    'utf8'
);
const supabaseSource = fs.readFileSync(path.join(root, 'js/supabase.js'), 'utf8');

test('internal resident notes are stored separately and readable only by managers', () => {
    assert.match(migration, /CREATE TABLE public\.resident_internal_notes/i);
    assert.match(migration, /ALTER TABLE public\.resident_internal_notes ENABLE ROW LEVEL SECURITY/i);
    assert.match(migration, /REVOKE ALL ON TABLE public\.resident_internal_notes FROM PUBLIC, anon, authenticated/i);
    assert.match(migration, /GRANT SELECT ON TABLE public\.resident_internal_notes TO authenticated/i);
    assert.match(migration, /CREATE POLICY resident_internal_notes_manager_select[\s\S]*private\.is_building_manager\(building_id\)/i);
});

test('existing notes are migrated and cleared from owner-readable resident rows', () => {
    assert.match(migration, /INSERT INTO public\.resident_internal_notes[\s\S]*FROM public\.residents r[\s\S]*r\.notes/i);
    assert.match(migration, /UPDATE public\.residents\s+SET notes = NULL/i);
});

test('snapshot writes are redirected into the protected table and legacy values are nulled', () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION private\.sync_resident_internal_note/i);
    assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public/i);
    assert.match(migration, /INSERT INTO public\.resident_internal_notes[\s\S]*NEW\.notes/i);
    assert.match(migration, /UPDATE public\.residents\s+SET notes = NULL[\s\S]*WHERE id = NEW\.id/i);
    assert.match(migration, /AFTER INSERT OR UPDATE OF notes ON public\.residents/i);
});

test('only manager sessions fetch internal notes in the browser', () => {
    assert.match(supabaseSource, /currentUserRole === 'manager' \? supabaseQuery\('resident_internal_notes', 'resident_id,notes'\) : Promise\.resolve\(\[\]\)/);
    assert.match(supabaseSource, /if \(currentUserRole === 'manager'\) \{[\s\S]*notesByResident[\s\S]*resident\.notes = notesByResident\.get\(resident\.id\) \|\| ''/);
});
