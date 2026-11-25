const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const settingsSource = read('js/state.js') + '\n' + read('js/settings.js');
const API = '\n({ isValidManagerPhone, normalizeManagerPhone, getPaymentMethodSettingsError, flagSettingsFieldError, clearSettingsFieldErrors, SETTINGS_FIELD_ERROR_CLASS })';

function loadSettingsApi(sandbox = {}) {
    return vm.runInNewContext(settingsSource + API, sandbox);
}

test('manager phone accepts Egyptian mobile and international E.164 formats, and stays optional', () => {
    const { isValidManagerPhone } = loadSettingsApi();
    assert.equal(isValidManagerPhone(''), true, 'empty phone stays allowed');
    assert.equal(isValidManagerPhone('   '), true, 'whitespace-only counts as empty');
    assert.equal(isValidManagerPhone('01012345678'), true);
    assert.equal(isValidManagerPhone('01512345678'), true, 'any Egyptian 01XXXXXXXXX mobile passes');
    assert.equal(isValidManagerPhone('010 1234 5678'), true, 'spaces are tolerated');
    assert.equal(isValidManagerPhone('010-1234-5678'), true, 'dashes are tolerated');
    assert.equal(isValidManagerPhone('+201012345678'), true);
    assert.equal(isValidManagerPhone('00201012345678'), true, '00 prefix counts as international');
    assert.equal(isValidManagerPhone('+971501234567'), true, 'owners abroad: Gulf number');
    assert.equal(isValidManagerPhone('+44 7911 123456'), true, 'owners abroad: UK number with spaces');
    assert.equal(isValidManagerPhone('+12025550125'), true, '8-15 digits after +');
});

test('manager phone rejects only clearly junk values', () => {
    const { isValidManagerPhone } = loadSettingsApi();
    for (const junk of [
        '123', 'abcdefghijk', '0101234567', '010123456789',
        '0212345678', '02212345678', '01012345678x', '++201012345678',
        '+123', '+1234567890123456'
    ]) {
        assert.equal(isValidManagerPhone(junk), false, `rejects ${junk}`);
    }
});

test('manager phone is normalized for storage so wa.me links keep working', () => {
    const { normalizeManagerPhone } = loadSettingsApi();
    assert.equal(normalizeManagerPhone('010 1234 5678'), '01012345678');
    assert.equal(normalizeManagerPhone('010-1234-5678'), '01012345678');
    assert.equal(normalizeManagerPhone('00201012345678'), '+201012345678', '00 prefix becomes +');
    assert.equal(normalizeManagerPhone('+20 101 234 5678'), '+201012345678');
    assert.equal(normalizeManagerPhone('  '), '', 'empty stays empty');
    // wa.me strips non-digits, so a normalized international number still resolves.
    assert.equal(normalizeManagerPhone('+971 50 123 4567').replace(/\D/g, ''), '971501234567');
    assert.equal(normalizeManagerPhone('01012345678').replace(/\D/g, ''), '01012345678');
});

function paymentSettings(overrides = {}) {
    return {
        cash: { enabled: false },
        wallet: { enabled: false, provider: '', accountName: '', number: '' },
        instapay: { enabled: false, accountName: '', address: '' },
        bank_transfer: { enabled: false, bankName: '', accountName: '', accountNumber: '', iban: '' },
        ...overrides
    };
}

test('at least one payment method must stay enabled', () => {
    const { getPaymentMethodSettingsError } = loadSettingsApi();
    const error = getPaymentMethodSettingsError(paymentSettings());
    assert.equal(error.fieldId, 'settingsPaymentCashEnabled');
    assert.match(error.message, /وسيلة دفع واحدة على الأقل/);
    assert.equal(getPaymentMethodSettingsError(paymentSettings({ cash: { enabled: true } })), null);
});

test('enabled wallet without a number is blocked', () => {
    const { getPaymentMethodSettingsError } = loadSettingsApi();
    const settings = paymentSettings({ cash: { enabled: true }, wallet: { enabled: true, provider: 'vf', accountName: '', number: '' } });
    const error = getPaymentMethodSettingsError(settings);
    assert.equal(error.fieldId, 'settingsWalletNumber');
    assert.match(error.message, /رقم المحفظة/);
    settings.wallet.number = '01012345678';
    assert.equal(getPaymentMethodSettingsError(settings), null);
});

test('enabled instapay without an address is blocked', () => {
    const { getPaymentMethodSettingsError } = loadSettingsApi();
    const settings = paymentSettings({ cash: { enabled: true }, instapay: { enabled: true, accountName: '', address: '' } });
    const error = getPaymentMethodSettingsError(settings);
    assert.equal(error.fieldId, 'settingsInstapayAddress');
    assert.match(error.message, /عنوان إنستاباي/);
    settings.instapay.address = 'manager@instapay';
    assert.equal(getPaymentMethodSettingsError(settings), null);
});

