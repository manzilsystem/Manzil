const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const THEMES = ['dark', 'light', 'emerald', 'ocean', 'sand', 'turquoise'];
const TOKENS = ['bg-main', 'bg-card', 'bg-input', 'text-main', 'text-muted', 'border-color', 'accent-color', 'surface-raised'];
const FONT_WEIGHTS = [400, 500, 600, 700, 800, 900];
const TRACKING_STEPS = {
    1: '.01em',
    2: '.02em',
    4: '.04em',
    8: '.08em',
    12: '.12em',
    20: '.2em'
};
const MOTION_STEPS = {
    150: '.15s',
    160: '.16s',
    180: '.18s',
    200: '.2s',
    240: '.24s',
    260: '.26s',
    300: '.3s'
};
const EASINGS = {
    standard: 'ease'
};
const Z_LAYERS = {
    below: '-1',
    raised: '1',
    topbar: '3',
    toolbar: '6',
    dropdown: '40',
    floating: '45'
};
const LEADINGS = {
    120: '1.2',
    135: '1.35',
    140: '1.4',
    150: '1.5',
    155: '1.55',
    160: '1.6',
    170: '1.7',
    175: '1.75',
    180: '1.8',
    185: '1.85',
    190: '1.9',
    195: '1.95'
};
const OPACITIES = {
    0: '0',
    40: '.4',
    55: '.55',
    60: '.6',
    65: '.65',
    75: '.75',
    100: '1'
};
const BLURS = {
    60: '6px',
    120: '12px',
    140: '14px',
    160: '16px'
};
const FONT_SIZES = {
    52: '.52rem',
    53: '.53rem',
    55: '.55rem',
    56: '.56rem',
    57: '.57rem',
    58: '.58rem',
    59: '.59rem',
    60: '.6rem',
    61: '.61rem',
    62: '.62rem',
    63: '.63rem',
    64: '.64rem',
    65: '.65rem',
    66: '.66rem',
    67: '.67rem',
    68: '.68rem',
    70: '.7rem',
    72: '.72rem',
    74: '.74rem',
    75: '.75rem',
    76: '.76rem',
    78: '.78rem',
    80: '.8rem',
    82: '.82rem',
    84: '.84rem',
    85: '.85rem',
    86: '.86rem',
    90: '.9rem',
    92: '.92rem',
    95: '.95rem',
    98: '.98rem',
    100: '1rem',
    102: '1.02rem',
    105: '1.05rem',
    110: '1.1rem',
    112: '1.12rem',
    115: '1.15rem',
    118: '1.18rem',
    120: '1.2rem',
    125: '1.25rem',
    135: '1.35rem',
    140: '1.4rem',
    145: '1.45rem',
    150: '1.5rem',
    175: '1.75rem'
};
const FLUID_FONT_SIZES = {
    'tab-label': 'clamp(8px, 2.7vw, 10px)',
    'tab-label-narrow': 'clamp(8px, 2.7vw, 9px)',
    'input-mobile': '16px',
    'print-title': '20px',
    'auth-title': 'clamp(1.8rem, 4vw, 2.35rem)',
    'auth-subtitle': 'clamp(1.4rem, 3vw, 1.8rem)',
    'lock-title': 'clamp(1.8rem, 3vw, 2.5rem)',
    'lock-mark': '.72em',
    'lock-subtitle': 'clamp(1.55rem, 3vw, 2rem)',
    'lock-title-narrow': 'clamp(1.55rem, 2vw, 2rem)',
    'lock-mark-narrow': '.62em',
    'settings-title': 'clamp(1.15rem, 2.2vw, 1.5rem)'
};
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

test('letter-spacing tokens are defined once in :root with their original values', () => {
    const css = read('css/style.css');
    const rootBlock = css.match(/:root\s*\{([^}]*)\}/)[1];
    for (const [step, value] of Object.entries(TRACKING_STEPS)) {
        assert.match(rootBlock, new RegExp(`--tracking-${step}\\s*:\\s*${value.replace('.', '\\.')}\\s*;`));
        assert.equal([...css.matchAll(new RegExp(`--tracking-${step}\\s*:`, 'g'))].length, 1);
    }
});

test('letter-spacing declarations use the canonical scale', () => {
    const css = read('css/style.css');
    const values = [...css.matchAll(/(?<![\w-])letter-spacing\s*:\s*([^;{}]+);/g)]
        .map(match => match[1].trim());
    assert.ok(values.length > 0);
    for (const value of values) {
        assert.match(value, /^var\(--tracking-(?:1|2|4|8|12|20)\)(?:\s*!important)?$/, value);
    }
    for (const step of Object.keys(TRACKING_STEPS)) {
        assert.ok(values.includes(`var(--tracking-${step})`), `tracking step ${step} must be consumed`);
    }
});

