const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const sqlName = '20261127_arrears_reminder_settings.sql';
const sql = read(path.join('supabase', 'manual', sqlName));
const modals = read(path.join('src', 'partials', 'modals.html'));
const settings = read(path.join('js', 'settings.js'));
const state = read(path.join('js', 'state.js'));
const supabase = read(path.join('js', 'supabase.js'));

test('the reminder schedule SQL is kept out of the auto-applied migrations folder', () => {
    assert.equal(fs.existsSync(path.join(root, 'supabase', 'migrations', sqlName)), false);
    assert.equal(fs.readdirSync(path.join(root, 'supabase', 'migrations')).some(name => /arrears_reminder_settings/.test(name)), false);
});

test('the reminder schedule SQL adds a per-building switch and day with safe defaults', () => {
    assert.match(sql, /add column if not exists arrears_reminders_enabled boolean not null default true/);
    assert.match(sql, /add column if not exists arrears_reminder_day smallint not null default 5/);
    assert.match(sql, /check \(arrears_reminder_day between 1 and 28\)/);
});

test('the nudge honors the switch, the chosen day, and the real lateness start', () => {
    assert.match(sql, /if not v_building\.arrears_reminders_enabled then/);
    assert.match(sql, /v_month_start \+ \(v_building\.arrears_reminder_day - 1\)/);
    assert.match(sql, /v_month_start \+ v_building\.subscription_due_day \+ v_building\.subscription_grace_days/);
    assert.match(sql, /manzil-arrears-reminder-nudge', '0 7 \* \* \*'/);
    assert.match(sql, /revoke all on function private\.queue_arrears_reminder_nudges\(\)/);
    assert.match(sql, /on conflict \(building_id, target_scope, dedupe_key\) do nothing/);
});

test('settings UI exposes the per-building switch and the reminder day', () => {
    assert.match(modals, /id="settingsArrearsRemindersEnabled"/);
    assert.match(modals, /id="settingsArrearsReminderDay" min="1" max="28"/);
    assert.match(settings, /getElementById\('settingsArrearsRemindersEnabled'\)/);
    assert.match(settings, /getElementById\('settingsArrearsReminderDay'\)/);
});

test('reminder day is validated as an integer from 1 to 28 before saving', () => {
    assert.match(settings, /!Number\.isInteger\(arrearsReminderDayRaw\) \|\| arrearsReminderDayRaw < 1 \|\| arrearsReminderDayRaw > 28/);
    assert.match(settings, /flagSettingsFieldError\('settingsArrearsReminderDay', 'reminders'/);
});

test('schedule state defaults safely and syncs through building settings', () => {
    assert.match(state, /arrearsRemindersEnabled:true, arrearsReminderDay:5/);
    assert.match(supabase, /arrears_reminders_enabled,arrears_reminder_day/);
    assert.match(settings, /arrears_reminders_enabled: arrearsRemindersEnabled/);
    assert.match(settings, /arrears_reminder_day: arrearsReminderDayRaw/);
});

test('missing schedule columns never break loading or saving before the manual SQL lands', () => {
    assert.match(supabase, /reminderScheduleError\.code !== 'PGRST204'/);
    assert.match(settings, /reminderScheduleError\?\.code === 'PGRST204'/);
});
