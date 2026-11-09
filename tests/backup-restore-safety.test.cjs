'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ui = read('js/backup.js');
const html = read('index.html');
const edge = read('supabase/functions/backup-console/index.ts');
const backupWorkflow = read('.github/workflows/supabase-backup.yml');
const restoreWorkflow = read('.github/workflows/supabase-restore.yml');
const migrations = [
    read('supabase/migrations/20261102223654_backup_catalog_and_restore_queue.sql'),
    read('supabase/migrations/20261102225117_manual_backup_requests.sql')
].join('\n');

test('backup console requires a verified manager session', () => {
    assert.match(edge, /authorization\.startsWith\('Bearer '\)/);
    assert.match(edge, /if \(!token\) return json\(401, \{ error: 'unauthorized' \}\)/);
    assert.match(edge, /caller\.auth\.getUser\(token\)/);
    assert.match(edge, /eq\('role', 'manager'\)/);
    assert.match(edge, /if \(memberError\) return json\(500, \{ error: 'membership_check_failed' \}\)/);
    assert.match(edge, /if \(!membership\) return json\(403, \{ error: 'manager_only' \}\)/);
});

test('database-wide restore requires management access to every building', () => {
    assert.match(edge, /hasGlobalRestoreAccess/);
    assert.match(edge, /buildings\.every\(building =>/);
    assert.match(edge, /if \(!globalRestoreAccess\) return json\(403, \{ error: 'global_manager_only' \}\)/);
    assert.match(edge, /body\.confirmation !== 'RESTORE'/);
    assert.match(edge, /\^backup-\\d\{8\}T\\d\{6\}Z\$/);
});

test('cached backup metadata is display-only and never enables destructive actions', () => {
    assert.match(ui, /renderBackupConsole\(cached, true\)/);
    assert.match(ui, /const restoreAllowed = !cached && data\.canRestore !== false/);
    assert.match(ui, /restoreButton\.disabled = !restoreAllowed \|\|/);
    assert.match(ui, /createButton\.disabled = cached \|\|/);
    assert.match(ui, /callBackupConsole\(\{ action: 'list' \}\)/);
    assert.doesNotMatch(ui, /github\.com|api\.github\.com/i);
});

test('restore UI requires explicit confirmation and a second typed confirmation', () => {
    assert.match(ui, /pendingRestoreTag = tag/);
    assert.match(ui, /openModal\('restoreConfirmModal'\)/);
    assert.match(html, /id="restoreConfirmInput"/);
    assert.match(html, /اكتب <strong dir="ltr">RESTORE<\/strong>/);
    assert.match(ui, /confirmation !== 'RESTORE'/);
    assert.match(ui, /action: 'request_restore', backup_tag: tag, confirmation/);
    const typedGate = ui.indexOf("confirmation !== 'RESTORE'");
    const request = ui.indexOf("action: 'request_restore', backup_tag: tag, confirmation");
    assert.ok(typedGate >= 0 && request > typedGate, 'the typed confirmation must gate the restore request');
});

test('backup archive is validated and excludes backup control tables', () => {
    assert.match(backupWorkflow, /--format=custom/);
    assert.match(backupWorkflow, /--exclude-table=public\.backup_catalog/);
    assert.match(backupWorkflow, /--exclude-table=public\.restore_requests/);
    assert.match(backupWorkflow, /--exclude-table=public\.backup_requests/);
    assert.match(backupWorkflow, /sha256sum --check/);
    assert.match(backupWorkflow, /pg_restore --list/);
    assert.match(backupWorkflow, /backup-\$timestamp/);
});

test('restore verifies the trusted catalog digest before an atomic database restore', () => {
    assert.match(restoreWorkflow, /expected_sha/);
    assert.match(restoreWorkflow, /actual_sha.*expected_sha/);
    assert.match(restoreWorkflow, /pg_restore --list/);
    assert.match(restoreWorkflow, /--clean --if-exists --single-transaction --exit-on-error/);
    assert.match(restoreWorkflow, /FOR UPDATE SKIP LOCKED/);
});

test('backup and restore requests are mutually exclusive and protected against duplicate work', () => {
    assert.match(edge, /restore_already_pending/);
    assert.match(edge, /backup_already_pending/);
    assert.match(migrations, /backup_requests_one_active_idx/);
    assert.match(migrations, /restore_requests_one_active_idx/);
    assert.match(restoreWorkflow, /backup_requests WHERE status IN \('queued','dispatched'\)/);
});

test('backup retention keeps exactly the latest 30 catalog entries and prunes catalog after releases', () => {
    assert.match(backupWorkflow, /row_number\(\) OVER \(ORDER BY created_at DESC, tag DESC\)/);
    assert.equal((backupWorkflow.match(/WHERE backup_rank > 30/g) || []).length, 2);
    assert.doesNotMatch(backupWorkflow, /interval '30 days'/);
    const releaseDelete = backupWorkflow.indexOf('gh release delete "$tag"', backupWorkflow.indexOf('Retain the latest 30 backups'));
    const catalogDelete = backupWorkflow.lastIndexOf('DELETE FROM public.backup_catalog WHERE tag IN');
    assert.ok(releaseDelete >= 0);
    assert.ok(catalogDelete > releaseDelete);
    assert.match(backupWorkflow, /http_status.*"404"/);
    assert.match(backupWorkflow, /Unable to verify backup release/);
});


test('backup request fails closed when restore queue state cannot be verified', () => {
    assert.match(edge, /pendingRestoreError/);
    assert.match(edge, /if \(pendingRestoreError\) return json\(500, \{ error: 'maintenance_state_check_failed' \}\)/);
});

test('restore request fails closed when backup lookup or either maintenance queue query fails', () => {
    assert.match(edge, /if \(backupError\) return json\(500, \{ error: 'backup_lookup_failed' \}\)/);
    assert.match(edge, /pendingError \|\| pendingBackupError/);
    assert.match(edge, /if \(error\) return json\(500, \{ error: 'status_query_failed' \}\)/);
});

test('backup and restore workers share a non-cancelling database maintenance lock', () => {
    assert.match(backupWorkflow, /group: supabase-database-maintenance/);
    assert.match(restoreWorkflow, /group: supabase-database-maintenance/);
    assert.match(backupWorkflow, /cancel-in-progress: false/);
    assert.match(restoreWorkflow, /cancel-in-progress: false/);
});


test('backup catalog only enables downloads for a verified global manager', () => {
    assert.match(edge, /const \[globalAccess, \{ data: backups/);
    assert.match(edge, /canDownload: globalAccess/);
    assert.match(edge, /canRestore: globalAccess/);
    assert.match(ui, /backupDownloadAllowed = !cached && data\.canDownload === true/);
    assert.match(ui, /const restoreAllowed = !cached && data\.canRestore !== false/);
});

test('full database backup download is restricted to global managers and a server-held GitHub token', () => {
    assert.match(edge, /body\.action === 'download_backup'/);
    assert.match(edge, /if \(!globalAccess\) return json\(403, \{ error: 'global_manager_only' \}\)/);
    assert.match(edge, /Deno\.env\.get\('BACKUP_REPO_TOKEN'\)/);
    assert.match(edge, /\.select\('tag,file_name,size_bytes,sha256'\)/);
    assert.match(edge, /backup_checksum_mismatch/);
    assert.match(edge, /backup_asset_digest_mismatch/);
    assert.match(edge, /checksumMatch\[2\]\.split\('\/'\)\.pop\(\) !== filename/);
    assert.match(edge, /X-Backup-SHA256/);
    assert.match(edge, /release-assets\.githubusercontent\.com/);
    assert.doesNotMatch(ui, /BACKUP_REPO_TOKEN|manzil_backups|api\.github\.com/i);
});

test('full backup download UI verifies the SHA-256 digest before saving the file', () => {
    assert.match(html, /id="backupDownloadButton"/);
    assert.match(html, /onclick="downloadDatabaseBackup\(\)"/);
    assert.match(ui, /backupDownloadAllowed = !cached && data\.canDownload === true/);
    assert.match(ui, /crypto\.subtle\.digest\('SHA-256'/);
    assert.match(ui, /actualSha !== expectedSha\.toLowerCase\(\)/);
    assert.match(ui, /backupDownloadInProgress/);
});


test('direct backup downloads require a server-verified digest and a trusted short-lived asset redirect', () => {
    assert.match(edge, /body\.action === 'download_backup' \|\| body\.action === 'prepare_download'/);
    assert.match(edge, /if \(!dumpAsset\.digest\) return json\(409, \{ error: 'provider_digest_unavailable' \}\)/);
    assert.match(edge, /redirect: 'manual'/);
    assert.match(edge, /release-assets\.githubusercontent\.com', 'objects\.githubusercontent\.com'/);
    assert.match(edge, /downloadUrl: directUrl\.toString\(\)/);
});

test('client prefers browser-managed direct download and retains checksum-verified proxy fallback', () => {
    assert.match(ui, /action: 'prepare_download'/);
    assert.match(ui, /'unknown_action'\]/);
    assert.match(ui, /directUrl\.protocol !== 'https:'/);
    assert.match(ui, /directUrl\.hostname/);
    assert.match(ui, /action: 'download_backup'/);
    assert.match(ui, /crypto\.subtle\.digest\('SHA-256'/);
});

test('backup tags are validated by one central tested matcher', () => {
    assert.match(ui, /const BACKUP_TAG_PATTERN = \/\^backup-\\d\{8\}T\\d\{6\}Z\$\//);
    assert.match(ui, /function isValidBackupTag\(tag\)/);
    assert.match(ui, /function backupTimestampFromTag\(tag\)/);
    assert.match(ui, /!isValidBackupTag\(tag\)\) return;/);
    assert.match(ui, /backupTimestampFromTag\(tag\)\}\.dump/);
    assert.ok(!ui.includes(String.raw`!/^backup-\d{8}T\d{6}Z$/.test(tag)`),
        'the download guard must delegate to the shared matcher');
    const sliceOccurrences = ui.split(String.raw`tag.slice('backup-'.length)`).length - 1;
    assert.equal(sliceOccurrences, 1,
        'the timestamp prefix must be stripped only inside the shared matcher');
});

test('the central backup tag matcher accepts only real UTC release tags', () => {
    const vm = require('node:vm');
    const sandbox = {};
    const api = vm.runInNewContext(
        `${ui}\n({ isValidBackupTag, backupTimestampFromTag })`,
        sandbox,
        { filename: 'backup-tag.js' }
    );
    assert.equal(api.isValidBackupTag('backup-20261107T022300Z'), true);
    assert.equal(api.backupTimestampFromTag('backup-20261107T022300Z'), '20261107T022300Z');
    assert.equal(api.isValidBackupTag('backup-20261107T02230Z'), false);
    assert.equal(api.isValidBackupTag('backup-20261107T022300'), false);
    assert.equal(api.isValidBackupTag('backup-20261107t022300z'), false);
    assert.equal(api.isValidBackupTag(''), false);
    assert.equal(api.isValidBackupTag(undefined), false);
    assert.equal(api.backupTimestampFromTag('not-a-tag'), '');
});


test('manual backup creation reports status in its own status region', () => {
    assert.match(ui, /getElementById\('backupCreateStatus'\)/);
    assert.match(ui, /if \(createStatus && !cached\)/);
    assert.match(ui, /latestBackup\?\.status === 'succeeded'/);
    assert.match(ui, /latestBackup\?\.status === 'failed'/);
    const request = ui.slice(ui.indexOf('async function requestDatabaseBackup'), ui.indexOf('async function requestDatabaseRestore'));
    assert.match(request, /getElementById\('backupCreateStatus'\)/);
    assert.doesNotMatch(request, /getElementById\('backupRestoreStatus'\)/);
    assert.match(html, /id="backupCreateStatus" role="status" aria-live="polite"/);
});
