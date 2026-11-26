const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const stateSource = read('js/state.js');
const crudSource = read('js/crud.js');

function fakeEl() {
    const el = { children: [], style: {}, listeners: {}, className: '', textContent: '',
        appendChild(c) { this.children.push(c); }, addEventListener(t, f) { this.listeners[t] = f; }, remove() { this.removed = true; } };
    return el;
}

test('toast can carry an action button that runs and dismisses', () => {
    const container = fakeEl();
    const timers = [];
    const sandbox = { document: { createElement: fakeEl, getElementById: () => container }, setTimeout: (f, ms) => { timers.push(ms); return 1; }, Date };
    const toast = vm.runInNewContext(stateSource + '\ntoast', sandbox, { filename: 'js/state.js' });
    let opened = 0;
    toast('رسالة', 'error', { label: 'افتح الإعدادات', onClick: () => { opened += 1; } });
    const el = container.children[0];
    const button = el.children[0];
    assert.equal(button.textContent, 'افتح الإعدادات');
    button.listeners.click();
    assert.equal(opened, 1);
    assert.ok(timers.includes(7000), 'action toast stays longer');
    toast('بدون زر', 'info');
    assert.equal(container.children[1].children.length, 0);
});

test('new apartment without floors offers an open-settings action', () => {
    assert.match(crudSource, /حدد عدد الأدوار وعدد الشقق[^\n]*label: 'افتح الإعدادات', onClick: \(\) => openSettingsModal\(\)/);
});
