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

test('assistant accent ink resolves from one canonical token', () => {
    const css = read('css/style.css');
    const rootBlock = blocks(css, ':root')[0][1];
    const declaration = '--assistant-ink-on-accent: #241a10';
    assert.ok(rootBlock.includes(declaration), `:root must declare ${declaration}`);
    assert.equal(
        css.split(declaration).length - 1,
        1,
        `${declaration} must be declared exactly once`
    );

    const escape = selector => selector.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&');
    const consumers = [
        '[data-theme="sand"] .assistant-msg.is-user .assistant-bubble',
        '[data-theme="emerald"] .assistant-send-button,\n[data-theme="sand"] .assistant-send-button'
    ];
    for (const selector of consumers) {
        const rules = blocks(css, escape(selector));
        assert.ok(rules.length, `expected a rule for "${selector}"`);
        assert.ok(
            rules.some(rule => rule[1].includes('color: var(--assistant-ink-on-accent)')),
            `"${selector}" must consume var(--assistant-ink-on-accent)`
        );
    }

    const raw = css.match(/#241a10/gi) || [];
    assert.equal(raw.length, 1, '#241a10 must only appear in the canonical token definition');
});

test('dropdown menus share their canonical shadow token', () => {
    const css = read('css/style.css');
    const declaration = '--shadow-dropdown: 0 18px 40px rgba(2, 6, 23, .34)';
    const rootBlocks = blocks(css, ':root');
    assert.ok(
        rootBlocks.some(root => root[1].includes(declaration)),
        `a :root block must declare ${declaration}`
    );
    assert.equal(
        css.split(declaration).length - 1,
        1,
        `${declaration} must be declared exactly once`
    );

    const escape = selector => selector.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&');
    for (const selector of ['.owner-theme-menu', '.manager-notifications-menu']) {
        const rules = blocks(css, escape(selector));
        assert.ok(rules.length, `expected a rule for "${selector}"`);
        assert.ok(
            rules.some(rule => rule[1].includes('box-shadow: var(--shadow-dropdown)')),
            `"${selector}" must consume var(--shadow-dropdown)`
        );
    }

    const raw = css.match(/0 18px 40px rgba\(2, 6, 23, \.34\)/g) || [];
    assert.equal(raw.length, 1, 'the dropdown shadow geometry must only appear in its canonical token');
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

test('the settings white ink resolves from its canonical token', () => {
    const css = read('css/style.css');

    // Strong headings and values on the dark settings surfaces share one solid
    // white ink. The live-card labels use it too; the light-theme polish does
    // not repaint any of these surfaces.
    const layer = blocks(css, '#settingsModal')[0];
    assert.ok(layer, 'expected a #settingsModal token layer');
    assert.match(
        layer[1],
        /--settings-ink-white:\s*#fff;/,
        '#settingsModal must declare --settings-ink-white: #fff'
    );
    assert.equal(
        css.split('--settings-ink-white: #fff;').length - 1,
        1,
        '--settings-ink-white: #fff must be declared exactly once'
    );

    const consumers = [
        '#settingsModal .settings-brand-copy strong',
        '#settingsModal .settings-topbar-title h3',
        '#settingsModal .settings-hero-copy h4',
        '#settingsModal .settings-hero-stats b',
        '#settingsModal .settings-live-name',
        '#settingsModal .settings-live-stats b'
    ];
    for (const selector of consumers) {
        const rules = blocks(css, selector.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&'));
        assert.ok(rules.length, `expected a rule for "${selector}"`);
        assert.ok(
            rules.some(rule => /color:\s*var\(--settings-ink-white\)/.test(rule[1])),
            `"${selector}" must consume var(--settings-ink-white) instead of the raw #fff literal`
        );
        assert.ok(
            rules.every(rule => !/color:\s*#(?:fff|ffffff)\b/i.test(rule[1])),
            `"${selector}" must not keep a raw white color literal`
        );
    }

    const uses = css.match(/var\(--settings-ink-white\)/g) || [];
    assert.ok(uses.length >= consumers.length, 'every consumer must use var(--settings-ink-white)');
});

test('the settings payment-toggle thumb uses its canonical white surface token', () => {
    const css = read('css/style.css');
    const declaration = '--settings-payment-toggle-thumb-surface: #fff;';
    const layer = blocks(css, '#settingsModal')[0];
    assert.ok(layer, 'expected a #settingsModal token layer');
    assert.match(layer[1], new RegExp(declaration.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `the settings token layer must declare ${declaration}`);
    assert.equal(css.split(declaration).length - 1, 1,
        `${declaration} must be declared exactly once`);

    const selector = '#settingsModal .settings-payment-toggle input[type="checkbox"]::after';
    const rule = blocks(css, selector.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&'))[0];
    assert.ok(rule, `expected a rule for "${selector}"`);
    assert.match(rule[1], /background:\s*var\(--settings-payment-toggle-thumb-surface\)/,
        `"${selector}" must consume the canonical white surface token`);
    assert.doesNotMatch(rule[1], /background:\s*#fff\b/,
        `"${selector}" must not keep the raw white surface literal`);
});

test('the settings brand mark and toggle share one canonical shadow tint', () => {
    const css = read('css/style.css');
    const name = '--settings-shadow-black-28';
    const value = 'rgba(0, 0, 0, .28)';
    const declaration = `${name}: ${value};`;
    const escape = input => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const layer = blocks(css, '#settingsModal')[0];

    assert.ok(layer, 'expected a #settingsModal token layer');
    assert.match(layer[1], new RegExp(escape(declaration)),
        `the settings token layer must declare ${declaration}`);
    assert.equal(css.split(declaration).length - 1, 1,
        `${declaration} must be declared exactly once`);

    for (const [selector, geometry] of [
        ['#settingsModal .settings-brand-mark', '0 6px 18px'],
        ['#settingsModal .settings-payment-toggle input[type="checkbox"]::after', '0 2px 6px']
    ]) {
        const rule = blocks(css, selector.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&'))[0];
        assert.ok(rule, `expected a rule for "${selector}"`);
        assert.match(rule[1], new RegExp(`box-shadow:\\s*${escape(geometry)}\\s+var\\(${escape(name)}\\)`),
            `"${selector}" must preserve its shadow geometry and use var(${name})`);
        assert.doesNotMatch(rule[1], new RegExp(escape(value)),
            `"${selector}" must not retain ${value}`);
    }

    const literals = css.match(new RegExp(escape(value), 'g')) || [];
    assert.equal(literals.length, 1, `${value} must only appear in the canonical token definition`);
});

test('the settings card-tone accent palette resolves from its canonical tokens', () => {
    const css = read('css/style.css');

    // Five card-tone accents (sky/violet/amber/rose/indigo) previously had raw
    // hex literals in their data-tone rules. They now resolve from canonical
    // tokens in the #settingsModal layer. The other three tones (teal→settings-accent,
    // gold→settings-gold, emerald→settings-emerald) already had tokens.
    const tokens = {
        '--settings-card-sky':    '#38a8e0',
        '--settings-card-violet': '#8b7cf6',
        '--settings-card-amber':  '#e0a034',
        '--settings-card-rose':   '#e06a8b',
        '--settings-card-indigo': '#6477e8'
    };
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Each token is declared exactly once, in the #settingsModal token layer.
    const layer = blocks(css, '#settingsModal')[0];
    assert.ok(layer, 'expected a #settingsModal token layer');
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(
            layer[1],
            new RegExp(escape(declaration)),
            `the settings token layer must declare ${declaration}`
        );
        assert.equal(
            css.split(declaration).length - 1,
            1,
            `${declaration} must be declared exactly once`
        );
    }

    // The data-tone rules must consume the tokens; no raw literal may survive.
    for (const [name, value] of Object.entries(tokens)) {
        const tone = name.replace('--settings-card-', '');
        const rule = blocks(css, `#settingsModal \\.settings-card\\[data-tone="${tone}"\\]`)[0];
        assert.ok(rule, `expected a data-tone rule for "${tone}"`);
        assert.ok(
            new RegExp(`--card-accent:\\s*var\\(${name}\\)`).test(rule[1]),
            `data-tone="${tone}" must set --card-accent to var(${name})`
        );
        assert.ok(
            !rule[1].includes(value),
            `data-tone="${tone}" must not keep the raw ${value} literal`
        );
    }

    // Global literal count: each value must only appear in its definition.
    for (const [, value] of Object.entries(tokens)) {
        const found = css.match(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || [];
        assert.equal(found.length, 1,
            `${value} must only appear in the canonical token definition`);
    }
});

test('the settings brand-preview palette resolves from canonical tokens', () => {
    const css = read('css/style.css');
    const tokens = {
        '--settings-brand-preview-light-surface': '#f2f7f6',
        '--settings-brand-preview-dark-ink': '#e7f3f1',
        '--settings-brand-preview-light-ink': '#173b48'
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
    }

    for (const [selector, token] of [
        ['#settingsModal .settings-brand-preview-light', '--settings-brand-preview-light-surface'],
        ['#settingsModal .settings-brand-preview-card span', '--settings-brand-preview-dark-ink'],
        ['#settingsModal .settings-brand-preview-light span', '--settings-brand-preview-light-ink']
    ]) {
        const rule = blocks(css, selector.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&'))[0];
        assert.ok(rule, `expected a rule for "${selector}"`);
        assert.ok(rule[1].includes(`var(${token})`),
            `"${selector}" must consume var(${token})`);
    }

    for (const value of Object.values(tokens)) {
        const found = css.match(new RegExp(escape(value), 'g')) || [];
        assert.equal(found.length, 1,
            `${value} must only appear in the canonical token definition`);
    }
});

test('the settings light-ink palette resolves from canonical tokens', () => {
    const css = read('css/style.css');
    const tokens = {
        '--settings-ink-topbar': '#f2fbfa',
        '--settings-ink-close': '#e8f7f5',
        '--settings-ink-hero': '#ecfbf9',
        '--settings-ink-hero-kicker': '#bff4ee'
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
    }

    for (const [selector, token] of [
        ['#settingsModal .settings-topbar', '--settings-ink-topbar'],
        ['#settingsModal .settings-close-button', '--settings-ink-close'],
        ['#settingsModal .settings-hero', '--settings-ink-hero'],
        ['#settingsModal .settings-hero-kicker', '--settings-ink-hero-kicker']
    ]) {
        const rule = blocks(css, selector.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&'))[0];
        assert.ok(rule, `expected a rule for "${selector}"`);
        assert.match(rule[1], new RegExp(`color:\\s*var\\(${escape(token)}\\)`),
            `"${selector}" must consume var(${token})`);
    }

    for (const value of Object.values(tokens)) {
        const found = css.match(new RegExp(escape(value), 'g')) || [];
        assert.equal(found.length, 1,
            `${value} must only appear in the canonical token definition`);
    }
});

test('the settings emerald icon inks resolve from canonical tokens', () => {
    const css = read('css/style.css');
    const tokens = {
        '--settings-ink-profile-avatar': '#052e2c',
        '--settings-ink-theme-check': '#032a29'
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
    }

    for (const [selector, token] of [
        ['#settingsModal .settings-profile-avatar', '--settings-ink-profile-avatar'],
        ['#settingsModal .theme-option.active::after', '--settings-ink-theme-check']
    ]) {
        const rule = blocks(css, selector.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&'))[0];
        assert.ok(rule, `expected a rule for "${selector}"`);
        assert.match(rule[1], new RegExp(`color:\\s*var\\(${escape(token)}\\)`),
            `"${selector}" must consume var(${token})`);
    }

    for (const value of Object.values(tokens)) {
        const found = css.match(new RegExp(escape(value), 'g')) || [];
        assert.equal(found.length, 1,
            `${value} must only appear in the canonical token definition`);
    }
});

test('the settings dark-green surface stops resolve from canonical tokens', () => {
    const css = read('css/style.css');
    const tokens = {
        '--settings-live-card-end': '#0d3c40',
        '--settings-phone-card-end': '#0b2c33',
        '--settings-message-bubble-start': '#0f3b3a',
        '--settings-message-bubble-end': '#0b2f36'
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
    }

    for (const [selector, token] of [
        ['#settingsModal .settings-live-card', '--settings-live-card-end'],
        ['#settingsModal .settings-phone-card', '--settings-phone-card-end'],
        ['#settingsModal .settings-phone .settings-preview-body', '--settings-message-bubble-start'],
        ['#settingsModal .settings-phone .settings-preview-body', '--settings-message-bubble-end']
    ]) {
        const rule = blocks(css, selector.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&'))[0];
        assert.ok(rule, `expected a rule for "${selector}"`);
        assert.match(rule[1], new RegExp(`background:[\\s\\S]*var\\(${escape(token)}\\)`),
            `"${selector}" must consume var(${token})`);
    }

    for (const value of Object.values(tokens)) {
        const found = css.match(new RegExp(escape(value), 'g')) || [];
        assert.equal(found.length, 1,
            `${value} must only appear in the canonical token definition`);
    }
});

test('the indigo accent palette resolves from its canonical tokens', () => {
    // Part 56: the five indigo/violet literals used by report-tone-indigo,
    // quick-action-resident, guide-step-number and #appCopyright a are now
    // routed through a canonical six-token palette defined once in :root with
    // per-theme overrides in [data-theme="light"]. Each token matches the
    // literal it replaced, so no visual change is introduced.
    const assert = require('node:assert/strict');
    const css = read('css/style.css');
    const rootBlock = blocks(css, ':root')[0][1];

    // 1. All six tokens are defined in :root.
    const rootTokens = {
        '--indigo-bright': '#818cf8',
        '--indigo-soft': 'rgba(99, 102, 241, .16)',
        '--indigo-line': 'rgba(99, 102, 241, .42)',
        '--indigo-tint-22': 'rgba(99, 102, 241, .22)',
        '--indigo-tint-32': 'rgba(129, 140, 248, .32)',
        '--indigo-link': '#c7d2fe'
    };
    for (const [name, value] of Object.entries(rootTokens)) {
        assert.match(rootBlock, new RegExp(`${name}\\s*:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
            `expected :root to declare ${name}: ${value}`);
    }

    // 2. Light-theme remaps bright/soft/line.
    const lightThemeBlock = blocks(css, '\\[data-theme="light"\\]')[0][1];
    assert.match(lightThemeBlock, /--indigo-bright\s*:\s*#4338ca/,
        'light theme must remap --indigo-bright to #4338ca');
    assert.match(lightThemeBlock, /--indigo-soft\s*:\s*#eef2ff/,
        'light theme must remap --indigo-soft to #eef2ff');
    assert.match(lightThemeBlock, /--indigo-line\s*:\s*#c7d2fe/,
        'light theme must remap --indigo-line to #c7d2fe');

    // 3. Each consumer uses a token, not a raw literal.
    const consumers = [
        ['.report-tone-indigo', '--report-tone', '--indigo-bright'],
        ['.report-tone-indigo', '--report-tone-soft', '--indigo-soft'],
        ['.report-tone-indigo', '--report-tone-line', '--indigo-line'],
        ['.quick-action-resident', 'color', '--indigo-bright'],
        ['.guide-step-number', 'color', '--indigo-link'],
        ['.guide-step-number', 'background', '--indigo-tint-22'],
    ];
    for (const [selector, prop, token] of consumers) {
        const escapedSel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rule = blocks(css, escapedSel)[0];
        assert.ok(rule, `expected a rule for "${selector}"`);
        assert.ok(rule[1].includes(`var(${token})`),
            `"${selector}" ${prop} must consume var(${token})`);
    }

    // 4. #appCopyright a uses --indigo-link.
    assert.match(css, /#appCopyright a \{ color: var\(--indigo-link\)/,
        '#appCopyright a must use var(--indigo-link)');

    // 5. The five dark-theme raw literals must not appear in any consumer rule
    //    (they are allowed only in token definition lines).
    // 5. Verify each consumer rule directly (no raw literals in consumer declarations).
    // We check each consumer rule individually instead of stripping the whole CSS,
    // which avoids false positives from comment lines and cross-token definitions.
    const consumerSelectors = [
        { sel: '.report-tone-indigo', badLiterals: ['#818cf8', 'rgba(99, 102, 241', 'rgba(129, 140, 248'] },
        { sel: '.quick-action-resident', badLiterals: ['#818cf8'] },
        { sel: '.guide-step-number', badLiterals: ['#c7d2fe', 'rgba(99, 102, 241', 'rgba(129, 140, 248'] },
    ];
    for (const { sel, badLiterals } of consumerSelectors) {
        const escapedSel = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rule = blocks(css, escapedSel)[0];
        assert.ok(rule, `expected a rule for "${sel}"`);
        for (const lit of badLiterals) {
            assert.ok(!rule[1].includes(lit),
                `"${sel}" must not contain raw literal "${lit}" — route through token instead`);
        }
    }
    // #appCopyright a is checked in assertion 4 above (uses var(--indigo-link))
    // and the auth-screen test verifies no raw #c7d2fe in that rule.
});

test('the assistant bubble and send-button inks resolve from canonical tokens', () => {
    // Part 57: the assistant user bubble and the send button that paint the accent
    // surface kept raw #fff / #000 / #06251c literals. They now resolve from the
    // canonical assistant palette declared once in :root. Each token matches the
    // literal it replaced, so no visual change is introduced.
    const css = read('css/style.css');
    const rootBlock = blocks(css, ':root')[0][1];
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const tokens = {
        '--assistant-ink-on-accent-default': '#fff',
        '--assistant-ink-on-accent-emerald': '#06251c',
        '--assistant-border-shade': '#000'
    };
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(rootBlock, new RegExp(escape(declaration)), `:root must declare ${declaration}`);
        assert.equal(css.split(declaration).length - 1, 1, `${declaration} must be declared exactly once`);
    }

    // The bubble consumes the default ink and the border shade.
    const bubble = blocks(css, '\\.assistant-msg\\.is-user \\.assistant-bubble');
    assert.ok(bubble.length, 'expected a rule for the assistant user bubble');
    assert.ok(
        bubble.some(rule => /color:\s*var\(--assistant-ink-on-accent-default\)/.test(rule[1])),
        'the assistant user bubble must consume var(--assistant-ink-on-accent-default)'
    );
    assert.ok(
        bubble.some(rule => /color-mix\(in srgb, var\(--accent-color\) 70%, var\(--assistant-border-shade\)\)/.test(rule[1])),
        'the assistant user bubble border must consume var(--assistant-border-shade)'
    );
    assert.ok(
        bubble.every(rule => !/color:\s*#fff\b/i.test(rule[1])),
        'the assistant user bubble must not keep a raw #fff ink literal'
    );

    // The emerald theme overrides only the ink.
    const emeraldBubble = blocks(css, '\\[data-theme="emerald"\\] \\.assistant-msg\\.is-user \\.assistant-bubble')[0];
    assert.ok(emeraldBubble, 'expected the emerald user-bubble rule');
    assert.ok(
        /color:\s*var\(--assistant-ink-on-accent-emerald\)/.test(emeraldBubble[1]),
        'the emerald user bubble must consume var(--assistant-ink-on-accent-emerald)'
    );

    // The send button shares the default ink and the border shade.
    const send = blocks(css, '\\.assistant-send-button');
    assert.ok(send.length, 'expected a rule for the assistant send button');
    assert.ok(
        send.some(rule => /color:\s*var\(--assistant-ink-on-accent-default\)/.test(rule[1])),
        'the assistant send button must consume var(--assistant-ink-on-accent-default)'
    );
    assert.ok(
        send.some(rule => /color-mix\(in srgb, var\(--accent-color\) 60%, var\(--assistant-border-shade\)\)/.test(rule[1])),
        'the assistant send button border must consume var(--assistant-border-shade)'
    );
    assert.ok(
        send.every(rule => !/color:\s*#fff\b/i.test(rule[1])),
        'the assistant send button must not keep a raw #fff ink literal'
    );

    // The replaced literals that are unique to this palette may only survive in
    // their token definitions (#fff is shared with other palettes).
    for (const literal of ['#000', '#06251c']) {
        const found = css.match(new RegExp(literal, 'g')) || [];
        assert.equal(found.length, 1, `${literal} must only appear in the canonical token definition`);
    }
});

test('the report primary-action palette resolves from canonical tokens', () => {
    // Part 58: the emerald "primary" report button (.report-action-primary and its
    // hover) kept raw #059669 / #10b981 / #fff literals plus a raw shadow stop. They
    // now resolve from the canonical report primary palette declared once in :root.
    // Each token matches the literal it replaced, so no visual change is introduced.
    const css = read('css/style.css');
    const rootBlock = blocks(css, ':root')[0][1];
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const tokens = {
        '--report-primary-solid': '#059669',
        '--report-primary-solid-hover': '#10b981',
        '--report-primary-ink': '#fff',
        '--report-primary-shadow': 'rgba(5, 150, 105, .18)'
    };
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(rootBlock, new RegExp(escape(declaration)), `:root must declare ${declaration}`);
        assert.equal(css.split(declaration).length - 1, 1, `${declaration} must be declared exactly once`);
    }

    // The primary button consumes the solid ink + shadow tokens.
    const primary = blocks(css, '\\.report-action-primary');
    assert.ok(primary.length, 'expected a rule for the report primary action');
    const base = primary[0];
    assert.ok(/background:\s*var\(--report-primary-solid\)/.test(base[1]),
        'the report primary action must paint its background via var(--report-primary-solid)');
    assert.ok(/border-color:\s*var\(--report-primary-solid\)/.test(base[1]),
        'the report primary action must paint its border via var(--report-primary-solid)');
    assert.ok(/color:\s*var\(--report-primary-ink\)/.test(base[1]),
        'the report primary action must paint its ink via var(--report-primary-ink)');
    assert.ok(/box-shadow:\s*0 8px 20px var\(--report-primary-shadow\)/.test(base[1]),
        'the report primary action must paint its shadow stop via var(--report-primary-shadow)');
    assert.ok(!/#059669|color:\s*#fff\b|rgba\(5,\s*150,\s*105/.test(base[1]),
        'the report primary action must not keep raw #059669 / #fff / shadow literals');

    // The hover state consumes the hover token.
    const hover = blocks(css, '\\.report-action-primary:hover:not\\(:disabled\\)')[0];
    assert.ok(hover, 'expected a rule for the report primary action hover');
    assert.ok(/background:\s*var\(--report-primary-solid-hover\)/.test(hover[1]),
        'the report primary hover must paint its background via var(--report-primary-solid-hover)');
    assert.ok(/border-color:\s*var\(--report-primary-solid-hover\)/.test(hover[1]),
        'the report primary hover must paint its border via var(--report-primary-solid-hover)');
    assert.ok(!hover[1].includes('#10b981'),
        'the report primary hover must not keep a raw #10b981 literal (#10b981 survives only in excluded surfaces)');

    // #059669 and the shadow stop were unique to this palette; they may only
    // survive in their token definitions.
    for (const literal of ['#059669', 'rgba(5, 150, 105, .18)']) {
        const found = css.match(new RegExp(escape(literal), 'g')) || [];
        assert.equal(found.length, 1, `${literal} must only appear in the canonical token definition`);
    }
});

test('the manager notification badge palette resolves from canonical tokens', () => {
    // Part 59: the manager notification bell's unread-count badge kept raw #e11d48
    // and #fff literals. It now resolves from the canonical manager badge palette
    // declared once in :root. Each token matches the literal it replaced, so no
    // visual change is introduced.
    const css = read('css/style.css');
    const rootBlock = blocks(css, ':root')[0][1];
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const tokens = {
        '--manager-badge-surface': '#e11d48',
        '--manager-badge-ink': '#fff'
    };
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(rootBlock, new RegExp(escape(declaration)), `:root must declare ${declaration}`);
        assert.equal(css.split(declaration).length - 1, 1, `${declaration} must be declared exactly once`);
    }

    const badge = blocks(css, '\\.manager-notifications-badge')[0];
    assert.ok(badge, 'expected a rule for the manager notification badge');
    assert.ok(/background:\s*var\(--manager-badge-surface\)/.test(badge[1]),
        'the manager notification badge must paint its surface via var(--manager-badge-surface)');
    assert.ok(/color:\s*var\(--manager-badge-ink\)/.test(badge[1]),
        'the manager notification badge must paint its ink via var(--manager-badge-ink)');
    assert.ok(!/#e11d48/.test(badge[1]) && !/color:\s*#fff\b/i.test(badge[1]),
        'the manager notification badge must not keep raw #e11d48 / #fff literals');

    // #e11d48 was unique to this palette; it may only survive in its token definition.
    const found = css.match(new RegExp(escape('#e11d48'), 'g')) || [];
    assert.equal(found.length, 1, '#e11d48 must only appear in the canonical token definition');
});

test('the assistant floating-button shadow palette resolves from canonical tokens', () => {
    // Part 60: the عم عبده floating button (.assistant-fab) and its compact state kept
    // raw rgba(2, 6, 23, .38) / rgba(2, 6, 23, .32) shadow literals. They now resolve
    // from the canonical assistant FAB shadow palette declared once in :root. Each
    // token matches the literal it replaced, so no visual change is introduced.
    const css = read('css/style.css');
    const rootBlock = blocks(css, ':root')[0][1];
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const tokens = {
        '--assistant-fab-shadow': 'rgba(2, 6, 23, .38)',
        '--assistant-fab-shadow-compact': 'rgba(2, 6, 23, .32)'
    };
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(rootBlock, new RegExp(escape(declaration)), `:root must declare ${declaration}`);
        assert.equal(css.split(declaration).length - 1, 1, `${declaration} must be declared exactly once`);
    }

    const fab = blocks(css, '\\.assistant-fab')[0];
    assert.ok(fab, 'expected a rule for the assistant floating action button');
    assert.ok(/box-shadow:\s*0 14px 34px var\(--assistant-fab-shadow\)/.test(fab[1]),
        'the assistant FAB must cast its drop shadow via var(--assistant-fab-shadow)');
    assert.ok(!/rgba\(2, 6, 23/.test(fab[1]),
        'the assistant FAB must not keep a raw rgba(2, 6, 23, …) shadow literal');

    const compact = blocks(css, '\\.assistant-fab\\.is-compact')[0];
    assert.ok(compact, 'expected a rule for the compact assistant FAB');
    assert.ok(/box-shadow:\s*0 9px 22px var\(--assistant-fab-shadow-compact\)/.test(compact[1]),
        'the compact assistant FAB must cast its drop shadow via var(--assistant-fab-shadow-compact)');
    assert.ok(!/rgba\(2, 6, 23/.test(compact[1]),
        'the compact assistant FAB must not keep a raw rgba(2, 6, 23, …) shadow literal');

    // Both literals were unique to this palette; they may only survive in their token
    // definitions (the remaining rgba(2, 6, 23, …) alphas belong to excluded surfaces).
    for (const literal of ['rgba(2, 6, 23, .38)', 'rgba(2, 6, 23, .32)']) {
        const found = css.match(new RegExp(escape(literal), 'g')) || [];
        assert.equal(found.length, 1, `${literal} must only appear in the canonical token definition`);
    }
});

test('the settings preview-panel inks and hairline resolve from canonical tokens', () => {
    // Part 61: the settings live-card heading (#settingsModal .settings-live-head b),
    // the phone preview body ink (#settingsModal .settings-phone .settings-preview-body)
    // and the phone card hairline (#settingsModal .settings-phone-card) kept raw
    // #f4fbfa / #e9f7f4 / rgba(15, 59, 58, .4) literals. They now resolve from canonical
    // tokens declared once inside the #settingsModal token layer. Every token matches
    // the literal it replaced, and these dark surfaces are theme-invariant (the light
    // theme polish does not repaint them), so no visual change is introduced.
    const css = read('css/style.css');
    const settingsBlock = blocks(css, '#settingsModal')[0][1];
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const tokens = {
        '--settings-live-head-ink': '#f4fbfa',
        '--settings-preview-body-ink': '#e9f7f4',
        '--settings-phone-card-line': 'rgba(15, 59, 58, .4)'
    };
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(settingsBlock, new RegExp(escape(declaration)),
            `#settingsModal must declare ${declaration}`);
        assert.equal(css.split(declaration).length - 1, 1, `${declaration} must be declared exactly once`);
    }

    const liveHead = blocks(css, '#settingsModal \\.settings-live-head b')[0];
    assert.ok(liveHead, 'expected a rule for the settings live-card heading');
    assert.ok(/color:\s*var\(--settings-live-head-ink\)/.test(liveHead[1]),
        'the settings live-card heading must paint its ink via var(--settings-live-head-ink)');
    assert.ok(!/#f4fbfa/.test(liveHead[1]),
        'the settings live-card heading must not keep a raw #f4fbfa literal');

    const phoneCard = blocks(css, '#settingsModal \\.settings-phone-card')[0];
    assert.ok(phoneCard, 'expected a rule for the settings phone card');
    assert.ok(/border-color:\s*var\(--settings-phone-card-line\)/.test(phoneCard[1]),
        'the settings phone card must draw its hairline via var(--settings-phone-card-line)');
    assert.ok(!/rgba\(15, 59, 58/.test(phoneCard[1]),
        'the settings phone card must not keep a raw rgba(15, 59, 58, …) hairline literal');

    const previewBody = blocks(css, '#settingsModal \\.settings-phone \\.settings-preview-body')[0];
    assert.ok(previewBody, 'expected a rule for the settings phone preview body');
    assert.ok(/color:\s*var\(--settings-preview-body-ink\)/.test(previewBody[1]),
        'the settings phone preview body must paint its ink via var(--settings-preview-body-ink)');
    assert.ok(!/#e9f7f4/.test(previewBody[1]),
        'the settings phone preview body must not keep a raw #e9f7f4 literal');

    // Each literal was unique to its rule; it may only survive in its token definition.
    for (const literal of ['#f4fbfa', '#e9f7f4', 'rgba(15, 59, 58, .4)']) {
        const found = css.match(new RegExp(escape(literal), 'g')) || [];
        assert.equal(found.length, 1, `${literal} must only appear in the canonical token definition`);
    }
});

test('the header brand mark frame resolves from canonical tokens', () => {
    // Part 62: the base .header-brand-mark frame kept raw rgba(15, 23, 42, .12),
    // #f8fbfd and rgba(2, 20, 35, .12) literals for its hairline, surface and drop
    // shadow. They now resolve from canonical tokens declared once in :root. Every
    // token matches the literal it replaced and the frame is theme-invariant, so no
    // visual change is introduced.
    const css = read('css/style.css');
    const rootBlock = blocks(css, ':root')[0][1];
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const tokens = {
        '--header-brand-line': 'rgba(15, 23, 42, .12)',
        '--header-brand-surface': '#f8fbfd',
        '--header-brand-shadow': 'rgba(2, 20, 35, .12)'
    };
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(rootBlock, new RegExp(escape(declaration)), `:root must declare ${declaration}`);
        assert.equal(css.split(declaration).length - 1, 1, `${declaration} must be declared exactly once`);
    }

    const mark = blocks(css, '\\.header-brand-mark')[0];
    assert.ok(mark, 'expected a rule for the header brand mark');
    assert.ok(/border:\s*1px solid var\(--header-brand-line\)/.test(mark[1]),
        'the header brand mark must draw its hairline via var(--header-brand-line)');
    assert.ok(/background:\s*var\(--header-brand-surface\)/.test(mark[1]),
        'the header brand mark must fill its surface via var(--header-brand-surface)');
    assert.ok(/box-shadow:\s*0 5px 16px var\(--header-brand-shadow\)/.test(mark[1]),
        'the header brand mark must cast its drop shadow via var(--header-brand-shadow)');
    assert.ok(!/#f8fbfd|rgba\(15,\s*23,\s*42|rgba\(2,\s*20,\s*35/.test(mark[1]),
        'the header brand mark must not keep a raw frame color literal');

    // Each literal was unique to this rule; it may only survive in its token definition.
    for (const literal of ['rgba(15, 23, 42, .12)', '#f8fbfd', 'rgba(2, 20, 35, .12)']) {
        const found = css.match(new RegExp(escape(literal), 'g')) || [];
        assert.equal(found.length, 1, `${literal} must only appear in the canonical token definition`);
    }
});

test('the remaining accent-surface inks and report/owner literals resolve from canonical tokens', () => {
    // Part 63: the last raw colors outside the excluded settings/login scopes —
    // the settings/notice header and save-button ink (#fff, sand override #211b16),
    // the reports navigation hover shadow tint rgba(2, 8, 23, .3) and the owner
    // theme swatch fallback accent #6366f1 — now resolve from canonical tokens
    // declared once in :root. Every value matches the literal it replaced.
    const css = read('css/style.css');
    const rootBlock = blocks(css, ':root')[0][1];
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const tokens = {
        '--accent-surface-ink': '#fff',
        '--accent-surface-ink-sand': '#211b16',
        '--report-nav-shadow-tint': 'rgba(2, 8, 23, .3)',
        '--owner-swatch-fallback-accent': '#6366f1'
    };
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(rootBlock, new RegExp(escape(declaration)), `:root must declare ${declaration}`);
        assert.equal(css.split(declaration).length - 1, 1, `${declaration} must be declared exactly once`);
    }

    const header = css.match(/\n\.settings-modal-header \{([^}]*)\}/);
    assert.ok(header, 'expected a rule for the settings modal header');
    assert.ok(/color:\s*var\(--accent-surface-ink\)/.test(header[1]),
        'the settings modal header must paint its ink via var(--accent-surface-ink)');
    assert.ok(!/#fff\b/.test(header[1]), 'the settings modal header must not keep a raw #fff ink');

    const save = css.match(/\n\.settings-save-button \{([^}]*)\}/);
    assert.ok(save, 'expected a rule for the settings save button');
    assert.ok(/color:\s*var\(--accent-surface-ink\)/.test(save[1]),
        'the settings save button must paint its ink via var(--accent-surface-ink)');
    assert.ok(!/#fff\b/.test(save[1]), 'the settings save button must not keep a raw #fff ink');

    const sand = css.match(/\n\[data-theme="sand"\] \.settings-modal-header,\[data-theme="sand"\] \.settings-save-button \{([^}]*)\}/);
    assert.ok(sand, 'expected the sand-theme ink override');
    assert.ok(/color:\s*var\(--accent-surface-ink-sand\)/.test(sand[1]),
        'the sand-theme override must paint its ink via var(--accent-surface-ink-sand)');
    assert.ok(!/#211b16/.test(sand[1]), 'the sand-theme override must not keep a raw #211b16 ink');

    const nav = css.match(/\n\.report-nav-item:hover \{([^}]*)\}/);
    assert.ok(nav, 'expected a rule for the reports navigation hover');
    assert.ok(/var\(--report-nav-shadow-tint\)/.test(nav[1]),
        'the reports navigation hover must mix its shadow tint via var(--report-nav-shadow-tint)');
    assert.ok(!/rgba\(2, 8, 23/.test(nav[1]),
        'the reports navigation hover must not keep a raw rgba(2, 8, 23, …) tint');

    const swatch = blocks(css, '\\.owner-theme-swatch').map(match => match[1])
        .find(body => /background-image/.test(body));
    assert.ok(swatch, 'expected the owner theme swatch gradient rule');
    assert.ok(/var\(--preview-accent, var\(--owner-swatch-fallback-accent\)\)/.test(swatch),
        'the owner theme swatch must fall back to var(--owner-swatch-fallback-accent)');
    assert.ok(!/#6366f1/.test(swatch), 'the owner theme swatch must not keep a raw #6366f1 fallback');

    // The shadow tint literal was unique to its rule and may only survive in its token.
    assert.equal((css.match(/rgba\(2, 8, 23, \.3\)/g) || []).length, 1,
        'rgba(2, 8, 23, .3) must only appear in the canonical token definition');
    // The fallback accent literal also remains as the default --accent-color.
    assert.equal((css.match(/#6366f1/g) || []).length, 2,
        '#6366f1 must only appear in the default accent and the fallback token');
});

test('the generated receipt document palette resolves from canonical tokens', () => {
    // Part 64: buildReceiptDocument in js/access.js writes a standalone receipt
    // document into a fresh print window, so it cannot inherit the app :root tokens.
    // Its inline <style> now declares one canonical --receipt-doc-* palette and
    // references it from every rule. The document is theme-invariant and every value
    // matches the literal it replaced, so there is no visual change.
    const source = read('js/access.js');
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
    assert.ok(styleMatch, 'expected the receipt document to carry one inline <style>');
    const style = styleMatch[1];

    const rootMatch = style.match(/:root\s*\{([^}]*)\}/);
    assert.ok(rootMatch, 'expected the receipt document style to declare a :root token block');
    const rootBlock = rootMatch[1];
    const rules = style.replace(rootMatch[0], '');

    const tokens = {
        '--receipt-doc-canvas': '#f1f5f9',
        '--receipt-doc-ink': '#0f172a',
        '--receipt-doc-surface': '#fff',
        '--receipt-doc-accent-ink': '#fff',
        '--receipt-doc-line': '#cbd5e1',
        '--receipt-doc-rule': '#334155',
        '--receipt-doc-muted': '#475569',
        '--receipt-doc-hairline': '#e2e8f0',
        '--receipt-doc-faint': '#64748b',
        '--receipt-doc-head-surface': '#f8fafc',
        '--receipt-doc-total-surface': '#ecfdf5',
        '--receipt-doc-total-ink': '#065f46',
        '--receipt-doc-accent': '#4f46e5'
    };
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: ${value};`;
        assert.match(rootBlock, new RegExp(escape(declaration)),
            `the receipt document must declare ${declaration}`);
        assert.equal(rootBlock.split(declaration).length - 1, 1,
            `${declaration} must be declared exactly once`);
    }

    // Every rule now references the canonical tokens instead of raw colors.
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(rules),
        'the receipt document rules must not keep a raw hex color');
    assert.ok(!/rgba?\(/.test(rules),
        'the receipt document rules must not keep a raw rgb()/rgba() color');
    for (const name of Object.keys(tokens)) {
        assert.ok(rules.includes(`var(${name})`),
            `the receipt document rules must consume var(${name})`);
    }

    // The raw literals only survive inside the canonical token block.
    assert.equal((rootBlock.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length, 13,
        'all 13 receipt document colors must be declared once in the token block');
});

test('the receipt image canvas palette resolves from canonical tokens', () => {
    // Part 65: drawReceiptImage in js/access.js paints the exported PNG receipt with
    // raw hex literals. A canvas cannot read the app CSS custom properties, so the
    // palette is now declared once as a frozen token map and referenced from every
    // draw call. Each value matches the literal it replaced, so the PNG is unchanged.
    const source = read('js/access.js');
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const paletteMatch = source.match(/const RECEIPT_IMAGE_PALETTE = Object\.freeze\(\{([\s\S]*?)\}\);/);
    assert.ok(paletteMatch, 'expected a frozen RECEIPT_IMAGE_PALETTE token map');
    const palette = paletteMatch[1];

    const tokens = {
        surface: '#ffffff',
        accentInk: '#ffffff',
        ink: '#0f172a',
        rule: '#334155',
        muted: '#475569',
        faint: '#64748b',
        source: '#94a3b8',
        hairline: '#e2e8f0',
        line: '#cbd5e1',
        accent: '#4f46e5',
        headerSurface: '#047857',
        headerMutedInk: '#d1fae5',
        headSurface: '#f8fafc',
        totalSurface: '#ecfdf5',
        totalInk: '#065f46'
    };
    for (const [name, value] of Object.entries(tokens)) {
        const declaration = `${name}: '${value}'`;
        assert.match(palette, new RegExp(escape(declaration)),
            `the receipt image palette must declare ${declaration}`);
        assert.equal(palette.split(declaration).length - 1, 1,
            `${declaration} must be declared exactly once`);
    }

    // The canvas drawing must reference the canonical tokens, not raw colors.
    const drawMatch = source.match(/function drawReceiptImage\(plan\) \{([\s\S]*?)\n\}\n/);
    assert.ok(drawMatch, 'expected the drawReceiptImage function body');
    const body = drawMatch[1];
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(body),
        'the receipt image canvas must not keep a raw hex color');
    for (const name of Object.keys(tokens)) {
        assert.ok(body.includes(`RECEIPT_IMAGE_PALETTE.${name}`),
            `the receipt image canvas must consume RECEIPT_IMAGE_PALETTE.${name}`);
    }

    // The raw literals only survive inside the canonical palette map.
    assert.equal((palette.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length, 15,
        'all 15 receipt image colors must be declared once in the palette map');
});

test('the browser theme colour palette has a single source of truth', () => {
    // Part 66: the theme -> browser chrome colour map was duplicated inline inside the
    // JSON import flow (js/backup.js) next to the canonical MANZIL_THEME_COLORS in
    // js/state.js, so the two could drift. The import now reuses applyThemeToDocument(),
    // leaving the palette declared once.
    const state = read('js/state.js');
    const backup = read('js/backup.js');

    assert.equal((state.match(/const MANZIL_THEME_COLORS = \{/g) || []).length, 1,
        'state.js must declare the theme colour map exactly once');
    for (const theme of ['dark', 'light', 'emerald', 'ocean', 'sand', 'turquoise']) {
        assert.match(state, new RegExp(`${theme}:'#[0-9a-f]{6}'`),
            `MANZIL_THEME_COLORS must keep the ${theme} colour`);
    }

    assert.doesNotMatch(backup, /dark:\s*'#0b1020'/,
        'backup.js must not redeclare the theme colour palette');
    assert.match(backup, /applyThemeToDocument\(state\.currentTheme\)/,
        'the JSON import must apply the imported theme through the canonical applier');
});
