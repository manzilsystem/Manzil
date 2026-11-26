const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const stateSource = read('js/state.js');
const accessSource = read('js/access.js');
const supabaseSource = read('js/supabase.js');
const html = read('index.html');
const css = read('css/style.css');
const migration = read('supabase/migrations/20261106120000_profile_theme_preference.sql');
const restoreVerify = read('tests/post-restore-verify.sql');

function loadThemeHelpers() {
    const start = stateSource.indexOf('const MANZIL_THEME_LIST');
    const end = stateSource.indexOf('let state = {', start);
    assert.notEqual(start, -1, 'theme constants must exist in state.js');
    assert.notEqual(end, -1, 'theme constants must precede the app state');
    const helpers = stateSource.slice(start, end);
    const body = { attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } };
    const meta = { attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } };
    const sandbox = {
        document: {
            body,
            querySelector: selector => (selector === 'meta[name="theme-color"]' ? meta : null)
        }
    };
    const api = vm.runInNewContext(
        `${helpers}\n({ normalizeThemeName, resolveUserTheme, applyThemeToDocument, MANZIL_THEME_LIST, MANZIL_THEME_NAMES, MANZIL_THEME_COLORS })`,
        sandbox,
        { filename: 'js/state.js' }
    );
    return { api, body, meta };
}

test('owner theme preference overrides the building theme for owners only', () => {
    const { api } = loadThemeHelpers();

    assert.deepEqual([...api.MANZIL_THEME_LIST], ['dark', 'light', 'emerald', 'ocean', 'sand', 'turquoise']);
    assert.equal(api.resolveUserTheme('emerald', 'sand', 'owner'), 'sand');
    assert.equal(api.resolveUserTheme('emerald', null, 'owner'), 'emerald');
    assert.equal(api.resolveUserTheme('emerald', 'invalid', 'owner'), 'emerald');
    assert.equal(api.resolveUserTheme('emerald', 'sand', 'manager'), 'emerald');
    assert.equal(api.resolveUserTheme('invalid', 'invalid', 'owner'), 'dark');
    assert.equal(api.normalizeThemeName('turquoise'), 'turquoise');
    assert.equal(api.normalizeThemeName('neon'), null);
});

test('applying a theme updates the document attribute and browser chrome color', () => {
    const { api, body, meta } = loadThemeHelpers();

    assert.equal(api.applyThemeToDocument('turquoise'), 'turquoise');
    assert.equal(body.attrs['data-theme'], 'turquoise');
    assert.equal(meta.attrs.content, '#071f27');

    assert.equal(api.applyThemeToDocument('unknown'), 'dark');
    assert.equal(body.attrs['data-theme'], 'dark');
    assert.equal(meta.attrs.content, '#0b1020');
});

test('owners use the same sun/moon header button as managers, with no palette menu', () => {
    assert.match(html, /id="quickThemeBtn"[^>]*onclick="toggleQuickTheme\(\)"/);
    assert.doesNotMatch(html, /id="ownerThemeBtn"|id="ownerThemeMenu"|id="ownerThemeControl"/);
    assert.doesNotMatch(accessSource, /renderOwnerThemeMenu|toggleOwnerThemeMenu|bindOwnerThemeMenu/);
    assert.match(stateSource, /currentUserRole === 'owner'[\s\S]*setOwnerTheme\(next\)/);
    assert.match(css, /body\.owner-mode header \.container > div:last-child > button:not\(#accessSwitchBtn\)[^{]*:not\(#quickThemeBtn\)/);
});

test('owner theme changes apply instantly and persist through the guarded RPC', () => {
    assert.match(accessSource, /async function setOwnerTheme\(theme\) \{[\s\S]*currentUserRole !== 'owner'/);
    assert.match(accessSource, /applyThemeToDocument\(next\)/);
    assert.match(accessSource, /supabaseClient\.rpc\('set_my_theme', \{ p_theme: theme \}\)/);
    assert.match(accessSource, /catch \(error\) \{[\s\S]*applyThemeToDocument\(previous\)/, 'a failed save must restore the previous theme');
    assert.ok(!/async function setOwnerTheme\(theme\) \{\s*if \(!requireManager\(\)\)/.test(accessSource), 'owner theme must not require a manager session');
});

test('owner sessions load the theme preference with the profile', () => {
    assert.match(supabaseSource, /\.select\('must_change_pin,theme_preference,full_name'\)/);
    assert.match(supabaseSource, /currentTheme: resolveUserTheme\(building\.current_theme, profile\?\.theme_preference, currentUserRole\)/);
});

test('migration adds a constrained preference and a security-definer setter', () => {
    assert.match(migration, /add column if not exists theme_preference text/);
    assert.match(migration, /profiles_theme_preference_check/);
    for (const theme of ['dark', 'light', 'emerald', 'ocean', 'sand', 'turquoise']) {
        assert.ok(migration.includes(`'${theme}'`), `migration must allow ${theme}`);
    }
    assert.match(migration, /create or replace function public\.set_my_theme\(p_theme text\)/);
    assert.match(migration, /security definer/);
    assert.match(migration, /where id = auth\.uid\(\)/);
    assert.match(migration, /revoke all on function public\.set_my_theme\(text\) from public, anon/);
    assert.match(migration, /grant execute on function public\.set_my_theme\(text\) to authenticated/);
    assert.match(restoreVerify, /profiles\.theme_preference column missing/);
});
