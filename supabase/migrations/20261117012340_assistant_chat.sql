-- Persistent, building-scoped chat history for عم عبده.
-- The assistant remains deterministic/local; this migration only adds an optional
-- authenticated history layer and never grants access to financial tables.

create table if not exists public.assistant_conversations (
    id uuid primary key default gen_random_uuid(),
    building_id uuid not null references public.buildings(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    resident_id uuid references public.residents(id) on delete set null,
    scope_key text not null check (char_length(scope_key) between 1 and 120),
    title text not null default 'عم عبده' check (char_length(title) between 1 and 120),
    context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'::text),
    last_message_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint assistant_conversations_scope_unique unique (building_id, user_id, scope_key)
);

create table if not exists public.assistant_messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
    building_id uuid not null references public.buildings(id) on delete cascade,
    sender_id uuid references auth.users(id) on delete set null,
    sender_type text not null check (sender_type in ('user', 'assistant')),
    body text not null check (char_length(body) between 1 and 12000),
    metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'::text),
    created_at timestamptz not null default now(),
    constraint assistant_messages_sender_consistency check (
        (sender_type = 'user' and sender_id is not null)
        or (sender_type = 'assistant' and sender_id is null)
    )
);

comment on table public.assistant_conversations is
    'Private, building-scoped conversation history for the deterministic local assistant.';
comment on table public.assistant_messages is
    'Append-only user and assistant messages belonging to assistant_conversations.';

create index if not exists assistant_conversations_user_updated_idx
    on public.assistant_conversations (user_id, building_id, updated_at desc);
create index if not exists assistant_messages_conversation_created_idx
    on public.assistant_messages (conversation_id, created_at asc);
create index if not exists assistant_messages_building_created_idx
    on public.assistant_messages (building_id, created_at desc);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

revoke all on public.assistant_conversations, public.assistant_messages from public, anon;
grant select, insert, update on public.assistant_conversations to authenticated;
grant select, insert on public.assistant_messages to authenticated;

drop policy if exists assistant_conversations_select_own on public.assistant_conversations;
create policy assistant_conversations_select_own on public.assistant_conversations
for select to authenticated
using (
    user_id = (select auth.uid())
    and private.is_building_member(building_id)
    and (
        private.is_building_manager(building_id)
        or (
            resident_id is not null
            and private.owns_resident(resident_id)
            and private.owner_pin_change_complete()
        )
    )
);

drop policy if exists assistant_conversations_insert_own on public.assistant_conversations;
create policy assistant_conversations_insert_own on public.assistant_conversations
for insert to authenticated
with check (
    user_id = (select auth.uid())
    and (
        (private.is_building_manager(building_id) and resident_id is null)
        or (
            private.is_building_member(building_id)
            and resident_id is not null
            and private.owns_resident(resident_id)
            and private.owner_pin_change_complete()
        )
    )
);

drop policy if exists assistant_conversations_update_own on public.assistant_conversations;
create policy assistant_conversations_update_own on public.assistant_conversations
for update to authenticated
using (
    user_id = (select auth.uid())
    and private.is_building_member(building_id)
)
with check (
    user_id = (select auth.uid())
    and (
        (private.is_building_manager(building_id) and resident_id is null)
        or (
            private.is_building_member(building_id)
            and resident_id is not null
            and private.owns_resident(resident_id)
            and private.owner_pin_change_complete()
        )
    )
);

drop policy if exists assistant_messages_select_own on public.assistant_messages;
create policy assistant_messages_select_own on public.assistant_messages
for select to authenticated
using (
    exists (
        select 1
        from public.assistant_conversations conversation
        where conversation.id = assistant_messages.conversation_id
          and conversation.building_id = assistant_messages.building_id
          and conversation.user_id = (select auth.uid())
    )
);

drop policy if exists assistant_messages_insert_own on public.assistant_messages;
create policy assistant_messages_insert_own on public.assistant_messages
for insert to authenticated
with check (
    (
        sender_type = 'user'
        and sender_id = (select auth.uid())
    )
    or (
        sender_type = 'assistant'
        and sender_id is null
    )
    and exists (
    select 1
    from public.assistant_conversations conversation
    where conversation.id = assistant_messages.conversation_id
      and conversation.building_id = assistant_messages.building_id
      and conversation.user_id = (select auth.uid())
);

create or replace function private.touch_assistant_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.assistant_conversations
       set updated_at = now(),
           last_message_at = coalesce(new.created_at, now())
     where id = new.conversation_id;
    return new;
end;
$$;

revoke all on function private.touch_assistant_conversation() from public, anon, authenticated;
drop trigger if exists touch_assistant_conversation on public.assistant_messages;
create trigger touch_assistant_conversation
after insert on public.assistant_messages
for each row execute function private.touch_assistant_conversation();

-- Enable future realtime UI features without requiring a second schema change.
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
           select 1
           from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'assistant_messages'
       ) then
        alter publication supabase_realtime add table public.assistant_messages;
    end if;
end;
$$;
