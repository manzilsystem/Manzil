const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261101174507_restrict_profile_updates.sql'),
    'utf8'
);
const client = fs.readFileSync(path.join(root, 'js/supabase.js'), 'utf8');
const edgeFunction = fs.readFileSync(
    path.join(root, 'supabase/functions/complete-owner-pin-change/index.ts'),
    'utf8'
);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('authenticated clients cannot update profile rows or the first-login flag directly', () => {
    assert.match(migration, /drop policy if exists profiles_update_self on public\.profiles/i);
    assert.match(migration, /revoke update on table public\.profiles from public, anon, authenticated/i);
    assert.doesNotMatch(
        client,
        /from\(['"]profiles['"]\)\s*\.update\s*\(\s*\{\s*must_change_pin\s*:/i
    );
});

test('owner data stays behind the PIN gate in RLS and the client does not preload it', () => {
    assert.match(migration, /create or replace function private\.owner_pin_change_complete\(\)/i);
    assert.match(migration, /profile\.must_change_pin is true/i);
    for (const policy of [
        'buildings_select_members',
        'residents_manager_or_owner_select',
        'income_manager_or_owner_select',
        'notices_members_select',
    ]) {
        const policyStart = migration.indexOf(`alter policy ${policy}`);
        assert.notEqual(policyStart, -1, `migration must update ${policy}`);
        const nextPolicyStart = migration.indexOf('\nalter policy ', policyStart + 1);
        const policySql = migration.slice(policyStart, nextPolicyStart === -1 ? undefined : nextPolicyStart);
        assert.match(policySql, /owner_pin_change_complete\(\)/);
    }
    const loadState = client.match(/async function loadState\(\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(loadState, 'loadState must exist');
    assert.ok(
        loadState.indexOf('if (ownerMustChangePin)') < loadState.indexOf(".from('buildings')"),
        'the client must stop before loading building data when PIN change is required'
    );
});

test('first PIN change requires the current PIN and goes through the protected server function', () => {
    assert.match(html, /id="currentOwnerPin"/);
    assert.match(html, /id="currentOwnerPin"[^>]*maxlength="8"/);
    assert.match(client, /functions\.invoke\(['"]complete-owner-pin-change['"]/);
    assert.match(client, /current_pin:\s*currentPin/);
    assert.match(edgeFunction, /profile\.must_change_pin !== true/);
    assert.match(edgeFunction, /normalizePin\(payload\.current_pin, true\)/);
    assert.match(edgeFunction, /normalizePin\(payload\.new_pin\)/);
    assert.match(edgeFunction, /\.eq\(['"]role['"],\s*['"]owner['"]\)/);
    assert.match(edgeFunction, /currentPin === newPin/);
    assert.match(edgeFunction, /signInWithPassword\(/);
    assert.match(edgeFunction, /owner_login_rate_limit/);
    assert.match(edgeFunction, /crypto\.subtle\.importKey\([\s\S]*?name: 'HMAC'/i);
    assert.match(edgeFunction, /hashPhone\(profile\.phone, serviceRoleKey\)/);
    assert.match(client, /errorCode === 'rate_limited'/);
    assert.match(client, /showFirstOwnerPinChange\(.*retryMinutes/);
    assert.match(edgeFunction, /p_action: 'attempt'/);
    assert.match(edgeFunction, /p_action: 'success'/);
    assert.match(edgeFunction, /admin\.auth\.admin\.updateUserById/);
    assert.match(edgeFunction, /must_change_pin:\s*false/);
    assert.ok(
        edgeFunction.indexOf('admin.auth.admin.updateUserById') <
            edgeFunction.indexOf('must_change_pin: false'),
        'the server must change the Auth password before opening the first-login data gate'
    );
    assert.match(edgeFunction, /if \(passwordError\) \{/);
    assert.match(edgeFunction, /\[400, 401, 403, 422, 429\]\.includes\(status\)/);
    assert.match(edgeFunction, /error: 'pin_update_failed'/);
    assert.match(edgeFunction, /error: 'pin_update_status_unknown'/);
    assert.match(edgeFunction, /catch \(error\) \{[\s\S]*?pin_update_status_unknown/);
    assert.match(edgeFunction, /Auth credential update request failed without a confirmed outcome/);
    assert.match(edgeFunction, /Auth credential update outcome is unknown/);
    assert.match(edgeFunction, /pin_updated_retry_required/);
    assert.match(client, /errorCode === 'pin_update_status_unknown'/);
    assert.match(client, /errorCode === 'pin_update_failed'/);
    const retryStart = client.indexOf("if (errorCode === 'pin_updated_retry_required')");
    const retryEnd = client.indexOf("\n        if (errorCode === 'pin_update_status_unknown')", retryStart);
    const retryBranch = client.slice(retryStart, retryEnd);
    assert.ok(retryStart >= 0 && retryEnd > retryStart, 'client must reconcile profile state after an uncertain completion response');
    assert.ok(retryBranch.indexOf('await loadState()') < retryBranch.indexOf('showFirstOwnerPinChange'));
});
