const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');

const blocks = selector => [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'g'))];

const escape = value => value.replace(/[.%]/g, '\\$&');

// Canonical radius scale. Corner rounding is theme-independent, so every token
// lives only in the base :root layer and never inside a per-theme block.
const RADIUS_TOKENS = {
    'radius-lg': '1rem',
    'radius-pill': '999px',
    'radius-circle': '50%'
};

// Canonical fine radius scale. The token suffix is the value in hundredths of a
// rem (--radius-55 = .55rem); every step mirrors the literal it replaced so that
// routing the small corner radii introduces no visual change.
const FINE_RADIUS_TOKENS = {
    'radius-55': '.55rem',
    'radius-60': '.6rem',
    'radius-65': '.65rem',
    'radius-70': '.7rem',
    'radius-75': '.75rem',
    'radius-80': '.8rem',
    'radius-85': '.85rem',
    'radius-90': '.9rem',
    'radius-95': '.95rem'
};

test('the :root block defines the canonical radius scale', () => {
    const rootBlock = blocks(':root')[0][1];
    for (const [token, value] of Object.entries(RADIUS_TOKENS)) {
        assert.match(
            rootBlock,
            new RegExp(`--${token}\\s*:\\s*${escape(value)}\\s*;`),
            `:root must define --${token} as ${value} so shared corner radii stay unified`
        );
    }
});

test('the :root block defines the canonical fine radius scale', () => {
    const rootBlock = blocks(':root')[0][1];
    for (const [token, value] of Object.entries(FINE_RADIUS_TOKENS)) {
        assert.match(
            rootBlock,
            new RegExp(`--${token}\\s*:\\s*${escape(value)}\\s*;`),
            `:root must define --${token} as ${value} so the small corner radii stay unified`
        );
    }
});

test('shared corner radii consume the tokens instead of raw literals', () => {
    for (const [token, value] of Object.entries(RADIUS_TOKENS)) {
        assert.doesNotMatch(
            css,
            new RegExp(`border-radius:\\s*${escape(value)}\\s*;`),
            `border-radius must use var(--${token}) instead of the raw ${value} literal`
        );
    }

    // The dominant card radius and the pill shape must actually be routed, not
    // merely defined, otherwise the scale would be dead weight.
    assert.ok(
        (css.match(/border-radius:\s*var\(--radius-pill\)/g) || []).length >= 20,
        'the pill radius token must be consumed across the shared pill shapes'
    );
    assert.ok(
        (css.match(/border-radius:\s*var\(--radius-lg\)/g) || []).length >= 15,
        'the lg radius token must be consumed across the shared card/panel surfaces'
    );
});

test('the fine radius scale replaces the fractional raw literals', () => {
    // Any value in scope left directly after border-radius: means the literal
    // crept back in (this also covers a leading value in a shorthand radius).
    const fractional = '\\.(55|60|65|70|75|80|85|90|95)rem';
    assert.doesNotMatch(
        css,
        new RegExp(`border-radius:\\s*${fractional}`),
        'fractional corner radii must use the fine radius tokens instead of raw literals'
    );

    for (const token of Object.keys(FINE_RADIUS_TOKENS)) {
        assert.ok(
            (css.match(new RegExp(`var\\(--${token}\\)`, 'g')) || []).length >= 1,
            `--${token} must be consumed, otherwise the scale step would be dead weight`
        );
    }
});
