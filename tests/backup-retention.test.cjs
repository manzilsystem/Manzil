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


test('orphan cleanup runs after a failed registration and only removes unregistered releases older than 24 hours', () => {
    assert.ok(workflow.includes("if: ${{ always() && env.PGHOST != '' }}"));
    assert.ok(workflow.includes('SELECT tag FROM public.backup_catalog'));
    assert.ok(workflow.includes('age_seconds >= 86400'));
    assert.ok(workflow.includes('grep -Fxq -- "$tag" "$registered" && continue'));
    assert.ok(workflow.includes('gh release delete "$tag" --repo manzilsystem/manzil_backups --yes --cleanup-tag'));
});

test('orphan cleanup validates backup release tags before deletion', () => {
    assert.ok(workflow.includes('[[ "$tag" =~ ^backup-[0-9]{8}T[0-9]{6}Z$ ]] || continue'));
});


test('orphan cleanup shell command continuations use a single backslash', () => {
    const cleanup = workflow.split('      - name: Clean up stale orphaned backup releases')[1]
        .split('      - name: Complete manual backup request')[0];
    assert.doesNotMatch(cleanup, /\\\\\\n/);
    assert.match(cleanup, /docker run --rm[^\n]*\\\n/);
    assert.match(cleanup, /gh release list[^\n]*\\\n/);
});
