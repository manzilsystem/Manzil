const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'supabase/functions/manage-owner-access/index.ts'),
    'utf8'
);

function position(text) {
    const index = source.indexOf(text);
    assert.notEqual(index, -1, `expected to find ${text}`);
    return index;
}

test('temporary owner PIN uses WebCrypto and contains eight digits', () => {
    assert.match(source, /crypto\.getRandomValues\(random\)/);
    assert.match(source, /String\(10000000 \+ \(random\[0\] % 90000000\)\)/);
});

test('reissuing an existing owner PIN waits until profile, membership, and resident linking succeed', () => {
    assert.match(source, /let createdNewUser = false/);
    assert.match(source, /if \(ownerUserId\)/);
    assert.match(source, /admin\.auth\.admin\.updateUserById/);

    const authUpdate = position('admin.auth.admin.updateUserById');
    const profileSave = position('admin.from(\'profiles\').upsert');
    const membershipSave = position('admin.from(\'building_members\').upsert');
    const residentLink = position("admin.from('residents').update");

    assert.ok(
        profileSave < authUpdate && membershipSave < authUpdate && residentLink < authUpdate,
        'an existing owner PIN must not change before all account links are saved'
    );
});

test('existing-owner reissue remains distinct from new-user creation', () => {
    assert.match(
        source,
        /if \(createdNewUser && ownerUserId\) await admin\.auth\.admin\.deleteUser\(ownerUserId\)/
    );
    assert.match(source, /if \(!createdNewUser && ownerUserId\)\s*\{[\s\S]*?updateUserById/);
});

test('an orphan phone profile is reused only when it has no resident or building links', () => {
    const guardStart = position('if (existingProfile && existingProfile.id !== resident.user_id) {');
    const guardEnd = position('const temporaryPin = generateTemporaryPin()');
    const guard = source.slice(guardStart, guardEnd);

    assert.match(guard, /if \(ownerUserId\) return json\(409, \{ error: 'phone_already_linked' \}\)/);
    assert.match(guard, /from\('residents'\)[\s\S]*?eq\('user_id', existingProfile\.id\)[\s\S]*?maybeSingle\(\)/);
    assert.match(guard, /from\('building_members'\)[\s\S]*?eq\('user_id', existingProfile\.id\)[\s\S]*?maybeSingle\(\)/);
    assert.match(guard, /if \(linkedResident \|\| existingMembership\)[\s\S]*?phone_already_linked/);
    assert.ok(guard.indexOf('if (linkedResident || existingMembership)') < guard.indexOf('ownerUserId = existingProfile.id'));
    assert.match(guard, /ownerUserId = existingProfile\.id/);
});

test('failure to verify orphan-account links fails closed without adopting the profile', () => {
    const guardStart = position('if (existingProfile && existingProfile.id !== resident.user_id) {');
    const guardEnd = position('const temporaryPin = generateTemporaryPin()');
    const guard = source.slice(guardStart, guardEnd);

    assert.match(guard, /residentLinkLookupError \|\| membershipLookupError/);
    assert.match(guard, /profile_link_lookup_failed/);
    assert.ok(guard.indexOf('profile_link_lookup_failed') < guard.indexOf('ownerUserId = existingProfile.id'));
});


test('provisioning snapshots are captured after a new Auth user is created', () => {
    const createUser = position('admin.auth.admin.createUser');
    const createdFlag = position('createdNewUser = true');
    const membershipSnapshot = position('const { data: previousMembership');
    const profileSnapshot = position(".from('profiles')\n    .select('*')\n    .eq('id', ownerUserId)");
    assert.ok(createUser < createdFlag && createdFlag < membershipSnapshot);
    assert.ok(membershipSnapshot < profileSnapshot);
});

test('provisioning failures compensate resident, membership, profile, and audit changes', () => {
    assert.ok(source.includes('residentSnapshot = { user_id: resident.user_id, phone: resident.phone }'));
    assert.ok(source.includes(".from('building_members').upsert(previousMembership)"));
    assert.ok(source.includes(".from('profiles').upsert(profileSnapshot)"));
    assert.ok(source.includes(".from('audit_logs').delete().eq('id', auditId)"));
    assert.ok(source.includes('owner_access_compensation_audit_failed'));
    assert.ok(source.includes('provisioning_compensation_failed'));
});

test('new Auth user cleanup restores the resident phone after the Auth cascade', () => {
    const deleteUser = position('admin.auth.admin.deleteUser(ownerUserId)');
    const residentRestore = position('owner_access_compensation_new_user_resident_failed');
    assert.ok(deleteUser < residentRestore);
    assert.ok(source.includes('user_id: residentSnapshot.user_id,'));
    assert.ok(source.includes('phone: residentSnapshot.phone,'));
});

test('audit persistence is required before changing an existing owner PIN', () => {
    const auditInsert = position("admin.from('audit_logs').insert");
    const authUpdate = position('admin.auth.admin.updateUserById');
    assert.ok(auditInsert < authUpdate);
    assert.match(source, /if \\(auditError \\|\\| !auditEntry\\) return await failWithCompensation\\('audit_log_save_failed'\\)/);
});
