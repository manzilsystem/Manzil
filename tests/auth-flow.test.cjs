const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const accessSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'access.js'), 'utf8');

test('access.js loads without legacy session-handler ReferenceErrors', () => {
    const registeredEvents = [];
    const sandbox = {
        document: {
            addEventListener: (eventName) => registeredEvents.push(eventName),
        },
        updateAccessSwitchButton: () => {},
    };

    assert.doesNotThrow(() => vm.runInNewContext(accessSource, sandbox, { filename: 'js/access.js' }));
    assert.deepEqual(registeredEvents, ['DOMContentLoaded']);
});

test('a missing resident error shown in the owner portal is not aria-hidden', () => {
    const attributes = { 'aria-hidden': 'true' };
    const classes = new Set(['hidden']);
    const portal = {
        innerHTML: '',
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
        },
        setAttribute: (name, value) => { attributes[name] = value; },
        getAttribute: name => attributes[name] ?? null,
    };
    const sandbox = {
        document: {
            addEventListener() {},
            getElementById: id => id === 'ownerPortal' ? portal : null,
        },
        state: { residents: [] },
        currentResidentId: 'missing-resident',
        updateAccessSwitchButton() {},
    };
    const renderOwnerPortal = vm.runInNewContext(`${accessSource}\nrenderOwnerPortal`, sandbox, {
        filename: 'js/access.js',
    });

    renderOwnerPortal();

    assert.match(portal.innerHTML, /تعذر العثور على حساب الشقة/);
    assert.equal(classes.has('hidden'), false);
    assert.equal(portal.getAttribute('aria-hidden'), 'false');
});

test('owner portal uses the effective subscription rate for the current month', () => {
    const resident = {
        id: 'resident-1',
        name: 'Test Owner',
        apartmentNumber: '12',
        monthlyAmount: 100,
    };
    const portal = {
        innerHTML: '',
        classList: { remove() {} },
        setAttribute() {},
    };
    const headerBuildingTitle = { textContent: '' };
    const syncStatus = { textContent: '' };
    let requestedRate = null;
    const sandbox = {
        document: {
            addEventListener() {},
            getElementById: id => ({
                ownerPortal: portal,
                headerBuildingTitle,
                syncStatus,
            })[id] || null,
        },
        state: {
            residents: [resident],
            income: [],
            notices: [],
            ownerNotifications: [],
            buildingName: 'Test Building',
            defaultSubscription: 90,
        },
        currentResidentId: 'resident-1',
        getCurrentMonth: () => 'نوفمبر 2026',
        getPaidAmountForMonth: () => 25,
        getSubscriptionAmountForMonth: (item, month) => {
            requestedRate = { item, month };
            return 125;
        },
        calculateCumulativeDebt: () => ({ count: 0, totalDebt: 0, unpaidMonths: [] }),
        esc: value => String(value ?? ''),
        fmtNum: value => String(value),
        formatDate: () => '',
        updateAccessSwitchButton() {},
    };
    const renderOwnerPortal = vm.runInNewContext(`${accessSource}\nrenderOwnerPortal`, sandbox, {
        filename: 'js/access.js',
    });

    renderOwnerPortal();

    assert.equal(requestedRate.item, resident);
    assert.equal(requestedRate.month, 'نوفمبر 2026');
    assert.match(portal.innerHTML, /اشتراكك الشهري 125 ج\.م/);
    assert.match(portal.innerHTML, /المتبقي لهذا الشهر[\s\S]*?100 ج\.م/);
});
