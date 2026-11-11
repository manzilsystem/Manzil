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

test('the emerald accent ink resolves from its canonical token', () => {
    const css = read('css/style.css');

    // Text and icons that sit on the emerald settings accent surface (the teal
    // gradient used by the active nav icon, account avatars and the primary/save
    // buttons) all share one ink color. It is theme-invariant, so it lives once
    // in the #settingsModal token layer, and every consumer must reference it
    // instead of the raw literal.
    const settingsBlock = blocks(css, '#settingsModal')[0][1];
    assert.match(
        settingsBlock,
        /--settings-ink-on-accent:\s*#042d2c\s*;/,
        '#settingsModal must declare --settings-ink-on-accent: #042d2c'
    );
    assert.equal(
        css.split('--settings-ink-on-accent: #042d2c').length - 1,
        1,
        '--settings-ink-on-accent: #042d2c must be declared exactly once'
    );

    const raw = css.match(/#042d2c/gi) || [];
    assert.equal(raw.length, 1, '#042d2c must only appear in the canonical token definition');

    const uses = css.match(/var\(--settings-ink-on-accent\)/g) || [];
    assert.ok(uses.length >= 5, 'every consumer must use var(--settings-ink-on-accent)');
});

test('the light settings surface palette resolves from its canonical tokens', () => {
    const css = read('css/style.css');

    // The light theme's settings workspace (shell, sidebar, cards, dividers,
    // active nav ink and the card shadow) shares one surface palette. It lives
    // once in a scoped [data-theme="light"] #settingsModal token layer, and the
    // polish rules below must reference the tokens instead of the raw literals.
    const tokens = {
        '--settings-light-shell': '#f7fbfa',
        '--settings-light-sidebar': '#f3f9f8',
        '--settings-light-surface': '#ffffff',
        '--settings-light-line': '#dfe9e8',
        '--settings-light-ink': '#0e3a44',
        '--settings-light-shadow': 'rgba(15, 55, 65, .05)'
    };
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const marker = '/* ---------- Light theme polish ---------- */';
    const endMarker = '/* ---------- Responsive ---------- */';
    const start = css.indexOf(marker);
    const end = css.indexOf(endMarker);
    assert.ok(start !== -1 && end > start, 'expected the light theme polish section');
    const region = css.slice(start + marker.length, end);

    const tokenRule = blocks(region, '\\[data-theme="light"\\] #settingsModal')[0];
    assert.ok(tokenRule, 'expected a [data-theme="light"] #settingsModal token layer');
    for (const [name, value] of Object.entries(tokens)) {
        assert.match(
            tokenRule[1],
            new RegExp(`${name}:\\s*${escape(value)}\\s*;`),
            `the token layer must declare ${name}: ${value}`
        );
    }

    // Strip the token layer so the remaining rules must be literal-free.
    const consumers = region.replace(tokenRule[0], '');
    assert.equal((consumers.match(/#[0-9a-f]{3,8}\b/gi) || []).length, 0,
        'the light settings polish rules must not keep raw hex colors');
    assert.equal((consumers.match(/rgba?\(/g) || []).length, 0,
        'the light settings polish rules must not keep raw rgb/rgba colors');
    for (const name of Object.keys(tokens)) {
        assert.ok(consumers.includes(`var(${name})`),
            `the light settings polish rules must consume var(${name})`);
    }
});

test('the theme preview palette resolves from its canonical tokens', () => {
    const css = read('css/style.css');

    // The six selectable themes each show a miniature preview: a surface with
    // muted bars in the settings modal, and an accent-to-card-tint gradient in the
    // owner theme picker. Every one of those colors shares a single palette that
    // lives once in the :root token layer, so a preview can never drift from the
    // theme it represents.
    const themes = ['dark', 'light', 'emerald', 'ocean', 'sand', 'turquoise'];
    const tokens = {
        '--preview-bg-dark': '#0b1020',
        '--preview-bg-light': '#f3f6fc',
        '--preview-bg-emerald': '#071c18',
        '--preview-bg-ocean': '#071827',
        '--preview-bg-sand': '#211b16',
        '--preview-bg-turquoise': '#082a34',
        '--preview-muted-dark': '#4a5878',
        '--preview-muted-light': '#c7d2e5',
        '--preview-muted-emerald': '#3d6b5c',
        '--preview-muted-ocean': '#37617c',
        '--preview-muted-sand': '#6b5643',
        '--preview-muted-turquoise': '#386a72',
        '--preview-card-dark': '#1e293b',
        '--preview-card-light': '#cbd5e1',
        '--preview-card-emerald': '#065f46',
        '--preview-card-ocean': '#075985',
        '--preview-card-sand': '#78350f',
        '--preview-card-turquoise': '#0b5260'
    };
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const rootBlock = blocks(css, ':root')[0][1];
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value}`;
        assert.match(rootBlock, new RegExp(escape(declaration)),
            `:root must declare ${declaration}`);
        assert.equal(css.split(declaration).length - 1, 1,
            `${declaration} must be declared exactly once`);
    }

    // Settings previews consume the surface and muted tokens per theme.
    for (const theme of themes) {
        const rule = blocks(css, `#settingsModal \\.theme-preview-${theme}`)[0];
        assert.ok(rule, `expected a settings preview rule for "${theme}"`);
        assert.ok(
            new RegExp(`--preview-bg:\\s*var\\(--preview-bg-${theme}\\)`).test(rule[1]),
            `the ${theme} settings preview must consume var(--preview-bg-${theme})`
        );
        assert.ok(
            new RegExp(`--preview-muted:\\s*var\\(--preview-muted-${theme}\\)`).test(rule[1]),
            `the ${theme} settings preview must consume var(--preview-muted-${theme})`
        );
    }

    // Owner swatches consume the card tint token per theme.
    for (const theme of themes) {
        const rule = blocks(css, `\\.owner-theme-swatch\\.theme-preview-${theme}`)[0];
        assert.ok(rule, `expected an owner swatch rule for "${theme}"`);
        assert.ok(
            new RegExp(`--preview-card:\\s*var\\(--preview-card-${theme}\\)`).test(rule[1]),
            `the ${theme} owner swatch must consume var(--preview-card-${theme})`
        );
    }

    // The shared fallbacks reuse the dark entries instead of raw literals.
    const settingsBase = blocks(css, '#settingsModal \\.theme-preview')[0][1];
    assert.match(settingsBase, /var\(--preview-bg,\s*var\(--preview-bg-dark\)\)/,
        'the settings preview base must fall back to var(--preview-bg-dark)');
    const settingsBars = blocks(css, '#settingsModal \\.theme-preview i')[0][1];
    assert.match(settingsBars, /var\(--preview-muted,\s*var\(--preview-muted-dark\)\)/,
        'the settings preview bars must fall back to var(--preview-muted-dark)');
    const swatchBase = blocks(css, '\\.owner-theme-swatch')
        .map(rule => rule[1])
        .find(body => body.includes('background-image'));
    assert.ok(swatchBase, 'expected an owner swatch base rule carrying the gradient');
    assert.match(swatchBase, /var\(--preview-card,\s*var\(--preview-card-dark\)\)/,
        'the owner swatch base must fall back to var(--preview-card-dark)');

    // No raw literal from the palette may survive in the preview rules.
    const previewRules = [
        ...themes.map(theme => blocks(css, `#settingsModal \\.theme-preview-${theme}`)[0][0]),
        ...themes.map(theme => blocks(css, `\\.owner-theme-swatch\\.theme-preview-${theme}`)[0][0]),
        ...blocks(css, '#settingsModal \\.theme-preview').map(rule => rule[0]),
        ...blocks(css, '\\.owner-theme-swatch').map(rule => rule[0])
    ].join('\n');
    for (const value of new Set(Object.values(tokens))) {
        assert.ok(!previewRules.includes(value),
            `the theme preview rules must not keep the raw ${value} literal`);
    }
});

test('the branded sign-in palette resolves from its canonical tokens', () => {
    const css = read('css/style.css');

    // The sign-in screen (#pinLockModal) is a fixed brand surface independent of
    // the app themes, so its midnight-navy surfaces and ink tones live once in the
    // #pinLockModal token layer instead of remapping through the theme tokens.
    const tokens = {
        '--auth-surface-shell': '#07141d',
        '--auth-surface-brand-1': '#02080d',
        '--auth-surface-brand-2': '#071c27',
        '--auth-surface-brand-3': '#061018',
        '--auth-surface-panel-1': '#10232d',
        '--auth-surface-panel-2': '#0b1821',
        '--auth-surface-field': '#07131b',
        '--auth-ink-brand': '#f7f1e5',
        '--auth-ink-panel': '#f3f6f5',
        '--auth-ink-strong': '#fff',
        '--auth-ink-mark': '#e5e7eb',
        '--auth-ink-soft': '#c5d5d9',
        '--auth-ink-benefit': '#e0e9e9',
        '--auth-ink-control': '#d6e2e3',
        '--auth-ink-label': '#dbe5e4',
        '--auth-ink-help': '#edf7f5',
        '--auth-ink-subtle': '#b6c6ca',
        '--auth-ink-faint': '#aebfc2',
        '--auth-ink-dim': '#90a5ac'
    };
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const start = css.indexOf('/* Manzil branded sign-in:');
    const end = css.indexOf('   Settings workspace');
    assert.ok(start !== -1 && end > start, 'expected the branded sign-in section');
    const region = css.slice(start, end);

    // The palette is declared exactly once, in the #pinLockModal token layer.
    const tokenBlock = blocks(region, '#pinLockModal')[0];
    assert.ok(tokenBlock, 'expected a #pinLockModal token layer');
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(tokenBlock[1], new RegExp(escape(declaration)),
            `the sign-in token layer must declare ${declaration}`);
        assert.equal(css.split(declaration).length - 1, 1,
            `${declaration} must be declared exactly once`);
    }

    // Strip the token layer so the remaining rules must be literal-free and every
    // token must be consumed.
    const consumers = region.replace(/--auth-[a-z0-9-]+\s*:[^;]*;/g, '');
    for (const value of new Set(Object.values(tokens))) {
        assert.ok(!consumers.includes(value),
            `the sign-in rules must not keep the raw ${value} literal`);
    }
    for (const name of Object.keys(tokens)) {
        assert.ok(region.includes(`var(${name})`),
            `the sign-in rules must consume var(${name})`);
    }
});

test('the settings veil scale resolves from its canonical tokens', () => {
    const css = read('css/style.css');

    // The translucent-white veils that overlay the dark settings surfaces are a
    // theme-invariant alpha scale: the light-theme polish never repaints the
    // surfaces they sit on. Each step is declared once in the #settingsModal
    // token layer and the suffix is the alpha in hundredths.
    const tokens = {
        '--settings-veil-4': 'rgba(255, 255, 255, .04)',
        '--settings-veil-5': 'rgba(255, 255, 255, .05)',
        '--settings-veil-6': 'rgba(255, 255, 255, .06)',
        '--settings-veil-8': 'rgba(255, 255, 255, .08)',
        '--settings-veil-9': 'rgba(255, 255, 255, .09)',
        '--settings-veil-10': 'rgba(255, 255, 255, .1)',
        '--settings-veil-12': 'rgba(255, 255, 255, .12)',
        '--settings-veil-14': 'rgba(255, 255, 255, .14)',
        '--settings-veil-16': 'rgba(255, 255, 255, .16)',
        '--settings-veil-18': 'rgba(255, 255, 255, .18)',
        '--settings-veil-32': 'rgba(255, 255, 255, .32)'
    };
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // The veil is declared exactly once, in the #settingsModal token layer.
    const layer = blocks(css, '#settingsModal')[0];
    assert.ok(layer, 'expected a #settingsModal token layer');
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(layer[1], new RegExp(escape(declaration)),
            `the settings token layer must declare ${declaration}`);
        assert.equal(css.split(declaration).length - 1, 1,
            `${declaration} must be declared exactly once`);
        assert.ok(css.includes(`var(${name})`),
            `the settings rules must consume var(${name})`);
    }

    // Strip the veil declarations so no raw translucent-white literal may remain.
    const consumers = css.replace(/--settings-veil-[0-9]+\s*:[^;]*;/g, '');
    assert.ok(!consumers.includes('rgba(255, 255, 255,'),
        'the settings rules must not keep a raw rgba(255, 255, 255, …) literal');
});

