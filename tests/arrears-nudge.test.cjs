const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const sqlName = '20261126_arrears_reminder_nudge.sql';
const sql = fs.readFileSync(path.join(root, 'supabase', 'manual', sqlName), 'utf8');
const access = fs.readFileSync(path.join(root, 'js', 'access.js'), 'utf8');

test('the arrears nudge SQL is kept out of the auto-applied migrations folder', () => {
    assert.equal(fs.existsSync(path.join(root, 'supabase', 'migrations', sqlName)), false);
    assert.equal(fs.readdirSync(path.join(root, 'supabase', 'migrations')).some(name => /arrears_reminder_nudge/.test(name)), false);
});

test('the arrears nudge SQL never messages tenants, stores no secret and carries no number', () => {
    assert.match(sql, /target_user_id, target_resident_id/);
    assert.match(sql, /v_building\.id, null, null, 'collection_due', v_dedupe_key/);
    assert.doesNotMatch(sql, /vault\.|http_post|net\.http|secret\s*=|password|token/i);
    assert.match(sql, /on conflict \(building_id, target_scope, dedupe_key\) do nothing/);
    assert.match(sql, /arrears-nudge:/);
    assert.match(sql, /where not exists \(\s+select 1 from public\.notifications n\s+where n\.building_id = v_building\.id\s+and n\.dedupe_key = v_dedupe_key/);
    assert.match(sql, /Known edges/);
    assert.match(sql, /revoke all on function private\.queue_arrears_reminder_nudges\(\)/);
});

test('tapping the nudge opens the reminders list in the app', () => {
    assert.match(access, /target === '#arrears-reminders' && typeof openArrearsRemindersList === 'function'/);
    assert.match(sql, /'#arrears-reminders'/);
});
