const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');

const blocks = selector => [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'g'))];

const escape = value => value.replace(/[.%]/g, '\\$&');

// Canonical compact spacing scale: the shared steps for the tight
// padding/gap/margin values (a half rem and below). The token suffix is the
// value in hundredths of a rem (--space-45 = .45rem); the lone half-hundredth
// step is written with a dash (--space-12-5 = .125rem) and --space-none is the
// explicit zero. Spacing is theme-independent, so these live only in :root, and
// each value matches the literal it replaced, so routing them is non-visual.
const COMPACT_SPACE_TOKENS = {
    'space-none': '0',
    'space-5': '.05rem',
    'space-10': '.1rem',
    'space-12-5': '.125rem',
    'space-15': '.15rem',
    'space-20': '.2rem',
    'space-22': '.22rem',
    'space-25': '.25rem',
    'space-28': '.28rem',
    'space-30': '.3rem',
    'space-35': '.35rem',
    'space-40': '.4rem',
    'space-45': '.45rem',
    'space-50': '.5rem'
};

// The whitespace-separated value tokens of a gap declaration, with the token
// references removed, so any leftover token is a raw literal.
const rawGapTokens = () => [...css.matchAll(/(?<![\w-])gap\s*:\s*([^;{}]+);/g)]
    .flatMap(match => match[1].split(/\s+/))
    .map(token => token.trim())
    .filter(token => token && !token.startsWith('var('));

test('the :root block defines the canonical compact spacing scale', () => {
    const rootBlock = blocks(':root')[0][1];
    for (const [token, value] of Object.entries(COMPACT_SPACE_TOKENS)) {
        assert.match(
            rootBlock,
            new RegExp(`--${token}\\s*:\\s*${escape(value)}\\s*;`),
            `:root must define --${token} as ${value} so the compact spacing stays unified`
        );
    }
});

test('the compact gap literals are routed to the spacing tokens', () => {
    const literals = Object.values(COMPACT_SPACE_TOKENS);
    for (const token of rawGapTokens()) {
        assert.ok(
            !literals.includes(token),
            `gap must use the compact spacing tokens instead of the raw literal "${token}"`
        );
    }
});

test('every compact spacing token is consumed, never dead weight', () => {
    for (const token of Object.keys(COMPACT_SPACE_TOKENS)) {
        assert.ok(
            (css.match(new RegExp(`var\\(--${token}\\)`, 'g')) || []).length >= 1,
            `--${token} must be consumed, otherwise the scale step would be dead weight`
        );
    }
});