test('enabled bank transfer needs an account number or an IBAN', () => {
    const { getPaymentMethodSettingsError } = loadSettingsApi();
    const settings = paymentSettings({ cash: { enabled: true }, bank_transfer: { enabled: true, bankName: '', accountName: '', accountNumber: '', iban: '' } });
    const error = getPaymentMethodSettingsError(settings);
    assert.equal(error.fieldId, 'settingsBankAccountNumber');
    assert.match(error.message, /رقم الحساب أو رقم IBAN/);
    settings.bank_transfer.iban = 'EG380019000500000000263180002';
    assert.equal(getPaymentMethodSettingsError(settings), null, 'IBAN alone is enough');
    settings.bank_transfer.iban = '';
    settings.bank_transfer.accountNumber = '1234567890';
    assert.equal(getPaymentMethodSettingsError(settings), null, 'account number alone is enough');
});

function makeElementStub(id) {
    const classes = new Set();
    const attrs = {};
    return {
        id,
        dataset: {},
        listeners: {},
        innerHTML: '',
        textContent: '',
        classList: {
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            toggle: (name, force) => {
                const next = force === undefined ? !classes.has(name) : Boolean(force);
                if (next) classes.add(name); else classes.delete(name);
                return next;
            },
            contains: name => classes.has(name)
        },
        setAttribute(name, value) { attrs[name] = String(value); },
        removeAttribute(name) { delete attrs[name]; },
        getAttribute: name => (name in attrs ? attrs[name] : null),
        addEventListener(type, fn) { this.listeners[type] = fn; },
        appendChild(child) { (this.children = this.children || []).push(child); },
        remove() {},
        style: {},
        querySelector: () => null,
        querySelectorAll: () => [],
        closest: () => null,
        scrollIntoView() { this.scrolled = true; },
        focus() { this.focused = true; },
        attrs
    };
}

function makeSettingsDocument(elements) {
    const toastContainer = makeElementStub('toastContainer');
    return {
        getElementById: id => (id === 'toastContainer' ? toastContainer : elements[id] || null),
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => makeElementStub('toast'),
        toastContainer
    };
}

test('flagged field is marked, focused, its tab opens, and typing clears the mark', () => {
    const elements = { settingsManagerPhone: makeElementStub('settingsManagerPhone') };
    for (const tab of ['building', 'payments', 'subscriptions', 'appearance', 'backup', 'receipts', 'reminders', 'account']) {
        elements['settings-panel-' + tab] = makeElementStub('settings-panel-' + tab);
        elements['settings-panel-' + tab].classList.add('hidden');
    }
    const field = elements.settingsManagerPhone;
    const sandbox = {
        document: makeSettingsDocument(elements),
        setTimeout: () => 0
    };
    const api = loadSettingsApi(sandbox);
    api.flagSettingsFieldError('settingsManagerPhone', 'building', 'رقم غير صحيح');
    assert.equal(field.classList.contains(api.SETTINGS_FIELD_ERROR_CLASS), true);
    assert.equal(field.getAttribute('aria-invalid'), 'true');
    assert.equal(field.focused, true, 'focus moves to the bad field');
    assert.equal(field.scrolled, true, 'field scrolls into view');
    assert.equal(elements['settings-panel-building'].classList.contains('hidden'), false, 'the owning tab opens');
    assert.equal(elements['settings-panel-payments'].classList.contains('hidden'), true, 'other tabs stay closed');
    const toastEl = sandbox.document.toastContainer.children[0];
    assert.equal(toastEl.textContent, 'رقم غير صحيح', 'toast carries the validation message');
    assert.match(toastEl.className, /bg-rose-600/, 'toast uses the error style');
    field.listeners.input();
    assert.equal(field.classList.contains(api.SETTINGS_FIELD_ERROR_CLASS), false, 'typing clears the error mark');
    assert.equal(field.getAttribute('aria-invalid'), null);
});

test('flagging a field opens its folded accordion block', () => {
    const field = makeElementStub('settingsWalletNumber');
    const foldedClasses = new Set(['is-folded']);
    const head = { attrs: { 'aria-expanded': 'false' }, setAttribute(name, value) { this.attrs[name] = String(value); } };
    const folded = {
        classList: {
            remove: name => foldedClasses.delete(name),
            contains: name => foldedClasses.has(name)
        },
        querySelector: () => head
    };
    field.closest = selector => (selector === '.is-folded' ? folded : null);
    const elements = { settingsWalletNumber: field };
    for (const tab of ['building', 'payments', 'subscriptions', 'appearance', 'backup', 'receipts', 'reminders', 'account']) {
        elements['settings-panel-' + tab] = makeElementStub('settings-panel-' + tab);
    }
    const sandbox = {
        document: makeSettingsDocument(elements),
        setTimeout: () => 0
    };
    const api = loadSettingsApi(sandbox);
    api.flagSettingsFieldError('settingsWalletNumber', 'payments', 'أدخل الرقم');
    assert.equal(foldedClasses.has('is-folded'), false, 'accordion block opens');
    assert.equal(head.attrs['aria-expanded'], 'true');
});
