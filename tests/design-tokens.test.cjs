const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const THEMES = ['dark', 'light', 'emerald', 'ocean', 'sand', 'turquoise'];
const TOKENS = ['bg-main', 'bg-card', 'bg-input', 'text-main', 'text-muted', 'border-color', 'accent-color', 'surface-raised'];
const FONT_WEIGHTS = [400, 500, 600, 700, 800, 900];

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

test('font-weight tokens are defined once in :root with their original values', () => {
    const css = read('css/style.css');
    const rootBlock = css.match(/:root\s*\{([^}]*)\}/)[1];
    for (const weight of FONT_WEIGHTS) {
        assert.match(rootBlock, new RegExp(`--weight-${weight}\\s*:\\s*${weight}\\s*;`));
        assert.equal([...css.matchAll(new RegExp(`--weight-${weight}\\s*:`, 'g'))].length, 1);
    }
});

test('font-weight declarations use the canonical scale or intentional inheritance', () => {
    const css = read('css/style.css');
    const values = [...css.matchAll(/(?<![\w-])font-weight\s*:\s*([^;{}]+);/g)]
        .map(match => match[1].trim());
    assert.ok(values.length > 0);
    for (const value of values) {
        assert.match(value, /^(?:var\(--weight-[4-9]00\)|inherit)(?:\s*!important)?$/, value);
    }
    for (const weight of FONT_WEIGHTS) {
        assert.ok(values.includes(`var(--weight-${weight})`), `weight ${weight} must be consumed`);
    }
});

test('settings wrappers keep inheriting their surrounding font weight', () => {
    const css = read('css/style.css');
    for (const selector of ['settings-input-unit', 'settings-search-wrap']) {
        assert.match(css, new RegExp(`#settingsModal \\.settings-field > \\.${selector}\\s*\\{[^}]*font-weight:\\s*inherit;`));
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