test('the settings muted-ink scale resolves from its canonical tokens', () => {
    const css = read('css/style.css');

    // The translucent muted ink used for text on the dark settings surfaces is a
    // theme-invariant alpha scale in two tiers: the dimmer teal-white of the
    // live/phone panels and the brighter near-white of the topbar and hero. The
    // light-theme polish never repaints the surfaces they sit on. Each step is
    // declared once in the #settingsModal token layer; the suffix is the alpha
    // in hundredths.
    const tokens = {
        '--settings-muted-ink-58': 'rgba(220, 240, 237, .58)',
        '--settings-muted-ink-60': 'rgba(220, 240, 237, .6)',
        '--settings-muted-ink-62': 'rgba(220, 240, 237, .62)',
        '--settings-muted-ink-72': 'rgba(220, 240, 237, .72)',
        '--settings-muted-ink-bright-66': 'rgba(226, 244, 242, .66)',
        '--settings-muted-ink-bright-68': 'rgba(233, 247, 246, .68)',
        '--settings-muted-ink-bright-70': 'rgba(226, 246, 243, .7)',
        '--settings-muted-ink-bright-72': 'rgba(226, 246, 243, .72)'
    };
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Each ink is declared exactly once, in the #settingsModal token layer.
    const layer = blocks(css, '#settingsModal')[0];
    assert.ok(layer, 'expected a #settingsModal token layer');
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(layer[1], new RegExp(escape(declaration)),
            `the settings token layer must declare ${declaration}`);
        assert.equal(css.split(declaration).length - 1, 1,
            `${declaration} must be declared exactly once`);
        assert.ok(css.includes(`var(${name})`),
            `the settings rules must consume var(${name})`);
    }

    // Strip the ink declarations so no raw muted-ink literal may remain.
    const consumers = css.replace(/--settings-muted-ink[a-z0-9-]*\s*:[^;]*;/g, '');
    assert.ok(
        !/rgba\((220, 240, 237|226, 246, 243|226, 244, 242|233, 247, 246),/.test(consumers),
        'the settings rules must not keep a raw rgba(220, 240, 237, …) muted-ink literal'
    );
});

