-- Keep SECURITY DEFINER helpers used by notification RLS outside the exposed public API schema.
-- Fix the search_path on all private SECURITY DEFINER membership helpers.
create or replace function private.is_building_manager(target_building uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
    select exists (
        select 1
        from public.building_members
        where building_id = target_building
          and user_id = (select auth.uid())
          and role = 'manager'
    );
$function$;

create or replace function private.is_building_member(target_building uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
    select exists (
        select 1
        from public.building_members
        where building_id = target_building
          and user_id = (select auth.uid())
    );
$function$;

create or replace function private.owns_resident(target_resident uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
    select exists (
        select 1
        from public.residents
        where id = target_resident
          and user_id = (select auth.uid())
    );
$function$;

create or replace function private.can_read_notification(
    p_building_id uuid,
    p_target_user_id uuid,
    p_target_resident_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
    select private.is_building_manager(p_building_id)
        or (
            p_target_user_id = auth.uid()
            and private.owner_pin_change_complete()
        )
        or (
            private.owner_pin_change_complete()
            and exists (
                select 1
                from public.residents r
                where r.id = p_target_resident_id
                  and r.building_id = p_building_id
                  and r.user_id = auth.uid()
            )
        );
$function$;

revoke all on function private.can_read_notification(uuid, uuid, uuid) from public, anon;
grant execute on function private.can_read_notification(uuid, uuid, uuid) to authenticated;

alter policy notifications_manager_delete on public.notifications
using (private.is_building_manager(building_id));

alter policy notifications_manager_insert on public.notifications
with check (private.is_building_manager(building_id));

alter policy notifications_select_scoped on public.notifications
using (private.can_read_notification(building_id, target_user_id, target_resident_id));

alter policy notifications_update_read_state on public.notifications
using (private.can_read_notification(building_id, target_user_id, target_resident_id))
with check (private.can_read_notification(building_id, target_user_id, target_resident_id));

revoke all on function public.can_read_notification(uuid, uuid, uuid) from public, anon, authenticated;
drop function public.can_read_notification(uuid, uuid, uuid);

revoke all on function public.is_building_manager(uuid) from public, anon, authenticated;
drop function public.is_building_manager(uuid);
