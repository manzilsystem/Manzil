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

// Canonical spacing tail: the remaining shared gap steps (a half rem and above)
// kept tokenised so no gap value falls back to a raw literal. Same suffix
// convention (value in hundredths of a rem: --space-100 = 1rem, --space-200 =
// 2rem). Each value matches the literal it replaced, so routing it is
// non-visual, and spacing is theme-independent so these live only in :root.
const TAIL_SPACE_TOKENS = {
    'space-55': '.55rem',
    'space-60': '.6rem',
    'space-65': '.65rem',
    'space-70': '.7rem',
    'space-75': '.75rem',
    'space-80': '.8rem',
    'space-85': '.85rem',
    'space-90': '.9rem',
    'space-100': '1rem',
    'space-125': '1.25rem',
    'space-150': '1.5rem',
    'space-160': '1.6rem',
    'space-200': '2rem'
};

// Spacing steps introduced so every padding declaration resolves from the same
// scale. Same suffix convention (value in hundredths of a rem), and each value
// matches the literal it replaced, so routing padding is non-visual.
const PADDING_SPACE_TOKENS = {
    'space-8': '.08rem',
    'space-12': '.12rem',
    'space-42': '.42rem',
    'space-95': '.95rem',
    'space-105': '1.05rem',
    'space-110': '1.1rem',
    'space-115': '1.15rem',
    'space-120': '1.2rem',
    'space-130': '1.3rem',
    'space-135': '1.35rem',
    'space-175': '1.75rem',
    'space-190': '1.9rem',
    'space-210': '2.1rem',
    'space-225': '2.25rem',
    'space-250': '2.5rem',
    'space-300': '3rem',
    'space-350': '3.5rem',
    'space-600': '6rem'
};

// Spacing steps introduced so every margin declaration resolves from the same
// scale. Same suffix convention (value in hundredths of a rem), and each value
// matches the literal it replaced, so routing margin is non-visual.
const MARGIN_SPACE_TOKENS = {
    'space-18': '.18rem'
};

// The whitespace-separated value tokens of a gap declaration, with the token
// references removed, so any leftover token is a raw literal.
const rawGapTokens = () => [...css.matchAll(/(?<![\w-])gap\s*:\s*([^;{}]+);/g)]
    .flatMap(match => match[1].split(/\s+/))
    .map(token => token.trim())
    .filter(token => token && !token.startsWith('var('));

// Every gap value with the token references stripped, so any surviving length is
// a raw literal that escaped the scale. Unlike rawGapTokens this also catches a
// literal nested inside clamp() or a shorthand (e.g. clamp(.75rem, 2vw, 1.5rem)).
const strippedGapValues = () => [...css.matchAll(/(?<![\w-])gap\s*:\s*([^;{}]+);/g)]
    .map(match => match[1].replace(/var\(--[\w-]+\)/g, ''));

// Every padding declaration, longhand included, with the token references
// stripped, so a surviving rem length or standalone zero is a raw literal that
// escaped the scale (including one nested inside clamp()/calc()).
const strippedPaddingValues = () => [...css.matchAll(/(?<![\w-])padding(?:-[a-z-]+)?\s*:\s*([^;{}]+);/g)]
    .map(match => match[1].replace(/var\(--[\w-]+\)/g, ''));

