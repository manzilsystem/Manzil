const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('header sun/moon button flips light and dark through setTheme and updates its icon', async () => {
    const stateSource = read('js/state.js');
    const attrs = {};
    const icon = { className: '' };
    const button = { label: '', setAttribute(k, v) { if (k === 'aria-label') this.label = v; } };
    const sandbox = {
        document: {
            body: { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: k => attrs[k] },
            querySelector: () => null,
            getElementById: id => (id === 'quickThemeIcon' ? icon : id === 'quickThemeBtn' ? button : null)
        }
    };
    const api = vm.runInNewContext(stateSource + '\n({ applyThemeToDocument, toggleQuickTheme, setThemeCalls, state })'.replace('setThemeCalls, ', ''), sandbox, { filename: 'js/state.js' });
    const calls = [];
    sandbox.setTheme = async theme => { calls.push(theme); api.applyThemeToDocument(theme); };
    api.applyThemeToDocument('dark');
    assert.match(icon.className, /fa-sun/);
    await vm.runInNewContext('toggleQuickTheme()', Object.assign(sandbox, { toggleQuickTheme: api.toggleQuickTheme }));
    assert.deepEqual(calls, ['light']);
    assert.match(icon.className, /fa-moon/);
    assert.match(button.label, /الليلي/);
    await sandbox.toggleQuickTheme();
    assert.deepEqual(calls, ['light', 'dark']);
    assert.match(icon.className, /fa-sun/);
});

test('button is in the header, owners do not see it, and light mode fixes the dashboard balance card', () => {
    assert.match(read('index.html'), /id="quickThemeBtn"[^>]*onclick="toggleQuickTheme\(\)"/);
    assert.match(read('css/style.css'), /body\.owner-mode header \.container > div:last-child > button:not\(#accessSwitchBtn\)/);
    assert.match(read('css/style.css'), /\[data-theme="light"\] \.dashboard-balance \{ background-image:none !important; background-color:var\(--indigo-soft\)/);
});
