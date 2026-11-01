-- Profile security flags and contact identifiers are server-managed.
-- Owner PIN changes are handled by the complete-owner-pin-change Edge Function.
drop policy if exists profiles_update_self on public.profiles;
revoke update on table public.profiles from public, anon, authenticated;

-- A valid owner session must not access building data until the temporary PIN is changed.
create or replace function private.owner_pin_change_complete()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select not exists (
    select 1
    from public.building_members member
    join public.profiles profile on profile.id = member.user_id
    where member.user_id = (select auth.uid())
      and member.role = 'owner'
      and profile.must_change_pin is true
  );
$$;

revoke all on function private.owner_pin_change_complete() from public, anon, authenticated;
grant execute on function private.owner_pin_change_complete() to authenticated;

alter policy buildings_select_members on public.buildings
  using (
    private.is_building_manager(id)
    or (private.is_building_member(id) and private.owner_pin_change_complete())
  );

alter policy residents_manager_or_owner_select on public.residents
  using (
    private.is_building_manager(building_id)
    or (user_id = (select auth.uid()) and private.owner_pin_change_complete())
  );

alter policy income_manager_or_owner_select on public.income
  using (
    private.is_building_manager(building_id)
    or (private.owns_resident(resident_id) and private.owner_pin_change_complete())
  );

alter policy notices_members_select on public.notices
  using (
    private.is_building_manager(building_id)
    or (private.is_building_member(building_id) and private.owner_pin_change_complete())
  );
