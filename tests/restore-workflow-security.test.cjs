const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github/workflows/supabase-restore.yml'),
    'utf8'
);

test('restore worker retrieves and validates the trusted digest from the database catalog', () => {
    assert.ok(workflow.includes("COALESCE((SELECT b.sha256 FROM public.backup_catalog b WHERE b.tag=r.backup_tag), '')"));
    assert.ok(workflow.includes('if [[ ! "$expected_sha" =~ ^[a-f0-9]{64}$ ]]; then'));
});

test('restore archive must match the catalog digest before pg_restore validation or execution', () => {
    const catalogDigestCheck = workflow.indexOf('[[ "$actual_sha" == "$expected_sha" ]]');
    const archiveValidation = workflow.indexOf('pg_restore --list');
    const restoreExecution = workflow.indexOf('pg_restore --host=');
    assert.ok(catalogDigestCheck >= 0, 'catalog checksum comparison must exist');
    assert.ok(archiveValidation > catalogDigestCheck, 'archive validation must follow catalog checksum comparison');
    assert.ok(restoreExecution > catalogDigestCheck, 'database restore must follow catalog checksum comparison');
});

test('restore retains the existing archive checksum and custom-format validation', () => {
    assert.match(workflow, /sha256sum --check "\$filename\.sha256"/);
    assert.match(workflow, /pg_restore --list "\/backup\/\$filename"/);
    assert.match(workflow, /--single-transaction --exit-on-error/);
});

test('restore request is claimed atomically with SKIP LOCKED', () => {
    assert.ok(workflow.includes("WITH next_request AS (SELECT r.id FROM public.restore_requests r WHERE r.status='queued' ORDER BY r.created_at LIMIT 1 FOR UPDATE SKIP LOCKED) UPDATE public.restore_requests r SET status='running'"));
    assert.ok(workflow.includes("RETURNING r.id::text || '|' || r.backup_tag || '|' || COALESCE((SELECT b.sha256 FROM public.backup_catalog b WHERE b.tag=r.backup_tag), '')"));
    assert.doesNotMatch(workflow, /FOR UPDATE OF r SKIP LOCKED/);
});
test('missing or malformed catalog digest is terminally failed before download or restore', () => {
    const invalidDigest = workflow.indexOf('if [[ ! "$expected_sha" =~');
    const failUpdate = workflow.indexOf("status='failed',finished_at=now(),result_message='بصمة النسخة غير موجودة أو غير صالحة في سجل النسخ'");
    const download = workflow.indexOf('gh release download');
    assert.ok(invalidDigest >= 0, 'catalog digest must be validated');
    assert.ok(failUpdate > invalidDigest, 'invalid digest must transition the claimed request to failed');
    assert.ok(download > failUpdate, 'invalid digest must fail before downloading or restoring');
    assert.match(workflow, /trap - ERR/);
});

test('abandoned restore requests are failed after a safe timeout', () => {
    assert.ok(workflow.includes("timeout-minutes: 45"));
    assert.ok(workflow.includes("WHERE status='running' AND started_at IS NOT NULL AND started_at < now() - interval '60 minutes'"));
    assert.ok(workflow.includes("توقفت مهمة الاستعادة دون إكمال؛ لم تتم إعادة المحاولة تلقائياً"));
    const staleRecovery = workflow.indexOf("started_at < now() - interval '60 minutes'");
    const claimNext = workflow.indexOf('WITH next_request AS');
    assert.ok(staleRecovery >= 0 && staleRecovery < claimNext, 'stale requests must be closed before claiming a new request');
    assert.doesNotMatch(workflow, /UPDATE public\\.restore_requests SET status='queued'/);
});