// Every margin declaration, longhand and logical included, with the token
// references stripped, so a surviving rem length or standalone zero is a raw
// literal that escaped the scale. `auto` is a legitimate keyword and is left
// as-is; scroll-margin-* is a separate property and is not matched.
const strippedMarginValues = () => [...css.matchAll(/(?<![\w-])margin(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?\s*:\s*([^;{}]+);/g)]
    .map(match => match[1].replace(/var\(--[\w-]+\)/g, ''));

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

test('the :root block defines the canonical spacing tail', () => {
    const rootBlock = blocks(':root')[0][1];
    for (const [token, value] of Object.entries(TAIL_SPACE_TOKENS)) {
        assert.match(
            rootBlock,
            new RegExp(`--${token}\\s*:\\s*${escape(value)}\\s*;`),
            `:root must define --${token} as ${value} so the gap scale stays unified`
        );
    }
});

test('the :root block defines the padding spacing steps', () => {
    const rootBlock = blocks(':root')[0][1];
    for (const [token, value] of Object.entries(PADDING_SPACE_TOKENS)) {
        assert.match(
            rootBlock,
            new RegExp(`--${token}\\s*:\\s*${escape(value)}\\s*;`),
            `:root must define --${token} as ${value} so the padding scale stays unified`
        );
    }
});

test('no padding declaration falls back to a raw spacing literal', () => {
    for (const value of strippedPaddingValues()) {
        assert.doesNotMatch(
            value,
            /(\.\d+|\d+(?:\.\d+)?)rem\b/,
            `padding must resolve its lengths from the spacing tokens, found a raw literal in "${value.trim()}"`
        );
        assert.doesNotMatch(
            value,
            /(?<![\w.\-])0(?![\w.%])/,
            `padding must use var(--space-none) instead of a raw zero in "${value.trim()}"`
        );
    }
});

test('the padding scale steps are consumed by padding declarations', () => {
    const paddingValues = [...css.matchAll(/(?<![\w-])padding(?:-[a-z-]+)?\s*:\s*([^;{}]+);/g)]
        .map(match => match[1])
        .join(' ');
    for (const token of Object.keys(PADDING_SPACE_TOKENS)) {
        assert.ok(
            paddingValues.includes(`var(--${token})`),
            `--${token} must be consumed by a padding declaration, otherwise the step would be dead weight`
        );
    }
});

test('the :root block defines the margin spacing steps', () => {
    const rootBlock = blocks(':root')[0][1];
    for (const [token, value] of Object.entries(MARGIN_SPACE_TOKENS)) {
        assert.match(
            rootBlock,
            new RegExp(`--${token}\\s*:\\s*${escape(value)}\\s*;`),
            `:root must define --${token} as ${value} so the margin scale stays unified`
        );
    }
});

test('no margin declaration falls back to a raw spacing literal', () => {
    for (const value of strippedMarginValues()) {
        assert.doesNotMatch(
            value,
            /(\.\d+|\d+(?:\.\d+)?)rem\b/,
            `margin must resolve its lengths from the spacing tokens, found a raw literal in "${value.trim()}"`
        );
        assert.doesNotMatch(
            value,
            /(?<![\w.\-])0(?![\w.%])/,
            `margin must use var(--space-none) instead of a raw zero in "${value.trim()}"`
        );
    }
});

test('the margin scale steps are consumed by margin declarations', () => {
    const marginValues = [...css.matchAll(/(?<![\w-])margin(?:-[a-z-]+)?\s*:\s*([^;{}]+);/g)]
        .map(match => match[1])
        .join(' ');
    for (const token of Object.keys(MARGIN_SPACE_TOKENS)) {
        assert.ok(
            marginValues.includes(`var(--${token})`),
            `--${token} must be consumed by a margin declaration, otherwise the step would be dead weight`
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

test('no gap declaration falls back to a raw length literal', () => {
    for (const value of strippedGapValues()) {
        assert.doesNotMatch(
            value,
            /(\d+(?:\.\d+)?|\.\d+)rem\b/,
            `gap must resolve its lengths from the spacing tokens, found a raw literal in "${value.trim()}"`
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

test('every spacing tail token is consumed, never dead weight', () => {
    for (const token of Object.keys(TAIL_SPACE_TOKENS)) {
        assert.ok(
            (css.match(new RegExp(`var\\(--${token}\\)`, 'g')) || []).length >= 1,
            `--${token} must be consumed, otherwise the scale step would be dead weight`
        );
    }
});
