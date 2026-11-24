'use strict';

// فحص أسرار خفيف على الملفات المتتبعة في Git فقط.
// لا يقرأ .env (مستبعد أصلاً) ولا يطبع القيم؛ يعرض نوع السر وموقعه وطوله فقط.
// الاستعمال: npm run check:secrets

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SKIP_PREFIXES = ['vendor/', 'test-results/', 'node_modules/'];

const PATTERNS = [
    { name: 'supabase_access_token', regex: /\bsbp_[A-Za-z0-9]{20,}/g },
    { name: 'supabase_secret_key', regex: /\bsb_secret_[A-Za-z0-9]{20,}/g },
    { name: 'github_token', regex: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
    { name: 'aws_access_key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
    { name: 'private_key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g },
];

function trackedFiles(root = ROOT) {
    const output = execFileSync('git', ['ls-files', '-z'], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    });
    return output.split('\0').filter(Boolean);
}

function findSecrets(text) {
    const findings = [];
    for (const { name, regex } of PATTERNS) {
        regex.lastIndex = 0;
        for (const match of text.matchAll(regex)) {
            findings.push({ name, value: match[0], index: match.index });
        }
    }
    return findings;
}

function scanFile(filePath, root = ROOT) {
    const fullPath = path.join(root, filePath);
    const stats = fs.statSync(fullPath);
    if (!stats.isFile() || stats.size > MAX_FILE_BYTES) return [];

    const buffer = fs.readFileSync(fullPath);
    if (buffer.includes(0)) return [];

    return findSecrets(buffer.toString('utf8')).map((finding) => ({
        ...finding,
        file: filePath,
        line: buffer.slice(0, finding.index).toString('utf8').split('\n').length,
    }));
}

function scanRepository(root = ROOT) {
    const findings = [];
    for (const file of trackedFiles(root)) {
        if (SKIP_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
        findings.push(...scanFile(file, root));
    }
    return findings;
}

function main() {
    const findings = scanRepository();
    if (findings.length === 0) {
        console.log('check:secrets: no credentials found in tracked files');
        return;
    }

    for (const finding of findings) {
        console.error(
            `check:secrets: ${finding.name} at ${finding.file}:${finding.line} ` +
            `(prefix=${finding.value.slice(0, 4)}, length=${finding.value.length})`
        );
    }
    process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { PATTERNS, findSecrets, scanRepository, trackedFiles };
