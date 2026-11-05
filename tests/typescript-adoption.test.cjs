const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tsconfig = JSON.parse(read('tsconfig.json'));
const pkg = JSON.parse(read('package.json'));

test('TypeScript adoption stays opt-in per module', () => {
    assert.equal(tsconfig.compilerOptions.checkJs, true);
    assert.equal(tsconfig.compilerOptions.noEmit, true);
    assert.ok(Array.isArray(tsconfig.include));
    assert.ok(tsconfig.include.includes('js/telemetry.js'));
    assert.ok(!tsconfig.include.includes('js/**/*.js'), 'the whole js tree must not be type-checked yet');
});

test('typecheck script and CI step exist', () => {
    assert.equal(pkg.scripts.typecheck, 'tsc -p tsconfig.json');
    assert.match(read('.github/workflows/quality-checks.yml'), /npm run typecheck/);
});

test('Edge Function type-check covers every deployed function', () => {
    const workflow = read('.github/workflows/node-tests.yml');
    assert.match(workflow, /for fn in supabase\/functions\/\*\/index\.ts/);
    const functionsDir = path.join(root, 'supabase', 'functions');
    const deployed = fs.readdirSync(functionsDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join('supabase', 'functions', entry.name, 'index.ts'));
    assert.ok(deployed.length >= 4, 'expected at least four Edge Functions');
    for (const file of deployed) {
        assert.ok(fs.existsSync(path.join(root, file)), `${file} must exist`);
    }
});
