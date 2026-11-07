const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('index.html is generated from the template and is up to date', () => {
    const result = execFileSync(process.execPath, ['scripts/build-index.mjs', '--check'], {
        cwd: root,
        encoding: 'utf8'
    });
    assert.match(result, /assets match the release manzil-[0-9a-f]{10}/);
});

test('the generated document contains no unresolved include markers', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(!html.includes('<!-- @include '), 'run npm run build:index after editing src/partials');
});

test('the template stays small and delegates markup to partials', () => {
    const template = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
    assert.ok(template.split('\n').length < 100, 'index.template.html should only contain the document shell');
    for (const partial of ['auth-modals.html', 'header.html', 'main-tabs.html', 'bottom-nav.html', 'modals.html']) {
        assert.ok(template.includes(`<!-- @include ${partial} -->`), partial + ' must be included');
        assert.ok(fs.existsSync(path.join(root, 'src/partials', partial)), partial + ' must exist');
    }
});
