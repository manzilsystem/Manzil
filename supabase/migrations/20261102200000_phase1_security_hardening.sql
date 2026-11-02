-- Phase 1 security hardening.
-- This migration is committed for review only; it has NOT been applied to production.

-- RLS policies execute these helper functions as the requesting role.
-- Keep the public entry points unavailable to anon/PUBLIC and explicitly
-- grant only authenticated sessions the execution needed by their policies.
revoke all on function public.can_read_notification(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_read_notification(uuid, uuid, uuid) to authenticated;

revoke all on function public.is_building_manager(uuid) from public, anon;
grant execute on function public.is_building_manager(uuid) to authenticated;

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