test('the settings bright-gold scale resolves from its canonical tokens', () => {
    const css = read('css/style.css');

    // The bright gold used by the settings accents (the live card decorations and
    // the WhatsApp phone dot) is one theme-invariant scale: a solid accent plus
    // translucent steps that share the same RGB and differ only in alpha. The
    // light-theme polish never repaints the surfaces they sit on. Every step is
    // declared once in the #settingsModal token layer; the veil suffix is the
    // alpha in hundredths.
    const tokens = {
        '--settings-gold-bright': '#f0cc7e',
        '--settings-gold-veil-10': 'rgba(240, 204, 126, .1)',
        '--settings-gold-veil-14': 'rgba(240, 204, 126, .14)',
        '--settings-gold-veil-28': 'rgba(240, 204, 126, .28)',
        '--settings-gold-veil-35': 'rgba(240, 204, 126, .35)',
        '--settings-gold-veil-40': 'rgba(240, 204, 126, .4)'
    };
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Each gold step is declared exactly once, in the #settingsModal token layer.
    const layer = blocks(css, '#settingsModal')[0];
    assert.ok(layer, 'expected a #settingsModal token layer');
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(layer[1], new RegExp(escape(declaration)),
            `the settings token layer must declare ${declaration}`);
        assert.equal(css.split(declaration).length - 1, 1,
            `${declaration} must be declared exactly once`);
        assert.ok(css.includes(`var(${name})`),
            `the settings rules must consume var(${name})`);
    }

    // Strip the gold declarations so no raw gold literal may remain.
    const consumers = css.replace(/--settings-gold[a-z0-9-]*\s*:[^;]*;/g, '');
    assert.ok(
        !/#f0cc7e|rgba\(240,\s*204,\s*126,/.test(consumers),
        'the settings rules must not keep a raw #f0cc7e / rgba(240, 204, 126, …) gold literal'
    );
});

