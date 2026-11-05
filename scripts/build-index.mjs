import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const templatePath = path.join(root, 'src', 'index.template.html');
const outputPath = path.join(root, 'index.html');
const includePattern = /^[ \t]*<!-- @include ([^ ]+) -->$/;

const output = fs.readFileSync(templatePath, 'utf8')
    .split('\n')
    .flatMap(line => {
        const match = line.match(includePattern);
        if (!match) return [line];
        const partial = fs.readFileSync(path.join(root, 'src', 'partials', match[1]), 'utf8');
        return partial.replace(/\n$/, '').split('\n');
    })
    .join('\n');

if (process.argv.includes('--check')) {
    const current = fs.readFileSync(outputPath, 'utf8');
    if (current !== output) {
        console.error('index.html is out of date. Run: npm run build:index');
        process.exit(1);
    }
    console.log('index.html matches src/index.template.html');
} else {
    fs.writeFileSync(outputPath, output);
    console.log('Rebuilt index.html');
}
