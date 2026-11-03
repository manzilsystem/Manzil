const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github/workflows/supabase-restore.yml'),
    'utf8'
);

test('restore worker retrieves the trusted digest from the database catalog', () => {
    assert.match(workflow, /LEFT JOIN public\.backup_catalog b ON b\.tag = r\.backup_tag/);
    assert.match(workflow, /COALESCE\(b\.sha256, ''\)/);
    assert.match(workflow, /expected_sha.*\^\[a-f0-9\]\{64\}\$/);
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

test('restore request claiming retains row-level concurrency locking', () => {
    assert.match(workflow, /FOR UPDATE OF r SKIP LOCKED/);
});
