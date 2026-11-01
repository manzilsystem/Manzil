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
