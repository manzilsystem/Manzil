const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const crud = fs.readFileSync(path.join(root, 'js', 'crud.js'), 'utf8');
const stateSrc = fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8');
const modals = fs.readFileSync(path.join(root, 'src', 'partials', 'modals.html'), 'utf8');

test('toast skips an identical message shown within 3 seconds', () => {
    const start = stateSrc.indexOf('const recentToasts');
    const end = stateSrc.indexOf('function confirmRecordDeletion');
    const shown = [];
    let now = 1000;
    const sandbox = {
        Date: { now: () => now },
        Map,
        setTimeout: () => 0,
        document: {
            createElement: () => ({ style: {}, remove() {} }),
            getElementById: () => ({ appendChild: el => shown.push(el.textContent) })
        }
    };
    const toast = vm.runInNewContext(stateSrc.slice(start, end) + '\ntoast', sandbox);
    toast('x', 'error'); toast('x', 'error'); toast('y', 'error');
    assert.equal(shown.length, 2);
    now += 3100;
    toast('x', 'error');
    assert.equal(shown.length, 3);
});

test('default payment method is last used, else cash', () => {
    const start = crud.indexOf('const INCOME_LAST_METHOD_KEY');
    const end = crud.indexOf('function showIncomeFieldError');
    const run = (stored, methods) => {
        const select = { options: methods.map(value => ({ value })), value: '' };
        const sandbox = {
            localStorage: { getItem: () => stored, setItem() {} },
            document: { getElementById: () => select }
        };
        vm.runInNewContext(crud.slice(start, end) + '\napplyDefaultIncomePaymentMethod();', sandbox);
        return select.value;
    };
    assert.equal(run('instapay', ['', 'cash', 'instapay']), 'instapay');
    assert.equal(run('wallet', ['', 'cash', 'instapay']), 'cash');
    assert.equal(run(null, ['', 'cash']), 'cash');
    assert.equal(run(null, ['', 'instapay']), '');
});

test('submit names the missing field and a >12 month advance needs confirmation', () => {
    assert.match(crud, /showIncomeFieldError\(missing\[0\], missing\[1\], missing\[2\]\)/);
    assert.match(crud, /getIncomeFutureMonthsAhead\(allocation\) > 12[\s\S]*confirm\(/);
    assert.match(crud, /scrollIntoView[\s\S]*focus\(/);
});

test('native month picker hides behind the "شهر آخر" link', () => {
    assert.match(modals, /id="incomeOtherMonthLink"[\s\S]*شهر آخر/);
    assert.match(modals, /id="incomeOtherMonthBox" class="hidden/);
});
