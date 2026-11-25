const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '20261117012340_assistant_chat.sql'),
    'utf8'
);
const supabaseSource = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
const assistantSource = fs.readFileSync(path.join(root, 'js', 'assistant.js'), 'utf8');

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

test('RLS scenarios stay covered by concrete migration rules', () => {
    const scenarios = [
        ['قراءة محادثة مستخدم آخر في نفس المبنى', () => assert.match(migration, /user_id = \(select auth\.uid\(\)\)/)],
        ['إنشاء محادثة مالك لشقة أخرى', () => assert.match(migration, /private\.owns_resident\(resident_id\)/)],
        ['إدخال رسالة مستخدم باسم `sender_id` مختلف', () => assert.match(migration, /sender_id = \(select auth\.uid\(\)\)/)],
        ['حذف رسالة أو محادثة مباشرة', () => assert.doesNotMatch(migration, /create policy[\s\S]{0,120}?for delete/i)],
        ['الوصول المجهول `anon`', () => assert.match(migration, /revoke all on public\.assistant_conversations, public\.assistant_messages from public, anon/)]
    ];
    for (const [label, check] of scenarios) {
        check();
        assert.ok(label);
    }
});

test('clearing assistant chat hides prior append-only messages after reload', () => {
    assert.match(supabaseSource, /select\('id,context,updated_at'\)/);
    assert.match(supabaseSource, /conversation\.context\?\.chat_epoch/);
    assert.match(supabaseSource, /messagesQuery\.eq\('metadata->>chat_epoch', chatEpoch\)/);
    assert.match(supabaseSource, /\.order\('created_at', \{ ascending: false \}\)\s*\.limit\(30\)/, 'load the newest page, not the oldest');
    assert.match(supabaseSource, /\(messages \|\| \[\]\)\.slice\(\)\.reverse\(\)/, 'restore chronological order before rendering');
    assert.match(supabaseSource, /async function clearAssistantChatHistory\(\)/);
    assert.match(supabaseSource, /update\(\{ context: \{ \.\.\.\(conversation\.context \|\| \{\}\), period: null, residentId: null, chat_epoch: chatEpoch \} \}\)/);
    assert.match(supabaseSource, /clear: clearAssistantChatHistory/);
    assert.match(assistantSource, /function clearAssistantRemoteHistory\(\)/);
    assert.match(assistantSource, /assistantRemoteWriteQueue = assistantRemoteWriteQueue\.then/);
    assert.match(assistantSource, /assistantChatRevision \+= 1/);
    assert.doesNotMatch(supabaseSource, /from\('assistant_messages'\)\s*\.delete\(/);
});
