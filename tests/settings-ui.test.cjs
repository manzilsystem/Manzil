const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');
const css = read('css/style.css');
const state = read('js/state.js');
const auth = read('js/supabase.js');
const crud = read('js/crud.js');
const settings = read('js/settings.js');
const sw = read('sw.js');

test('settings are divided into accessible functional tabs', () => {
    for (const tab of ['building', 'payments', 'subscriptions', 'appearance', 'backup', 'receipts', 'reminders', 'account']) {
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
    assert.match(sw, /CACHE_NAME = 'manzil-v64'/);
    assert.ok(css.includes('max-width:52rem'));
    assert.ok(css.includes('height:min(88dvh,760px)'));
    assert.ok(css.includes('height:94dvh'));
    assert.ok(css.includes('max-height:min(62vh,600px)'));
    assert.match(sw, /\.\/css\/style\.css/);
    assert.match(sw, /\.\/js\/state\.js/);
    assert.match(sw, /\.\/js\/settings\.js/);
    assert.match(sw, /\.\/js\/notices\.js/);
    assert.match(html, /js\/crud\.js[\s\S]*js\/notices\.js/);
    assert.match(html, /js\/crud\.js[\s\S]*js\/settings\.js/);
    assert.doesNotMatch(crud, /function openSettingsModal|function saveSettings|function switchSettingsTab/);
});


test('settings report a failed layout rollback even when the RPC has no transport error', async () => {
    const messages = [];
    let rpcCalls = 0;
    const elements = {
        settingsDefaultSub: { value: '0' },
        settingsStartingBalance: { value: '0' },
        settingsFloorCount: { value: '3' },
        settingsApartmentsPerFloor: { value: '4' },
        settingsBuildingName: { value: 'Building' },
        settingsManagerName: { value: 'Manager' },
        settingsManagerPhone: { value: '01000000000' },
        settingsSubscriptionDueDay: { value: '1' },
        settingsSubscriptionGraceDays: { value: '0' },
        settingsPaymentAllocationPolicy: { value: 'oldest_first' },
        settingsPaymentCashEnabled: { checked: true },
        settingsPaymentWalletEnabled: { checked: true },
        settingsWalletProvider: { value: '' },
        settingsWalletAccountName: { value: '' },
        settingsWalletNumber: { value: '' },
        settingsPaymentInstapayEnabled: { checked: true },
        settingsInstapayAccountName: { value: '' },
        settingsInstapayAddress: { value: '' },
        settingsPaymentBankEnabled: { checked: true },
        settingsBankName: { value: '' },
        settingsBankAccountName: { value: '' },
        settingsBankAccountNumber: { value: '' },
        settingsBankIban: { value: '' },
        settingsReceiptThankYou: { value: '' },
        settingsReminderTemplate: { value: '' }
    };
    const sandbox = {
        state: {},
        activeBuildingId: 'building-1',
        requireManager: () => true,
        normalizePaymentSettings: value => value,
        logAction() {},
        getIncomePaymentMethodLabel: value => value,
        document: { getElementById: id => elements[id] || null },
        cloneStateSnapshot: () => ({ floorCount: 2, apartmentsPerFloor: 4 }),
        supabaseClient: {
            rpc: async () => {
                rpcCalls += 1;
                return rpcCalls === 1
                    ? { data: { ok: true }, error: null }
                    : { data: { ok: false }, error: null };
            }
        },
        saveWithRollback: async () => false,
        toast: (message, type) => messages.push({ message, type })
    };
    const api = vm.runInNewContext(settings + String.fromCharCode(10) + '({ saveSettings })', sandbox, {
        filename: 'js/settings.js'
    });

    await api.saveSettings();

    assert.equal(rpcCalls, 2);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'error');
    assert.match(messages[0].message, /تعذر التراجع عن إعدادات الأدوار/);
});

test('receipt and reminder templates synchronize through building settings', () => {
    assert.ok(state.includes('state.receiptThankYouTemplate !== null'));
    assert.ok(state.includes('state.reminderMessageTemplate !== null'));
    assert.ok(auth.includes('receipt_thank_you_template,arrears_reminder_template'));
    assert.ok(auth.includes('receiptThankYouTemplate: building.receipt_thank_you_template ?? null'));
    assert.ok(auth.includes('reminderMessageTemplate: building.arrears_reminder_template ?? null'));
    assert.ok(settings.includes('receipt_thank_you_template: receiptThankYou || null'));
    assert.ok(settings.includes('arrears_reminder_template: reminderTemplate || null'));
    assert.ok(settings.includes('localStorage.removeItem(getReceiptSettingsKey())'));
    assert.ok(settings.includes('localStorage.removeItem(getReminderTemplateKey())'));
    assert.match(sw, /CACHE_NAME = 'manzil-v64'/);
});


test('settings tabs support RTL arrow navigation, Home and End keys', () => {
    const tabs = ['building', 'payments', 'subscriptions', 'appearance', 'backup', 'receipts', 'reminders', 'account'];
    const elements = new Map();
    const makeElement = id => {
        const classes = new Set();
        return {
            id,
            classList: {
                toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
                contains(name) { return classes.has(name); },
            },
            attributes: {},
            setAttribute(name, value) { this.attributes[name] = value; },
            focus() { document.activeElement = this; },
        };
    };
    for (const name of tabs) {
        elements.set('settings-tab-' + name, makeElement('settings-tab-' + name));
        elements.set('settings-panel-' + name, makeElement('settings-panel-' + name));
    }
    const document = {
        activeElement: elements.get('settings-tab-building'),
        getElementById: id => elements.get(id) || null,
    };
    const api = vm.runInNewContext(settings + String.fromCharCode(10) + '({ handleSettingsTabKeydown })', { document });

    const send = key => {
        let prevented = false;
        api.handleSettingsTabKeydown({ key, preventDefault() { prevented = true; } });
        return prevented;
    };

    assert.equal(send('ArrowLeft'), true);
    assert.equal(document.activeElement.id, 'settings-tab-payments');
    assert.equal(elements.get('settings-tab-payments').attributes['aria-selected'], 'true');
    assert.equal(elements.get('settings-panel-building').classList.contains('hidden'), true);

    assert.equal(send('ArrowRight'), true);
    assert.equal(document.activeElement.id, 'settings-tab-building');
    assert.equal(send('End'), true);
    assert.equal(document.activeElement.id, 'settings-tab-account');
    assert.equal(send('Home'), true);
    assert.equal(document.activeElement.id, 'settings-tab-building');
    assert.equal(send('Tab'), false);
});
