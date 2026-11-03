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
    assert.ok(position('restrict_profile_updates') < position('create_notifications'));
    assert.ok(position('create_notifications') < position('harden_notifications_functions_and_indexes'));
    assert.ok(position('harden_notifications_functions_and_indexes') < position('phase1_security_hardening'));
    assert.ok(position('phase1_security_hardening') < position('move_notification_helpers_private'));
    assert.ok(position('move_notification_helpers_private') < position('backup_catalog_and_restore_queue'));
    assert.ok(position('backup_catalog_and_restore_queue') < position('manual_backup_requests'));
    assert.ok(position('manual_backup_requests') < position('backup_requests_fk_indexes'));
    assert.ok(position('backup_requests_fk_indexes') < position('drop_redundant_notification_index'));
    assert.ok(position('effective_dated_subscription_rates') < position('atomic_subscription_rate_snapshot'));
    assert.ok(position('atomic_subscription_rate_snapshot') < position('optimize_subscription_rate_rls'));
    assert.ok(position('optimize_subscription_rate_rls') < position('drop_legacy_subscription_rate_rpc'));
    assert.ok(position('drop_legacy_subscription_rate_rpc') < position('restrict_subscription_rate_visibility'));
    assert.ok(position('restrict_subscription_rate_visibility') < position('manager_only_resident_notes'));
    assert.ok(position('manager_only_resident_notes') < position('owner_login_rate_limit'));
    assert.ok(position('owner_login_rate_limit') < position('subscription_rate_change_history'));
});
