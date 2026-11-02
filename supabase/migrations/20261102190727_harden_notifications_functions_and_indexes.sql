alter table public.notifications
  add constraint notifications_dedupe_scope_unique unique (building_id, target_scope, dedupe_key);

create index if not exists notifications_created_by_idx on public.notifications(created_by);
create index if not exists notifications_dedupe_scope_idx on public.notifications(building_id, target_scope, dedupe_key);
create index if not exists notifications_target_resident_id_idx on public.notifications(target_resident_id);
create index if not exists notifications_target_user_id_idx on public.notifications(target_user_id);
create index if not exists notifications_recipient_idx on public.notifications(building_id, target_user_id, read_at, created_at desc);

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
  select public.is_building_manager(p_building_id)
    or (
      p_target_user_id = auth.uid()
      and private.owner_pin_change_complete()
    )
    or (
      private.owner_pin_change_complete()
      and exists (
        select 1 from public.residents r
        where r.id = p_target_resident_id
          and r.building_id = p_building_id
          and r.user_id = auth.uid()
      )
    );
$function$;
revoke all on function public.can_read_notification(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_read_notification(uuid, uuid, uuid) to authenticated;

create or replace function public.protect_notification_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.is_building_manager(old.building_id) then
    if new.id <> old.id
      or new.building_id <> old.building_id
      or new.target_user_id is distinct from old.target_user_id
      or new.target_resident_id is distinct from old.target_resident_id
      or new.kind <> old.kind
      or new.dedupe_key <> old.dedupe_key
      or new.title <> old.title
      or new.body <> old.body
      or new.severity <> old.severity
      or new.action_path is distinct from old.action_path
      or new.created_by is distinct from old.created_by
      or new.created_at <> old.created_at then
      raise exception 'notification content is immutable for non-managers';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$function$;
revoke all on function public.protect_notification_fields() from public, anon, authenticated;
create trigger protect_notification_fields
before update on public.notifications
for each row execute function public.protect_notification_fields();

create policy notifications_manager_delete on public.notifications
for delete to authenticated
using (public.is_building_manager(building_id));

create policy notifications_manager_insert on public.notifications
for insert to authenticated
with check (public.is_building_manager(building_id));

create policy notifications_select_scoped on public.notifications
for select to authenticated
using (public.can_read_notification(building_id, target_user_id, target_resident_id));

create policy notifications_update_read_state on public.notifications
for update to authenticated
using (public.can_read_notification(building_id, target_user_id, target_resident_id))
with check (public.can_read_notification(building_id, target_user_id, target_resident_id));
