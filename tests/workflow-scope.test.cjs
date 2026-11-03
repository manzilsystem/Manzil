const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const workflow = fs.readFileSync('.github/workflows/node-tests.yml', 'utf8');

function triggerSection(name) {
    const marker = `  ${name}:`;
    const start = workflow.indexOf(marker);
    assert.notEqual(start, -1, `missing ${name} trigger`);
    const following = ['  pull_request:', '  push:', '\npermissions:']
        .map(value => workflow.indexOf(value, start + marker.length))
        .filter(index => index !== -1);
    const end = following.length ? Math.min(...following) : workflow.length;
    return workflow.slice(start, end);
}

test('application CI runs only for changes that can affect app code or tests', () => {
    const requiredPaths = [
        'index.html',
        'css/**',
        'js/**',
        'icons/**',
        'manifest.json',
        'sw.js',
        'supabase/**',
        'tests/**',
        '.github/workflows/**'
    ];

    for (const trigger of ['pull_request', 'push']) {
        const section = triggerSection(trigger);
        assert.match(section, /branches: \[main\]/);
        assert.match(section, /paths:/);
        for (const path of requiredPaths) {
            assert.ok(section.includes(`      - "${path}"`), `${trigger} must include ${path}`);
        }
    }
});

test('docs-only changes do not trigger the Node and PostgreSQL workflow', () => {
    const triggers = ['pull_request', 'push'];
    for (const trigger of triggers) {
        const section = triggerSection(trigger);
        assert.ok(!section.includes('README.md'));
        assert.ok(!section.includes('docs/**'));
    }
});
