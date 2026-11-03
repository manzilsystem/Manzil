const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/supabase-backup.yml'), 'utf8');

test('backup retention removes old private releases and bounds the database catalog', () => {
    assert.match(workflow, /sort_by\\(\\.createdAt\\) \\| reverse \\| \\[\\.\\.\\.30\\]/);
    assert.match(workflow, /gh release delete ".*--cleanup-tag/);
    assert.match(workflow, /DELETE FROM public\\.backup_catalog WHERE tag NOT IN/);
    assert.match(workflow, /ORDER BY created_at DESC LIMIT 30/);
});

test('retention only deletes releases with the expected backup tag format', () => {
    assert.match(workflow, /backup-\\[0-9\\]\\{8\\}T\\[0-9\\]\\{6\\}Z/);
});

test('catalog cleanup receives the database connection environment', () => {
    for (const variable of ['PGPASSWORD', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGSSLMODE']) {
        assert.ok(workflow.includes(variable + ': ${{ env.' + variable + ' }}'));
    }
});
