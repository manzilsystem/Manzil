-- Phase 1 security hardening.
-- This migration is already applied to production; filename matches remote history.

-- RLS policies execute these helper functions as the requesting role.
-- Keep the public entry points unavailable to anon/PUBLIC and explicitly
-- grant only authenticated sessions the execution needed by their policies.
-- Owners must complete their first-login PIN change before notification
-- rows are visible, including notifications addressed directly to their user.
create or replace function public.can_read_notification(
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

revoke all on function public.can_read_notification(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_read_notification(uuid, uuid, uuid) to authenticated;

-- The legacy public helper was removed by the preceding hardening migration.
-- Policies use private.is_building_manager(uuid), granted in the helper-access migration.


-- RLS does not protect TRUNCATE, REFERENCES, or TRIGGER privileges.
-- The app does not need these table-level capabilities from browser sessions.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Profile writes are performed by trusted server-side Auth hooks/functions only.
-- Browser sessions need to read their own profile, but not create/delete it.
revoke insert, update, delete, truncate, references, trigger
on table public.profiles from authenticated;

-- An income update must not be able to move a payment to a resident in a
-- different building. Keep the manager check and validate the resulting row.
drop policy if exists income_manager_update on public.income;
create policy income_manager_update
on public.income
for update
to authenticated
using (private.is_building_manager(building_id))
with check (
    private.is_building_manager(building_id)
    and exists (
        select 1
        from public.residents r
        where r.id = income.resident_id
          and r.building_id = income.building_id
    )
);
