'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { findSecrets, trackedFiles } = require('../scripts/check-secrets.cjs');

test('CI audits production dependencies after install', () => {
    const workflow = read('.github/workflows/quality-checks.yml');
    const install = workflow.indexOf('run: npm ci');
    const audit = workflow.indexOf('npm audit --omit=dev --audit-level=high');

    assert.ok(install >= 0, 'npm ci step is missing');
    assert.ok(audit > install, 'production dependency audit must run after install');
});

test('CI skips the evaluation artifact upload when an earlier gate stops the run', () => {
    const workflow = read('.github/workflows/quality-checks.yml');
    assert.match(workflow, /if: always\(\) && hashFiles\('test-results\/assistant-evaluation\.json'\) != ''/);
    assert.doesNotMatch(workflow, /if-no-files-found: error/);
});

test('npm ci installs the Chart.js version used by the vendored bundle', () => {
    const manifest = JSON.parse(read('package.json'));
    const lock = JSON.parse(read('package-lock.json'));
    const pinned = lock.packages['node_modules/chart.js'].version;
    const escaped = pinned.replace(/\./g, '\\.');

    assert.equal(manifest.devDependencies['chart.js'], `^${pinned}`);
    assert.equal(lock.packages[''].devDependencies['chart.js'], `^${pinned}`);
    assert.match(read('vendor/chart.umd.js'), new RegExp(`Chart\\.js v${escaped}`));
});

test('CI runs the live Supabase connectivity check as an informational step', () => {
    const workflow = read('.github/workflows/quality-checks.yml');
    assert.match(workflow, /run: npm run check:supabase/);
});

test('CI scans tracked files for credentials after install', () => {
    const workflow = read('.github/workflows/quality-checks.yml');
    const install = workflow.indexOf('run: npm ci');
    const scan = workflow.indexOf('npm run check:secrets');

    assert.ok(install >= 0);
    assert.ok(scan > install);
});

test('secret scanner detects credential shapes but ignores placeholders', () => {
    // تُبنى الأنماط ديناميكيًا حتى لا يكتشفها فاحص الأسرار في ملف الاختبار نفسه.
    const accessToken = 'sbp_' + 'a1b2c3d4e5f6g7h8i9j0';
    const secretKey = 'sb_secret_' + 'a1b2c3d4e5f6g7h8i9j0';
    const real = findSecrets(`token=${accessToken}\nkey=${secretKey}\n`);
    assert.deepEqual(real.map((finding) => finding.name).sort(), [
        'supabase_access_token',
        'supabase_secret_key',
    ]);

    assert.deepEqual(
        findSecrets('SUPABASE_ACCESS_TOKEN=sbp_...\n# sb_secret_<المفتاح>\n'),
        []
    );
});

test('secret scanner never reads the ignored .env file', () => {
    assert.ok(!trackedFiles().includes('.env'));
});

test('the vendored XLSX bundle is only used to write reports, never to parse untrusted files', () => {
    const source = read('js/reports/shared/excel-exporter.js');
    assert.match(source, /XLSX\.writeFile/);
    assert.doesNotMatch(source, /XLSX\.(?:read|readFile)\s*\(/);
});
