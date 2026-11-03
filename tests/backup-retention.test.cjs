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

test('catalog cleanup inherits database connection values exported through GITHUB_ENV', () => {
    assert.ok(workflow.includes('docker run --rm -e PGPASSWORD -e PGHOST -e PGPORT -e PGDATABASE -e PGSSLMODE'));
    assert.doesNotMatch(workflow, /\$\{\{ env\.(?:PGPASSWORD|PGHOST|PGPORT|PGDATABASE|PGSSLMODE) \}\}/);
});


test('orphan cleanup runs after successful backup registration and only removes unregistered releases older than 24 hours', () => {
    assert.ok(workflow.includes("if: ${{ success() }}"));
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

test('stale catalog rows are removed only after 24 hours and a confirmed GitHub 404', () => {
    const cleanup = workflow.split('      - name: Clean up stale orphaned backup releases')[1]
        .split('      - name: Complete manual backup request')[0];
    assert.ok(cleanup.includes("created_at < now() - interval '24 hours'"));
    assert.ok(cleanup.includes('gh api --include "repos/manzilsystem/manzil_backups/releases/tags/$tag"'));
    assert.ok(cleanup.includes('if [[ "$http_status" == "404" ]]; then'));
    assert.ok(cleanup.includes('elif [[ "$http_status" == "200" ]]; then'));
    assert.ok(cleanup.includes('Unable to verify GitHub release status'));
    assert.match(cleanup, /DELETE FROM public\.backup_catalog WHERE tag='\$tag' AND created_at < now\(\) - interval '24 hours'/);
});