test('motion tokens are defined once in :root with their original values', () => {
    const css = read('css/style.css');
    const rootBlock = css.match(/:root\s*\{([^}]*)\}/)[1];
    for (const [step, value] of Object.entries(MOTION_STEPS)) {
        assert.match(rootBlock, new RegExp(`--motion-${step}\\s*:\\s*${value.replace('.', '\\.')}\\s*;`));
        assert.equal([...css.matchAll(new RegExp(`--motion-${step}\\s*:`, 'g'))].length, 1);
    }
    for (const [name, value] of Object.entries(EASINGS)) {
        assert.match(rootBlock, new RegExp(`--ease-${name}\\s*:\\s*${value}\\s*;`));
        assert.equal([...css.matchAll(new RegExp(`--ease-${name}\\s*:`, 'g'))].length, 1);
    }
});

test('transition declarations use the canonical motion scale', () => {
    const css = read('css/style.css');
    const values = [...css.matchAll(/(?<![\w-])transition\s*:\s*([^;{}]+);/g)]
        .map(match => match[1].trim());
    assert.ok(values.length > 0);
    const part = new RegExp(
        `^[a-z-]+(?:\\s+[a-z-]+)*\\s+var\\(--motion-(?:${Object.keys(MOTION_STEPS).join('|')})\\)`
        + `(?:\\s+var\\(--ease-(?:${Object.keys(EASINGS).join('|')})\\))?$`
    );
    for (const value of values) {
        if (value === 'none') continue;
        for (const segment of value.split(',').map(item => item.trim())) {
            assert.match(segment, part, segment);
        }
    }
    for (const step of Object.keys(MOTION_STEPS)) {
        assert.ok(values.some(value => value.includes(`var(--motion-${step})`)), `motion step ${step} must be consumed`);
    }
    for (const name of Object.keys(EASINGS)) {
        assert.ok(values.some(value => value.includes(`var(--ease-${name})`)), `easing ${name} must be consumed`);
    }
});

test('z-index tokens are defined once in :root with their original values', () => {
    const css = read('css/style.css');
    const rootBlock = css.match(/:root\s*\{([^}]*)\}/)[1];
    for (const [name, value] of Object.entries(Z_LAYERS)) {
        assert.match(rootBlock, new RegExp(`--z-${name}\\s*:\\s*${value.replace('.', '\\.')}\\s*;`));
        assert.equal([...css.matchAll(new RegExp(`--z-${name}\\s*:`, 'g'))].length, 1);
    }
});

test('z-index declarations use the canonical layering scale', () => {
    const css = read('css/style.css');
    const values = [...css.matchAll(/(?<![\w-])z-index\s*:\s*([^;{}]+);/g)]
        .map(match => match[1].trim());
    assert.ok(values.length > 0);
    const part = new RegExp(`^var\\(--z-(?:${Object.keys(Z_LAYERS).join('|')})\\)(?:\\s*!important)?$`);
    for (const value of values) {
        assert.match(value, part, value);
    }
    for (const name of Object.keys(Z_LAYERS)) {
        assert.ok(values.includes(`var(--z-${name})`), `layer ${name} must be consumed`);
    }
});

test('leading tokens are defined once in :root with their original values', () => {
    const css = read('css/style.css');
    const rootBlock = css.match(/:root\s*\{([^}]*)\}/)[1];
    for (const [step, value] of Object.entries(LEADINGS)) {
        assert.match(rootBlock, new RegExp(`--leading-${step}\\s*:\\s*${value.replace('.', '\\.')}\\s*;`));
        assert.equal([...css.matchAll(new RegExp(`--leading-${step}\\s*:`, 'g'))].length, 1);
    }
});

test('line-height declarations use the canonical leading scale', () => {
    const css = read('css/style.css');
    const values = [...css.matchAll(/(?<![\w-])line-height\s*:\s*([^;{}]+);/g)]
        .map(match => match[1].trim());
    assert.ok(values.length > 0);
    const part = new RegExp(
        `^(?:var\\(--leading-(?:${Object.keys(LEADINGS).join('|')})\\)|var\\(--space-115\\))(?:\\s*!important)?$`
    );
    for (const value of values) {
        assert.match(value, part, value);
    }
    for (const step of Object.keys(LEADINGS)) {
        assert.ok(values.includes(`var(--leading-${step})`), `leading step ${step} must be consumed`);
    }
});

