const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');

const blocks = selector => [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'g'))];

// Canonical radius scale. Corner rounding is theme-independent, so every token
// lives only in the base :root layer and never inside a per-theme block.
const RADIUS_TOKENS = {
    'radius-lg': '1rem',
    'radius-pill': '999px',
    'radius-circle': '50%'
};

const escape = value => value.replace(/[.%]/g, '\\$&');

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
