const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
const files = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort();
const names = files.map(file => file.replace(/^\d+_/, '').replace(/\.sql$/, ''));
const position = name => names.indexOf(name);

test('local migration history matches the applied Supabase order', () => {
    assert.ok(files.length > 0);
    assert.equal(new Set(files).size, files.length);
    assert.equal(names[0], 'auth_and_rls');
    assert.ok(position('auth_and_rls') < position('harden_rls_helper_exposure'));
    assert.ok(position('harden_rls_helper_exposure') < position('revoke_legacy_rls_function'));
    assert.ok(position('revoke_legacy_rls_function') < position('grant_rls_helper_access'));
    assert.ok(position('grant_rls_helper_access') < position('owner_phone_pin_bootstrap'));
    assert.ok(position('owner_phone_pin_bootstrap') < position('index_missing_foreign_keys'));
    assert.ok(position('index_missing_foreign_keys') < position('restrict_profile_updates'));
});
