const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Canonical semantic state tokens (success / warning / danger / info). They are the
// single source of truth for the shared semantic colors used across the app.
const STATE_TOKENS = [
    'state-success', 'state-success-soft', 'state-success-line',
    'state-warning', 'state-warning-soft', 'state-warning-line',
    'state-danger', 'state-danger-soft', 'state-danger-line',
    'state-info', 'state-info-soft', 'state-info-line'
];

const blocks = (css, selector) => [
    ...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'g'))
];

const lightBlock = () => blocks(read('css/style.css'), '\\[data-theme="light"\\]')[0][1];

test('the :root block defines every canonical semantic state token', () => {
    // The first :root block is the base token layer; a later :root block only holds
    // derived surface tokens.
    const rootBlock = blocks(read('css/style.css'), ':root')[0][1];
    for (const token of STATE_TOKENS) {
        assert.match(
            rootBlock,
            new RegExp(`--${token}\\s*:`),
            `:root must define --${token} so semantic states stay unified`
        );
    }
});

test('the light theme remaps the semantic state tokens in its canonical block', () => {
    const body = lightBlock();
    for (const token of STATE_TOKENS) {
        assert.match(
            body,
            new RegExp(`--${token}\\s*:`),
            `the canonical light theme block must remap --${token}`
        );
    }
});

