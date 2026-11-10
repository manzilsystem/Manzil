const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const THEMES = ['dark', 'light', 'emerald', 'ocean', 'sand', 'turquoise'];
const TOKENS = ['bg-main', 'bg-card', 'bg-input', 'text-main', 'text-muted', 'border-color', 'accent-color', 'surface-raised'];

const themeBlocks = (css, theme) => [
    ...css.matchAll(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`, 'g'))
];

test('every theme defines its design tokens exactly once', () => {
    const css = read('css/style.css');
    for (const theme of THEMES) {
        const blocks = themeBlocks(css, theme);
        assert.equal(
            blocks.length,
            1,
            `theme "${theme}" must define its token block exactly once; duplicate/overridden blocks drift the unified design system`
        );
    }
});

test('every theme exposes the same canonical token set', () => {
    const css = read('css/style.css');
    for (const theme of THEMES) {
        const body = themeBlocks(css, theme)[0][1];
        for (const token of TOKENS) {
            assert.match(
                body,
                new RegExp(`--${token}\\s*:`),
                `theme "${theme}" must define --${token} so all themes stay unified`
            );
        }
    }
});
