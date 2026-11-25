-- Web Push subscriptions: one row per browser/device endpoint per signed-in user.
-- NOT applied automatically. Apply by hand after review (see docs/push-notifications.md).
-- The send-push Edge Function reads this table with the service role; clients can
-- only manage their own rows for buildings they belong to.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint),
  constraint push_subscriptions_endpoint_https check (endpoint like 'https://%'),
  constraint push_subscriptions_key_lengths check (char_length(p256dh) between 80 and 100 and char_length(auth) between 20 and 30)
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
create index if not exists push_subscriptions_building_idx on public.push_subscriptions(building_id);

alter table public.push_subscriptions enable row level security;

revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_building_member(building_id));

create policy push_subscriptions_update_own on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.is_building_member(building_id));

create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));
