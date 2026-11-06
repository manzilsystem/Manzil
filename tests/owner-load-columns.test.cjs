const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase.js'), 'utf8');
const start = source.indexOf('async function loadState()');
const end = source.indexOf('\nasync function saveState()', start);
const loadState = source.slice(start, end);

test('owner sessions select only fields required by the read-only portal', () => {
    assert.notEqual(start, -1, 'loadState must exist');
    assert.notEqual(end, -1, 'loadState must end before saveState');

    assert.ok(loadState.includes(
        "const residentColumns = isManager\n        ? 'id,user_id,name,apartment_number,floor,phone,monthly_amount,created_at,billing_start_month'\n        : 'id,name,apartment_number,floor,monthly_amount,created_at,billing_start_month'"
    ), 'owner resident data must retain created_at and the billing start for debt calculations');

    assert.ok(loadState.includes(
        "const incomeColumns = isManager\n        ? 'id,resident_id,amount,month,notes,payment_method,cash_account_code,purpose_code,paid_at'\n        : 'id,resident_id,amount,month,notes,payment_method,cash_account_code,purpose_code,paid_at'"
    ), 'owner payment history needs only payment identity, amount, month, and date');

    assert.ok(loadState.includes(
        "const noticeColumns = 'id,text,created_at'"
    ), 'owner announcements need only their displayed fields');

    assert.ok(loadState.includes("supabaseQuery('residents', residentColumns)"));
    assert.ok(loadState.includes("supabaseQueryAllById('income', incomeColumns)"));
    assert.match(source, /async function supabaseQueryAllById\(table, columns = '\*', pageSize = 1000\)/);
    assert.match(source, /\.order\('id', \{ ascending: true \}\)\s*\.range\(offset, offset \+ pageSize - 1\)/);
    assert.ok(loadState.includes("supabaseQuery('notices', noticeColumns)"));
});
