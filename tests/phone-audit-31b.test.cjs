const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const modals = fs.readFileSync('src/partials/modals.html', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');

test('backup refresh row wraps so the button never leaves the card on 360px', () => {
    assert.match(modals, /<div class="flex flex-wrap items-center justify-between gap-2">\s*<p id="backupRefreshNotice"[^>]*min-w-0 flex-1 basis-40/);
    assert.match(modals, /onclick="loadBackupConsole\(\)"[^>]*shrink-0 min-h-\[2\.75rem\]/);
});

test('assistant composer hint wraps instead of cutting the sentence on small phones', () => {
    assert.match(css, /#assistantInputHint \{ max-width: 12rem; white-space: normal;/);
    assert.doesNotMatch(css, /#assistantInputHint \{[^}]*text-overflow: ellipsis/);
});
