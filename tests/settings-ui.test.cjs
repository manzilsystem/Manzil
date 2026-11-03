const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');
const css = read('css/style.css');
const state = read('js/state.js');
const auth = read('js/supabase.js');
const crud = read('js/crud.js');
const settings = read('js/settings.js');
const sw = read('sw.js');

test('settings are divided into accessible functional tabs', () => {
    for (const tab of ['building', 'appearance', 'backup', 'account']) {
        assert.match(html, new RegExp('id="settings-tab-' + tab + '"'));
        assert.match(html, new RegExp('id="settings-panel-' + tab + '"'));
        assert.match(html, new RegExp('aria-controls="settings-panel-' + tab + '"'));
    }
    assert.match(settings, /function switchSettingsTab\(tab\)/);
    assert.match(settings, /function openSettingsModal\(\)[\s\S]*switchSettingsTab\('building'\)/);
});

test('all five themes are selectable, persisted and restored after authentication', () => {
    for (const theme of ['dark', 'light', 'emerald', 'ocean', 'sand']) {
        assert.match(html, new RegExp('data-theme-option="' + theme + '"'));
        assert.match(css, new RegExp('\\[data-theme="' + theme + '"\\]'));
        assert.ok(state.includes("'" + theme + "'"), 'state.js must support ' + theme);
        assert.ok(auth.includes("'" + theme + "'"), 'auth bootstrap must support ' + theme);
    }
    assert.match(state, /updateThemeSelection\(\)/);
    assert.match(settings, /SETTINGS_THEME_NAMES/);
});

test('settings redesign is included in the service worker cache version', () => {
    assert.match(html, /02:23 UTC/);
    assert.match(html, /04:23 شتاءً و05:23 صيفًا بتوقيت القاهرة/);
    assert.doesNotMatch(html, /نسخة يومية الساعة 04:23 صباحًا بتوقيت مصر/);
    assert.match(sw, /CACHE_NAME = 'manzil-v45'/);
    assert.match(sw, /\.\/css\/style\.css/);
    assert.match(sw, /\.\/js\/state\.js/);
    assert.match(sw, /\.\/js\/settings\.js/);
    assert.match(sw, /\.\/js\/notices\.js/);
    assert.match(html, /js\/crud\.js[\s\S]*js\/notices\.js/);
    assert.match(html, /js\/crud\.js[\s\S]*js\/settings\.js/);
    assert.doesNotMatch(crud, /function openSettingsModal|function saveSettings|function switchSettingsTab/);
});
