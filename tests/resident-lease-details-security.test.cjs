const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('tenant details use a separate manager-only table with no direct client writes', () => {
    const migration = read('supabase/migrations/20261106215500_resident_lease_details.sql');
    assert.match(migration, /CREATE TABLE public\.resident_lease_details/);
    assert.match(migration, /ALTER TABLE public\.resident_lease_details ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /resident_lease_details_manager_select[\s\S]*private\.is_building_manager\(building_id\)/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.resident_lease_details FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /GRANT SELECT ON TABLE public\.resident_lease_details TO authenticated/);
    assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public/);
    assert.match(migration, /private\.persist_building_snapshot\(/);
    assert.match(migration, /WHERE resident_payload\.value \? 'is_rented'/);
    assert.match(migration, /NOT COALESCE\(\(v_result->>'duplicate'\)::boolean, false\)/);
});

test('only manager sessions load tenant details and owner portal never queries them', () => {
    const supabase = read('js/supabase.js');
    const access = read('js/access.js');
    assert.match(supabase, /const residentLeaseDetailsQuery = isManager[\s\S]*from\('resident_lease_details'\)/);
    assert.match(supabase, /: Promise\.resolve\(\{ data: \[\], error: null \}\);/);
    assert.doesNotMatch(access, /tenantName|tenantPhone|leaseStart|rentAmount|resident_lease_details/);
});

test('tenant details appear only in the manager apartment form and manager profile', () => {
    const crud = read('js/crud.js');
    const modal = read('src/partials/modals.html');
    const reports = read('js/reports.js');
    const restoreVerification = read('tests/post-restore-verify.sql');
    assert.match(modal, /id="residentIsRented"/);
    assert.match(modal, /بيانات المستأجر تظهر للمدير فقط/);
    assert.match(crud, /function openResidentModal\(mode, id\) \{\s*if \(!requireManager\(\)\) return;/);
    assert.match(crud, /function openResidentProfile\(residentId\) \{\s*if \(!requireManager\(\)\) return;/);
    assert.match(crud, /resident\.isRented === true \?/);
    assert.doesNotMatch(reports, /tenantName|tenantPhone|leaseStart|rentAmount|depositAmount/);
    assert.match(restoreVerification, /resident_lease_details/);
    assert.match(restoreVerification, /resident_lease_details_manager_select/);
});

test('legacy JSON backups remain valid and tenant details are normalized on import', () => {
    const backup = read('js/backup.js');
    assert.match(backup, /r\.isRented === undefined \|\| typeof r\.isRented === 'boolean'/);
    assert.match(backup, /isRented: r\.isRented === true/);
    assert.match(backup, /tenantName: typeof r\.tenantName === 'string'/);
    assert.match(backup, /leaseStart: r\.leaseStart \|\| null/);
});
