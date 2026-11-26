const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const access = read('js/access.js');

// Loads renderOwnerNotificationsBell with a stub button/badge and a given
// unread count, then returns the aria-label the bell announces.
function bellLabel(unreadCount) {
    const button = {
        attrs: {},
        classes: new Set(),
        classList: { toggle(name, force) { force ? this._add?.(name) : null; } },
        setAttribute(name, value) { this.attrs[name] = value; },
        getAttribute(name) { return this.attrs[name]; }
    };
    button.classList.toggle = (name, force) => { force ? button.classes.add(name) : button.classes.delete(name); };
    const badge = {
        textContent: '',
        classes: new Set(),
        classList: { toggle(name, force) { force ? badge.classes.add(name) : badge.classes.delete(name); } }
    };
    const sandbox = {
        fmtNum: value => String(value ?? 0),
        document: {
            addEventListener() {},
            getElementById(id) {
                if (id === 'ownerNotificationsBtn') return button;
                if (id === 'ownerNotificationsBadge') return badge;
                return null;
            }
        },
        state: {
            ownerNotifications: Array.from({ length: unreadCount }, (_, i) => ({ id: 'n' + i, readAt: null }))
        },
        currentUserRole: 'owner',
        activeSession: { user: { id: 'u1' } }
    };
    vm.runInNewContext(access + '\nrenderOwnerNotificationsBell();', sandbox, { filename: 'js/access.js' });
    return { aria: button.getAttribute('aria-label'), badge: badge.textContent, badgeHidden: badge.classes.has('hidden') };
}

test('bell aria-label uses the singular form for one unread notification', () => {
    const { aria, badge } = bellLabel(1);
    assert.equal(aria, 'الإشعارات، إشعار واحد غير مقروء');
    assert.equal(badge, '1');
});

test('bell aria-label uses the dual form for two unread notifications', () => {
    const { aria, badge } = bellLabel(2);
    assert.equal(aria, 'الإشعارات، إشعاران غير مقروءان');
    assert.equal(badge, '2');
});

test('bell aria-label keeps the plural form for three and up, capped at 99+', () => {
    assert.equal(bellLabel(5).aria, 'الإشعارات، 5 غير مقروءة');
    const capped = bellLabel(120);
    assert.equal(capped.aria, 'الإشعارات، 99+ غير مقروءة');
    assert.equal(capped.badge, '99+');
});

test('bell with no unread notifications hides the badge and drops the count', () => {
    const { aria, badgeHidden } = bellLabel(0);
    assert.equal(aria, 'الإشعارات');
    assert.equal(badgeHidden, true);
});

test('the old raw-count phrasing is gone', () => {
    assert.doesNotMatch(access, /\$\{label\} غير مقروءة` : 'الإشعارات'\);/);
});

test('owner-mode CSS no longer hides the notifications bell', () => {
    const css = read('css/style.css');
    assert.match(css, /button:not\(#accessSwitchBtn\):not\(#ownerNotificationsBtn\)/);
});
