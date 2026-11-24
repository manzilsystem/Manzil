import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const vendorDir = path.join(root, 'vendor');
const modules = path.join(root, 'node_modules');

// Each library ships a browser-ready UMD bundle. Strip sourceMappingURL so the
// browser never requests a .map file (which CSP blocks and only devtools needs).
const bundles = [
    ['chart.js/dist/chart.umd.js', 'chart.umd.js'],
    ['xlsx/dist/xlsx.full.min.js', 'xlsx.full.min.js'],
    ['@supabase/supabase-js/dist/umd/supabase.js', 'supabase.js']
];

const outputs = [];
for (const [source, name] of bundles) {
    const content = fs.readFileSync(path.join(modules, source), 'utf8')
        .replace(/^\/\/# sourceMappingURL=.*$/gm, '');
    outputs.push({ file: path.join(vendorDir, name), content });
}

if (process.argv.includes('--check')) {
    const stale = outputs.filter(output => !fs.existsSync(output.file) || fs.readFileSync(output.file, 'utf8') !== output.content);
    if (stale.length) {
        console.error(`vendor files out of date: ${stale.map(output => path.basename(output.file)).join(', ')}. Run: npm run build:vendor`);
        process.exit(1);
    }
    console.log('vendor bundles are up to date');
} else {
    fs.mkdirSync(vendorDir, { recursive: true });
    outputs.forEach(output => fs.writeFileSync(output.file, output.content));
    console.log(`Copied ${outputs.length} vendor bundles to vendor/`);
}
