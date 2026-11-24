import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';

const root = path.resolve(import.meta.dirname, '..');
const input = path.join(root, 'src', 'tailwind.css');
const output = path.join(root, 'css', 'tailwind.css');

const css = fs.readFileSync(input, 'utf8');
const result = await postcss([
    tailwindcss({ base: root }),
    autoprefixer()
]).process(css, { from: input, to: output });

if (process.argv.includes('--check')) {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== result.css) {
        console.error('css/tailwind.css out of date. Run: npm run build:css');
        process.exit(1);
    }
    console.log('tailwind css is up to date');
} else {
    fs.writeFileSync(output, result.css);
    console.log(`Built css/tailwind.css (${result.css.length} bytes)`);
}