test('the settings danger-veil scale resolves from its canonical tokens', () => {
    const css = read('css/style.css');

    // The translucent danger (rose) veils that flag an overdue rule or a
    // destructive action on the settings surfaces are one theme-invariant alpha
    // scale: the steps share one RGB and differ only in alpha. The solid ink is
    // always --state-danger. Every step is declared once in the #settingsModal
    // token layer; the suffix is the alpha in hundredths.
    const tokens = {
        '--settings-danger-veil-8': 'rgba(244, 63, 94, .08)',
        '--settings-danger-veil-10': 'rgba(244, 63, 94, .1)',
        '--settings-danger-veil-30': 'rgba(244, 63, 94, .3)',
        '--settings-danger-veil-50': 'rgba(244, 63, 94, .5)'
    };
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Each veil step is declared exactly once, in the #settingsModal token layer.
    const layer = blocks(css, '#settingsModal')[0];
    assert.ok(layer, 'expected a #settingsModal token layer');
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(layer[1], new RegExp(escape(declaration)),
            `the settings token layer must declare ${declaration}`);
        assert.equal(css.split(declaration).length - 1, 1,
            `${declaration} must be declared exactly once`);
        assert.ok(css.includes(`var(${name})`),
            `the settings rules must consume var(${name})`);
    }

    // Strip the settings danger declarations and the global danger state tokens
    // (which keep their own rgba literal) so no raw rose literal may remain in
    // the settings rules.
    const consumers = css
        .replace(/--settings-danger-veil-[0-9]+\s*:[^;]*;/g, '')
        .replace(/--state-danger-(?:soft|line)\s*:[^;]*;/g, '');
    assert.ok(
        !/rgba\(244,\s*63,\s*94,/.test(consumers),
        'the settings rules must not keep a raw rgba(244, 63, 94, …) danger literal'
    );
});

