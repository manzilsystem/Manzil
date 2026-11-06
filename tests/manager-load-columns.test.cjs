const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase.js'), 'utf8');
const start = source.indexOf('async function loadState()');
const end = source.indexOf('\nasync function saveState()', start);
const loadState = source.slice(start, end);

test('manager load selects only fields consumed by application state', () => {
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);

    assert.ok(loadState.includes(
        "from('buildings').select('id,name,manager_name,manager_phone,default_subscription,starting_balance,current_theme,payment_settings,subscription_due_day,subscription_grace_days,payment_allocation_policy,receipt_thank_you_template,arrears_reminder_template,floor_count,apartments_per_floor,state_version')"
    ));

    assert.ok(loadState.includes(
        "const residentColumns = isManager\n        ? 'id,user_id,name,apartment_number,floor,phone,monthly_amount,created_at,billing_start_month'"
    ));
    assert.ok(loadState.includes(
        "const incomeColumns = isManager\n        ? 'id,resident_id,amount,month,notes,payment_method,cash_account_code,purpose_code,settlement_adjustment_id,paid_at'"
    ));
    assert.ok(loadState.includes(
        "const expenseColumns = 'id,title,amount,category,month,notes,cash_account_code,spent_at'"
    ));
    assert.ok(loadState.includes(
        "const auditColumns = 'id,action,details,actor_id,created_at,actor:profiles!audit_logs_actor_id_fkey(full_name)'"
    ));

    assert.ok(loadState.includes("supabaseQuery('expenses', expenseColumns)"));
    assert.ok(loadState.includes("supabaseQuery('audit_logs', auditColumns)"));
    assert.ok(loadState.includes("supabaseQuery('resident_internal_notes', 'resident_id,notes')"));
});

test('manager load keeps private resident notes and income notes available', () => {
    assert.ok(loadState.includes("'id,resident_id,amount,month,notes,payment_method,cash_account_code,purpose_code,settlement_adjustment_id,paid_at'"));
    assert.ok(loadState.includes("resident.notes = notesByResident.get(resident.id) || ''"));
});
