-- Manzil: Supabase Auth + privacy-first relational schema
-- Bootstrap note: create the first manager in Supabase Auth, then insert its profile,
-- building and manager membership from the Supabase SQL editor/service role.

create extension if not exists pgcrypto;

create type public.app_role as enum ('manager', 'owner');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Manzil',
  manager_name text not null default '',
  manager_phone text,
  default_subscription numeric(12,2) not null default 0 check (default_subscription >= 0),
  starting_balance numeric(12,2) not null default 0,
  current_theme text not null default 'dark' check (current_theme in ('dark', 'light', 'emerald')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.building_members (
  building_id uuid not null references public.buildings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (building_id, user_id),
  unique (building_id, user_id, role)
);

create table public.residents (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  user_id uuid unique references public.profiles(id) on delete set null,
  name text not null,
  apartment_number text not null,
  phone text,
  monthly_amount numeric(12,2) not null default 0 check (monthly_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, apartment_number)
);

create table public.income (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  resident_id uuid not null references public.residents(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  month text not null,
  notes text,
  paid_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  title text not null,
  amount numeric(12,2) not null check (amount > 0),
  category text not null default 'أخرى',
  month text not null,
  notes text,
  spent_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id)
);

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  text text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  action text not null,
  details text,
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index building_members_user_idx on public.building_members(user_id);
create index residents_building_idx on public.residents(building_id);
create index residents_user_idx on public.residents(user_id);
create index income_resident_idx on public.income(resident_id);
create index income_building_month_idx on public.income(building_id, month);
create index expenses_building_month_idx on public.expenses(building_id, month);
create index notices_building_created_idx on public.notices(building_id, created_at desc);
create index audit_logs_building_created_idx on public.audit_logs(building_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger buildings_touch_updated_at before update on public.buildings
for each row execute function public.touch_updated_at();
create trigger residents_touch_updated_at before update on public.residents
for each row execute function public.touch_updated_at();

-- Keep profile rows in sync with Supabase Auth. This does not grant any data access.
create or replace function public.is_building_member(target_building uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.building_members where building_id = target_building and user_id = (select auth.uid()));
$$;

create or replace function public.is_building_manager(target_building uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.building_members where building_id = target_building and user_id = (select auth.uid()) and role = 'manager');
$$;

create or replace function public.owns_resident(target_resident uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.residents where id = target_resident and user_id = (select auth.uid()));
$$;

revoke all on function public.is_building_member(uuid), public.is_building_manager(uuid), public.owns_resident(uuid) from public, anon;
grant execute on function public.is_building_member(uuid), public.is_building_manager(uuid), public.owns_resident(uuid) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.buildings enable row level security;
alter table public.building_members enable row level security;
alter table public.residents enable row level security;
alter table public.income enable row level security;
alter table public.expenses enable row level security;
alter table public.notices enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: every user can read/update only their own profile. Managers can read
-- profiles belonging to their buildings for administration screens.
create policy profiles_select_self_or_manager on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.building_members me
    join public.building_members member on member.building_id = me.building_id
    where me.user_id = (select auth.uid())
      and me.role = 'manager'
      and member.user_id = profiles.id
  )
);
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Members: a user sees their own membership; a manager sees all memberships
-- for buildings they manage. Owners cannot grant themselves access.
create policy members_select_own_or_manager on public.building_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_building_manager(building_id)
);
create policy members_manager_insert on public.building_members
for insert to authenticated
with check (exists (
  select 1 from public.building_members manager
  where manager.building_id = building_members.building_id
    and manager.user_id = (select auth.uid())
    and manager.role = 'manager'
));
create policy members_manager_update on public.building_members
for update to authenticated
using (exists (
  select 1 from public.building_members manager
  where manager.building_id = building_members.building_id
    and manager.user_id = (select auth.uid())
    and manager.role = 'manager'
))
with check (exists (
  select 1 from public.building_members manager
  where manager.building_id = building_members.building_id
    and manager.user_id = (select auth.uid())
    and manager.role = 'manager'
));
create policy members_manager_delete on public.building_members
for delete to authenticated
using (exists (
  select 1 from public.building_members manager
  where manager.building_id = building_members.building_id
    and manager.user_id = (select auth.uid())
    and manager.role = 'manager'
));

create policy buildings_select_members on public.buildings
for select to authenticated
using (public.is_building_member(id));
create policy buildings_manager_update on public.buildings
for update to authenticated
using (public.is_building_manager(id))
with check (public.is_building_manager(id));

-- Residents: managers see all units in their building; owners see only their
-- linked unit. The owner link is user_id, never a client-supplied PIN.
create policy residents_manager_or_owner_select on public.residents
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_building_manager(building_id)
);
create policy residents_manager_insert on public.residents
for insert to authenticated
with check (public.is_building_manager(building_id));
create policy residents_manager_update on public.residents
for update to authenticated
using (public.is_building_manager(building_id))
with check (public.is_building_manager(building_id));
create policy residents_manager_delete on public.residents
for delete to authenticated
using (public.is_building_manager(building_id));

-- Income is linked to a resident, so an owner can only read their own payments.
create policy income_manager_or_owner_select on public.income
for select to authenticated
using (
  public.owns_resident(resident_id)
  or public.is_building_manager(building_id)
);
create policy income_manager_insert on public.income
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.is_building_manager(building_id)
  and exists (
    select 1 from public.residents r
    where r.id = income.resident_id and r.building_id = income.building_id
  )
);
create policy income_manager_update on public.income
for update to authenticated
using (public.is_building_manager(building_id))
with check (public.is_building_manager(building_id));
create policy income_manager_delete on public.income
for delete to authenticated
using (public.is_building_manager(building_id));

create policy expenses_manager_all on public.expenses
for all to authenticated
using (public.is_building_manager(building_id))
with check (
  created_by = (select auth.uid())
  and public.is_building_manager(building_id)
);

create policy notices_members_select on public.notices
for select to authenticated
using (public.is_building_member(building_id));
create policy notices_manager_insert on public.notices
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.is_building_manager(building_id)
);
create policy notices_manager_update on public.notices
for update to authenticated
using (public.is_building_manager(building_id))
with check (public.is_building_manager(building_id));
create policy notices_manager_delete on public.notices
for delete to authenticated
using (public.is_building_manager(building_id));

create policy audit_logs_manager_select on public.audit_logs
for select to authenticated
using (public.is_building_manager(building_id));
create policy audit_logs_manager_insert on public.audit_logs
for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and exists (
    select 1 from public.building_members
    where building_id = audit_logs.building_id and user_id = (select auth.uid()) and role = 'manager'
  )
);

-- No anonymous access to application tables. Authenticated access is restricted
-- exclusively by the policies above.
revoke all on public.profiles, public.buildings, public.building_members,
  public.residents, public.income, public.expenses, public.notices, public.audit_logs
from anon;
grant select, insert, update, delete on public.profiles, public.buildings,
  public.building_members, public.residents, public.income, public.expenses,
  public.notices, public.audit_logs to authenticated;
