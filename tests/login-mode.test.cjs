const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const supabaseSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase.js'), 'utf8');

function makeClassList(initial = []) {
    const values = new Set(initial);
    return {
        add: (...tokens) => tokens.forEach(token => values.add(token)),
        remove: (...tokens) => tokens.forEach(token => values.delete(token)),
        toggle(token, force) {
            const shouldAdd = force === undefined ? !values.has(token) : force;
            if (shouldAdd) values.add(token);
            else values.delete(token);
            return shouldAdd;
        },
        contains: token => values.has(token),
    };
}

function makeHarness() {
    const ids = [
        'authIdentifierLabel', 'authPasswordLabel', 'authIdentifier', 'authPassword',
        'pinLockTitle', 'pinLockHint', 'ownerLoginHelp', 'loginModeManager', 'loginModeOwner', 'pinErrorMsg',
    ];
    const elements = new Map(ids.map(id => [id, {
        value: '', textContent: '', placeholder: '', className: '', attributes: {},
        classList: makeClassList(id === 'ownerLoginHelp' ? ['hidden'] : []),
        setAttribute(name, value) { this.attributes[name] = String(value); },
        removeAttribute(name) { delete this.attributes[name]; },
    }]));
    const sandbox = {
        window: { supabase: { createClient: () => ({}) } },
        document: { getElementById: id => elements.get(id) || null },
    };
    const app = vm.runInNewContext(`${supabaseSource}\n({ setLoginMode, getLoginMode: () => authLoginMode })`, sandbox, { filename: 'js/supabase.js' });
    return { app, elements };
}

test('owner mode shows the registered phone and six/eight-digit PIN field and owner-only help', () => {
    const { app, elements } = makeHarness();
    elements.get('authIdentifier').value = 'manager@example.com';
    elements.get('authPassword').value = 'manager-password';

    assert.equal(app.setLoginMode('owner'), 'owner');
    assert.equal(elements.get('pinLockTitle').textContent, 'دخول مالك الشقة');
    assert.equal(elements.get('authIdentifierLabel').textContent, 'رقم الجوال المسجل للشقة');
    assert.equal(elements.get('authIdentifier').attributes.inputmode, 'tel');
    assert.equal(elements.get('authPasswordLabel').textContent, 'PIN المالك — 6 أرقام أو 8 للمؤقت');
    assert.equal(elements.get('authPassword').attributes.inputmode, 'numeric');
    assert.equal(elements.get('authPassword').attributes.maxlength, '8');
    assert.equal(elements.get('ownerLoginHelp').classList.contains('hidden'), false);
    assert.equal(elements.get('loginModeOwner').attributes['aria-pressed'], 'true');
    assert.equal(elements.get('loginModeManager').attributes['aria-pressed'], 'false');
    assert.equal(elements.get('authIdentifier').value, '');
    assert.equal(elements.get('authPassword').value, '');
});

test('manager mode restores email and password fields and hides owner help', () => {
    const { app, elements } = makeHarness();
    app.setLoginMode('owner');
    elements.get('authIdentifier').value = '01012345678';
    elements.get('authPassword').value = '123456';

    assert.equal(app.setLoginMode('manager'), 'manager');
    assert.equal(elements.get('pinLockTitle').textContent, 'دخول مدير المبنى');
    assert.equal(elements.get('authIdentifierLabel').textContent, 'البريد الإلكتروني للمدير');
    assert.equal(elements.get('authIdentifier').attributes.inputmode, 'email');
    assert.equal(elements.get('authPasswordLabel').textContent, 'كلمة مرور المدير');
    assert.equal(elements.get('authPassword').attributes.inputmode, undefined);
    assert.equal(elements.get('authPassword').attributes.maxlength, undefined);
    assert.equal(elements.get('ownerLoginHelp').classList.contains('hidden'), true);
    assert.equal(elements.get('loginModeManager').attributes['aria-pressed'], 'true');
    assert.equal(elements.get('loginModeOwner').attributes['aria-pressed'], 'false');
    assert.equal(elements.get('authIdentifier').value, '');
    assert.equal(elements.get('authPassword').value, '');
});
