const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ownerLogin = read('supabase/functions/owner-login/index.ts');
const pinChange = read('supabase/functions/complete-owner-pin-change/index.ts');
const manageAccess = read('supabase/functions/manage-owner-access/index.ts');

test('owner-login stays public but rate-limits every syntactically valid probe', () => {
    assert.doesNotMatch(ownerLogin, /request\.headers\.get\('Authorization'\)/);
    assert.doesNotMatch(ownerLogin, /auth\.getUser/);
    assert.match(ownerLogin, /admin\.rpc\('owner_login_rate_limit',[\s\S]*?p_phone_hash: phoneHash,[\s\S]*?p_action: 'attempt'/);
    assert.match(ownerLogin, /hashPhone\(phone, serviceRoleKey\)/);
    assert.match(ownerLogin, /crypto\.subtle\.importKey[\s\S]*?'HMAC', hash: 'SHA-256'/);
    assert.match(ownerLogin, /rateLimit\?\.allowed !== true[\s\S]*?429, \{ error: 'rate_limited'/);
    assert.match(ownerLogin, /'Retry-After': String\(retryAfter\)/);
    // Attempts are counted before the profile lookup so unknown numbers cannot bypass lockout.
    const attemptIndex = ownerLogin.indexOf("p_action: 'attempt'");
    const profileIndex = ownerLogin.indexOf(".from('profiles')");
    assert.ok(attemptIndex > 0 && profileIndex > attemptIndex, 'rate limit must run before the profile lookup');
});

test('owner-login never reveals whether a phone or account exists', () => {
    const invalidCredentialResponses = ownerLogin.match(/error: 'invalid_credentials'/g) || [];
    assert.ok(invalidCredentialResponses.length >= 3, 'unknown phone, missing membership, and bad PIN share one error');
    assert.doesNotMatch(ownerLogin, /user_not_found|account_not_found|phone_not_registered/);
});

test('owner-login releases attempts on infrastructure failures and resets on success', () => {
    assert.match(ownerLogin, /p_action: 'release'/);
    assert.match(ownerLogin, /p_action: 'success'/);
});

test('owner-login does not log credentials or PIN material', () => {
    assert.doesNotMatch(ownerLogin, /console\.(?:log|error|warn)\([^)]*\bpin\b/i);
    assert.doesNotMatch(ownerLogin, /console\.(?:log|error|warn)\([^)]*payload/i);
});

test('complete-owner-pin-change requires a verified owner session and the first-login gate', () => {
    const unauthorizedIndex = pinChange.indexOf("return json(401, { error: 'unauthorized' })");
    const getUserIndex = pinChange.indexOf('auth.getUser(token)');
    assert.ok(unauthorizedIndex > 0 && getUserIndex > unauthorizedIndex, 'Bearer token must be verified before use');
    assert.match(pinChange, /profile\.must_change_pin !== true[\s\S]*?pin_change_not_required/);
    assert.match(pinChange, /\.eq\('role', 'owner'\)/);
    assert.match(pinChange, /owner_login_rate_limit/);
    assert.match(pinChange, /verified\.user\?\.id !== callerData\.user\.id/);
});

test('complete-owner-pin-change updates Auth before clearing the gate and handles partial failure', () => {
    const passwordUpdateIndex = pinChange.indexOf('admin.auth.admin.updateUserById');
    const flagClearIndex = pinChange.indexOf(".update({ must_change_pin: false })");
    assert.ok(passwordUpdateIndex > 0 && flagClearIndex > passwordUpdateIndex, 'Auth password must change before the gate clears');
    assert.match(pinChange, /\.eq\('must_change_pin', true\)/);
    assert.match(pinChange, /pin_updated_retry_required/);
    assert.match(pinChange, /pin_update_status_unknown/);
});

test('manage-owner-access is manager-only and scoped to the caller building', () => {
    const unauthorizedIndex = manageAccess.indexOf("return json(401, { error: 'unauthorized' })");
    const membershipIndex = manageAccess.indexOf(".eq('role', 'manager')");
    const residentIndex = manageAccess.indexOf(".from('residents')");
    assert.ok(unauthorizedIndex > 0 && membershipIndex > unauthorizedIndex && residentIndex > membershipIndex,
        'caller verification and manager membership must precede resident access');
    assert.match(manageAccess, /\.eq\('building_id', membership\.building_id\)/);
    assert.match(manageAccess, /must_change_pin: true/);
    assert.match(manageAccess, /temporary_pin: temporaryPin/);
    assert.match(manageAccess, /first_login_pin_change_required: true/);
});

test('manage-owner-access compensates failed provisioning instead of leaving partial links', () => {
    assert.match(manageAccess, /async function compensateProvisioning/);
    assert.match(manageAccess, /failWithCompensation\('profile_save_failed'\)/);
    assert.match(manageAccess, /failWithCompensation\('membership_save_failed'\)/);
    assert.match(manageAccess, /failWithCompensation\('resident_link_failed'\)/);
    assert.match(manageAccess, /provisioning_compensation_failed/);
});
