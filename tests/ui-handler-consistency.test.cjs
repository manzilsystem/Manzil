const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const jsDir = path.join(root, 'js');
const srcDir = path.join(root, 'src');

const BUILTINS = new Set([
    'window', 'document', 'event', 'this', 'console', 'location', 'history', 'navigator',
    'Math', 'JSON', 'Date', 'Number', 'String', 'Boolean', 'Array', 'Object', 'RegExp',
    'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'clearTimeout', 'setInterval',
    'clearInterval', 'alert', 'confirm', 'prompt', 'encodeURIComponent', 'decodeURIComponent'
]);

function listFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(full) : [full];
    });
}

// Names the browser UI can call: top-level declarations, assignments to a
// function/arrow, and explicit `window.x =` exports across every runtime module.
function declaredNames() {
    const declared = new Set();
    for (const file of fs.readdirSync(jsDir).filter(name => name.endsWith('.js'))) {
        const source = fs.readFileSync(path.join(jsDir, file), 'utf8');
        for (const match of source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) declared.add(match[1]);
        for (const match of source.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/gm)) declared.add(match[1]);
        for (const match of source.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) declared.add(match[1]);
    }
    return declared;
}

const HANDLER_ATTR = /on(?:click|change|input|submit|blur|focus|keydown|keyup|keypress|load|error|toggle)\s*=\s*"([^"]*)"/g;

test('every inline UI handler maps to a declared runtime function', () => {
    const declared = declaredNames();
    const htmlFiles = [path.join(root, 'index.html'), ...listFiles(srcDir).filter(file => file.endsWith('.html'))];

    const missing = [];
    let scanned = 0;
    for (const file of htmlFiles) {
        const html = fs.readFileSync(file, 'utf8');
        for (const attr of html.matchAll(HANDLER_ATTR)) {
            for (const call of attr[1].matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
                const name = call[2];
                if (BUILTINS.has(name) || declared.has(name)) continue;
                scanned += 1;
                missing.push(`${name} in ${path.relative(root, file)}: ${attr[1].trim()}`);
            }
        }
    }

    assert.deepEqual(missing, [], 'inline handlers call functions that no module declares:\n' + missing.join('\n'));
    assert.ok(declared.size > 300, 'a meaningful number of runtime functions must be discovered');
});
