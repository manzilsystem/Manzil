'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const config = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
const seed = readFileSync(path.join(root, 'supabase/seed.sql'), 'utf8');
const verify = readFileSync(path.join(__dirname, 'local-seed.verify.sql'), 'utf8');

test('Supabase CLI seed is explicitly enabled for the local workspace', () => {
    assert.match(config, /\[db\.seed\]\s+enabled\s*=\s*true\s+sql_paths\s*=\s*\["\.\/seed\.sql"\]/);
    assert.match(seed, /^-- LOCAL-ONLY FIXTURES\./);
});

test('local fixtures use fictional invalid email domains and fixed local credentials', () => {
    assert.match(seed, /manager@manzil\.invalid/);
    assert.doesNotMatch(seed, /INSERT INTO auth\.users\s*\([\s\S]*?\bemail\b/i);
    assert.match(seed, /@phone-login\.manzil\.invalid/);
    assert.match(seed, /Manzil-Local-Only-2026!/);
    assert.match(seed, /\+201555001101/);
    assert.match(seed, /\+201555001102/);
    assert.doesNotMatch(seed, /musvcrkljccubwbcrtjs\.supabase\.co|sb_publishable_/i);
    assert.doesNotMatch(seed, /service_role|SUPABASE_SERVICE_ROLE_KEY/i);
});

test('seed contains representative apartment, rate, payment, expense and cash transfer fixtures', () => {
    for (const table of [
        'auth.users', 'auth.identities', 'public.residents',
        'public.resident_subscription_rates', 'public.income',
        'public.expenses', 'public.cash_transfers'
    ]) assert.match(seed, new RegExp('INSERT INTO ' + table.replace('.', '\\.') , 'i'));
    assert.match(seed, /'main', 'development', 400/i);
    assert.match(seed, /'main', 'emergency', 300/i);
    assert.match(seed, /get_monthly_cashbox_close/i);
    for (const amount of ['1120', '150', '175', '1445']) assert.match(seed, new RegExp('\\b' + amount + '\\b'));
});

test('local seed has no schema reset, destructive DDL or backup-control fixtures', () => {
    assert.doesNotMatch(seed, /\b(?:TRUNCATE|DELETE\s+FROM|DROP\s+(?:TABLE|SCHEMA|FUNCTION)|ALTER\s+TABLE)\b/i);
    assert.doesNotMatch(seed, /public\.(?:backup_catalog|backup_requests|restore_requests|building_mutations)/i);
    assert.match(seed, /LOCAL-ONLY/);
});

test('database verification checks monthly reconciliation and owner row-level isolation', () => {
    assert.match(verify, /local_monthly_close_unexpected/);
    assert.match(verify, /owner_rls_resident_scope_failed/);
    assert.match(verify, /owner_rls_notification_scope_failed/);
    assert.match(verify, /owner_rls_internal_notes_leak/);
    assert.match(verify, /ROLLBACK;/);
});