test('opacity tokens are defined once in :root with their original values', () => {
    const css = read('css/style.css');
    const rootBlock = css.match(/:root\s*\{([^}]*)\}/)[1];
    for (const [step, value] of Object.entries(OPACITIES)) {
        assert.match(rootBlock, new RegExp(`--opacity-${step}\\s*:\\s*${value.replace('.', '\\.')}\\s*;`));
        assert.equal([...css.matchAll(new RegExp(`--opacity-${step}\\s*:`, 'g'))].length, 1);
    }
});

test('opacity declarations use the canonical opacity scale', () => {
    const css = read('css/style.css');
    const values = [...css.matchAll(/(?<![\w-])opacity\s*:\s*([^;{}]+);/g)]
        .map(match => match[1].trim());
    assert.ok(values.length > 0);
    const part = new RegExp(`^var\\(--opacity-(?:${Object.keys(OPACITIES).join('|')})\\)(?:\\s*!important)?$`);
    for (const value of values) {
        assert.match(value, part, value);
    }
    for (const step of Object.keys(OPACITIES)) {
        assert.ok(values.includes(`var(--opacity-${step})`), `opacity step ${step} must be consumed`);
    }
});

test('blur tokens are defined once in :root with their original values', () => {
    const css = read('css/style.css');
    const rootBlock = css.match(/:root\s*\{([^}]*)\}/)[1];
    for (const [step, value] of Object.entries(BLURS)) {
        assert.match(rootBlock, new RegExp(`--blur-${step}\\s*:\\s*${value}\\s*;`));
        assert.equal([...css.matchAll(new RegExp(`--blur-${step}\\s*:`, 'g'))].length, 1);
    }
});

test('backdrop-filter declarations use the canonical blur scale', () => {
    const css = read('css/style.css');
    const values = [...css.matchAll(/(?:-webkit-)?backdrop-filter\s*:\s*([^;{}]+)(?:;|\})/g)]
        .map(match => match[1].trim());
    assert.ok(values.length > 0);
    const part = new RegExp(
        `^(?:blur\\(var\\(--blur-(?:${Object.keys(BLURS).join('|')})\\)\\)|none)(?:\\s*!important)?$`
    );
    for (const value of values) {
        assert.match(value, part, value);
    }
    for (const step of Object.keys(BLURS)) {
        assert.ok(values.includes(`blur(var(--blur-${step}))`), `blur step ${step} must be consumed`);
    }
});

test('font-size tokens are defined once in :root with their original values', () => {
    const css = read('css/style.css');
    const rootBlock = css.match(/:root\s*\{([^}]*)\}/)[1];
    for (const [step, value] of Object.entries(FONT_SIZES)) {
        assert.match(rootBlock, new RegExp(`--font-${step}\\s*:\\s*${value.replace('.', '\\.')}\\s*;`));
        assert.equal([...css.matchAll(new RegExp(`--font-${step}\\s*:`, 'g'))].length, 1);
    }
});

test('font-size declarations use the canonical typographic scale', () => {
    const css = read('css/style.css');
    for (const [step, value] of Object.entries(FONT_SIZES)) {
        const literal = value.replace('.', '\\.');
        assert.ok(
            new RegExp(`font-size\\s*:\\s*var\\(--font-${step}\\)`).test(css),
            `font step ${step} must be consumed`
        );
        assert.doesNotMatch(
            css,
            new RegExp(`font-size\\s*:\\s*${literal}\\s*;`),
            `literal ${value} must be routed through --font-${step}`
        );
    }
});

test('fluid font-size tokens are defined once in :root with their original values', () => {
    const css = read('css/style.css');
    const rootBlock = css.match(/:root\s*\{([^}]*)\}/)[1];
    for (const [name, value] of Object.entries(FLUID_FONT_SIZES)) {
        const token = escapeRegex(`--font-${name}`);
        assert.match(rootBlock, new RegExp(`${token}(?![\\w-])\\s*:\\s*${escapeRegex(value)}\\s*;`));
        assert.equal([...css.matchAll(new RegExp(`${token}(?![\\w-])\\s*:`, 'g'))].length, 1);
    }
});

test('fluid font-size declarations use their canonical tokens', () => {
    const css = read('css/style.css');
    for (const [name, value] of Object.entries(FLUID_FONT_SIZES)) {
        assert.ok(
            new RegExp(`font-size\\s*:\\s*var\\(--font-${name}\\)`).test(css),
            `fluid font token --font-${name} must be consumed`
        );
        assert.doesNotMatch(
            css,
            new RegExp(`font-size\\s*:\\s*${escapeRegex(value)}(?:\\s*!important)?\\s*;`),
            `literal ${value} must be routed through --font-${name}`
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
