const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('header sun/moon button is one icon: sun in dark, moon in light, and flips through the right save path', async () => {
    const stateSource = read('js/state.js');
    const attrs = {};
    const btnAttrs = {};
    const icon = { className: '' };
    const button = { setAttribute(k, v) { btnAttrs[k] = v; } };
    const sandbox = {
        document: {
            body: { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: k => attrs[k] },
            querySelector: () => null,
            getElementById: id => (id === 'quickThemeIcon' ? icon : id === 'quickThemeBtn' ? button : null)
        }
    };
    const api = vm.runInNewContext(stateSource + '\n({ applyThemeToDocument, toggleQuickTheme })', sandbox, { filename: 'js/state.js' });
    const calls = [];
    sandbox.setTheme = async theme => { calls.push(theme); api.applyThemeToDocument(theme); };
    sandbox.setOwnerTheme = async theme => { calls.push('owner:' + theme); api.applyThemeToDocument(theme); };
    api.applyThemeToDocument('dark');
    assert.match(icon.className, /fa-sun/);
    assert.equal(btnAttrs['aria-label'], 'الوضع الليلي / النهاري');
    assert.equal(btnAttrs.title, 'الوضع الليلي / النهاري');
    await vm.runInNewContext('toggleQuickTheme()', Object.assign(sandbox, { toggleQuickTheme: api.toggleQuickTheme }));
    assert.deepEqual(calls, ['light']);
    assert.match(icon.className, /fa-moon/);
    assert.equal(btnAttrs['data-mode'], 'light');
    assert.equal(btnAttrs.title, 'الوضع الليلي / النهاري');
    await sandbox.toggleQuickTheme();
    assert.deepEqual(calls, ['light', 'dark']);
    assert.match(icon.className, /fa-sun/);
    vm.runInNewContext("currentUserRole = 'owner'", sandbox);
    await sandbox.toggleQuickTheme();
    assert.deepEqual(calls, ['light', 'dark', 'owner:light']);
});

test('button is in the header, owners see it too, and light mode fixes the dashboard balance card', () => {
    assert.match(read('index.html'), /id="quickThemeBtn"[^>]*onclick="toggleQuickTheme\(\)"/);
    assert.match(read('css/style.css'), /body\.owner-mode header \.container > div:last-child > button:not\(#accessSwitchBtn\)[^{]*:not\(#quickThemeBtn\)/);
    assert.match(read('css/style.css'), /\[data-theme="light"\] \.dashboard-balance \{ background-image:none !important; background-color:var\(--indigo-soft\)/);
});
