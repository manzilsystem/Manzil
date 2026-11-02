-- Manzil: database-enforced role and apartment isolation.
-- Apply this migration to a new Supabase project before enabling the client config.

create table if not exists public.buildings (
    id text primary key,
    name text not null default 'Manzil',
    default_subscription numeric not null default 0 check (default_subscription >= 0),
    created_at timestamptz not null default now()
);

insert into public.buildings (id, name)
values ('main', 'Manzil')
on conflict (id) do nothing;

create table if not exists public.apartments (
    id text primary key,
    building_id text not null references public.buildings(id) on delete cascade,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    building_id text not null references public.buildings(id) on delete cascade,
    role text not null check (role in ('admin', 'owner')),
    apartment_id text references public.apartments(id) on delete cascade,
    phone text,
    display_name text,
    created_at timestamptz not null default now(),
    constraint owner_must_have_apartment check (role <> 'owner' or apartment_id is not null)
);

create table if not exists public.income_records (
    id text primary key,
    building_id text not null references public.buildings(id) on delete cascade,
    apartment_id text not null references public.apartments(id) on delete cascade,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.expenses (
    id text primary key,
    building_id text not null references public.buildings(id) on delete cascade,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.building_notices (
    id text primary key,
    building_id text not null references public.buildings(id) on delete cascade,
    data jsonb not null default '{}'::jsonb,
    is_published boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
    building_id text primary key references public.buildings(id) on delete cascade,
    data jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
    id text primary key,
    building_id text not null references public.buildings(id) on delete cascade,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists apartments_building_idx on public.apartments (building_id);
create unique index if not exists profiles_phone_unique_idx on public.profiles (lower(phone)) where phone is not null;
create index if not exists income_building_apartment_idx on public.income_records (building_id, apartment_id);
create index if not exists expenses_building_idx on public.expenses (building_id);
create index if not exists notices_building_published_idx on public.building_notices (building_id, is_published);
create index if not exists audit_logs_building_idx on public.audit_logs (building_id);

create or replace function public.current_building_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select p.building_id
    from public.profiles as p
    where p.id = (select auth.uid())
    limit 1
$$;

create or replace function public.current_manzil_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select p.role
    from public.profiles as p
    where p.id = (select auth.uid())
    limit 1
$$;

create or replace function public.current_apartment_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select p.apartment_id
    from public.profiles as p
    where p.id = (select auth.uid())
    limit 1
$$;

revoke all on function public.current_building_id() from public, anon;
revoke all on function public.current_manzil_role() from public, anon;
revoke all on function public.current_apartment_id() from public, anon;
grant execute on function public.current_building_id() to authenticated;
grant execute on function public.current_manzil_role() to authenticated;
grant execute on function public.current_apartment_id() to authenticated;

alter table public.buildings enable row level security;
alter table public.profiles enable row level security;
alter table public.apartments enable row level security;
alter table public.income_records enable row level security;
alter table public.expenses enable row level security;
alter table public.building_notices enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_logs enable row level security;

-- Keep grants and policies explicit. RLS narrows table grants to the relevant rows.
revoke all on public.buildings, public.profiles, public.apartments,
    public.income_records, public.expenses, public.building_notices,
    public.app_settings, public.audit_logs from anon;
grant select, update on public.buildings to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.apartments,
    public.income_records, public.expenses, public.building_notices,
    public.app_settings, public.audit_logs to authenticated;

create policy buildings_member_read on public.buildings
for select to authenticated
using (id = (select public.current_building_id()));
create policy buildings_manager_update on public.buildings
for update to authenticated
using (id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin')
with check (id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');

create policy profiles_self_or_manager_read on public.profiles
for select to authenticated
using (
    id = (select auth.uid())
    or (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin')
);

create policy apartments_member_read on public.apartments
for select to authenticated
using (
    building_id = (select public.current_building_id())
    and (
        (select public.current_manzil_role()) = 'admin'
        or id = (select public.current_apartment_id())
    )
);
create policy apartments_manager_insert on public.apartments
for insert to authenticated
with check (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');
create policy apartments_manager_update on public.apartments
for update to authenticated
using (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin')
with check (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');
create policy apartments_manager_delete on public.apartments
for delete to authenticated
using (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');

create policy income_member_read on public.income_records
for select to authenticated
using (
    building_id = (select public.current_building_id())
    and (
        (select public.current_manzil_role()) = 'admin'
        or apartment_id = (select public.current_apartment_id())
    )
);
create policy income_manager_insert on public.income_records
for insert to authenticated
with check (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');
create policy income_manager_update on public.income_records
for update to authenticated
using (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin')
with check (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');
create policy income_manager_delete on public.income_records
for delete to authenticated
using (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');

create policy expenses_manager_read on public.expenses
for select to authenticated
using (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');
create policy expenses_manager_insert on public.expenses
for insert to authenticated
with check (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');
create policy expenses_manager_update on public.expenses
for update to authenticated
using (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin')
with check (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');
create policy expenses_manager_delete on public.expenses
for delete to authenticated
using (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');

create policy notices_member_read on public.building_notices
for select to authenticated
using (
    building_id = (select public.current_building_id())
    and ((select public.current_manzil_role()) = 'admin' or is_published)
);
create policy notices_manager_insert on public.building_notices
for insert to authenticated
with check (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');
create policy notices_manager_update on public.building_notices
for update to authenticated
using (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin')
with check (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');
create policy notices_manager_delete on public.building_notices
for delete to authenticated
using (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');

create policy settings_manager_read on public.app_settings
for select to authenticated
using (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');
create policy settings_manager_insert on public.app_settings
for insert to authenticated
with check (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');
create policy settings_manager_update on public.app_settings
for update to authenticated
using (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin')
with check (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');
create policy settings_manager_delete on public.app_settings
for delete to authenticated
using (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');

create policy audit_manager_read on public.audit_logs
for select to authenticated
using (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');
create policy audit_manager_insert on public.audit_logs
for insert to authenticated
with check (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');
create policy audit_manager_update on public.audit_logs
for update to authenticated
using (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin')
with check (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');
create policy audit_manager_delete on public.audit_logs
for delete to authenticated
using (building_id = (select public.current_building_id()) and (select public.current_manzil_role()) = 'admin');

-- Atomic full-state synchronization for the existing manager UI. It is callable
-- only by authenticated managers; owner PINs and local PIN values are discarded.
create or replace function public.replace_building_state(p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_building_id text;
    v_residents jsonb;
    v_income jsonb;
    v_expenses jsonb;
    v_notices jsonb;
    v_audit_logs jsonb;
    v_settings jsonb;
begin
    v_building_id := public.current_building_id();
    if v_building_id is null or public.current_manzil_role() <> 'admin' then
        raise exception 'admin role required' using errcode = '42501';
    end if;
    if jsonb_typeof(p_state) <> 'object' then
        raise exception 'state must be a JSON object' using errcode = '22023';
    end if;
    v_residents := coalesce(p_state->'residents', '[]'::jsonb);
    v_income := coalesce(p_state->'income', '[]'::jsonb);
    v_expenses := coalesce(p_state->'expenses', '[]'::jsonb);
    v_notices := coalesce(p_state->'notices', '[]'::jsonb);
    v_audit_logs := coalesce(p_state->'auditLogs', '[]'::jsonb);
    if jsonb_typeof(v_residents) <> 'array' or jsonb_typeof(v_income) <> 'array'
       or jsonb_typeof(v_expenses) <> 'array' or jsonb_typeof(v_notices) <> 'array'
       or jsonb_typeof(v_audit_logs) <> 'array' then
        raise exception 'state collections must be arrays' using errcode = '22023';
    end if;

    update public.buildings
    set name = coalesce(nullif(p_state->>'buildingName', ''), 'Manzil'),
        default_subscription = greatest(0, coalesce((p_state->>'defaultSubscription')::numeric, 0))
    where id = v_building_id;

    v_settings := jsonb_build_object(
        'managerName', coalesce(p_state->'managerName', '""'::jsonb),
        'managerPhone', coalesce(p_state->'managerPhone', '""'::jsonb),
        'defaultSubscription', coalesce(p_state->'defaultSubscription', '0'::jsonb),
        'startingBalance', coalesce(p_state->'startingBalance', '0'::jsonb),
        'currentTheme', coalesce(p_state->'currentTheme', '"dark"'::jsonb),
        'lastUpdated', coalesce(p_state->'lastUpdated', '0'::jsonb)
    );
    insert into public.app_settings (building_id, data, updated_at)
    values (v_building_id, v_settings, now())
    on conflict (building_id) do update set data = excluded.data, updated_at = excluded.updated_at;

    insert into public.apartments (id, building_id, data, updated_at)
    select item->>'id', v_building_id, item - 'ownerPin' - 'pinCode', now()
    from jsonb_array_elements(v_residents) as source(item)
    where nullif(item->>'id', '') is not null
    on conflict (id) do update set building_id = excluded.building_id, data = excluded.data, updated_at = excluded.updated_at;

    insert into public.income_records (id, building_id, apartment_id, data)
    select item->>'id', v_building_id, item->>'residentId', item - 'residentId'
    from jsonb_array_elements(v_income) as source(item)
    where nullif(item->>'id', '') is not null and nullif(item->>'residentId', '') is not null
    on conflict (id) do update set building_id = excluded.building_id, apartment_id = excluded.apartment_id, data = excluded.data;

    insert into public.expenses (id, building_id, data)
    select item->>'id', v_building_id, item
    from jsonb_array_elements(v_expenses) as source(item)
    where nullif(item->>'id', '') is not null
    on conflict (id) do update set building_id = excluded.building_id, data = excluded.data;

    insert into public.building_notices (id, building_id, data, is_published)
    select item->>'id', v_building_id, item, true
    from jsonb_array_elements(v_notices) as source(item)
    where nullif(item->>'id', '') is not null
    on conflict (id) do update set building_id = excluded.building_id, data = excluded.data, is_published = true;

    insert into public.audit_logs (id, building_id, data)
    select item->>'id', v_building_id, item
    from jsonb_array_elements(v_audit_logs) as source(item)
    where nullif(item->>'id', '') is not null
    on conflict (id) do update set building_id = excluded.building_id, data = excluded.data;

    delete from public.income_records as r
    where r.building_id = v_building_id
      and not exists (select 1 from jsonb_array_elements(v_income) as source(item) where item->>'id' = r.id);
    delete from public.expenses as r
    where r.building_id = v_building_id
      and not exists (select 1 from jsonb_array_elements(v_expenses) as source(item) where item->>'id' = r.id);
    delete from public.building_notices as r
    where r.building_id = v_building_id
      and not exists (select 1 from jsonb_array_elements(v_notices) as source(item) where item->>'id' = r.id);
    delete from public.audit_logs as r
    where r.building_id = v_building_id
      and not exists (select 1 from jsonb_array_elements(v_audit_logs) as source(item) where item->>'id' = r.id);
    delete from public.apartments as r
    where r.building_id = v_building_id
      and not exists (select 1 from jsonb_array_elements(v_residents) as source(item) where item->>'id' = r.id);
end;
$$;

revoke all on function public.replace_building_state(jsonb) from public, anon;
grant execute on function public.replace_building_state(jsonb) to authenticated;
