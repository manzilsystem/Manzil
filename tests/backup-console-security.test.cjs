const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'supabase/functions/backup-console/index.ts'),
    'utf8'
);

test('database restore requires manager membership in every building', () => {
    assert.match(source, /\s+const hasGlobalRestoreAccess = async \(\): Promise<boolean \| null>/);
    assert.match(source, /admin\.from\('buildings'\)\.select\('id'\)/);
    assert.match(source, /admin\.from\('building_members'\)[\s\S]*?\.eq\('user_id', auth\.user\.id\)[\s\S]*?\.eq\('role', 'manager'\)/);
    assert.match(source, /buildings\.every\(building =>[\s\S]*?managedMemberships\?\.some\(item => item\.building_id === building\.id\)/);
});

test('restore authorization runs before a restore request can be inserted', () => {
    const restoreBranch = source.split("if (body.action === 'request_restore')")[1];
    assert.ok(restoreBranch, 'request_restore handler must exist');
    const authorizationCheck = restoreBranch.indexOf('await hasGlobalRestoreAccess()');
    const insertRequest = restoreBranch.indexOf("admin.from('restore_requests').insert");
    assert.ok(authorizationCheck >= 0, 'restore must check global authorization');
    assert.ok(insertRequest > authorizationCheck, 'authorization must precede queue insertion');
    assert.match(restoreBranch, /if \(!globalRestoreAccess\) return json\(403, \{ error: 'global_manager_only' \}\)/);
});

test('backup creation remains available to a manager of their building', () => {
    const backupBranch = source.split("if (body.action === 'request_backup')")[1];
    assert.ok(backupBranch, 'request_backup handler must exist');
    assert.match(backupBranch, /admin\.from\('backup_requests'\)[\s\S]*?\.insert\(\{ building_id: membership\.building_id, requested_by: auth\.user\.id \}\)/);
});