test('the settings WhatsApp dot resolves from its canonical tokens', () => {
    const css = read('css/style.css');

    // The WhatsApp brand green that paints the settings phone-status dot (the
    // receipt preview bar) is one theme-invariant pair: the solid is the single
    // source for the WhatsApp green and the ring shares its RGB at .14. Both
    // are declared once in the #settingsModal token layer.
    const tokens = {
        '--settings-whatsapp': '#25d366',
        '--settings-whatsapp-veil-14': 'rgba(37, 211, 102, .14)'
    };
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Each token is declared exactly once, in the #settingsModal token layer.
    const layer = blocks(css, '#settingsModal')[0];
    assert.ok(layer, 'expected a #settingsModal token layer');
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(layer[1], new RegExp(escape(declaration)),
            `the settings token layer must declare ${declaration}`);
        assert.equal(css.split(declaration).length - 1, 1,
            `${declaration} must be declared exactly once`);
        assert.ok(css.includes(`var(${name})`),
            `the settings rules must consume var(${name})`);
    }

    // Strip the settings WhatsApp declarations so no raw brand-green literal may
    // remain in the settings rules.
    const consumers = css.replace(/--settings-whatsapp(?:-veil-14)?\s*:[^;]*;/g, '');
    assert.ok(
        !/#25d366|rgba\(37,\s*211,\s*102,/.test(consumers),
        'the settings rules must not keep a raw #25d366 / rgba(37, 211, 102, …) WhatsApp literal'
    );
});

test('the settings validation inks resolve from their canonical tokens', () => {
    const css = read('css/style.css');

    // The settings validation affordances (the message character counter
    // nearing/at its limit and the pending owner stat) paint one theme-invariant
    // amber/red pair, each declared once in the #settingsModal token layer.
    const tokens = {
        '--settings-warning-ink': '#d97706',
        '--settings-danger-ink': '#dc2626'
    };
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const layer = blocks(css, '#settingsModal')[0];
    assert.ok(layer, 'expected a #settingsModal token layer');
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(layer[1], new RegExp(escape(declaration)),
            `the settings token layer must declare ${declaration}`);
        assert.equal(css.split(declaration).length - 1, 1,
            `${declaration} must be declared exactly once`);
        assert.ok(css.includes(`var(${name})`),
            `the settings rules must consume var(${name})`);
    }

    // Strip the settings status-ink declarations so no raw amber/red literal may
    // remain in the settings rules.
    const consumers = css.replace(/--settings-(?:warning|danger)-ink\s*:[^;]*;/g, '');
    assert.ok(
        !/#d97706|#dc2626/.test(consumers),
        'the settings rules must not keep a raw #d97706 / #dc2626 status literal'
    );
});

test('the settings bright ink resolves from its canonical token', () => {
    const css = read('css/style.css');

    // The opaque bright ink painted on the dark settings surfaces (the live card
    // heading and the phone-card preview heading) is declared once in the
    // #settingsModal token layer.
    const declaration = '--settings-ink-bright: #eaf7f4;';
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const layer = blocks(css, '#settingsModal')[0];
    assert.ok(layer, 'expected a #settingsModal token layer');
    assert.match(layer[1], new RegExp(escape(declaration)),
        `the settings token layer must declare ${declaration}`);
    assert.equal(css.split(declaration).length - 1, 1,
        `${declaration} must be declared exactly once`);
    assert.ok(css.includes('var(--settings-ink-bright)'),
        'the settings rules must consume var(--settings-ink-bright)');

    // Strip the settings bright-ink declaration so no raw literal may remain in
    // the settings rules.
    const consumers = css.replace(/--settings-ink-bright\s*:[^;]*;/g, '');
    assert.ok(
        !/#eaf7f4/.test(consumers),
        'the settings rules must not keep a raw #eaf7f4 bright-ink literal'
    );
});
