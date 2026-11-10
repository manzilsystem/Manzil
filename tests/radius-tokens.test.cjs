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

// Canonical radius tail: the remaining one-off corner radii, so every
// corner-radius declaration resolves from a token and none falls back to a raw
// literal. Same suffix convention; --radius-none is the zero (square) corner.
const TAIL_RADIUS_TOKENS = {
    'radius-none': '0',
    'radius-16': '.16rem',
    'radius-25': '.25rem',
    'radius-30': '.3rem',
    'radius-32': '.32rem',
    'radius-35': '.35rem',
    'radius-45': '.45rem',
    'radius-50': '.5rem',
    'radius-110': '1.1rem',
    'radius-120': '1.2rem',
    'radius-125': '1.25rem',
    'radius-135': '1.35rem',
    'radius-150': '1.5rem',
    'radius-165': '1.65rem',
    'radius-180': '1.8rem'
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

test('the :root block defines the canonical radius tail', () => {
    const rootBlock = blocks(':root')[0][1];
    for (const [token, value] of Object.entries(TAIL_RADIUS_TOKENS)) {
        assert.match(
            rootBlock,
            new RegExp(`--${token}\\s*:\\s*${escape(value)}\\s*;`),
            `:root must define --${token} as ${value} so the tail corner radii stay unified`
        );
    }
});

test('every corner-radius declaration resolves from a token, never a raw literal', () => {
    const declarations = [...css.matchAll(/border(?:-[a-z]+)*-radius\s*:\s*([^;{}]+);/g)]
        .map(match => match[1]);
    assert.ok(declarations.length > 0, 'expected corner-radius declarations in the stylesheet');

    for (const value of declarations) {
        const stripped = value.replace(/var\(--radius-[a-z0-9]+\)/g, '');
        assert.doesNotMatch(
            stripped,
            /[0-9]|%/,
            `corner-radius declarations must use tokens instead of a raw literal: "${value.trim()}"`
        );
    }

    for (const token of Object.keys(TAIL_RADIUS_TOKENS)) {
        assert.ok(
            (css.match(new RegExp(`var\\(--${token}\\)`, 'g')) || []).length >= 1,
            `--${token} must be consumed, otherwise the scale step would be dead weight`
        );
    }
});
