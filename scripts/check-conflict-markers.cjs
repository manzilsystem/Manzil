#!/usr/bin/env node
// Fails when a tracked text file still contains git merge-conflict markers.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const SKIP = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz|mp3|mp4|mov)$/i;

// A conflict needs an opening and a closing marker; a lone "=======" (markdown rules) is ignored.
function findMarkers(text) {
    const lines = text.split(/\r?\n/);
    const open = [];
    const close = [];
    lines.forEach((line, index) => {
        if (/^<{7}( |$)/.test(line)) open.push(index + 1);
        else if (/^>{7}( |$)/.test(line)) close.push(index + 1);
    });
    return open.length && close.length ? open.concat(close).sort((x, y) => x - y) : [];
}

function main() {
    const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
    const bad = [];
    for (const file of files) {
        if (SKIP.test(file) || file === 'scripts/check-conflict-markers.cjs') continue;
        let text;
        try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
        const hits = findMarkers(text);
        if (hits.length) bad.push(`${file}:${hits.slice(0, 5).join(',')}`);
    }
    if (bad.length) {
        console.error('Leftover merge-conflict markers found:\n  ' + bad.join('\n  '));
        process.exit(1);
    }
    console.log('no merge-conflict markers in tracked files');
}

if (require.main === module) main();
module.exports = { findMarkers };
