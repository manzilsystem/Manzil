const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migration = fs.readFileSync(
    path.join(__dirname, '..', 'supabase/migrations/20261102195138_phase1_security_hardening.sql'),
    'utf8'
);

test('notification RLS helpers are executable by authenticated users but not anon or PUBLIC', () => {
    for (const signature of [
        'public.can_read_notification(uuid, uuid, uuid)',
        'public.is_building_manager(uuid)',
    ]) {
        assert.match(
            migration,
            new RegExp('revoke all on function ' + signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' from public, anon', 'i')
        );
        assert.match(
            migration,
            new RegExp('grant execute on function ' + signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' to authenticated', 'i')
        );
    }
});

test('owner notification access stays blocked until first PIN change is complete', () => {
    assert.match(migration, /create or replace function public\.can_read_notification/i);
    assert.match(migration, /p_target_user_id = auth\.uid\(\)[\s\S]*private\.owner_pin_change_complete\(\)/i);
    assert.match(migration, /private\.owner_pin_change_complete\(\)[\s\S]*r\.id = p_target_resident_id[\s\S]*r\.user_id = auth\.uid\(\)/i);
});

test('authenticated browser sessions do not receive non-RLS table privileges or profile write access', () => {
    assert.match(migration, /revoke truncate, references, trigger on all tables in schema public from authenticated/i);
    assert.match(
        migration,
        /revoke insert, update, delete, truncate, references, trigger[\s\S]*on table public\.profiles from authenticated/i
    );
});

test('income updates preserve the manager boundary and resident/building relationship', () => {
    assert.match(migration, /drop policy if exists income_manager_update on public\.income/i);
    assert.match(migration, /using \(private\.is_building_manager\(building_id\)\)/i);
    assert.match(migration, /with check \([\s\S]*private\.is_building_manager\(building_id\)[\s\S]*r\.id = income\.resident_id[\s\S]*r\.building_id = income\.building_id/i);
});
