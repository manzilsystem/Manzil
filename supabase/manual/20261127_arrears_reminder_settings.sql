-- Per-building on/off switch and changeable reminder day for the arrears-reminder nudge.
-- NOT in supabase/migrations on purpose: apply by hand, staging first, production only after the owner approves.
--
-- Owner decisions (WhatsApp, Nov 27 2026, 12:10-12:15 AM):
--   1. One-tap send: the app prepares each WhatsApp message, the manager sends it himself. (Already live; no change.)
--   2. Nudge on day 5 of the month at 9 AM Cairo by default, and the day must be changeable.
--   3. An on/off toggle per building, in Settings.
--   4. Overdue apartments only. (Already the nudge's behavior; no change.)
--
-- What it does, in plain words:
--   Adds two columns to public.buildings: arrears_reminders_enabled (default on) and
--   arrears_reminder_day (default 5, allowed 1-28). Then replaces the nudge function so it:
--     - skips any building whose switch is off;
--     - nudges on the first daily run on or after the building's reminder day, and never before
--       the subscription due day plus grace days have actually passed (so a building whose due day
--       is the 15th is not told "maybe late" on the 5th);
--     - still only nudges when at least one apartment looks unpaid for the month (unchanged);
--     - still sends ONE manager notification per building per month (dedupe key unchanged).
--   The cron job (manzil-arrears-reminder-nudge, 07:00 UTC daily) is unchanged: 9 AM Cairo in winter,
--   10 AM in summer.
-- Safe to run twice: columns use IF NOT EXISTS, the constraint is created only when missing,
-- the function is CREATE OR REPLACE, and the dedupe key is unchanged.
-- Rollback:
--   select cron.unschedule('manzil-arrears-reminder-nudge');
--   drop function private.queue_arrears_reminder_nudges();
--   alter table public.buildings drop column arrears_reminders_enabled, drop column arrears_reminder_day;
--   delete from public.notifications where dedupe_key like 'arrears-nudge:%';

alter table public.buildings
    add column if not exists arrears_reminders_enabled boolean not null default true,
    add column if not exists arrears_reminder_day smallint not null default 5;

do $migration$
begin
    if not exists (select 1 from pg_constraint where conrelid = 'public.buildings'::regclass and conname = 'buildings_arrears_reminder_day_check') then
        alter table public.buildings add constraint buildings_arrears_reminder_day_check check (arrears_reminder_day between 1 and 28);
    end if;
end;
$migration$;

comment on column public.buildings.arrears_reminders_enabled is
    'Per-building switch for the monthly arrears-reminder manager nudge; managed from Settings > التذكيرات.';
comment on column public.buildings.arrears_reminder_day is
    'Day of month (1-28) the arrears-reminder nudge starts firing; default 5, changeable per building.';

create or replace function private.queue_arrears_reminder_nudges()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_month_start date := date_trunc('month', (now() at time zone 'Africa/Cairo'))::date;
  v_month_names text[] := array['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  v_label text;
  v_dedupe_key text := 'arrears-nudge:' || to_char(date_trunc('month', (now() at time zone 'Africa/Cairo'))::date, 'YYYY-MM');
  v_inserted integer := 0;
  v_rows integer;
  v_building record;
begin
  v_label := v_month_names[extract(month from v_month_start)::int] || ' ' || extract(year from v_month_start)::int;

  for v_building in
    select b.id, b.subscription_due_day, b.subscription_grace_days,
           b.arrears_reminders_enabled, b.arrears_reminder_day
    from public.buildings b
  loop
    -- Per-building kill switch from Settings > التذكيرات.
    if not v_building.arrears_reminders_enabled then
      continue;
    end if;

    -- Fire on the manager's chosen day of the month (default 5), and never before the
    -- subscription due day plus grace days have actually passed.
    if v_today < greatest(
      v_month_start + (v_building.arrears_reminder_day - 1),
      v_month_start + v_building.subscription_due_day + v_building.subscription_grace_days
    ) then
      continue;
    end if;

    if not exists (
      select 1
      from public.residents r
      where r.building_id = v_building.id
        and r.monthly_amount > 0
        and (r.billing_start_month is null or r.billing_start_month <= v_month_start)
        and not exists (
          select 1 from public.income i
          where i.building_id = v_building.id
            and i.resident_id = r.id
            and i.month = v_label
            and i.purpose_code = 'subscription'
        )
        and not exists (
          select 1 from public.resident_adjustments a
          where a.building_id = v_building.id
            and a.resident_id = r.id
            and a.effective_month = v_month_start
        )
    ) then
      continue;
    end if;

    -- Gate on the dedupe key itself: target_scope can be NULL on some rows, so ON CONFLICT alone is not enough.
    insert into public.notifications (
      building_id, target_user_id, target_resident_id, kind, dedupe_key,
      title, body, severity, action_path, created_by
    )
    select
      v_building.id, null, null, 'collection_due', v_dedupe_key,
      'وقت تذكيرات المتأخرات',
      format('عدّى ميعاد اشتراك %s، وفيه شقق ممكن تكون لسه ما دفعتش. افتح التذكيرات وراجع القايمة قبل ما تبعت.', v_label),
      'warning', '#arrears-reminders', null
    where not exists (
      select 1 from public.notifications n
      where n.building_id = v_building.id
        and n.dedupe_key = v_dedupe_key
    )
    on conflict (building_id, target_scope, dedupe_key) do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
  end loop;

  return v_inserted;
end;
$function$;

revoke all on function private.queue_arrears_reminder_nudges() from public, anon, authenticated, service_role;

do $schedule$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'manzil-arrears-reminder-nudge';
    perform cron.schedule('manzil-arrears-reminder-nudge', '0 7 * * *', 'select private.queue_arrears_reminder_nudges()');
  else
    raise notice 'pg_cron is not enabled: enable it in Database > Extensions, then re-run this file to create the schedule.';
  end if;
end;
$schedule$;
