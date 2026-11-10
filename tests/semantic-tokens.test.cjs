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
        ['.assistant-online-dot', 'state-success']
    ];
    for (const [selector, token] of expectations) {
        const rule = blocks(css, selector.replace(/[.$*+?^${}()|[\]\\]/g, '\\$&'))[0];
        assert.ok(rule, `expected a rule for "${selector}"`);
        assert.match(
            rule[1],
            new RegExp(`var\\(--${token}\\)`),
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
