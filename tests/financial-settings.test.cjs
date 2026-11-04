const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.TZ = 'Africa/Cairo';
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const stateSource = read('js/state.js');
const settingsSource = read('js/settings.js');
const supabaseSource = read('js/supabase.js');
const renderSource = read('js/render.js');
const crudSource = read('js/crud.js');
const accessSource = read('js/access.js');
const html = read('index.html');
const css = read('css/style.css');
const migration = read('supabase/migrations/20261104040000_building_payment_subscription_settings.sql');

const fixedNow = new Date('2026-11-04T12:00:00+02:00');
class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow.getTime(); }
}

function loadStateHelpers() {
    return vm.runInNewContext(
        stateSource + '\n({ state, normalizePaymentSettings, populatePaymentMethodOptions, getSubscriptionDueDeadline, isSubscriptionMonthOverdue, calculateIncomeAllocationPreview })',
        { Date: FixedDate },
        { filename: 'js/state.js' }
    );
}

test('payment settings normalize every method and keep defaults backward compatible', () => {
    const app = loadStateHelpers();
    const defaults = app.normalizePaymentSettings({});
    assert.deepEqual(JSON.parse(JSON.stringify(defaults)), {
        cash: { enabled: true },
        wallet: { enabled: true, provider: '', accountName: '', number: '' },
        instapay: { enabled: true, accountName: '', address: '' },
        bank_transfer: { enabled: true, bankName: '', accountName: '', accountNumber: '', iban: '' }
    });

    const normalized = app.normalizePaymentSettings({
        cash: { enabled: false },
        wallet: { enabled: true, provider: 'Vodafone Cash', number: '01012345678', accountName: 'Owner' },
        instapay: { enabled: false, address: 'owner@instapay' },
        bank_transfer: { enabled: true, bankName: 'Bank', accountNumber: '123456', iban: 'EG123' }
    });
    assert.equal(normalized.cash.enabled, false);
    assert.equal(normalized.wallet.provider, 'Vodafone Cash');
    assert.equal(normalized.wallet.number, '01012345678');
    assert.equal(normalized.instapay.enabled, false);
    assert.equal(normalized.bank_transfer.bankName, 'Bank');
    assert.equal(normalized.wallet.provider.length <= 60, true);
});

test('collection payment selector exposes only enabled methods', () => {
    const app = loadStateHelpers();
    app.state.paymentSettings = app.normalizePaymentSettings({
        cash: { enabled: true },
        wallet: { enabled: false },
        instapay: { enabled: true },
        bank_transfer: { enabled: false }
    });
    const select = { innerHTML: '', value: '' };
    app.populatePaymentMethodOptions(select);
    assert.match(select.innerHTML, /value="cash"/);
    assert.match(select.innerHTML, /value="instapay"/);
    assert.doesNotMatch(select.innerHTML, /value="wallet"/);
    assert.doesNotMatch(select.innerHTML, /value="bank_transfer"/);
});

test('an existing disabled method remains selectable only while editing its old payment', () => {
    const app = loadStateHelpers();
    app.state.paymentSettings = app.normalizePaymentSettings({
        cash: { enabled: true },
        wallet: { enabled: false },
        instapay: { enabled: true },
        bank_transfer: { enabled: false }
    });
    const select = { innerHTML: '', value: '' };
    app.populatePaymentMethodOptions(select, 'wallet', true);
    assert.match(select.innerHTML, /wallet/);
    assert.match(select.innerHTML, /غير مفعّل حاليًا/);
    assert.equal(select.value, 'wallet');
    assert.doesNotMatch(select.innerHTML, /value="bank_transfer"/);
});

test('due day and grace period classify the current monthly balance without rewriting arrears', () => {
    const app = loadStateHelpers();
    app.state.subscriptionDueDay = 5;
    app.state.subscriptionGraceDays = 3;
    const beforeGraceEnds = new Date('2026-11-08T23:59:59+02:00');
    const afterGraceEnds = new Date('2026-11-09T00:00:00+02:00');
    assert.equal(app.isSubscriptionMonthOverdue('نوفمبر 2026', beforeGraceEnds), false);
    assert.equal(app.isSubscriptionMonthOverdue('نوفمبر 2026', afterGraceEnds), true);
    assert.equal(app.isSubscriptionMonthOverdue('invalid-month', afterGraceEnds), false);
});

