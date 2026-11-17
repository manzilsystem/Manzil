const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '20261117012340_assistant_chat.sql'),
    'utf8'
);
const plan = fs.readFileSync(
    path.join(root, 'docs', 'assistant-natural-language-and-rls.md'),
    'utf8'
);

test('assistant chat tables are protected by RLS and do not grant anon access', () => {
    assert.match(migration, /alter table public\.assistant_conversations enable row level security/);
    assert.match(migration, /alter table public\.assistant_messages enable row level security/);
    assert.match(migration, /revoke all on public\.assistant_conversations, public\.assistant_messages from public, anon/);
    assert.match(migration, /grant select, insert, update on public\.assistant_conversations to authenticated/);
    assert.match(migration, /grant select, insert on public\.assistant_messages to authenticated/);
});

test('assistant conversation policies bind every read and write to the authenticated user', () => {
    assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
    assert.match(migration, /private\.is_building_manager\(building_id\)/);
    assert.match(migration, /private\.owns_resident\(resident_id\)/);
    assert.match(migration, /private\.owner_pin_change_complete\(\)/);
    assert.match(migration, /sender_id = \(select auth\.uid\(\)\)/);
    assert.match(migration, /conversation\.user_id = \(select auth\.uid\(\)\)/);
});

test('RLS plan documents manager-owner isolation and write restrictions', () => {
    for (const phrase of [
        'قراءة محادثة مستخدم آخر في نفس المبنى',
        'إنشاء محادثة مالك لشقة أخرى',
        'إدخال رسالة مستخدم باسم `sender_id` مختلف',
        'حذف رسالة أو محادثة مباشرة',
        'الوصول المجهول `anon`'
    ]) {
        assert.ok(plan.includes(phrase), `missing RLS scenario: ${phrase}`);
    }
});
