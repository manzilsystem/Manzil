const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/supabase-backup.yml'), 'utf8');

test('backup retention removes old private releases and bounds the database catalog', () => {
    assert.ok(workflow.includes('sort_by(.createdAt) | reverse | .[30:][] | .tagName'));
    assert.ok(workflow.includes('gh release delete "$tag" --repo manzilsystem/manzil_backups --yes --cleanup-tag'));
    assert.ok(workflow.includes('DELETE FROM public.backup_catalog WHERE tag NOT IN'));
    assert.ok(workflow.includes('ORDER BY created_at DESC LIMIT 30'));
});

test('retention only deletes releases with the expected backup tag format', () => {
    assert.ok(workflow.includes('[[ "$tag" =~ ^backup-[0-9]{8}T[0-9]{6}Z$ ]]'));
});

test('catalog cleanup receives the database connection environment', () => {
    for (const variable of ['PGPASSWORD', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGSSLMODE']) {
        assert.ok(workflow.includes(variable + ': ${{ env.' + variable + ' }}'));
    }
});
