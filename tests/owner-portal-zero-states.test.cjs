const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const access = fs.readFileSync(path.join(__dirname, '..', 'js', 'access.js'), 'utf8');

test('a zero-arrears account shows only the zero summary row, not a second line', () => {
    assert.doesNotMatch(access, /لا توجد شهور متأخرة/);
    assert.match(access, /summary row above already shows a zero total/);
    assert.match(access, /إجمالي متأخرات حسابك/);
});

test('the grace period reads in words and drops the "0 يوم" phrasing', () => {
    assert.match(access, /: 'بدون فترة سماح'/);
    assert.match(access, /فترة السماح \$\{esc\(formatOverdueDuration\(subscriptionGraceDays\)\)\}/);
    assert.doesNotMatch(access, /فترة السماح \$\{subscriptionGraceDays\} يوم/);
});