test('shared semantic consumers reference the tokens instead of raw literals', () => {
    const css = read('css/style.css');
    const expectations = [
        ['.report-tone-emerald', 'state-success'],
        ['.report-tone-amber', 'state-warning'],
        ['.report-tone-rose', 'state-danger'],
        ['.report-tone-sky', 'state-info'],
        ['.assistant-row.is-good strong', 'state-success'],
        ['.assistant-row.is-bad strong', 'state-danger'],
        ['.assistant-row.is-warn strong', 'state-warning'],
        ['.arrears-amount', 'state-danger'],
        ['.quick-action-income', 'state-success'],
        ['.quick-action-expense', 'state-danger'],
        ['.quick-action-report', 'state-warning'],
        ['.app-input:user-invalid:not(:focus)', 'state-danger'],
        ['.assistant-fab::after', 'state-success'],
        ['.assistant-online-dot', 'state-success'],
        ['.report-nav-item.is-ready::after', 'state-success'],
        ['.report-nav-item.is-stale::after', 'state-warning'],
        ['#settingsModal .settings-owner-stats .is-missing b', 'state-danger'],
        ['#settingsModal .settings-rule-step.is-late .settings-rule-step-icon', 'state-danger'],
        ['#settingsModal .settings-secondary-button.is-danger', 'state-danger']
    ];
    for (const [selector, token] of expectations) {
        const rules = blocks(css, selector.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&'));
        assert.ok(rules.length, `expected a rule for "${selector}"`);
        // A selector can appear in more than one rule (e.g. a shared layout rule
        // that also lists the selector, plus the color rule we care about), so
        // require that at least one matching rule consumes the canonical token.
        assert.ok(
            rules.some(rule => new RegExp(`var\\(--${token}\\)`).test(rule[1])),
            `"${selector}" must consume var(--${token}) instead of a raw literal`
        );
    }
});

test('per-selector light overrides are gone; semantic colors resolve from tokens', () => {
    const css = read('css/style.css');
    for (const selector of [
        '\\[data-theme="light"\\] \\.report-tone-emerald',
        '\\[data-theme="light"\\] \\.report-tone-amber',
        '\\[data-theme="light"\\] \\.report-tone-rose',
        '\\[data-theme="light"\\] \\.report-tone-sky',
        '\\[data-theme="light"\\] \\.assistant-row\\.is-good strong',
        '\\[data-theme="light"\\] \\.assistant-row\\.is-bad strong',
        '\\[data-theme="light"\\] \\.assistant-row\\.is-warn strong',
        '\\[data-theme="light"\\] \\.arrears-amount'
    ]) {
        assert.doesNotMatch(
            css,
            new RegExp(selector),
            `"${selector.replace(/\\/g, '')}" is now redundant; the light theme remaps the --state-* tokens instead`
        );
    }
});

test('remaining semantic literals are routed to the canonical state tokens', () => {
    const css = read('css/style.css');
    const escape = selector => selector.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&');
    const firstRule = selector => {
        const rules = blocks(css, escape(selector));
        assert.ok(rules.length, `expected a rule for "${selector}"`);
        return rules[0][1];
    };

    // The assistant online dot used to keep the raw #34d399 literal inside its
    // color-mix focus ring while the report nav dots already consumed the token,
    // so the two shared dots drifted apart. It must resolve from --state-success.
    const onlineDot = firstRule('.assistant-online-dot');
    assert.match(
        onlineDot,
        /box-shadow:\s*0 0 0 3px color-mix\(in srgb, var\(--state-success\) 22%, transparent\)/,
        '.assistant-online-dot must consume var(--state-success) in its focus ring like the report nav dots'
    );
    assert.doesNotMatch(onlineDot, /#34d399/, '.assistant-online-dot must not keep the raw #34d399 literal');

    // The invalid-input ring used the raw rose-500 literal while its border already
    // resolved from --state-danger; both must come from the same token.
    const invalidInput = firstRule('.app-input:user-invalid:not(:focus)');
    assert.match(
        invalidInput,
        /box-shadow:\s*0 0 0 1px color-mix\(in srgb, var\(--state-danger\) 18%, transparent\)/,
        '.app-input:user-invalid must consume var(--state-danger) in its focus ring'
    );
    assert.doesNotMatch(
        invalidInput,
        /rgba\(251,\s*113,\s*133/,
        '.app-input:user-invalid must not keep the raw rgba(251, 113, 133, …) literal'
    );
});

test('the settings emerald accent resolves from one canonical token', () => {
    const css = read('css/style.css');

    // The emerald accent shared by the settings surfaces (the emerald card tone
    // and the connected/"linked" status) must be declared exactly once, inside
    // the #settingsModal token layer, so every consumer derives from one source.
    const settingsBlock = blocks(css, '#settingsModal')[0][1];
    assert.match(
        settingsBlock,
        /--settings-emerald:\s*#2ea879;/,
        '#settingsModal must declare --settings-emerald: #2ea879 as the single source'
    );

    const definitions = css.match(/--settings-emerald\s*:/g) || [];
    assert.equal(definitions.length, 1, '--settings-emerald must be defined exactly once');

    // Every emerald consumer must route through the token; a raw #2ea879 or a
    // rgba(46, 168, 121, …) literal is only allowed in the definition itself.
    const hexLiterals = css.match(/#2ea879/gi) || [];
    assert.equal(hexLiterals.length, 1, '#2ea879 must only appear in the --settings-emerald definition');
    assert.doesNotMatch(
        css,
        /rgba\(46,\s*168,\s*121/,
        'the emerald rgba(46, 168, 121, …) literals must resolve from var(--settings-emerald) via color-mix'
    );

    for (const selector of [
        '#settingsModal .settings-card[data-tone="emerald"]',
        '#settingsModal .settings-owner-stats .is-linked b',
        '#settingsModal .settings-status'
    ]) {
        const rules = blocks(css, selector.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&'));
        assert.ok(rules.length, `expected a rule for "${selector}"`);
        assert.ok(
            rules.some(rule => /var\(--settings-emerald\)/.test(rule[1])),
            `"${selector}" must consume var(--settings-emerald) instead of a raw emerald literal`
        );
    }
});

test('the settings accent family resolves from its canonical tokens', () => {
    const css = read('css/style.css');
    const escape = selector => selector.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&');

    // The teal/gold accents and the dark ink stops shared by the settings surfaces
    // must each be declared exactly once, inside the #settingsModal token layer,
    // so every gradient, shadow and tone derives from one source.
    const settingsBlock = blocks(css, '#settingsModal')[0][1];
    for (const declaration of [
        '--settings-accent: #159e9a;',
        '--settings-accent-bright: #55c9bd;',
        '--settings-gold: #c9973d;',
        '--settings-ink: #071f27;',
        '--settings-ink-2: #0b2633;',
        '--settings-ink-3: #123b50;'
    ]) {
        const name = declaration.slice(0, declaration.indexOf(':'));
        assert.match(
            settingsBlock,
            new RegExp(`${name}:\\s*${declaration.slice(declaration.indexOf(':') + 1).trim()}`),
            `#settingsModal must declare ${name} as the single source`
        );
    }

    // Outside the declarations, no settings surface may keep the raw accent-family
    // literals. #071f27 also seeds the turquoise theme, so it is checked through
    // its consumers below instead of a global count.
    for (const [literal, expected] of [
        [/#159e9a/gi, 1],
        [/#55c9bd/gi, 1],
        [/#c9973d/gi, 1],
        [/#0b2633/gi, 1],
        [/#123b50/gi, 1]
    ]) {
        const found = css.match(literal) || [];
        assert.equal(
            found.length,
            expected,
            `${literal.source} must only appear in the canonical token definition`
        );
    }
    for (const family of ['rgba\\(21,\\s*158,\\s*154', 'rgba\\(85,\\s*201,\\s*189', 'rgba\\(201,\\s*151,\\s*61']) {
        assert.doesNotMatch(
            css,
            new RegExp(family),
            `the ${family} literals must resolve from the canonical token via color-mix`
        );
    }

    const expectations = [
        ['#settingsModal .settings-card[data-tone="teal"]', 'settings-accent'],
        ['#settingsModal .settings-card[data-tone="gold"]', 'settings-gold'],
        ['#settingsModal .settings-brand-preview-dark', 'settings-ink-2'],
        ['#settingsModal .settings-brand-preview-dark', 'settings-ink-3'],
        ['#settingsModal .settings-phone-card', 'settings-ink'],
        ['#settingsModal .settings-phone-card .settings-preview-icon', 'settings-accent-bright']
    ];
    for (const [selector, token] of expectations) {
        const rules = blocks(css, escape(selector));
        assert.ok(rules.length, `expected a rule for "${selector}"`);
        assert.ok(
            rules.some(rule => new RegExp(`var\\(--${token}\\)`).test(rule[1])),
            `"${selector}" must consume var(--${token}) instead of a raw literal`
        );
    }
});

test('the six theme accents resolve from their canonical tokens', () => {
    const css = read('css/style.css');
    const escape = selector => selector.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&');
    const themeAccents = {
        dark: '#818cf8',
        light: '#4f46e5',
        emerald: '#34d399',
        ocean: '#38bdf8',
        sand: '#e6a85c',
        turquoise: '#24c4c7'
    };

    // Every theme accent must be declared exactly once, in the :root token layer,
    // so the theme remaps, the settings preview chips and the owner swatches all
    // share one source — a preview can never drift from the theme it represents.
    const rootBlock = blocks(css, ':root')[0][1];
    for (const [theme, value] of Object.entries(themeAccents)) {
        const declaration = `--theme-accent-${theme}: ${value}`;
        assert.match(rootBlock, new RegExp(`${declaration.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&')}`),
            `:root must declare ${declaration}`);
        assert.equal(
            css.split(declaration).length - 1,
            1,
            `${declaration} must be declared exactly once`
        );
    }

    // Each theme block, settings preview chip and owner swatch consumes the token
    // instead of keeping the raw accent literal.
    for (const theme of Object.keys(themeAccents)) {
        for (const [selector, property] of [
            [`[data-theme="${theme}"]`, '--accent-color'],
            [`#settingsModal .theme-preview-${theme}`, '--preview-accent'],
            [`.owner-theme-swatch.theme-preview-${theme}`, '--preview-accent']
        ]) {
            const rules = blocks(css, escape(selector));
            assert.ok(rules.length, `expected a rule for "${selector}"`);
            assert.ok(
                rules.some(rule => new RegExp(`${property}\\s*:\\s*var\\(--theme-accent-${theme}\\)`).test(rule[1])),
                `"${selector}" must set ${property} to var(--theme-accent-${theme})`
            );
        }
    }

    // Outside the canonical :root definitions the raw accent literals may only
    // survive where they are unrelated to the theme family: #818cf8 is reused by
    // the report indigo tone and the resident quick action, #4f46e5 by the light
    // theme's indigo tint, and #34d399/#38bdf8 double as the success/info states.
    for (const [literal, expected] of [
        ['#818cf8', 3],
        ['#4f46e5', 2],
        ['#34d399', 2],
        ['#38bdf8', 2],
        ['#e6a85c', 1],
        ['#24c4c7', 1]
    ]) {
        const found = css.match(new RegExp(literal, 'g')) || [];
        assert.equal(
            found.length,
            expected,
            `${literal} must only appear in the canonical token definition and its known unrelated uses`
        );
    }
});

test('the print palette resolves from its canonical tokens', () => {
    const css = read('css/style.css');

    // The print stylesheet always prints on a fixed light "paper" page regardless
    // of the active theme, so its colors are theme-independent and live in the
    // :root token layer as one canonical print palette.
    const printTokens = {
        bg: '#fff',
        ink: '#111827',
        line: '#cbd5e1',
        muted: '#475569',
        success: '#047857',
        danger: '#be123c',
        info: '#4338ca'
    };
    const rootBlock = blocks(css, ':root')[0][1];
    for (const [name, value] of Object.entries(printTokens)) {
        const declaration = `--print-${name}: ${value}`;
        assert.match(rootBlock, new RegExp(declaration.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&')),
            `:root must declare ${declaration}`);
        assert.equal(
            css.split(declaration).length - 1,
            1,
            `${declaration} must be declared exactly once`
        );
    }

    // The main print block (the one that styles #printableArea) must consume the
    // tokens and keep no raw literal from the palette.
    const start = css.indexOf('@media print');
    const open = css.indexOf('{', start);
    let depth = 0;
    let printBlock = '';
    for (let i = open; i < css.length; i += 1) {
        if (css[i] === '{') depth += 1;
        else if (css[i] === '}') {
            depth -= 1;
            if (depth === 0) { printBlock = css.slice(open + 1, i); break; }
        }
    }
    assert.ok(printBlock.includes('#printableArea'), 'expected the main print block to style #printableArea');
    for (const [name, value] of Object.entries(printTokens)) {
        assert.ok(printBlock.includes(`var(--print-${name})`),
            `the print block must consume var(--print-${name})`);
        assert.ok(!printBlock.includes(value),
            `the print block must not keep the raw ${value} literal`);
    }
});
