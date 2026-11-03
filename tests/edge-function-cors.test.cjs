const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const functions = [
    'backup-console',
    'manage-owner-access',
    'complete-owner-pin-change',
];

for (const name of functions) {
    test(`${name} restricts browser access to the configured application origin`, () => {
        const source = fs.readFileSync(
            path.join(__dirname, '..', 'supabase/functions', name, 'index.ts'),
            'utf8'
        );
        assert.match(source, /Deno\.env\.get\('APP_ORIGIN'\)\s*\|\|\s*'https:\/\/manzilsystem\.github\.io'/);
        assert.match(source, /'Access-Control-Allow-Origin':\s*(?:appOrigin)/);
        assert.match(source, /'Vary':\s*'Origin'/);
        assert.doesNotMatch(source, /'Access-Control-Allow-Origin':\s*'\*'/);
    });
}
