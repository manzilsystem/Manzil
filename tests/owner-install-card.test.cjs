const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const push = fs.readFileSync(path.join(__dirname, '..', 'js', 'push.js'), 'utf8');

function loadPush(store = {}) {
    const sandbox = {
        window: { addEventListener() {} },
        navigator: {},
        currentUserRole: 'owner',
        renderManagerNotifications() {},
        renderOwnerPortal() {},
        localStorage: {
            getItem: key => (key in store ? store[key] : null),
            setItem: (key, value) => { store[key] = String(value); },
            removeItem: key => { delete store[key]; }
        },
        Date
    };
    return vm.runInNewContext(
        push + String.fromCharCode(10) + '({ installCardDismissed, dismissInstallCard })',
        sandbox,
        { filename: 'js/push.js' }
    );
}

test('the install card shows until it is dismissed', () => {
    const { installCardDismissed } = loadPush();
    assert.equal(installCardDismissed(), false);
});

test('a dismissal hides the card for 14 days, then the card returns', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const { installCardDismissed } = loadPush({ 'manzil.installCardDismissedAt': String(Date.now() - 13 * DAY) });
    assert.equal(installCardDismissed(), true);
    const expired = loadPush({ 'manzil.installCardDismissedAt': String(Date.now() - 15 * DAY) });
    assert.equal(expired.installCardDismissed(), false);
});

test('dismissing records the timestamp and a corrupt value does not hide the card', () => {
    const store = {};
    const { dismissInstallCard, installCardDismissed } = loadPush(store);
    dismissInstallCard();
    assert.ok(Number(store['manzil.installCardDismissedAt']) > 0);
    assert.equal(installCardDismissed(), true);
    const corrupt = loadPush({ 'manzil.installCardDismissedAt': 'not-a-number' });
    assert.equal(corrupt.installCardDismissed(), false);
});
