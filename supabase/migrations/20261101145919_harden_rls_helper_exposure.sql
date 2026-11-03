-- Keep RLS helper functions outside the API-exposed public schema.
create schema if not exists private;

create or replace function private.is_building_member(target_building uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.building_members where building_id = target_building and user_id = (select auth.uid()));
$$;

create or replace function private.is_building_manager(target_building uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.building_members where building_id = target_building and user_id = (select auth.uid()) and role = 'manager');
$$;

create or replace function private.owns_resident(target_resident uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.residents where id = target_resident and user_id = (select auth.uid()));
$$;

revoke all on schema private from public, anon, authenticated;
revoke all on function private.is_building_member(uuid), private.is_building_manager(uuid), private.owns_resident(uuid) from public, anon, authenticated;

alter policy members_select_own_or_manager on public.building_members using (user_id = (select auth.uid()) or private.is_building_manager(building_id));
alter policy members_manager_insert on public.building_members with check (private.is_building_manager(building_id));
alter policy members_manager_update on public.building_members using (private.is_building_manager(building_id)) with check (private.is_building_manager(building_id));
alter policy members_manager_delete on public.building_members using (private.is_building_manager(building_id));
alter policy buildings_select_members on public.buildings using (private.is_building_member(id));
alter policy buildings_manager_update on public.buildings using (private.is_building_manager(id)) with check (private.is_building_manager(id));
alter policy residents_manager_or_owner_select on public.residents using (user_id = (select auth.uid()) or private.is_building_manager(building_id));
alter policy residents_manager_insert on public.residents with check (private.is_building_manager(building_id));
alter policy residents_manager_update on public.residents using (private.is_building_manager(building_id)) with check (private.is_building_manager(building_id));
alter policy residents_manager_delete on public.residents using (private.is_building_manager(building_id));
alter policy income_manager_or_owner_select on public.income using (private.owns_resident(resident_id) or private.is_building_manager(building_id));
alter policy income_manager_insert on public.income with check (created_by = (select auth.uid()) and private.is_building_manager(building_id) and exists (select 1 from public.residents r where r.id = income.resident_id and r.building_id = income.building_id));
alter policy income_manager_update on public.income using (private.is_building_manager(building_id)) with check (private.is_building_manager(building_id));
alter policy income_manager_delete on public.income using (private.is_building_manager(building_id));
alter policy expenses_manager_all on public.expenses using (private.is_building_manager(building_id)) with check (created_by = (select auth.uid()) and private.is_building_manager(building_id));
alter policy notices_members_select on public.notices using (private.is_building_member(building_id));
alter policy notices_manager_insert on public.notices with check (created_by = (select auth.uid()) and private.is_building_manager(building_id));
alter policy notices_manager_update on public.notices using (private.is_building_manager(building_id)) with check (private.is_building_manager(building_id));
alter policy notices_manager_delete on public.notices using (private.is_building_manager(building_id));
alter policy audit_logs_manager_select on public.audit_logs using (private.is_building_manager(building_id));
alter policy audit_logs_manager_insert on public.audit_logs with check (actor_id = (select auth.uid()) and private.is_building_manager(building_id));

drop function if exists public.is_building_member(uuid);
drop function if exists public.is_building_manager(uuid);
drop function if exists public.owns_resident(uuid);
DO $
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'revoke all on function public.rls_auto_enable() from anon, authenticated';
  END IF;
END;
$;
