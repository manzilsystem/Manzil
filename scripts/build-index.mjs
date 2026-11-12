import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const templatePath = path.join(root, 'src', 'index.template.html');
const indexPath = path.join(root, 'index.html');
const swPath = path.join(root, 'sw.js');
const telemetryPath = path.join(root, 'js', 'telemetry.js');
const includePattern = /^[ \t]*<!-- @include ([^ ]+) -->$/;

// Stable placeholders so hashing never depends on a value this script writes.
const RELEASE_TOKEN = '__MANZIL_RELEASE__';
// A version token is either a per-file content hash or the shared release id
// (the loaded-at-runtime modules use the latter). Both forms must be recognised
// when a token is stripped or rewritten, otherwise a shared-release shell entry
// would keep a stale stamp forever.
const VERSION_TOKEN = '(?:manzil-)?[0-9a-f]+';
const VERSION_QUERY = new RegExp(`\\?v=${VERSION_TOKEN}`, 'g');
const VERSION_QUERY_SUFFIX = new RegExp(`\\?v=${VERSION_TOKEN}$`);
const RELEASE_LITERAL = /const RELEASE = '[^']*';/;
const CACHE_LITERAL = /const CACHE_NAME = '[^']*';/;
const SHELL_BLOCK = /(const APP_SHELL = \[)([\s\S]*?)(\];)/;

// Modules that are loaded dynamically at runtime, so the browser cannot read a
// per-file hash from index.html. They use the shared release id instead.
const SHARED_RELEASE_ASSETS = new Set(['js/telemetry.js', 'js/subscription-rates.js']);

const ASSET_DIRS = ['css', 'js', 'icons'];
const ASSET_FILES = ['manifest.json'];

// The committed model-viewer and onnxruntime builds stay in the asset digest so
// a runtime upgrade always rolls the release id along with its lazy-loaded URL.

function listFiles(dir, base = dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
        .flatMap(entry => {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) return listFiles(full, base);
            return [path.relative(base, full).split(path.sep).join('/')];
        })
        .sort();
}

function relativeAssets() {
    const fromDirs = ASSET_DIRS.flatMap(dir => listFiles(path.join(root, dir), root));
    return [...fromDirs, ...ASSET_FILES].sort();
}

/** Remove anything this script writes so the digest only follows real content. */
function normalize(relative) {
    const extension = path.extname(relative);
    if (!['.js', '.css', '.json', '.svg'].includes(extension)) return fs.readFileSync(path.join(root, relative));
    return fs.readFileSync(path.join(root, relative), 'utf8')
        .replace(VERSION_QUERY, '')
        .replace(RELEASE_LITERAL, `const RELEASE = '${RELEASE_TOKEN}';`)
        .replace(CACHE_LITERAL, `const CACHE_NAME = '${RELEASE_TOKEN}';`);
}

function shortHash(input) {
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 10);
}

const assets = relativeAssets();
const fileHashes = new Map(assets.map(relative => [relative, shortHash(normalize(relative))]));
const release = `manzil-${shortHash(assets.map(relative => `${relative}:${fileHashes.get(relative)}`).join('\n'))}`;

function versionFor(relative) {
    if (SHARED_RELEASE_ASSETS.has(relative)) return release;
    return fileHashes.get(relative);
}

function stampIndex() {
    const template = fs.readFileSync(templatePath, 'utf8')
        .split('\n')
        .flatMap(line => {
            const match = line.match(includePattern);
            if (!match) return [line];
            const partial = fs.readFileSync(path.join(root, 'src', 'partials', match[1]), 'utf8');
            return partial.replace(/\n$/, '').split('\n');
        })
        .join('\n');

    return template.replace(/(src|href)="((?:css|js|icons)\/[^"?]+|manifest\.json)"/g, (whole, attribute, url) => {
        const version = versionFor(url);
        return version ? `${attribute}="${url}?v=${version}"` : whole;
    });
}

function stampServiceWorker() {
    return fs.readFileSync(swPath, 'utf8')
        .replace(CACHE_LITERAL, `const CACHE_NAME = '${release}';`)
        .replace(SHELL_BLOCK, (whole, open, body, close) => open + body.replace(/'\.\/([^']*)'/g, (entry, raw) => {
            const relative = raw.replace(VERSION_QUERY_SUFFIX, '');
            const version = versionFor(relative);
            return version ? `'./${relative}?v=${version}'` : entry;
        }) + close);
}

function stampTelemetry() {
    return fs.readFileSync(telemetryPath, 'utf8').replace(RELEASE_LITERAL, `const RELEASE = '${release}';`);
}

const outputs = [
    { file: indexPath, name: 'index.html', content: stampIndex() },
    { file: swPath, name: 'sw.js', content: stampServiceWorker() },
    { file: telemetryPath, name: 'js/telemetry.js', content: stampTelemetry() }
];

if (process.argv.includes('--check')) {
    const stale = outputs.filter(output => fs.readFileSync(output.file, 'utf8') !== output.content);
    if (stale.length) {
        console.error(`${stale.map(output => output.name).join(', ')} out of date. Run: npm run build:index`);
        process.exit(1);
    }
    console.log(`assets match the release ${release}`);
} else {
    outputs.forEach(output => fs.writeFileSync(output.file, output.content));
    console.log(`Rebuilt index.html, sw.js and telemetry.js for ${release}`);
}
