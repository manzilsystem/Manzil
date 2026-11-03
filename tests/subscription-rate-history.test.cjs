const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261103064001_subscription_rate_change_history.sql'),
    'utf8'
);
const adapter = fs.readFileSync(path.join(root, 'js/subscription-rates.js'), 'utf8');
const crud = fs.readFileSync(path.join(root, 'js/crud.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('subscription rate history is append-only and manager-readable only', () => {
    assert.match(migration, /CREATE TABLE public\.resident_subscription_rate_changes/i);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
    assert.match(migration, /resident_subscription_rate_changes_manager_read[\s\S]*private\.is_building_manager\(building_id\)/i);
    assert.match(migration, /REVOKE ALL ON TABLE public\.resident_subscription_rate_changes FROM PUBLIC, anon, authenticated/i);
    assert.match(migration, /GRANT SELECT ON TABLE public\.resident_subscription_rate_changes TO authenticated/i);
    assert.match(migration, /REVOKE ALL ON FUNCTION private\.record_resident_subscription_rate_change\(\)/i);
});

test('database trigger records both old and new values without overwriting prior audit events', () => {
    assert.match(migration, /AFTER INSERT OR UPDATE OF monthly_amount ON public\.resident_subscription_rates/i);
    assert.match(migration, /OLD\.monthly_amount[\s\S]*NEW\.monthly_amount/i);
    assert.match(migration, /INSERT INTO public\.resident_subscription_rate_changes/i);
    assert.match(migration, /LAG\(rate\.monthly_amount\)/i);
});

test('manager UI exposes history and new effective month without prompt()', () => {
    assert.match(html, /id="subscriptionRateModal"/);
    assert.match(html, /id="subscriptionRateHistoryBody"/);
    assert.match(html, /id="subscriptionRateEffectiveMonth"/);
    assert.match(crud, /openSubscriptionRateModal/);
    assert.match(crud, /addSubscriptionRateChange/);
    assert.doesNotMatch(crud, /prompt\(['"]تاريخ تطبيق قيمة الاشتراك/);
});

test('history loads only for managers and is not queried in owner sessions', () => {
    assert.match(adapter, /currentUserRole === 'manager'[\s\S]*resident_subscription_rate_changes/);
    assert.match(adapter, /reloadResidentSubscriptionRateHistory/);
});
