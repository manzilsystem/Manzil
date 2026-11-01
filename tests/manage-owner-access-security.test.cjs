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