test('oldest-first remains the default allocation order and selected-month-first is configurable', () => {
    const app = loadStateHelpers();
    app.state.residents = [{
        id: 'resident-1',
        createdAt: '2024-01-01T00:00:00.000Z',
        monthlyAmount: 100
    }];
    app.state.income = [];
    app.state.paymentAllocationPolicy = 'oldest_first';
    const oldestFirst = app.calculateIncomeAllocationPreview('resident-1', 150, 'مارس 2024');
    assert.deepEqual(JSON.parse(JSON.stringify(oldestFirst.allocations)), [
        { month: 'يناير 2024', amount: 100, amountCents: 10000 },
        { month: 'فبراير 2024', amount: 50, amountCents: 5000 }
    ]);

    app.state.paymentAllocationPolicy = 'selected_month_first';
    const selectedFirst = app.calculateIncomeAllocationPreview('resident-1', 150, 'مارس 2024');
    assert.deepEqual(JSON.parse(JSON.stringify(selectedFirst.allocations)), [
        { month: 'مارس 2024', amount: 100, amountCents: 10000 },
        { month: 'يناير 2024', amount: 50, amountCents: 5000 }
    ]);
});

test('settings UI persists method details and monthly collection rules per building', () => {
    for (const id of [
        'settingsPaymentCashEnabled', 'settingsPaymentWalletEnabled', 'settingsWalletProvider',
        'settingsWalletAccountName', 'settingsWalletNumber', 'settingsPaymentInstapayEnabled',
        'settingsInstapayAccountName', 'settingsInstapayAddress', 'settingsPaymentBankEnabled',
        'settingsBankName', 'settingsBankAccountName', 'settingsBankAccountNumber', 'settingsBankIban',
        'settingsSubscriptionDueDay', 'settingsSubscriptionGraceDays', 'settingsPaymentAllocationPolicy'
    ]) {
        assert.ok(html.includes('id="' + id + '"'), 'missing settings control #' + id);
    }
    assert.match(settingsSource, /SETTINGS_TABS = \['building','payments','subscriptions'/);
    assert.match(settingsSource, /state\.paymentSettings = paymentSettings/);
    assert.match(settingsSource, /state\.subscriptionDueDay = subscriptionDueDay/);
    assert.match(settingsSource, /state\.subscriptionGraceDays = subscriptionGraceDays/);
    assert.match(settingsSource, /state\.paymentAllocationPolicy = paymentAllocationPolicy/);
    assert.match(supabaseSource, /payment_settings: normalizePaymentSettings\(state\.paymentSettings\)/);
    assert.match(supabaseSource, /subscription_due_day: Math\.min\(28/);
    assert.match(supabaseSource, /payment_allocation_policy: \['oldest_first', 'selected_month_first'\]/);
});

test('enabled payment details are rendered in the read-only owner portal', () => {
    assert.match(accessSource, /طرق سداد الاشتراك/);
    assert.match(accessSource, /paymentSettings\.bank_transfer/);
    assert.match(accessSource, /settings\.iban/);
    assert.match(accessSource, /موعد الاستحقاق يوم/);
    assert.match(accessSource, /esc\(item\)/);
});

test('collection submission rejects payment methods that the manager has disabled', () => {
    assert.match(renderSource, /populatePaymentMethodOptions\(paymentMethodSelect/);
    assert.match(crudSource, /!isIncomePaymentMethodEnabled\(paymentMethod\)/);
    assert.match(crudSource, /paymentMethodSelect, payment\.paymentMethod \|\| '', true/);
});

test('database stores settings with validated constraints and preserves them in the atomic snapshot', () => {
    assert.match(migration, /ADD COLUMN IF NOT EXISTS payment_settings jsonb NOT NULL/);
    assert.match(migration, /buildings_payment_settings_shape_check/);
    assert.match(migration, /buildings_subscription_due_day_check/);
    assert.match(migration, /buildings_subscription_grace_days_check/);
    assert.match(migration, /buildings_payment_allocation_policy_check/);
    assert.match(migration, /invalid_building_payment_settings/);
    assert.match(migration, /invalid_subscription_due_day/);
    assert.match(migration, /invalid_subscription_grace_days/);
    assert.match(migration, /invalid_payment_allocation_policy/);
    assert.match(migration, /payment_settings = CASE/);
    assert.match(migration, /subscription_due_day = CASE/);
    assert.match(migration, /subscription_grace_days = CASE/);
    assert.match(migration, /payment_allocation_policy = CASE/);
    assert.match(migration, /v_version <> p_expected_version/);
});

test('settings layout adapts eight tabs and payment details to mobile screens', () => {
    assert.match(css, /\.settings-tabs \{ grid-template-columns:repeat\(4,minmax\(0,1fr\)\); \}/);
    assert.match(css, /\.settings-payment-card/);
    assert.match(css, /@media\(max-width:360px\) \{\s*\.settings-tabs \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/);
});
