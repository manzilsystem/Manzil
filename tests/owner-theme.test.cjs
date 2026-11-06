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

test('the owner theme picker is one header button that opens a menu of every theme', () => {
    assert.match(accessSource, /function renderOwnerThemeMenu\(\)/);
    assert.match(accessSource, /MANZIL_THEME_LIST\.map\(theme =>/);
    assert.match(accessSource, /data-owner-theme-option="\$\{theme\}"/);
    assert.match(accessSource, /onclick="setOwnerTheme\('\$\{theme\}'\)"/);
    assert.match(html, /id="ownerThemeBtn"[^>]*aria-haspopup="true"[^>]*aria-controls="ownerThemeMenu"/);
    assert.match(html, /id="ownerThemeMenu"[^>]*aria-label="اختيار مظهر البوابة"/);
    assert.doesNotMatch(accessSource, /ownerThemeCard/, 'the six-swatch card must stop eating portal height');
    assert.doesNotMatch(accessSource, /id="ownerThemeCurrent"/);
});

test('the header theme button is reachable and closes on outside click and Escape', () => {
    assert.match(accessSource, /function toggleOwnerThemeMenu\(force\)/);
    assert.match(accessSource, /button\.setAttribute\('aria-expanded', String\(open\)\)/);
    assert.match(accessSource, /if \(control\.contains\(event\?\.target\)\) return;/, 'clicking the button must not close its own menu');
    assert.match(accessSource, /event\?\.key === 'Escape'\) closeOwnerThemeMenu\(\)/);
    assert.match(accessSource, /bindOwnerThemeMenu\(\);[\s\S]*updateAccessSwitchButton\(\);/);
    assert.match(css, /\.owner-theme-menu \{/);
    assert.match(css, /body\.owner-mode \.owner-theme-control \{/);
    assert.match(css, /\.owner-theme-control \{ display: none; \}/, 'managers keep their settings theme control');
});

test('owner theme changes apply instantly and persist through the guarded RPC', () => {
    assert.match(accessSource, /async function setOwnerTheme\(theme\) \{[\s\S]*currentUserRole !== 'owner'/);
    assert.match(accessSource, /applyThemeToDocument\(next\)/);
    assert.match(accessSource, /supabaseClient\.rpc\('set_my_theme', \{ p_theme: theme \}\)/);
    assert.match(accessSource, /catch \(error\) \{[\s\S]*applyThemeToDocument\(previous\)/, 'a failed save must restore the previous theme');
    assert.ok(!/async function setOwnerTheme\(theme\) \{\s*if \(!requireManager\(\)\)/.test(accessSource), 'owner theme must not require a manager session');
});

test('owner sessions load the theme preference with the profile', () => {
    assert.match(supabaseSource, /\.select\('must_change_pin,theme_preference'\)/);
    assert.match(supabaseSource, /currentTheme: resolveUserTheme\(building\.current_theme, profile\?\.theme_preference, currentUserRole\)/);
});

test('owner theme styles stay scoped to the header picker', () => {
    assert.doesNotMatch(css, /\.owner-theme-grid\s*\{/, 'the removed portal card must not leave dead CSS');
    assert.match(css, /\.owner-theme-menu \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /\.owner-theme-option\.active\s*\{/);
    assert.match(css, /\.owner-theme-swatch\s*\{[\s\S]*background-image: linear-gradient/);
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
