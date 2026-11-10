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
