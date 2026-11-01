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
