const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261103063455_owner_login_rate_limit.sql'),
    'utf8'
);
const hashMigration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261103105902_key_owner_login_rate_limit_hashes.sql'),
    'utf8'
);
const rateLimitMigration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261103140000_check_owner_login_rate_limit.sql'),
    'utf8'
);
const loginFunction = fs.readFileSync(
    path.join(root, 'supabase/functions/owner-login/index.ts'),
    'utf8'
);
const pinChangeFunction = fs.readFileSync(
    path.join(root, 'supabase/functions/complete-owner-pin-change/index.ts'),
    'utf8'
);
const client = fs.readFileSync(path.join(root, 'js/supabase.js'), 'utf8');
const supabaseConfig = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');

test('owner login Edge Function does not require a pre-existing JWT', () => {
    assert.ok(supabaseConfig.includes('[functions.owner-login]'));
    assert.ok(supabaseConfig.includes('verify_jwt = false'));
});

test('owner login attempts are stored privately as hashes with a bounded lockout window', () => {
    assert.ok(hashMigration.includes('DELETE FROM private.owner_login_attempts'));
    assert.match(migration, /CREATE TABLE private\.owner_login_attempts/i);
    assert.match(migration, /phone_hash text PRIMARY KEY CHECK \(phone_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/i);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
    assert.match(migration, /REVOKE ALL ON TABLE private\.owner_login_attempts FROM PUBLIC, anon, authenticated, service_role/i);
    assert.match(migration, /failed_attempts > 5/i);
    assert.match(migration, /interval '15 minutes'/i);
});

test('only the service role can call the owner login rate-limit RPC', () => {
    assert.match(rateLimitMigration, /REVOKE ALL ON FUNCTION public\.owner_login_rate_limit\(text, text\) FROM PUBLIC, anon, authenticated/i);
    assert.match(rateLimitMigration, /GRANT EXECUTE ON FUNCTION public\.owner_login_rate_limit\(text, text\) TO service_role/i);
});

test('owner login hashes the phone, rate-limits before Auth, and never returns a session for invalid credentials', () => {
    assert.match(loginFunction, /crypto\.subtle\.importKey\([\s\S]*?name: 'HMAC'[\s\S]*?hash: 'SHA-256'/i);
    assert.match(loginFunction, /crypto\.subtle\.sign\('HMAC', key/);
    assert.match(loginFunction, /hashPhone\(phone, serviceRoleKey\)/);
    assert.match(loginFunction, /from\('profiles'\)[\s\S]*?eq\('phone', phone\)/);
    assert.match(loginFunction, /from\('building_members'\)[\s\S]*?eq\('role', 'owner'\)/);
    assert.match(loginFunction, /p_action: 'attempt'/);
    assert.match(loginFunction, /status: 429|json\(429,/);
    assert.ok(loginFunction.indexOf("p_action: 'attempt'") < loginFunction.indexOf('signInWithPassword'));
    assert.match(loginFunction, /p_action: 'release'/);
    assert.match(loginFunction, /error: 'invalid_credentials'/);
    assert.match(loginFunction, /session:\s*\{[\s\S]*access_token:[\s\S]*refresh_token:/);
    assert.doesNotMatch(loginFunction, /serviceRoleKey.*access_token/i);
});

test('owner PIN login is routed through the protected Edge Function, while manager email login stays on Auth', () => {
    assert.match(client, /functions\.invoke\('owner-login'/);
    assert.match(client, /auth\.setSession\(/);
    assert.match(client, /auth\.signInWithPassword\(\{ email: identifier, password \}\)/);
});

test('first PIN change shares the same account lockout policy', () => {
    assert.match(pinChangeFunction, /owner_login_rate_limit/);
    assert.match(pinChangeFunction, /p_action: 'attempt'/);
    assert.match(pinChangeFunction, /p_action: 'success'/);
    assert.match(pinChangeFunction, /p_action: 'release'/);
});


test('temporary Auth outages do not consume or clear owner PIN failure counters', () => {
    const loginErrorBranch = loginFunction.slice(loginFunction.indexOf('if (error) {'), loginFunction.indexOf('if (!data.session'));
    assert.match(loginErrorBranch, /error\.status !== 400 && error\.status !== 401/);
    assert.match(loginErrorBranch, /p_action: 'release'/);
    assert.doesNotMatch(loginErrorBranch, /p_action: 'success'/);
    assert.match(loginErrorBranch, /Owner Auth provider unavailable/);

    const pinErrorBranch = pinChangeFunction.slice(
        pinChangeFunction.indexOf('if (verifyError) {'),
        pinChangeFunction.indexOf('if (verified.user?.id')
    );
    assert.match(pinErrorBranch, /verifyError\.status !== 400 && verifyError\.status !== 401/);
    assert.match(pinErrorBranch, /p_action: 'release'/);
    assert.match(pinErrorBranch, /error: 'login_unavailable'/);
});

test('rate limiter releases transient reservations without consuming a failed PIN attempt', () => {
    assert.match(rateLimitMigration, /p_action NOT IN \('attempt', 'release', 'success'\)/);
    assert.match(rateLimitMigration, /p_action = 'release'/);
    assert.match(rateLimitMigration, /failed_attempts = GREATEST\(0, failed_attempts - 1\)/);
    assert.match(rateLimitMigration, /IF v_failed_attempts >= 5 THEN/);
    assert.match(rateLimitMigration, /RETURN jsonb_build_object\('allowed', false, 'retry_after_seconds', 900\)/);
});
